from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required
from decimal import Decimal
from datetime import datetime
from app import db, limiter
from app.models import Payment, Loan, Transaction
from app.utils.daraja import DarajaAPI
from app.utils.security import log_audit, admin_required

payments_bp = Blueprint('payments', __name__)

@payments_bp.route('/cash', methods=['POST'])
@jwt_required()
@admin_required
def process_cash_payment():
    """Process cash payment - ADMIN ONLY"""
    try:
        data = request.json
        
        loan_id = data.get('loan_id')
        amount = data.get('amount')
        notes = data.get('notes', '')
        
        if not all([loan_id, amount]):
            return jsonify({'error': 'Missing required fields: loan_id and amount'}), 400
        
        # Verify loan exists
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
        
        if loan.status != 'active':
            return jsonify({'error': 'Loan is not active'}), 400
        
        payment_amount = Decimal(str(amount))
        
        # Check if payment exceeds balance
        if payment_amount > loan.balance:
            return jsonify({'error': f'Payment amount exceeds loan balance of {float(loan.balance)}'}), 400
        
        # Update loan
        loan.amount_paid += payment_amount
        loan.balance -= payment_amount
        
        # Mark loan as completed if fully paid and update livestock status
        if loan.balance <= 0:
            loan.status = 'completed'
            # Remove livestock from gallery when loan is fully paid
            if loan.livestock:
                db.session.delete(loan.livestock)  #  delete the livestock from gallery after its fully paid
        
        # Create transaction record
        transaction = Transaction(
            loan_id=loan.id,
            transaction_type='payment',
            amount=payment_amount,
            payment_method='cash',
            notes=notes or f'Cash payment of KSh {float(payment_amount)}'
        )
        
        db.session.add(transaction)
        db.session.commit()
        
        log_audit('cash_payment_processed', 'transaction', transaction.id, {
            'loan_id': loan.id,
            'client': loan.client.full_name if loan.client else 'Unknown',
            'amount': float(payment_amount),
            'new_balance': float(loan.balance)
        })
        
        return jsonify({
            'success': True,
            'message': 'Payment processed successfully',
            'transaction': transaction.to_dict(),
            'loan': {
                'id': loan.id,
                'amount_paid': float(loan.amount_paid),
                'balance': float(loan.balance),
                'status': loan.status
            }
        }), 200
        
    except ValueError as e:
        return jsonify({'error': f'Invalid amount format: {str(e)}'}), 400
    except Exception as e:
        db.session.rollback()
        print(f"Cash payment error: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
#mpesa stk push- coming soon
@payments_bp.route('/stkpush', methods=['POST'])
@jwt_required()
@limiter.limit("10 per minute")
def initiate_stk_push():
    """Initiate M-Pesa STK Push"""
    data = request.json
    
    loan_id = data.get('loan_id')
    phone_number = data.get('phone_number')
    amount = data.get('amount')
    
    if not all([loan_id, phone_number, amount]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    # Verify loan exists
    loan = db.session.get(Loan, loan_id)
    if not loan:
        return jsonify({'error': 'Loan not found'}), 404
    
    # Create payment record
    payment = Payment(
        loan_id=loan_id,
        phone_number=phone_number,
        amount=Decimal(str(amount)),
        status='pending'
    )
    
    db.session.add(payment)
    db.session.commit()
    
    # Initiate STK Push
    daraja = DarajaAPI()
    callback_url = current_app.config['DARAJA_CALLBACK_URL']
    account_ref = f"LOAN{loan_id}"
    
    result = daraja.stk_push(phone_number, amount, account_ref, callback_url)
    
    if result.get('success'):
        payment.merchant_request_id = result.get('merchant_request_id')
        payment.checkout_request_id = result.get('checkout_request_id')
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': result.get('customer_message'),
            'payment_id': payment.id,
            'checkout_request_id': payment.checkout_request_id
        }), 200
    else:
        payment.status = 'failed'
        payment.result_desc = result.get('error')
        db.session.commit()
        
        return jsonify({
            'success': False,
            'error': result.get('error')
        }), 400

@payments_bp.route('/callback', methods=['POST'])
@limiter.limit("100 per minute")
def mpesa_callback():
    """Handle M-Pesa callback"""
    # Verify callback token
    token = request.headers.get('X-Callback-Token')
    if token != current_app.config['CALLBACK_SECRET_TOKEN']:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json
    
    # Extract callback data
    body = data.get('Body', {}).get('stkCallback', {})
    merchant_request_id = body.get('MerchantRequestID')
    checkout_request_id = body.get('CheckoutRequestID')
    result_code = body.get('ResultCode')
    result_desc = body.get('ResultDesc')
    
    # Find payment record
    payment = Payment.query.filter_by(checkout_request_id=checkout_request_id).first()
    
    if not payment:
        return jsonify({'error': 'Payment not found'}), 404
    
    # Update payment status
    if result_code == 0:  # Success
        callback_metadata = body.get('CallbackMetadata', {}).get('Item', [])
        
        # Extract payment details
        mpesa_receipt = None
        transaction_date = None
        
        for item in callback_metadata:
            if item.get('Name') == 'MpesaReceiptNumber':
                mpesa_receipt = item.get('Value')
            elif item.get('Name') == 'TransactionDate':
                transaction_date = item.get('Value')
        
        payment.status = 'completed'
        payment.mpesa_receipt_number = mpesa_receipt
        payment.result_code = str(result_code)
        payment.result_desc = result_desc
        
        # Update loan balance
        loan = payment.loan
        loan.amount_paid += payment.amount
        loan.balance = loan.total_amount - loan.amount_paid
        
        if loan.balance <= 0:
            loan.status = 'completed'
        
        # Create transaction record
        transaction = Transaction(
            loan_id=loan.id,
            transaction_type='payment',
            amount=payment.amount,
            payment_method='mpesa',
            mpesa_receipt=mpesa_receipt,
            notes=f'M-Pesa payment: {mpesa_receipt}'
        )
        
        db.session.add(transaction)
        
        log_audit('payment_received', 'payment', payment.id, {
            'loan_id': loan.id,
            'amount': float(payment.amount),
            'receipt': mpesa_receipt
        })
    else:
        payment.status = 'failed'
        payment.result_code = str(result_code)
        payment.result_desc = result_desc
    
    db.session.commit()
    
    return jsonify({'ResultCode': 0, 'ResultDesc': 'Success'}), 200

@payments_bp.route('/<int:payment_id>/status', methods=['GET'])
@jwt_required()
def get_payment_status(payment_id):
    """Get payment status"""
    payment = db.session.get(Payment, payment_id)
    
    if not payment:
        return jsonify({'error': 'Payment not found'}), 404
    
    return jsonify(payment.to_dict()), 200