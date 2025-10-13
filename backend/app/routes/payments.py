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

@payments_bp.route('/mpesa/stk-push', methods=['POST'])
@jwt_required()
@admin_required
@limiter.limit("10 per minute")
def stk_push():
    """Send M-Pesa STK Push - ADMIN ONLY"""
    try:
        data = request.get_json()
        print(f"Received STK Push request data: {data}")  # DEBUG
        
        loan_id = data.get('loan_id')
        amount = data.get('amount')
        phone_number = data.get('phone_number')
        
        # Validate input
        if not all([loan_id, amount, phone_number]):
            print(f"Missing fields - loan_id: {loan_id}, amount: {amount}, phone_number: {phone_number}")  # DEBUG
            return jsonify({'success': False, 'error': 'Missing required fields: loan_id, amount, and phone_number'}), 400
        
        # Verify loan exists and is active
        loan = db.session.get(Loan, loan_id)
        if not loan:
            print(f"Loan not found with ID: {loan_id}")  # DEBUG
            return jsonify({'success': False, 'error': 'Loan not found'}), 404
        
        if loan.status != 'active':
            print(f"Loan status is not active: {loan.status}")  # DEBUG
            return jsonify({'success': False, 'error': 'Loan is not active'}), 400
        
        # Validate amount
        try:
            payment_amount = Decimal(str(amount))
            if payment_amount <= 0:
                return jsonify({'success': False, 'error': 'Amount must be greater than 0'}), 400
            if payment_amount > loan.balance:
                return jsonify({'success': False, 'error': f'Payment amount exceeds loan balance of {float(loan.balance)}'}), 400
        except (ValueError, TypeError) as e:
            print(f"Amount validation error: {e}")  # DEBUG
            return jsonify({'success': False, 'error': 'Invalid amount format'}), 400
        
        # Initialize Daraja API
        daraja = DarajaAPI()
        print("Daraja API initialized")  # DEBUG
        
        # Generate account reference
        account_reference = f"NAGOLIE{loan.id}"
        print(f"Account reference: {account_reference}")  # DEBUG
        
        # Make STK push request
        print(f"Making STK push request for phone: {phone_number}, amount: {amount}")  # DEBUG
        result = daraja.stk_push(
            phone_number=phone_number,
            amount=str(amount),
            account_reference=account_reference,
            callback_url=current_app.config['DARAJA_CALLBACK_URL']
        )
        
        print(f"Daraja STK push result: {result}")  # DEBUG
        
        if result.get('success'):
            # Use the rounded amount from Daraja for consistency
            rounded_amount = result.get('rounded_amount', int(round(float(amount))))
            
            # Create pending payment with rounded amount
            payment = Payment(
                loan_id=loan.id,
                amount=Decimal(str(rounded_amount)),
                phone_number=phone_number,
                status='pending',
                merchant_request_id=result.get('merchant_request_id'),
                checkout_request_id=result.get('checkout_request_id'),
                created_at=datetime.utcnow()
            )
            
            db.session.add(payment)
            db.session.commit()
            
            log_audit('stk_push_sent', 'payment', payment.id, {
                'loan_id': loan.id,
                'phone_number': phone_number,
                'amount': float(rounded_amount),
                'merchant_request_id': result.get('merchant_request_id')
            })
            
            return jsonify({
                'success': True,
                'message': 'STK push sent successfully',
                'merchant_request_id': result.get('merchant_request_id'),
                'checkout_request_id': result.get('checkout_request_id'),
                'customer_message': result.get('customer_message'),
                'rounded_amount': rounded_amount
            })
        else:
            current_app.logger.error(f"STK Push failed: {result.get('error')}")
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to send STK push')
            }), 400
        
    except Exception as e:
        current_app.logger.error(f"STK Push error: {str(e)}")
        print(f"STK Push exception: {str(e)}")  # DEBUG
        import traceback
        print(f"Traceback: {traceback.format_exc()}")  # DEBUG
        db.session.rollback()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500

@payments_bp.route('/callback', methods=['POST'])
@limiter.limit("100 per minute")
def mpesa_callback():
    """Handle M-Pesa callback"""
    try:
        data = request.get_json()
        current_app.logger.info(f"Received M-Pesa callback: {data}")
        
        # Extract callback data
        body = data.get('Body', {}).get('stkCallback', {})
        result_code = body.get('ResultCode')
        result_desc = body.get('ResultDesc')
        checkout_request_id = body.get('CheckoutRequestID')
        merchant_request_id = body.get('MerchantRequestID')
        
        if not checkout_request_id:
            current_app.logger.error("No checkout_request_id in callback")
            return jsonify({'ResultCode': 1, 'ResultDesc': 'Missing checkout request ID'}), 400
        
        # Find payment record
        payment = Payment.query.filter_by(checkout_request_id=checkout_request_id).first()
        
        if not payment:
            current_app.logger.error(f"Payment not found for checkout_request_id: {checkout_request_id}")
            return jsonify({'ResultCode': 1, 'ResultDesc': 'Payment not found'}), 404
        
        # Update payment based on result
        if result_code == 0:  # Success
            callback_metadata = body.get('CallbackMetadata', {}).get('Item', [])
            result_data = {item['Name']: item.get('Value') for item in callback_metadata}
            
            amount = result_data.get('Amount')
            mpesa_receipt_number = result_data.get('MpesaReceiptNumber')
            phone_number = result_data.get('PhoneNumber')
            transaction_date = result_data.get('TransactionDate')
            
            # Update payment
            payment.status = 'completed'
            payment.mpesa_receipt_number = mpesa_receipt_number
            payment.phone_number = phone_number
            payment.result_code = str(result_code)
            payment.result_desc = result_desc
            payment.completed_at = datetime.utcnow()
            
            # Update loan balance - FIXED: Use the actual payment amount
            callback_amount = Decimal(str(amount))
            loan = payment.loan
            
            # Get current loan details before update
            old_balance = loan.balance
            old_amount_paid = loan.amount_paid
            
            # Update loan amounts
            loan.amount_paid += callback_amount
            loan.balance = loan.total_amount - loan.amount_paid
            
            # Mark loan as completed if fully paid
            if loan.balance <= 0:
                loan.status = 'completed'
                # Remove livestock from gallery when loan is fully paid
                if loan.livestock:
                    db.session.delete(loan.livestock)
            
            # Create transaction record - FIXED: Ensure proper transaction creation
            transaction = Transaction(
                loan_id=loan.id,
                transaction_type='payment',
                amount=callback_amount,
                payment_method='mpesa',
                mpesa_receipt=mpesa_receipt_number,
                notes=f'M-Pesa payment completed: {mpesa_receipt_number}',
                created_at=datetime.utcnow()
            )
            
            db.session.add(transaction)
            
            log_audit('mpesa_payment_completed', 'payment', payment.id, {
                'loan_id': loan.id,
                'client': loan.client.full_name if loan.client else 'Unknown',
                'amount': float(callback_amount),
                'mpesa_receipt': mpesa_receipt_number,
                'phone_number': phone_number,
                'old_balance': float(old_balance),
                'new_balance': float(loan.balance),
                'old_amount_paid': float(old_amount_paid),
                'new_amount_paid': float(loan.amount_paid)
            })
            
            current_app.logger.info(f"M-Pesa payment completed: {mpesa_receipt_number} for loan {loan.id}. Balance updated from {old_balance} to {loan.balance}")
            
        else:  # Failed
            payment.status = 'failed'
            payment.result_code = str(result_code)
            payment.result_desc = result_desc
            payment.completed_at = datetime.utcnow()
            
            log_audit('mpesa_payment_failed', 'payment', payment.id, {
                'loan_id': payment.loan_id,
                'result_code': result_code,
                'result_desc': result_desc
            })
            
            current_app.logger.warning(f"M-Pesa payment failed: {result_desc} (Code: {result_code})")
        
        db.session.commit()
        
        return jsonify({'ResultCode': 0, 'ResultDesc': 'Success'}), 200
        
    except Exception as e:
        current_app.logger.error(f"Callback processing error: {str(e)}")
        import traceback
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        db.session.rollback()
        return jsonify({'ResultCode': 1, 'ResultDesc': 'Callback processing failed'}), 500

@payments_bp.route('/<int:payment_id>/status', methods=['GET'])
@jwt_required()
def get_payment_status(payment_id):
    """Get payment status"""
    payment = db.session.get(Payment, payment_id)
    
    if not payment:
        return jsonify({'error': 'Payment not found'}), 404
    
    return jsonify(payment.to_dict()), 200

# In payments.py - Fix the check_payment_status endpoint
@payments_bp.route('/mpesa/check-status', methods=['POST'])
@jwt_required()
def check_payment_status():
    """Check M-Pesa payment status manually"""
    try:
        data = request.json
        checkout_request_id = data.get('checkout_request_id')
        
        if not checkout_request_id:
            return jsonify({'error': 'Checkout request ID required'}), 400
        
        # Find the payment record first
        payment = Payment.query.filter_by(checkout_request_id=checkout_request_id).first()
        if not payment:
            return jsonify({'error': 'Payment record not found'}), 404
        
        # If payment is already completed, return immediately
        if payment.status == 'completed':
            return jsonify({
                'success': True,
                'status': {
                    'ResultCode': '0',
                    'ResultDesc': 'The service request is processed successfully.'
                }
            }), 200
        
        # Use DarajaAPI to check status
        daraja = DarajaAPI()
        status_response = daraja.check_stk_status(checkout_request_id)
        
        if status_response.get('success'):
            status_data = status_response.get('status', {})
            result_code = status_data.get('ResultCode')
            
            # If payment is successful, process it
            if result_code == '0':
                # Process the successful payment
                callback_metadata = status_data.get('CallbackMetadata', {}).get('Item', [])
                result_data = {item['Name']: item.get('Value') for item in callback_metadata}
                
                amount = result_data.get('Amount')
                mpesa_receipt_number = result_data.get('MpesaReceiptNumber')
                phone_number = result_data.get('PhoneNumber')
                
                # Update payment
                payment.status = 'completed'
                payment.mpesa_receipt_number = mpesa_receipt_number
                payment.phone_number = phone_number
                payment.result_code = str(result_code)
                payment.result_desc = status_data.get('ResultDesc', 'Success')
                payment.completed_at = datetime.utcnow()
                
                # Update loan balance
                callback_amount = Decimal(str(amount))
                loan = payment.loan
                
                old_balance = loan.balance
                old_amount_paid = loan.amount_paid
                
                loan.amount_paid += callback_amount
                loan.balance = loan.total_amount - loan.amount_paid
                
                # Mark loan as completed if fully paid
                if loan.balance <= 0:
                    loan.status = 'completed'
                    if loan.livestock:
                        db.session.delete(loan.livestock)
                
                # Create transaction record
                transaction = Transaction(
                    loan_id=loan.id,
                    transaction_type='payment',
                    amount=callback_amount,
                    payment_method='mpesa',
                    mpesa_receipt=mpesa_receipt_number,
                    notes=f'M-Pesa payment completed: {mpesa_receipt_number}',
                    created_at=datetime.utcnow()
                )
                
                db.session.add(transaction)
                db.session.commit()
                
                log_audit('mpesa_payment_completed', 'payment', payment.id, {
                    'loan_id': loan.id,
                    'client': loan.client.full_name if loan.client else 'Unknown',
                    'amount': float(callback_amount),
                    'mpesa_receipt': mpesa_receipt_number
                })
            
            return jsonify(status_response), 200
        else:
            return jsonify(status_response), 200
            
    except Exception as e:
        print(f"Error checking payment status: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({'success': False, 'error': str(e)}), 500