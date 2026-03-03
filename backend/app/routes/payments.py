from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timedelta
from app import db, limiter
from app.models import Payment, Loan, Transaction
from app.utils.daraja import DarajaAPI
from app.utils.security import log_audit, admin_required

payments_bp = Blueprint('payments', __name__)

def recalculate_loan(loan):
    """
    Recalculate loan with simple interest per week.
    Interest accrues weekly on current principal, no compounding.
    """
    if loan.status != 'active':
        return loan

    today = datetime.now().date()
    
    # Initialize dates if missing
    if not loan.disbursement_date:
        loan.disbursement_date = datetime.now()
    
    if not loan.last_interest_payment_date:
        loan.last_interest_payment_date = loan.disbursement_date
    
    # Ensure last_interest_payment_date is a date object for comparison
    last_interest_date = loan.last_interest_payment_date
    if hasattr(last_interest_date, 'date'):
        last_interest_date = last_interest_date.date()
    
    # Calculate weeks since last interest payment (full weeks only)
    days_since = (today - last_interest_date).days
    weeks_passed = days_since // 7  # full weeks
    
    if weeks_passed > 0:
        # Accrue interest for each full week
        weekly_interest = (loan.current_principal* Decimal('0.30')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        new_accrued = weekly_interest * weeks_passed
        loan.accrued_interest += new_accrued
        
        # Update last interest payment date to the start of the current week
        loan.last_interest_payment_date += timedelta(days=weeks_passed * 7)
        
        # Update due_date to next week from that date
        loan.due_date = loan.last_interest_payment_date + timedelta(days=7)
    
    # Calculate unpaid interest
    unpaid_interest = loan.accrued_interest - loan.interest_paid
    if unpaid_interest < 0:
        unpaid_interest = Decimal('0')
    
    # Balance = current principal + unpaid interest
    loan.balance = (loan.current_principal + unpaid_interest).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    # Check if loan is fully paid (principal and all accrued interest)
    if loan.current_principal <= Decimal('0.01') and unpaid_interest <= Decimal('0.01'):
        loan.status = 'completed'
        loan.current_principal = Decimal('0')
        loan.balance = Decimal('0')
    
    return loan

@payments_bp.route('/cash', methods=['POST'])
@jwt_required()
@admin_required
def process_cash_payment():
    """Process cash payment with simple interest logic"""
    try:
        data = request.json
        loan_id = data.get('loan_id')
        amount = data.get('amount')
        payment_type = data.get('payment_type', 'principal')
        notes = data.get('notes', '')
        
        if not all([loan_id, amount, payment_type]):
            return jsonify({'error': 'Missing required fields: loan_id, amount, and payment_type'}), 400
        
        loan = db.session.get(Loan, loan_id)
        if not loan or loan.status != 'active':
            return jsonify({'error': 'Loan not found or not active'}), 404
        
        # Recalculate to get current accurate state
        loan = recalculate_loan(loan)
        
        payment_amount = Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        
        if payment_type == 'interest':
            # Calculate unpaid interest
            unpaid_interest = loan.accrued_interest - loan.interest_paid
            if unpaid_interest < 0:
                unpaid_interest = Decimal('0')
            
            # Validate payment amount
            if payment_amount > unpaid_interest:
                return jsonify({
                    'error': f'Interest payment cannot exceed unpaid interest of {float(unpaid_interest)}'
                }), 400
            
            # Record interest payment
            loan.interest_paid += payment_amount
            loan.amount_paid += payment_amount
            loan.last_interest_payment_date = datetime.utcnow()
            
            # If all accrued interest is now paid, reset the last interest payment date to today
            # so that future accrual starts fresh (extends due date)
            if loan.interest_paid >= loan.accrued_interest:
                # Move last_interest_payment_date to today to start new period
                loan.last_interest_payment_date = datetime.utcnow()
                loan.due_date = datetime.utcnow() + timedelta(days=7)
            
            notes_text = notes or f'Cash interest payment of KSh {float(payment_amount)}'
            
        else:  # principal payment
            if payment_amount > loan.current_principal:
                return jsonify({
                    'error': f'Principal payment cannot exceed current principal of {float(loan.current_principal)}'
                }), 400
            
            # Record principal payment
            loan.principal_paid += payment_amount
            loan.current_principal -= payment_amount
            loan.amount_paid += payment_amount
            
            notes_text = notes or f'Cash principal payment of KSh {float(payment_amount)}'
        
        # Recalculate after payment (accrued interest doesn't change, but balance may update)
        loan = recalculate_loan(loan)
        
        # Create transaction record
        transaction = Transaction(
            loan_id=loan.id,
            transaction_type='payment',
            payment_type=payment_type,
            amount=payment_amount,
            payment_method='cash',
            notes=notes_text,
            status='completed'
        )
        db.session.add(transaction)
        db.session.commit()
        
        log_audit('cash_payment_processed', 'transaction', transaction.id, {
            'loan_id': loan.id,
            'amount': float(payment_amount),
            'payment_type': payment_type,
            'new_balance': float(loan.balance),
            'current_principal': float(loan.current_principal)
        })
        
        return jsonify({
            'success': True,
            'message': f'{payment_type.capitalize()} payment processed successfully',
            'transaction': transaction.to_dict(),
            'loan': {
                'id': loan.id,
                'amount_paid': float(loan.amount_paid),
                'principal_paid': float(loan.principal_paid),
                'interest_paid': float(loan.interest_paid),
                'current_principal': float(loan.current_principal),
                'balance': float(loan.balance),
                'due_date': loan.due_date.isoformat() if loan.due_date else None,
                'status': loan.status
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Error processing cash payment: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@payments_bp.route('/mpesa/stk-push', methods=['POST'])
@jwt_required()
@admin_required
@limiter.limit("10 per minute")
def stk_push():
    """Send M-Pesa STK Push with validation"""
    try:
        data = request.get_json()
        
        loan_id = data.get('loan_id')
        amount = data.get('amount')
        phone_number = data.get('phone_number')
        payment_type = data.get('payment_type', 'principal')
        
        if not all([loan_id, amount, phone_number, payment_type]):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        loan = db.session.get(Loan, loan_id)
        if not loan or loan.status != 'active':
            return jsonify({'success': False, 'error': 'Loan not found or not active'}), 404
        
        payment_amount = Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        loan = recalculate_loan(loan)
        
        # Validate amount based on payment type
        loan = recalculate_loan(loan)

        if payment_type == 'interest':
            unpaid_interest = loan.accrued_interest - loan.interest_paid
            if unpaid_interest < 0:
                unpaid_interest = Decimal('0')
            if payment_amount > unpaid_interest:
                return jsonify({
                    'success': False, 
                    'error': f'Interest payment cannot exceed unpaid interest of {float(unpaid_interest)}'
                }), 400
        else:  # principal
            if payment_amount > loan.current_principal:
                return jsonify({
                    'success': False, 
                    'error': f'Principal payment cannot exceed current principal of {float(loan.current_principal)}'
                }), 400
        
        daraja = DarajaAPI()
        account_reference = f"NAGOLIE ENTERPRISES{loan.id}"
        
        result = daraja.stk_push(
            phone_number=phone_number,
            amount=str(amount),
            account_reference=account_reference,
            callback_url=current_app.config['DARAJA_CALLBACK_URL']
        )
        
        if result.get('success'):
            rounded_amount = result.get('rounded_amount', int(round(float(amount))))
            
            payment = Payment(
                loan_id=loan.id,
                amount=Decimal(str(rounded_amount)),
                phone_number=phone_number,
                payment_type=payment_type,
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
                'payment_type': payment_type
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
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to send STK push')
            }), 400
        
    except Exception as e:
        print(f"STK Push exception: {str(e)}")
        db.session.rollback()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500

@payments_bp.route('/callback', methods=['POST'])
@limiter.limit("100 per minute")
def mpesa_callback():
    """Handle M-Pesa callback with compound interest logic"""
    try:
        data = request.get_json()
        current_app.logger.info(f"Received M-Pesa callback: {data}")
        
        body = data.get('Body', {}).get('stkCallback', {})
        result_code = body.get('ResultCode')
        checkout_request_id = body.get('CheckoutRequestID')
        
        if not checkout_request_id:
            return jsonify({'ResultCode': 1, 'ResultDesc': 'Missing checkout request ID'}), 400
        
        payment = Payment.query.filter_by(checkout_request_id=checkout_request_id).first()
        if not payment:
            return jsonify({'ResultCode': 1, 'ResultDesc': 'Payment not found'}), 404
        
        if result_code == 0:  # Success
            callback_metadata = body.get('CallbackMetadata', {}).get('Item', [])
            result_data = {item['Name']: item.get('Value') for item in callback_metadata}
            
            amount = result_data.get('Amount')
            mpesa_receipt_number = result_data.get('MpesaReceiptNumber')
            phone_number = result_data.get('PhoneNumber')
            
            callback_amount = Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            loan = payment.loan
            payment_type = payment.payment_type or 'principal'
            
            # Recalculate loan before processing (as requested)
            loan = recalculate_loan(loan)
            
            # Process payment based on type
            if payment_type == 'interest':
                # Keep your original validation (more strict/safe)
                current_period_interest_due = (Decimal('0.30') * loan.current_principal).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                unpaid_interest = current_period_interest_due - loan.current_period_interest_paid
                
                if callback_amount > unpaid_interest:
                    payment.status = 'failed'
                    payment.result_code = '1'
                    payment.result_desc = f'Interest payment exceeds unpaid interest of {float(unpaid_interest)}'
                    payment.completed_at = datetime.utcnow()
                    db.session.commit()
                    return jsonify({'ResultCode': 1, 'ResultDesc': 'Payment validation failed'}), 200
                
                # Apply interest payment
                loan.current_period_interest_paid += callback_amount
                loan.interest_paid += callback_amount
                loan.amount_paid += callback_amount
                loan.last_interest_payment_date = datetime.utcnow()
                
                # Check if full interest paid for the period
                if loan.current_period_interest_paid >= current_period_interest_due:
                    loan.due_date = datetime.utcnow() + timedelta(days=7)
                    excess = loan.current_period_interest_paid - current_period_interest_due
                    loan.current_period_interest_paid = excess
                
                notes_text = f'M-Pesa interest payment: {mpesa_receipt_number}'
                
            else:
                # principal
                if callback_amount > loan.current_principal:
                    payment.status = 'failed'
                    payment.result_code = '1'
                    payment.result_desc = f'Principal payment exceeds current principal of {float(loan.current_principal)}'
                    payment.completed_at = datetime.utcnow()
                    db.session.commit()
                    return jsonify({'ResultCode': 1, 'ResultDesc': 'Payment validation failed'}), 200
                
                loan.principal_paid += callback_amount
                loan.current_principal -= callback_amount
                loan.amount_paid += callback_amount
                
                notes_text = f'M-Pesa principal payment: {mpesa_receipt_number}'
            
            # Recalculate after payment (as requested)
            loan = recalculate_loan(loan)
            
            # Check completion
            if loan.current_principal <= Decimal('0.01') and loan.balance <= Decimal('0.01'):
                loan.status = 'completed'
                loan.current_principal = Decimal('0')
                loan.balance = Decimal('0')
                if loan.livestock:
                    db.session.delete(loan.livestock)
            
            payment.status = 'completed'
            payment.mpesa_receipt_number = mpesa_receipt_number
            payment.phone_number = phone_number
            payment.result_code = str(result_code)
            payment.result_desc = body.get('ResultDesc')
            payment.completed_at = datetime.utcnow()
            
            transaction = Transaction(
                loan_id=loan.id,
                transaction_type='payment',
                payment_type=payment_type,
                amount=callback_amount,
                payment_method='mpesa',
                mpesa_receipt=mpesa_receipt_number,
                notes=notes_text,
                status='completed'
            )
            
            db.session.add(transaction)
            db.session.commit()
            
            log_audit('mpesa_payment_completed', 'payment', payment.id, {
                'loan_id': loan.id,
                'amount': float(callback_amount),
                'payment_type': payment_type,
                'mpesa_receipt': mpesa_receipt_number
            })
            
        else:  # Failed
            payment.status = 'failed'
            payment.result_code = str(result_code)
            payment.result_desc = body.get('ResultDesc')
            payment.completed_at = datetime.utcnow()
            db.session.commit()
        
        return jsonify({'ResultCode': 0, 'ResultDesc': 'Success'}), 200
        
    except Exception as e:
        current_app.logger.error(f"Callback processing error: {str(e)}")
        db.session.rollback()
        return jsonify({'ResultCode': 1, 'ResultDesc': 'Callback processing failed'}), 500
    
@payments_bp.route('/mpesa/manual', methods=['POST'])
@jwt_required()
@admin_required
def process_mpesa_manual():
    """Process manual M-Pesa payment with simple interest logic"""
    try:
        data = request.json
        
        loan_id = data.get('loan_id')
        amount = data.get('amount')
        mpesa_reference = data.get('mpesa_reference')
        payment_type = data.get('payment_type', 'principal')
        notes = data.get('notes', '')
        
        if not all([loan_id, amount, mpesa_reference, payment_type]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        loan = db.session.get(Loan, loan_id)
        if not loan or loan.status != 'active':
            return jsonify({'error': 'Loan not found or not active'}), 404
        
        # Recalculate to get current accurate state
        loan = recalculate_loan(loan)
        
        payment_amount = Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        
        # Validate amount
        if payment_type == 'interest':
            unpaid_interest = loan.accrued_interest - loan.interest_paid
            if unpaid_interest < 0:
                unpaid_interest = Decimal('0')
            
            if payment_amount > unpaid_interest:
                return jsonify({'error': f'Interest payment cannot exceed unpaid interest of {float(unpaid_interest)}'}), 400
        elif payment_type == 'principal':
            if payment_amount > loan.current_principal:
                return jsonify({'error': f'Principal payment cannot exceed current principal of {float(loan.current_principal)}'}), 400
        
        # Process payment
        if payment_type == 'interest':
            loan.interest_paid += payment_amount
            loan.amount_paid += payment_amount
            loan.last_interest_payment_date = datetime.utcnow()
            
            # If all accrued interest is now paid, reset the last interest payment date
            if loan.interest_paid >= loan.accrued_interest:
                loan.last_interest_payment_date = datetime.utcnow()
                loan.due_date = datetime.utcnow() + timedelta(days=7)
            
            notes_text = notes or f'M-Pesa interest payment: {mpesa_reference}'
        else:
            loan.principal_paid += payment_amount
            loan.current_principal -= payment_amount
            loan.amount_paid += payment_amount
            
            notes_text = notes or f'M-Pesa principal payment: {mpesa_reference}'
        
        # Recalculate
        loan = recalculate_loan(loan)
        
        transaction = Transaction(
            loan_id=loan.id,
            transaction_type='payment',
            payment_type=payment_type,
            amount=payment_amount,
            payment_method='mpesa',
            mpesa_receipt=mpesa_reference.upper(),
            notes=notes_text,
            status='completed'
        )
        
        db.session.add(transaction)
        db.session.commit()
        
        log_audit('mpesa_manual_payment_processed', 'transaction', transaction.id, {
            'loan_id': loan.id,
            'amount': float(payment_amount),
            'payment_type': payment_type,
            'mpesa_reference': mpesa_reference
        })
        
        return jsonify({
            'success': True,
            'message': f'M-Pesa {payment_type} payment processed successfully',
            'transaction': transaction.to_dict(),
            'loan': {
                'id': loan.id,
                'amount_paid': float(loan.amount_paid),
                'principal_paid': float(loan.principal_paid),
                'interest_paid': float(loan.interest_paid),
                'current_principal': float(loan.current_principal),
                'balance': float(loan.balance),
                'due_date': loan.due_date.isoformat() if loan.due_date else None,
                'status': loan.status
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Manual M-Pesa payment error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@payments_bp.route('/<int:payment_id>/status', methods=['GET'])
@jwt_required()
def get_payment_status(payment_id):
    """Get payment status"""
    payment = db.session.get(Payment, payment_id)
    
    if not payment:
        return jsonify({'error': 'Payment not found'}), 404
    
    return jsonify(payment.to_dict()), 200

@payments_bp.route('/mpesa/check-status', methods=['POST'])
@jwt_required()
def check_payment_status():
    """Check M-Pesa payment status"""
    try:
        data = request.json
        checkout_request_id = data.get('checkout_request_id')
        
        if not checkout_request_id:
            return jsonify({'error': 'Checkout request ID required'}), 400
        
        payment = Payment.query.filter_by(checkout_request_id=checkout_request_id).first()
        if not payment:
            return jsonify({'error': 'Payment record not found'}), 404
        
        if payment.status == 'completed':
            transaction = Transaction.query.filter_by(
                mpesa_receipt=payment.mpesa_receipt_number
            ).first()
            
            return jsonify({
                'success': True,
                'status': {
                    'ResultCode': '0',
                    'ResultDesc': 'The service request is processed successfully.'
                },
                'transaction': transaction.to_dict() if transaction else None,
                'payment_status': 'completed'
            }), 200
        
        daraja = DarajaAPI()
        status_response = daraja.check_stk_status(checkout_request_id)
        
        if status_response.get('success'):
            status_data = status_response.get('status', {})
            result_code = status_data.get('ResultCode')
            
            if result_code != '0':
                payment.status = 'failed'
                payment.result_code = str(result_code)
                payment.result_desc = status_data.get('ResultDesc')
                db.session.commit()
                
                return jsonify({
                    'success': False,
                    'error': status_data.get('ResultDesc'),
                    'payment_status': 'failed'
                })
        else:
            return jsonify({
                'success': False,
                'error': status_response.get('error'),
                'payment_status': 'pending'
            })
            
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False, 
            'error': str(e),
            'payment_status': 'error'
        }), 500

# Export for use in other modules
__all__ = ['recalculate_loan']