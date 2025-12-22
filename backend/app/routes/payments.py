from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required
from decimal import Decimal
from datetime import datetime, timedelta
from app import db, limiter
from app.models import Payment, Loan, Transaction
from app.utils.daraja import DarajaAPI
from app.utils.security import log_audit, admin_required

payments_bp = Blueprint('payments', __name__)

def calculate_weekly_interest(current_principal, rate=30.0):
    """Calculate interest for one week based on current principal"""
    if current_principal > 0:
        return current_principal * (Decimal(str(rate)) / Decimal('100'))
    return Decimal('0')

def get_loan_week_number(loan):
    """
    Calculate which week of the loan we're in.
    Week 1 = disbursement_date to disbursement_date + 7 days
    Week 2 = disbursement_date + 7 to disbursement_date + 14 days
    etc.
    """
    if not loan.disbursement_date:
        return 1
    
    disbursement_date = loan.disbursement_date.date() if hasattr(loan.disbursement_date, 'date') else loan.disbursement_date
    today = datetime.now().date()
    
    days_since_disbursement = (today - disbursement_date).days
    week_number = (days_since_disbursement // 7) + 1  # Week 1, 2, 3, etc.
    
    return max(1, week_number)

def get_expected_balance(loan):
    """Calculate what the balance should be based on current state"""
    from decimal import Decimal
    
    # Base: current principal
    balance = loan.current_principal
    
    # Calculate interest periods
    today = datetime.now().date()
    
    if loan.disbursement_date:
        disbursement_date = loan.disbursement_date.date() if hasattr(loan.disbursement_date, 'date') else loan.disbursement_date
    else:
        disbursement_date = today
        
    # Calculate weeks since disbursement
    days_since_disbursement = (today - disbursement_date).days
    weeks_since_disbursement = max(1, (days_since_disbursement + 6) // 7)
    
    # Each week: 30% interest on current principal at start of week
    running_principal = loan.principal_amount
    total_interest_expected = Decimal('0')
    
    for week in range(weeks_since_disbursement):
        weekly_interest = running_principal * (loan.interest_rate / Decimal('100'))
        total_interest_expected += weekly_interest
        
        # For next week, adjust principal based on payments
        if week == 0:
            running_principal = max(Decimal('0'), running_principal - loan.principal_paid)
        else:
            running_principal = loan.current_principal
    
    # Balance = current_principal + (total_interest_expected - interest_paid)
    interest_remaining = max(Decimal('0'), total_interest_expected - loan.interest_paid)
    balance = loan.current_principal + interest_remaining
    
    return balance

def recalculate_loan(loan):
    """Recalculate loan balances with proper interest tracking"""
    from decimal import Decimal
    
    # Calculate what balance should be
    expected_balance = get_expected_balance(loan)
    
    # Update loan balance
    loan.balance = expected_balance
    
    # Update total amount (original + all interest that should accrue)
    if loan.disbursement_date:
        disbursement_date = loan.disbursement_date.date() if hasattr(loan.disbursement_date, 'date') else loan.disbursement_date
        today = datetime.now().date()
        days_since_disbursement = (today - disbursement_date).days
        weeks_since_disbursement = max(1, (days_since_disbursement + 6) // 7)
        
        # Calculate total interest that should have accrued
        total_interest = Decimal('0')
        running_principal = loan.principal_amount
        
        for week in range(weeks_since_disbursement):
            weekly_interest = running_principal * (loan.interest_rate / Decimal('100'))
            total_interest += weekly_interest
            
            # Adjust principal for next week based on payments
            if week == 0:
                running_principal = max(Decimal('0'), loan.principal_amount - loan.principal_paid)
            else:
                running_principal = loan.current_principal
        
        loan.total_amount = loan.principal_amount + total_interest
    
    return loan

@payments_bp.route('/cash', methods=['POST'])
@jwt_required()
@admin_required
def process_cash_payment():
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
        
        # Recalculate to get current accurate balance
        loan = recalculate_loan(loan)
        
        payment_amount = Decimal(str(amount))
        
        if payment_type == 'interest':
            # Calculate interest due up to now
            interest_due = loan.balance - loan.current_principal
            
            if payment_amount > interest_due:
                return jsonify({
                    'error': f'Interest payment cannot exceed {float(interest_due)}'
                }), 400
            
            # Process interest payment
            loan.interest_paid += payment_amount
            loan.amount_paid += payment_amount
            loan.last_interest_payment_date = datetime.utcnow()
            
            # Check if all interest for current period is paid
            interest_due_after_payment = (loan.balance - loan.current_principal)
            
            # If interest is fully paid, extend due date by 7 days
            if interest_due_after_payment <= Decimal('0'):
                loan.due_date = datetime.utcnow() + timedelta(days=7)
            
            loan = recalculate_loan(loan)
            notes_text = notes or f'Interest payment of KSh {float(amount)}'
            
        else:  # principal payment
            if payment_amount > loan.current_principal:
                return jsonify({
                    'error': f'Principal payment cannot exceed {float(loan.current_principal)}'
                }), 400
            
            loan.principal_paid += payment_amount
            loan.current_principal -= payment_amount
            loan.amount_paid += payment_amount
            
            loan = recalculate_loan(loan)
            notes_text = notes or f'Principal payment of KSh {float(amount)}'
        
        # Mark as completed only when BOTH principal and balance are zero
        if loan.current_principal <= Decimal('0') and loan.balance <= Decimal('0'):
            loan.status = 'completed'
            if loan.livestock:
                db.session.delete(loan.livestock)
        
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
            'amount': float(amount),
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
                'status': loan.status
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Error processing cash payment: {str(e)}")
        return jsonify({'error': str(e)}), 500

@payments_bp.route('/mpesa/stk-push', methods=['POST'])
@jwt_required()
@admin_required
@limiter.limit("10 per minute")
def stk_push():
    """Send M-Pesa STK Push"""
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
        
        payment_amount = Decimal(str(amount))
        loan = recalculate_loan(loan)
        
        # Validate amount based on payment type
        if payment_type == 'interest':
            interest_due = loan.balance - loan.current_principal
            if payment_amount > interest_due:
                return jsonify({'success': False, 'error': f'Interest payment cannot exceed {float(interest_due)}'}), 400
        elif payment_type == 'principal' and payment_amount > loan.current_principal:
            return jsonify({'success': False, 'error': f'Principal payment cannot exceed {float(loan.current_principal)}'}), 400
        
        daraja = DarajaAPI()
        account_reference = f"NAGOLIE{loan.id}"
        
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
    """Handle M-Pesa callback"""
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
            
            callback_amount = Decimal(str(amount))
            loan = payment.loan
            payment_type = payment.payment_type or 'principal'
            
            loan = recalculate_loan(loan)
            
            # Validate amount
            if payment_type == 'interest':
                interest_due = loan.balance - loan.current_principal
                if callback_amount > interest_due:
                    payment.status = 'failed'
                    payment.result_code = '1'
                    payment.result_desc = f'Interest payment exceeds remaining {float(interest_due)}'
                    payment.completed_at = datetime.utcnow()
                    db.session.commit()
                    return jsonify({'ResultCode': 1, 'ResultDesc': 'Payment validation failed'}), 200
                
                loan.interest_paid += callback_amount
                loan.amount_paid += callback_amount
                loan.last_interest_payment_date = datetime.utcnow()
                
                # Check if interest is fully paid for current period
                interest_due_after_payment = (loan.balance - loan.current_principal)
                
                if interest_due_after_payment <= Decimal('0'):
                    # Full interest paid - extend due date
                    loan.due_date = datetime.utcnow() + timedelta(days=7)
                
                loan = recalculate_loan(loan)
                notes_text = f'M-Pesa interest payment: {mpesa_receipt_number}'
            else:
                if callback_amount > loan.current_principal:
                    payment.status = 'failed'
                    payment.result_code = '1'
                    payment.result_desc = f'Principal payment exceeds current principal {float(loan.current_principal)}'
                    payment.completed_at = datetime.utcnow()
                    db.session.commit()
                    return jsonify({'ResultCode': 1, 'ResultDesc': 'Payment validation failed'}), 200
                
                loan.principal_paid += callback_amount
                loan.current_principal -= callback_amount
                loan.amount_paid += callback_amount
                loan = recalculate_loan(loan)
                notes_text = f'M-Pesa principal payment: {mpesa_receipt_number}'
            
            # Mark as completed when both principal and balance are zero
            if loan.current_principal <= Decimal('0') and loan.balance <= Decimal('0'):
                loan.status = 'completed'
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
                status='completed',
                created_at=datetime.utcnow()
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
    """Process manual M-Pesa payment"""
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
        
        payment_amount = Decimal(str(amount))
        loan = recalculate_loan(loan)
        
        # Validate amount
        if payment_type == 'interest':
            interest_due = loan.balance - loan.current_principal
            if payment_amount > interest_due:
                return jsonify({'error': f'Interest payment cannot exceed {float(interest_due)}'}), 400
        elif payment_type == 'principal' and payment_amount > loan.current_principal:
            return jsonify({'error': f'Principal payment cannot exceed {float(loan.current_principal)}'}), 400
        
        # Process payment
        if payment_type == 'interest':
            loan.interest_paid += payment_amount
            loan.amount_paid += payment_amount
            loan.last_interest_payment_date = datetime.utcnow()
            
            # Check if interest is fully paid for current period
            interest_due_after_payment = (loan.balance - loan.current_principal)
            
            if interest_due_after_payment <= Decimal('0'):
                # Full interest paid - extend due date
                loan.due_date = datetime.utcnow() + timedelta(days=7)
            
            loan = recalculate_loan(loan)
            notes_text = notes or f'M-Pesa interest payment: {mpesa_reference}'
        else:
            loan.principal_paid += payment_amount
            loan.current_principal -= payment_amount
            loan.amount_paid += payment_amount
            loan = recalculate_loan(loan)
            notes_text = notes or f'M-Pesa principal payment: {mpesa_reference}'
        
        # Mark as completed when both are zero
        if loan.current_principal <= Decimal('0') and loan.balance <= Decimal('0'):
            loan.status = 'completed'
            if loan.livestock:
                db.session.delete(loan.livestock)
        
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
                'status': loan.status
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Manual M-Pesa payment error: {str(e)}")
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
            
            if result_code == '0':
                # Process successful payment
                pass
            else:
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

# Export recalculate_loan for use in admin routes
__all__ = ['recalculate_loan', 'calculate_weekly_interest', 'get_loan_week_number']
