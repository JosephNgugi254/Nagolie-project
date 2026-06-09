from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime, timedelta
from app import db, limiter
from app.models import Payment, Loan, Transaction
from app.utils.daraja import DarajaAPI
from app.utils.security import log_audit, role_required
from app.utils.decorators import role_required
from app.services.ledger import record_ledger_entry

payments_bp = Blueprint('payments', __name__)


def compute_overdue(loan, today=None):
    """
    Returns (overdue_days, overdue_weeks) for an active loan.
    - Daily loans: overdue starts on day 15 (grace period 14 days)
    - Weekly loans: grace period = first 2 weeks, overdue starts at week 3
      (week 3 = 1 week overdue, week 4 = 2 weeks overdue, ...)
    """
    if today is None:
        today = date.today()

    if loan.status != 'active':
        return 0, 0

    if not loan.disbursement_date:
        return 0, 0

    # Convert disbursement_date to date object
    disb = loan.disbursement_date.date() if hasattr(loan.disbursement_date, 'date') else loan.disbursement_date
    days_since = (today - disb).days

    if loan.repayment_plan == 'daily':
        # Overdue starts after 14 days
        overdue_days = max(0, days_since - 14)
        return overdue_days, 0
    else:  # weekly (including waived loans with interest_rate 0)
        # Week numbering: week 1 = days 0-6, week 2 = days 7-13, week 3 = days 14-20, ...
        week_number = days_since // 7 + 1
        # Weeks overdue = max(0, week_number - 2)
        overdue_weeks = max(0, week_number - 2)
        return 0, overdue_weeks




# ---------------------------------------------------------------------------
# Core interest-accrual engine
# ---------------------------------------------------------------------------

def recalculate_loan(loan):
    """Bring a loan's financial fields fully up-to-date."""
    if loan.status != 'active':
        return loan
    
    # No interest accrual for zero‑interest loans
    if loan.interest_rate == 0:
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


def _record_accrual(loan, amount, notes, event_date):
    """Helper to record an accrual ledger entry, avoiding duplicates.
    
    For weekly compound loans, `amount` should be the net amount actually
    capitalised (week_interest - prepaid). This ensures the ledger shows
    the true change in principal.
    """
    if not loan.last_accrual_recorded or event_date > loan.last_accrual_recorded:
        record_ledger_entry(
            loan=loan,
            event_type='accrual',
            amount=amount,
            notes=notes,
            event_date=event_date,
            user_id=None
        )
        loan.last_accrual_recorded = event_date


def _accrue_daily(loan, today, last_date):
    """Accrue daily simple interest – charge on day 0 (same day) and every 24h thereafter."""
    # If this is the first accrual ever (last_date equals disbursement date and no interest accrued)
    disb_date = loan.disbursement_date.date()
    if last_date == disb_date and loan.accrued_interest == 0:
        # Charge first day’s interest immediately
        first_day_interest = (loan.current_principal * Decimal('0.045')).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
        loan.accrued_interest += first_day_interest
        _record_accrual(
            loan=loan,
            amount=first_day_interest,
            notes='Daily interest (same day) at 4.5%',
            event_date=datetime.combine(disb_date, datetime.min.time())
        )
        # Advance last_interest_payment_date to today so we don't double count
        loan.last_interest_payment_date = datetime.combine(disb_date, datetime.min.time())

    # Now handle full days passed (each 24h block)
    # Convert to datetime for precise day counting
    last_dt = loan.last_interest_payment_date
    now_dt = datetime.combine(today, datetime.min.time())
    delta_days = (now_dt - last_dt).days

    if delta_days > 0:
        daily_rate = Decimal('0.045')
        for i in range(delta_days):
            day_interest = (loan.current_principal * daily_rate).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
            loan.accrued_interest += day_interest
            accrual_date = last_dt + timedelta(days=i+1)
            _record_accrual(
                loan=loan,
                amount=day_interest,
                notes=f'Daily interest accrued at {daily_rate*100}%',
                event_date=datetime.combine(accrual_date, datetime.min.time())
            )
        loan.last_interest_payment_date += timedelta(days=delta_days)

    unpaid = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)
    loan.balance = loan.current_principal + unpaid

    if loan.current_principal <= Decimal('0.01') and unpaid <= Decimal('0.01'):
        loan.status = 'completed'
        loan.current_principal = Decimal('0')
        loan.balance = Decimal('0')

    return loan

def _get_second_sunday(disbursement_date):
    dow = disbursement_date.weekday()
    if dow == 6:  # Sunday
        # For Sunday loans, second Sunday = next Sunday (7 days later)
        return disbursement_date + timedelta(days=7)
    else:
        days_to_first_sunday = (6 - dow) % 7
        first_sunday = disbursement_date + timedelta(days=days_to_first_sunday)
        second_sunday = first_sunday + timedelta(days=7)
        return second_sunday

def _accrue_weekly(loan, today, last_date):
    """Accrue weekly compound interest only after the second Sunday."""
    disb = loan.disbursement_date.date()
    second_sunday = _get_second_sunday(disb)
    # Compounding is allowed only on or after the Monday following second Sunday
    compounding_allowed = today > second_sunday

    days_since = (today - last_date).days
    weeks_passed = max(0, (days_since - 1) // 7)

    if weeks_passed > 0 and compounding_allowed:
        max_due = datetime.combine(
            disb + timedelta(days=14),
            loan.due_date.time() if loan.due_date else datetime.min.time()
        )
        for w in range(weeks_passed):
            week_num = ((last_date - disb).days // 7) + w
            period_key = f"{disb.isoformat()}-W{week_num}"
            week_interest = (loan.current_principal * Decimal('0.30')).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
            # Apply pre‑paid amount if it exists for this period
            if loan.interest_prepaid_period == period_key:
                prepaid = loan.interest_prepaid_amount or Decimal('0')
                net_added = max(Decimal('0'), week_interest - prepaid)
                loan.current_principal += net_added
                loan.accrued_interest += week_interest
                loan.interest_prepaid_period = None
                loan.interest_prepaid_amount = Decimal('0')
            else:
                net_added = week_interest
                loan.current_principal += net_added
                loan.accrued_interest += net_added

            # Record ledger entry for the compounding event
            accrual_date = last_date + timedelta(days=(w + 1) * 7)
            _record_accrual(
                loan=loan,
                amount=net_added,
                notes=(
                    f'Weekly compound interest at 30% – net after prepaid'
                    if net_added != week_interest
                    else f'Weekly compound interest at 30%'
                ),
                event_date=datetime.combine(accrual_date, datetime.min.time())
            )
            # Update due date (max 14 days after disbursement)
            candidate = loan.due_date + timedelta(days=7)
            loan.due_date = candidate if candidate <= max_due else max_due

        loan.last_interest_payment_date += timedelta(days=weeks_passed * 7)

    loan.balance = loan.current_principal
    if loan.current_principal <= Decimal('0.01'):
        unpaid_interest = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)
        if unpaid_interest <= Decimal('0.01'):
            loan.status = 'completed'
            loan.current_principal = Decimal('0')
            loan.balance = Decimal('0')
        else:
            loan.balance = unpaid_interest
    return loan

# ---------------------------------------------------------------------------
# Period helpers
# ---------------------------------------------------------------------------

def _get_current_period_key(loan):
    today = datetime.now().date()
    if loan.repayment_plan == 'daily':
        return today.strftime("%Y-%j")
    else:
        disb = loan.disbursement_date.date() if hasattr(loan.disbursement_date, 'date') else loan.disbursement_date
        days_since = (today - disb).days
        week_num = days_since // 7
        return f"{disb.isoformat()}-W{week_num}"

def _get_current_period_interest(loan):
    """Return the net remaining interest for the current period (weekly or daily)."""
    if loan.repayment_plan == 'daily':
        daily_rate = Decimal('0.045')
        raw_interest = (loan.current_principal * daily_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    else:   # weekly
        raw_interest = (loan.current_principal * Decimal('0.30')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    # Subtract any pre‑paid amount for the current period
    current_period = _get_current_period_key(loan)
    if loan.interest_prepaid_period == current_period:
        prepaid = loan.interest_prepaid_amount or Decimal('0')
        remaining = max(Decimal('0'), raw_interest - prepaid)
        return remaining
    return raw_interest


# ---------------------------------------------------------------------------
# Apply payment – corrected for compound interest
# ---------------------------------------------------------------------------

def _apply_payment(loan, payment_type, payment_amount, notes, method='Cash'):
    """
    Mutate loan fields for a payment.
    For weekly compound loans, interest payments are only allowed
    as pre‑period payments (before the week ends) and are capped at
    the current week's interest.
    """
    if payment_type == 'interest':
        current_period = _get_current_period_key(loan)
        current_period_interest = _get_current_period_interest(loan)

        if loan.repayment_plan == 'weekly' and loan.interest_rate > 0:
            # Compound weekly – interest payment only allowed BEFORE the week ends
            if loan.interest_prepaid_period == current_period:
                already_paid = loan.interest_prepaid_amount or Decimal('0')
                remaining_period_interest = max(Decimal('0'), current_period_interest - already_paid)
                if remaining_period_interest <= Decimal('0.01'):
                    return (
                        f'Interest for this week has already been paid '
                        f'(KSh {float(already_paid):,.2f} on {loan.interest_prepaid_period}). '
                        f'Next interest payment available after the week ends (if principal not fully paid).',
                        400
                    )
                max_payable = remaining_period_interest
            else:
                max_payable = current_period_interest

            if payment_amount > max_payable + Decimal('0.01'):
                return (
                    f'Interest payment cannot exceed KSh {float(max_payable):,.2f} for this week.',
                    400
                )

            # Payment is always a pre‑period payment (interest not yet capitalised)
            loan.interest_prepaid_period = current_period
            loan.interest_prepaid_amount = (loan.interest_prepaid_amount or Decimal('0')) + payment_amount
            loan.interest_paid += payment_amount
            loan.amount_paid += payment_amount
            notes_text = (
                notes or 
                f'{method} PRE-PERIOD interest payment of KSh {float(payment_amount):,.2f}. '
                f'Interest for current week locked – principal unchanged until week ends.'
            )

        else:
            # Daily plan – unchanged
            if loan.interest_prepaid_period == current_period:
                already_paid_today = loan.interest_prepaid_amount or Decimal('0')
                today_interest = current_period_interest
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
                unpaid = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)
                if unpaid <= Decimal('0.01'):
                    max_payable = current_period_interest
                else:
                    max_payable = unpaid

            if payment_amount > max_payable + Decimal('0.01'):
                return (
                    f'Interest payment cannot exceed KSh {float(max_payable):,.2f}.',
                    400,
                )

            unpaid_accrued = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)
            is_pre_period = unpaid_accrued <= Decimal('0.01')

            if is_pre_period:
                loan.interest_prepaid_period = current_period
                loan.interest_prepaid_amount = (loan.interest_prepaid_amount or Decimal('0')) + payment_amount
            else:
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
        
        loan.principal_paid += payment_amount
        loan.current_principal -= payment_amount
        if loan.current_principal < Decimal('0'):
            loan.current_principal = Decimal('0')
        loan.amount_paid += payment_amount
        loan.interest_prepaid_period = None
        loan.interest_prepaid_amount = Decimal('0')
        notes_text = notes or f'{method} principal payment of KSh {float(payment_amount):,.2f}'

    else:
        return ("Invalid payment_type. Must be 'principal' or 'interest'", 400)

    return notes_text


# ---------------------------------------------------------------------------
# Loan summary – correct unpaid_interest for weekly loans
# ---------------------------------------------------------------------------

def _loan_summary(loan):
    unpaid = Decimal('0')
    period_interest = Decimal('0')
    period_prepaid = Decimal('0')
    period_already_paid = False
    current_period = _get_current_period_key(loan)

    if loan.repayment_plan == 'weekly' and loan.interest_rate > 0:
        # Raw weekly interest (30% of current principal)
        raw_period_interest = (loan.current_principal * Decimal('0.30')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        period_interest = raw_period_interest   # this goes to "Interest / Period"

        if loan.interest_prepaid_period == current_period:
            period_prepaid = loan.interest_prepaid_amount or Decimal('0')
            # Unpaid = raw interest minus what has been prepaid
            unpaid = max(Decimal('0'), raw_period_interest - period_prepaid)
            period_already_paid = period_prepaid >= raw_period_interest - Decimal('0.01')
        else:
            unpaid = raw_period_interest
            period_prepaid = Decimal('0')
            period_already_paid = False
    else:
        # Daily or zero‑interest – use accumulated interest
        raw_period_interest = _get_current_period_interest(loan)
        period_interest = raw_period_interest
        if loan.interest_prepaid_period == current_period:
            period_prepaid = loan.interest_prepaid_amount or Decimal('0')
            period_already_paid = period_prepaid >= raw_period_interest - Decimal('0.01')
        unpaid = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)

    return {
        'id': loan.id,
        'amount_paid': float(loan.amount_paid),
        'principal_paid': float(loan.principal_paid),
        'interest_paid': float(loan.interest_paid),
        'current_principal': float(loan.current_principal),
        'accrued_interest': float(loan.accrued_interest),
        'unpaid_interest': float(unpaid),               # correct for weekly: raw - prepaid
        'balance': float(loan.balance),
        'due_date': loan.due_date.isoformat() if loan.due_date else None,
        'status': loan.status,
        'repayment_plan': loan.repayment_plan,
        'interest_type': loan.interest_type,
        'current_period_interest': float(period_interest),   # now raw weekly interest
        'period_interest_prepaid': float(period_prepaid),
        'period_interest_fully_paid': period_already_paid,
        'interest_prepaid_period': loan.interest_prepaid_period,
    }

# ---------------------------------------------------------------------------
# Cash payment endpoint
# ---------------------------------------------------------------------------

@payments_bp.route('/cash', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer'])
def process_cash_payment():
    try:
        data = request.json
        loan_id = data.get('loan_id')
        amount = data.get('amount')
        payment_type = data.get('payment_type', 'principal')
        notes = data.get('notes', '')

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

        record_ledger_entry(
            loan=loan,
            event_type='payment',
            transaction=txn,
            amount=payment_amount,
            notes=result,
            reference='CASH',
            user_id=get_jwt_identity()
        )
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
# Manual M-Pesa payment endpoint
# ---------------------------------------------------------------------------

@payments_bp.route('/mpesa/manual', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer'])
def process_mpesa_manual():
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

        record_ledger_entry(
            loan=loan,
            event_type='payment',
            transaction=txn,
            amount=payment_amount,
            notes=result,
            reference=mpesa_reference.upper(),
            user_id=get_jwt_identity()
        )
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
# STK Push endpoint (unchanged logic)
# ---------------------------------------------------------------------------

@payments_bp.route('/mpesa/stk-push', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer'])
@limiter.limit("10 per minute")
def stk_push():
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

        daraja = DarajaAPI()
        result = daraja.stk_push(
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
# M-Pesa callback (unchanged)
# ---------------------------------------------------------------------------

@payments_bp.route('/callback', methods=['POST'])
@limiter.limit("100 per minute")
def mpesa_callback():
    try:
        data = request.get_json()
        body = data.get('Body', {}).get('stkCallback', {})
        code = body.get('ResultCode')
        cid = body.get('CheckoutRequestID')

        if not cid:
            return jsonify({'ResultCode': 1, 'ResultDesc': 'Missing CID'}), 400

        payment = Payment.query.filter_by(checkout_request_id=cid).first()
        if not payment:
            return jsonify({'ResultCode': 1, 'ResultDesc': 'Not found'}), 404

        if code == 0:
            items = body.get('CallbackMetadata', {}).get('Item', [])
            rd = {i['Name']: i.get('Value') for i in items}
            cb_amt = Decimal(str(rd.get('Amount', 0))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            receipt = rd.get('MpesaReceiptNumber')
            phone = rd.get('PhoneNumber')
            loan = payment.loan
            ptype = payment.payment_type or 'principal'

            loan = recalculate_loan(loan)
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

            txn = Transaction(
                loan_id=loan.id, transaction_type='payment', payment_type=ptype,
                amount=cb_amt, payment_method='mpesa', mpesa_receipt=receipt,
                notes=result, status='completed'
            )
            db.session.add(txn)
            db.session.commit()

            record_ledger_entry(
                loan=loan,
                event_type='payment',
                transaction=txn,
                amount=cb_amt,
                notes=result,
                reference=receipt,
                user_id=None
            )
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


# ---------------------------------------------------------------------------
# Status endpoints
# ---------------------------------------------------------------------------

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