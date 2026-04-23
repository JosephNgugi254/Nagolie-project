from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timedelta
from app import db, limiter
from app.models import Payment, Loan, Transaction
from app.utils.daraja import DarajaAPI
from app.utils.security import log_audit, role_required

payments_bp = Blueprint('payments', __name__)


# ---------------------------------------------------------------------------
# Core interest-accrual engine
# ---------------------------------------------------------------------------

def recalculate_loan(loan):
    """
    Bring a loan's financial fields fully up-to-date.

    ── WEEKLY COMPOUND PLAN ───────────────────────────────────────────────
    • Each 7-day period that has elapsed (since last_interest_payment_date):
        week_interest = current_principal × 30%
        current_principal += week_interest          ← compound
        accrued_interest  += week_interest
        due_date          += 7 days  (capped at disbursement_date + 14 days)
    • balance = current_principal
      (interest is already folded into the principal; it is not a
       separate line-item for the client – they see one number to pay)
    • Max duration: 2 weeks from disbursement

    ── DAILY SIMPLE PLAN ──────────────────────────────────────────────────
    • Each day that has elapsed:
        day_interest = current_principal × 4.5%     ← simple on CURRENT principal
        accrued_interest += day_interest
    • balance = current_principal + (accrued_interest – interest_paid)
    • If the client pays some principal → current_principal falls →
      tomorrow's daily charge is automatically smaller.
    • Max duration: 14 days from disbursement (due_date is fixed)
    """
    if loan.status != 'active':
        return loan
    
    # No interest accrual for zero‑interest loans
    if loan.interest_rate == 0:
        # Ensure balance is simply current_principal (no interest)
        loan.balance = loan.current_principal
        return loan

    today = datetime.now().date()

    if not loan.disbursement_date:
        loan.disbursement_date = datetime.now()
    if not loan.last_interest_payment_date:
        loan.last_interest_payment_date = loan.disbursement_date

    last_date = (
        loan.last_interest_payment_date.date()
        if hasattr(loan.last_interest_payment_date, 'date')
        else loan.last_interest_payment_date
    )

    if loan.repayment_plan == 'daily':
        return _accrue_daily(loan, today, last_date)
    else:
        return _accrue_weekly(loan, today, last_date)


def _accrue_daily(loan, today, last_date):
    """4.5% of current_principal per day (simple, not compound)."""
    days_since = (today - last_date).days

    if days_since > 0:
        daily_rate = Decimal('0.045')
        for _ in range(days_since):
            # Interest each day is based on the principal at that moment.
            # Because principal only changes when a principal payment is made
            # (not automatically each day), we can multiply once:
            day_interest = (loan.current_principal * daily_rate).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
            loan.accrued_interest += day_interest

        loan.last_interest_payment_date += timedelta(days=days_since)

    unpaid = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)
    loan.balance = loan.current_principal + unpaid

    if loan.current_principal <= Decimal('0.01') and unpaid <= Decimal('0.01'):
        loan.status = 'completed'
        loan.current_principal = Decimal('0')
        loan.balance = Decimal('0')

    return loan


def _accrue_weekly(loan, today, last_date):
    """30% compound per 7-day period; due_date rolls forward each week.
    
    Respects pre-paid interest: if interest was pre-paid for a period,
    that payment is applied rather than compounding the full amount.
    """
    days_since  = (today - last_date).days
    weeks_passed = days_since // 7

    if weeks_passed > 0:
        disb = (
            loan.disbursement_date.date()
            if hasattr(loan.disbursement_date, 'date')
            else loan.disbursement_date
        )
        max_due = datetime.combine(disb + timedelta(days=14),
                                   loan.due_date.time() if loan.due_date else datetime.min.time())

        for w in range(weeks_passed):
            week_num = ((last_date - disb).days // 7) + w
            period_key = f"{disb.isoformat()}-W{week_num}"
            
            week_interest = (loan.current_principal * Decimal('0.30')).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
            
            # Check if this specific period was pre-paid
            if loan.interest_prepaid_period == period_key:
                prepaid = loan.interest_prepaid_amount or Decimal('0')
                remaining_to_compound = max(Decimal('0'), week_interest - prepaid)
                
                # Only compound the unpaid portion
                loan.current_principal += remaining_to_compound
                loan.accrued_interest  += week_interest  # record full accrual
                
                # Clear the pre-payment record since period has now passed
                loan.interest_prepaid_period = None
                loan.interest_prepaid_amount = Decimal('0')
            else:
                # Normal compound: full interest into principal
                loan.current_principal += week_interest
                loan.accrued_interest  += week_interest

            # Roll due_date forward by 7 days, but never past max
            candidate = loan.due_date + timedelta(days=7)
            loan.due_date = candidate if candidate <= max_due else max_due

        loan.last_interest_payment_date += timedelta(days=weeks_passed * 7)

    # Balance for weekly = current_principal (interest already inside)
    loan.balance = loan.current_principal

    if loan.current_principal <= Decimal('0.01'):
        # Check if there's still unpaid interest before marking complete
        unpaid_interest = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)
        if unpaid_interest <= Decimal('0.01'):
            loan.status = 'completed'
            loan.current_principal = Decimal('0')
            loan.balance = Decimal('0')
        else:
            # Principal paid but interest still owed — stay active
            loan.balance = unpaid_interest

    return loan

# ---------------------------------------------------------------------------
# Payment helper
# ---------------------------------------------------------------------------

def _get_current_period_key(loan):
    """
    Returns a string key identifying the current interest period.
    Weekly: "YYYY-WW-N" based on disbursement_date cycles
    Daily:  "YYYY-DOY" (year + day-of-year)
    """
    today = datetime.now().date()
    if loan.repayment_plan == 'daily':
        return today.strftime("%Y-%j")  # e.g. "2026-100"
    else:
        # Weekly: compute which week cycle we're in since disbursement
        disb = loan.disbursement_date.date() if hasattr(loan.disbursement_date, 'date') else loan.disbursement_date
        days_since = (today - disb).days
        week_num = days_since // 7  # 0 = week 1, 1 = week 2, etc.
        return f"{disb.isoformat()}-W{week_num}"


def _get_current_period_interest(loan):
    """
    Returns the interest amount that SHOULD be paid for the current period
    (regardless of whether accrual has happened yet via recalculate_loan).
    """
    if loan.repayment_plan == 'daily':
        daily_rate = Decimal('0.045')
        return (loan.current_principal * daily_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    else:
        weekly_rate = Decimal('0.30')
        return (loan.current_principal * weekly_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _apply_payment(loan, payment_type, payment_amount, notes, method='Cash'):
    """
    Mutate loan fields for a payment.
    
    Enhanced with pre-period interest payment support:
    - Allows interest payment BEFORE the period due date
    - Prevents double-payment for the same period  
    - Handles full principal payment with outstanding interest
    - Returns notes string on success, or (error_msg, status_code) on failure.
    """
    if payment_type == 'interest':
        current_period = _get_current_period_key(loan)
        current_period_interest = _get_current_period_interest(loan)
        
        if loan.repayment_plan == 'weekly':
            # ── WEEKLY COMPOUND PLAN ──────────────────────────────────────────
            # Interest has been folded into principal via compounding each week.
            # "Interest payment" reduces current_principal directly.
            #
            # We support two scenarios:
            # A) Pre-period payment: paying THIS week's interest before week ends
            # B) Normal payment: paying already-accrued (compounded) interest

            # Check if this period's interest was already pre-paid
            if loan.interest_prepaid_period == current_period:
                already_paid = loan.interest_prepaid_amount or Decimal('0')
                remaining_period_interest = max(Decimal('0'), current_period_interest - already_paid)
                
                if remaining_period_interest <= Decimal('0.01'):
                    return (
                        f'Interest for this week has already been paid '
                        f'(KSh {float(already_paid):,.2f} on {loan.interest_prepaid_period}). '
                        f'Next payment available after the principal is reduced or the new week begins.',
                        400,
                    )
                # Allow paying the remaining portion
                max_payable = remaining_period_interest
            else:
                # Not pre-paid this period — allow up to full current_principal
                # (which includes all compounded interest)
                max_payable = loan.current_principal

            if payment_amount > max_payable + Decimal('0.01'):
                return (
                    f'Interest payment cannot exceed {float(max_payable):,.2f} '
                    f'for this period.',
                    400,
                )

            # Determine if this is a PRE-period payment (before week is up)
            disb = loan.disbursement_date.date() if hasattr(loan.disbursement_date, 'date') else loan.disbursement_date
            last_ip = loan.last_interest_payment_date
            last_date = last_ip.date() if hasattr(last_ip, 'date') else last_ip if last_ip else disb
            days_since_last = (datetime.now().date() - last_date).days
            is_pre_period = days_since_last < 7  # Less than a full week has elapsed

            if is_pre_period:
                # PRE-PERIOD PAYMENT: Mark this period as pre-paid
                # Don't compound into principal yet — just track the pre-payment
                loan.interest_prepaid_period = current_period
                loan.interest_prepaid_amount = (loan.interest_prepaid_amount or Decimal('0')) + payment_amount
                
                # Record the interest payment but DON'T change current_principal yet
                # The principal stays the same; interest_paid increases
                loan.interest_paid += payment_amount
                loan.amount_paid += payment_amount
                
                notes_text = (
                    notes or 
                    f'{method} PRE-PERIOD interest payment of KSh {float(payment_amount):,.2f}. '
                    f'Interest for current week locked in — principal unchanged until week ends.'
                )
            else:
                # NORMAL PAYMENT (after period ends, interest already compounded):
                # Reduces current_principal (compound interest is baked in)
                loan.current_principal -= payment_amount
                if loan.current_principal < Decimal('0'):
                    loan.current_principal = Decimal('0')
                loan.interest_paid += payment_amount
                loan.principal_paid += payment_amount  # mirrors balance reduction
                loan.amount_paid += payment_amount
                
                # Clear any pre-payment record since we're now in normal mode
                loan.interest_prepaid_period = None
                loan.interest_prepaid_amount = Decimal('0')
                
                notes_text = notes or f'{method} interest payment of KSh {float(payment_amount):,.2f}'

        else:
            # ── DAILY SIMPLE PLAN ─────────────────────────────────────────────
            # Check if today's interest was already pre-paid
            if loan.interest_prepaid_period == current_period:
                already_paid_today = loan.interest_prepaid_amount or Decimal('0')
                today_interest = current_period_interest  # today's daily interest
                remaining_today = max(Decimal('0'), today_interest - already_paid_today)
                
                if remaining_today <= Decimal('0.01'):
                    return (
                        f"Today's interest has already been paid "
                        f"(KSh {float(already_paid_today):,.2f}). "
                        f"Next interest payment available tomorrow.",
                        400,
                    )
                max_payable = remaining_today
            else:
                # Normal: unpaid accrued interest
                unpaid = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)
                
                # Also allow paying today's interest even if not yet accrued
                if unpaid <= Decimal('0.01'):
                    # No accrued interest yet — allow pre-payment of today's interest
                    max_payable = current_period_interest
                else:
                    max_payable = unpaid

            if payment_amount > max_payable + Decimal('0.01'):
                return (
                    f'Interest payment cannot exceed KSh {float(max_payable):,.2f}.',
                    400,
                )

            # Check if this is truly pre-period (today's interest not yet in accrued)
            unpaid_accrued = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)
            is_pre_period = unpaid_accrued <= Decimal('0.01')

            if is_pre_period:
                loan.interest_prepaid_period = current_period
                loan.interest_prepaid_amount = (loan.interest_prepaid_amount or Decimal('0')) + payment_amount
            else:
                # Paying already-accrued interest — clear pre-payment tracking
                loan.interest_prepaid_period = None
                loan.interest_prepaid_amount = Decimal('0')

            loan.interest_paid += payment_amount
            loan.amount_paid += payment_amount
            notes_text = notes or f'{method} interest payment of KSh {float(payment_amount):,.2f}'

    elif payment_type == 'principal':
        if payment_amount > loan.current_principal + Decimal('0.01'):
            return (
                f'Principal payment cannot exceed current principal of '
                f'{float(loan.current_principal):,.2f}',
                400,
            )
        
        # ── FULL PRINCIPAL PAYMENT EDGE CASE ─────────────────────────────────
        # If paying full (or near-full) principal and there's outstanding interest,
        # keep loan ACTIVE with remaining balance = outstanding interest
        
        loan.principal_paid += payment_amount
        loan.current_principal -= payment_amount
        if loan.current_principal < Decimal('0'):
            loan.current_principal = Decimal('0')
        loan.amount_paid += payment_amount
        
        # Clear pre-payment tracking since principal changed
        # (period interest recalculates based on new principal)
        loan.interest_prepaid_period = None
        loan.interest_prepaid_amount = Decimal('0')
        
        notes_text = notes or f'{method} principal payment of KSh {float(payment_amount):,.2f}'

    else:
        return ("Invalid payment_type. Must be 'principal' or 'interest'", 400)

    return notes_text



def _loan_summary(loan):
    """Frontend-ready dict after a payment."""
    unpaid = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)
    
    # Pre-period interest info
    current_period = _get_current_period_key(loan)
    period_interest = _get_current_period_interest(loan)
    period_prepaid = Decimal('0')
    period_already_paid = False
    
    if loan.interest_prepaid_period == current_period:
        period_prepaid = loan.interest_prepaid_amount or Decimal('0')
        period_already_paid = period_prepaid >= period_interest - Decimal('0.01')
    
    return {
        'id':               loan.id,
        'amount_paid':      float(loan.amount_paid),
        'principal_paid':   float(loan.principal_paid),
        'interest_paid':    float(loan.interest_paid),
        'current_principal': float(loan.current_principal),
        'accrued_interest': float(loan.accrued_interest),
        'unpaid_interest':  float(unpaid),
        'balance':          float(loan.balance),
        'due_date':         loan.due_date.isoformat() if loan.due_date else None,
        'status':           loan.status,
        'repayment_plan':   loan.repayment_plan,
        'interest_type':    loan.interest_type,
        # New fields for pre-period tracking
        'current_period_interest': float(period_interest),
        'period_interest_prepaid': float(period_prepaid),
        'period_interest_fully_paid': period_already_paid,
        'interest_prepaid_period': loan.interest_prepaid_period,
    }

# ---------------------------------------------------------------------------
# Cash payment
# ---------------------------------------------------------------------------

@payments_bp.route('/cash', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary'])
def process_cash_payment():
    try:
        data         = request.json
        loan_id      = data.get('loan_id')
        amount       = data.get('amount')
        payment_type = data.get('payment_type', 'principal')
        notes        = data.get('notes', '')

        if not all([loan_id, amount, payment_type]):
            return jsonify({'error': 'Missing required fields'}), 400

        loan = db.session.get(Loan, loan_id)
        if not loan or loan.status != 'active':
            return jsonify({'error': 'Loan not found or not active'}), 404

        loan = recalculate_loan(loan)
        payment_amount = Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        if payment_amount <= 0:
            return jsonify({'error': 'Payment amount must be positive'}), 400

        result = _apply_payment(loan, payment_type, payment_amount, notes, method='Cash')
        if isinstance(result, tuple):
            return jsonify({'error': result[0]}), result[1]

        loan = recalculate_loan(loan)

        txn = Transaction(
            loan_id=loan.id, transaction_type='payment',
            payment_type=payment_type, amount=payment_amount,
            payment_method='cash', notes=result, status='completed'
        )
        db.session.add(txn)
        db.session.commit()

        log_audit('cash_payment_processed', 'transaction', txn.id, {
            'loan_id': loan.id, 'amount': float(payment_amount),
            'payment_type': payment_type, 'balance': float(loan.balance),
        })

        return jsonify({
            'success': True,
            'message': f'{payment_type.capitalize()} payment processed successfully',
            'transaction': txn.to_dict(),
            'loan': _loan_summary(loan),
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Manual M-Pesa payment
# ---------------------------------------------------------------------------

@payments_bp.route('/mpesa/manual', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary'])
def process_mpesa_manual():
    try:
        data            = request.json
        loan_id         = data.get('loan_id')
        amount          = data.get('amount')
        mpesa_reference = data.get('mpesa_reference')
        payment_type    = data.get('payment_type', 'principal')
        notes           = data.get('notes', '')

        if not all([loan_id, amount, mpesa_reference, payment_type]):
            return jsonify({'error': 'Missing required fields'}), 400

        loan = db.session.get(Loan, loan_id)
        if not loan or loan.status != 'active':
            return jsonify({'error': 'Loan not found or not active'}), 404

        loan = recalculate_loan(loan)
        payment_amount = Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        if payment_amount <= 0:
            return jsonify({'error': 'Payment amount must be positive'}), 400

        result = _apply_payment(loan, payment_type, payment_amount, notes,
                                method=f'M-Pesa {mpesa_reference}')
        if isinstance(result, tuple):
            return jsonify({'error': result[0]}), result[1]

        loan = recalculate_loan(loan)

        txn = Transaction(
            loan_id=loan.id, transaction_type='payment',
            payment_type=payment_type, amount=payment_amount,
            payment_method='mpesa', mpesa_receipt=mpesa_reference.upper(),
            notes=result, status='completed'
        )
        db.session.add(txn)
        db.session.commit()

        log_audit('mpesa_manual_payment_processed', 'transaction', txn.id, {
            'loan_id': loan.id, 'amount': float(payment_amount),
            'payment_type': payment_type, 'mpesa_reference': mpesa_reference,
        })

        return jsonify({
            'success': True,
            'message': f'M-Pesa {payment_type} payment processed successfully',
            'transaction': txn.to_dict(),
            'loan': _loan_summary(loan),
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# STK Push
# ---------------------------------------------------------------------------

@payments_bp.route('/mpesa/stk-push', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary'])
@limiter.limit("10 per minute")
def stk_push():
    try:
        data         = request.get_json()
        loan_id      = data.get('loan_id')
        amount       = data.get('amount')
        phone_number = data.get('phone_number')
        payment_type = data.get('payment_type', 'principal')

        if not all([loan_id, amount, phone_number, payment_type]):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400

        loan = db.session.get(Loan, loan_id)
        if not loan or loan.status != 'active':
            return jsonify({'success': False, 'error': 'Loan not found or not active'}), 404

        payment_amount = Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        loan = recalculate_loan(loan)

        if payment_type == 'interest':
            if loan.repayment_plan == 'weekly':
                if payment_amount > loan.current_principal + Decimal('0.01'):
                    return jsonify({'success': False, 'error': f'Cannot exceed current principal {float(loan.current_principal):.2f}'}), 400
            else:
                unpaid = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)
                if payment_amount > unpaid + Decimal('0.01'):
                    return jsonify({'success': False, 'error': f'Cannot exceed unpaid interest {float(unpaid):.2f}'}), 400
        else:
            if payment_amount > loan.current_principal + Decimal('0.01'):
                return jsonify({'success': False, 'error': f'Cannot exceed current principal {float(loan.current_principal):.2f}'}), 400

        daraja  = DarajaAPI()
        result  = daraja.stk_push(
            phone_number=phone_number, amount=str(amount),
            account_reference=f"NAGOLIE{loan.id}",
            callback_url=current_app.config['DARAJA_CALLBACK_URL']
        )

        if result.get('success'):
            rounded = result.get('rounded_amount', int(round(float(amount))))
            payment = Payment(
                loan_id=loan.id, amount=Decimal(str(rounded)),
                phone_number=phone_number, payment_type=payment_type,
                status='pending',
                merchant_request_id=result.get('merchant_request_id'),
                checkout_request_id=result.get('checkout_request_id'),
                created_at=datetime.utcnow()
            )
            db.session.add(payment)
            db.session.commit()
            return jsonify({
                'success': True, 'message': 'STK push sent successfully',
                'merchant_request_id': result.get('merchant_request_id'),
                'checkout_request_id': result.get('checkout_request_id'),
                'customer_message': result.get('customer_message'),
                'rounded_amount': rounded
            })
        return jsonify({'success': False, 'error': result.get('error', 'Failed')}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


# ---------------------------------------------------------------------------
# Callback
# ---------------------------------------------------------------------------

@payments_bp.route('/callback', methods=['POST'])
@limiter.limit("100 per minute")
def mpesa_callback():
    try:
        data  = request.get_json()
        body  = data.get('Body', {}).get('stkCallback', {})
        code  = body.get('ResultCode')
        cid   = body.get('CheckoutRequestID')

        if not cid:
            return jsonify({'ResultCode': 1, 'ResultDesc': 'Missing CID'}), 400

        payment = Payment.query.filter_by(checkout_request_id=cid).first()
        if not payment:
            return jsonify({'ResultCode': 1, 'ResultDesc': 'Not found'}), 404

        if code == 0:
            items   = body.get('CallbackMetadata', {}).get('Item', [])
            rd      = {i['Name']: i.get('Value') for i in items}
            cb_amt  = Decimal(str(rd.get('Amount', 0))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            receipt = rd.get('MpesaReceiptNumber')
            phone   = rd.get('PhoneNumber')
            loan    = payment.loan
            ptype   = payment.payment_type or 'principal'

            loan   = recalculate_loan(loan)
            result = _apply_payment(loan, ptype, cb_amt, '', method=f'M-Pesa {receipt}')
            if isinstance(result, tuple):
                payment.status = 'failed'; payment.result_code = '1'
                payment.result_desc = result[0]; payment.completed_at = datetime.utcnow()
                db.session.commit()
                return jsonify({'ResultCode': 1, 'ResultDesc': 'Validation failed'}), 200

            loan = recalculate_loan(loan)

            payment.status = 'completed'; payment.mpesa_receipt_number = receipt
            payment.phone_number = phone; payment.result_code = str(code)
            payment.result_desc = body.get('ResultDesc'); payment.completed_at = datetime.utcnow()

            db.session.add(Transaction(
                loan_id=loan.id, transaction_type='payment', payment_type=ptype,
                amount=cb_amt, payment_method='mpesa', mpesa_receipt=receipt,
                notes=result, status='completed'
            ))
            db.session.commit()
        else:
            payment.status = 'failed'; payment.result_code = str(code)
            payment.result_desc = body.get('ResultDesc'); payment.completed_at = datetime.utcnow()
            db.session.commit()

        return jsonify({'ResultCode': 0, 'ResultDesc': 'Success'}), 200

    except Exception as e:
        current_app.logger.error(f"Callback error: {e}")
        db.session.rollback()
        return jsonify({'ResultCode': 1, 'ResultDesc': 'Failed'}), 500


@payments_bp.route('/<int:payment_id>/status', methods=['GET'])
@jwt_required()
def get_payment_status(payment_id):
    p = db.session.get(Payment, payment_id)
    if not p:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(p.to_dict()), 200


@payments_bp.route('/mpesa/check-status', methods=['POST'])
@jwt_required()
def check_payment_status():
    try:
        cid = request.json.get('checkout_request_id')
        if not cid:
            return jsonify({'error': 'Checkout request ID required'}), 400
        payment = Payment.query.filter_by(checkout_request_id=cid).first()
        if not payment:
            return jsonify({'error': 'Not found'}), 404
        if payment.status == 'completed':
            txn = Transaction.query.filter_by(mpesa_receipt=payment.mpesa_receipt_number).first()
            return jsonify({'success': True,
                            'status': {'ResultCode': '0', 'ResultDesc': 'Success'},
                            'transaction': txn.to_dict() if txn else None,
                            'payment_status': 'completed'}), 200
        daraja = DarajaAPI()
        sr = daraja.check_stk_status(cid)
        if sr.get('success'):
            rc = sr.get('status', {}).get('ResultCode')
            if rc != '0':
                payment.status = 'failed'; payment.result_code = str(rc)
                payment.result_desc = sr.get('status', {}).get('ResultDesc')
                db.session.commit()
                return jsonify({'success': False, 'error': payment.result_desc, 'payment_status': 'failed'})
        return jsonify({'success': False, 'error': sr.get('error'), 'payment_status': 'pending'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e), 'payment_status': 'error'}), 500


__all__ = ['recalculate_loan', '_apply_payment', '_loan_summary']