from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime, timedelta
from app import db, limiter
from app.models import Payment, Loan, Transaction
from app.utils.daraja import DarajaAPI
from app.utils.security import log_audit, role_required
from app.utils.decorators import role_required
from app.services.ledger import record_ledger_entry

payments_bp = Blueprint('payments', __name__)

# ---------------------------------------------------------------------------
# Overdue helper  (unchanged)
# ---------------------------------------------------------------------------

def compute_overdue(loan, today=None):
    if today is None:
        today = date.today()
    if loan.status != 'active':
        return 0, 0
    if not loan.disbursement_date:
        return 0, 0
    disb = loan.disbursement_date.date() if hasattr(loan.disbursement_date, 'date') else loan.disbursement_date
    days_since = (today - disb).days
    if loan.repayment_plan == 'daily':
        overdue_days = max(0, days_since - 14)
        return overdue_days, 0
    else:
        week_number = days_since // 7 + 1
        overdue_weeks = max(0, week_number - 2)
        return 0, overdue_weeks


def compute_historical_unpaid_interest(loan, as_of_date):
    if loan.repayment_plan == 'daily' and loan.interest_rate > 0:
        disb = loan.disbursement_date.date() if loan.disbursement_date else None
        if not disb:
            return Decimal('0')
        days = (as_of_date - disb).days + 1
        if days <= 0:
            return Decimal('0')
        total_accrued = loan.current_principal * Decimal('0.045') * days
        from app import db
        from app.models import Transaction
        from sqlalchemy import func
        paid = db.session.query(func.sum(Transaction.amount)).filter(
            Transaction.loan_id == loan.id,
            Transaction.transaction_type == 'payment',
            Transaction.payment_type == 'interest',
            Transaction.created_at <= as_of_date,
            Transaction.status == 'completed'
        ).scalar() or Decimal('0')
        return max(Decimal('0'), total_accrued - paid)
    else:
        from app.routes.payments import _get_current_period_interest
        return _get_current_period_interest(loan)

# ---------------------------------------------------------------------------
# Core interest-accrual engine
# ---------------------------------------------------------------------------

def recalculate_loan(loan, save=True):
    """Bring a loan's financial fields fully up-to-date."""
    if loan.status != 'active':
        return loan
    if loan.interest_rate == 0:
        loan.balance = loan.current_principal
        return loan

    today = datetime.now().date()
    if not loan.disbursement_date:
        loan.disbursement_date = datetime.now()
    if not loan.last_interest_payment_date:
        loan.last_interest_payment_date = loan.disbursement_date
    if loan.repayment_plan == 'daily' and not loan.last_compounding_date:
        loan.last_compounding_date = loan.disbursement_date

    if loan.repayment_plan == 'daily':
        return _accrue_daily(loan, today, loan.last_interest_payment_date.date(), save=save)
    else:
        return _accrue_weekly(loan, today, loan.last_interest_payment_date.date(), save=save)

def _record_accrual(loan, amount, notes, event_date, save=True):
    if not save:
        return
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
# ---------------------------------------------------------------------------
# Daily accrual  (unchanged logic — only the weekly function is fixed)
# ---------------------------------------------------------------------------

def _accrue_daily(loan, today, last_date, save=True):
    """
    Daily accrual for daily-plan loans with weekly compounding.
    Compounding occurs on the day AFTER the weekly due date.
    Interest is NOT added on the due date itself.
    """
    if not loan.disbursement_date:
        return loan

    disb = loan.disbursement_date.date()
    if not loan.last_compounding_date:
        loan.last_compounding_date = disb

    if loan.last_interest_payment_date is None:
        loan.last_interest_payment_date = datetime.combine(disb, datetime.min.time())

    daily_rate = Decimal('0.045')
    due_date = loan.due_date.date() if loan.due_date else disb + timedelta(days=7)

    # --- Day-zero interest (immediately upon approval) ---
    if loan.last_interest_payment_date.date() == disb and loan.accrued_interest == 0:
        day_interest = (loan.current_principal * daily_rate).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
        loan.accrued_interest += day_interest
        _record_accrual(
            loan=loan,
            amount=day_interest,
            notes='Daily interest accrued on disbursement day (day 0)',
            event_date=datetime.combine(disb, datetime.min.time()),
            save=save
        )
        # Keep last_interest_payment_date at disb so loop starts from disb+1

    # --- Process each day from the day after last_interest_payment_date up to today ---
    current_date = loan.last_interest_payment_date.date() + timedelta(days=1)

    while current_date <= today:
        # 1. Check if compounding should happen at the start of this day
        first_compounding = due_date + timedelta(days=1)   # day after due date
        if current_date >= first_compounding and (current_date - first_compounding).days % 7 == 0:
            # --- Perform compounding ---
            week_end = current_date - timedelta(days=1)
            days_since_disbursement = (week_end - disb).days
            week_num = days_since_disbursement // 7
            period_key = f"{disb.isoformat()}-W{week_num}"

            prepaid = Decimal('0')
            if loan.interest_prepaid_period == period_key:
                prepaid = loan.interest_prepaid_amount or Decimal('0')

            net_to_capitalise = max(Decimal('0'), loan.accrued_interest - prepaid)

            if net_to_capitalise > 0:
                loan.current_principal += net_to_capitalise
                loan.accrued_interest -= net_to_capitalise
                if loan.accrued_interest < 0:
                    loan.accrued_interest = Decimal('0')

                _record_accrual(
                    loan=loan,
                    amount=net_to_capitalise,
                    notes=f'Weekly compounding – net capitalised: {net_to_capitalise:.2f}',
                    event_date=datetime.combine(current_date, datetime.min.time()),
                    save=save
                )

            # Clear prepaid marker for this period
            if loan.interest_prepaid_period == period_key:
                loan.interest_prepaid_period = None
                loan.interest_prepaid_amount = Decimal('0')

            loan.last_compounding_date = current_date

        # 2. Add daily interest for this day – EXCEPT on the due date itself
        if current_date != due_date:
            day_interest = (loan.current_principal * daily_rate).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
            loan.accrued_interest += day_interest
            _record_accrual(
                loan=loan,
                amount=day_interest,
                notes='Daily interest accrued at 4.5%',
                event_date=datetime.combine(current_date, datetime.min.time()),
                save=save
            )

        # Advance last_interest_payment_date to this day
        loan.last_interest_payment_date = datetime.combine(current_date, datetime.min.time())

        current_date += timedelta(days=1)

    # --- Final balance ---
    unpaid = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)
    loan.balance = loan.current_principal + unpaid

    # -----------------------------------------------------------------
    # NEW: Check for full repayment and DELETE livestock
    # -----------------------------------------------------------------
    if loan.current_principal <= Decimal('0.01') and unpaid <= Decimal('0.01'):
        loan.status = 'completed'
        loan.current_principal = Decimal('0')
        loan.balance = Decimal('0')
        # Delete associated livestock
        if loan.livestock:
            livestock = loan.livestock
            loan.livestock_id = None
            db.session.delete(livestock)

    return loan

def _get_second_sunday(disbursement_date):
    dow = disbursement_date.weekday()
    if dow == 6:
        return disbursement_date + timedelta(days=7)
    else:
        days_to_first_sunday = (6 - dow) % 7
        first_sunday = disbursement_date + timedelta(days=days_to_first_sunday)
        second_sunday = first_sunday + timedelta(days=7)
        return second_sunday

# ---------------------------------------------------------------------------
# Weekly accrual  ← THE FIXED FUNCTION
# ---------------------------------------------------------------------------

def _accrue_weekly(loan, today, last_date, save=True):
    """
    Compound-interest engine for weekly loans.

    Compounding fires at midnight of the day AFTER the due date.
    Interest for the due date itself is NOT added.
    """
    if not loan.disbursement_date:
        return loan

    disb = loan.disbursement_date.date()
    first_due = disb + timedelta(days=7)
    current_due = loan.due_date.date() if loan.due_date else first_due

    # Process every completed week whose compounding moment has arrived
    while current_due + timedelta(days=1) <= today:
        week_start = current_due - timedelta(days=6)
        days_since_disbursement = (week_start - disb).days
        week_num = days_since_disbursement // 7
        period_key = f"{disb.isoformat()}-W{week_num}"

        week_interest = (loan.current_principal * Decimal('0.30')).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )

        prepaid = Decimal('0')
        if loan.interest_prepaid_period == period_key:
            prepaid = loan.interest_prepaid_amount or Decimal('0')

        net_to_capitalise = max(Decimal('0'), week_interest - prepaid)

        if net_to_capitalise > 0:
            loan.current_principal += net_to_capitalise
            # Clear accrued interest – it has been moved to principal
            loan.accrued_interest = Decimal('0')
            _record_accrual(
                loan=loan,
                amount=net_to_capitalise,
                notes=(
                    f'Weekly compound interest (30%) – net after prepaid: '
                    f'{net_to_capitalise:.2f}'
                ),
                event_date=datetime.combine(
                    current_due + timedelta(days=1),
                    datetime.min.time()
                ),
                save=save
            )
        else:
            # No interest to compound; still clear any stale accrued
            loan.accrued_interest = Decimal('0')

        # Clear prepaid marker for this period
        if loan.interest_prepaid_period == period_key:
            loan.interest_prepaid_period = None
            loan.interest_prepaid_amount = Decimal('0')

        current_due += timedelta(days=7)

    loan.due_date = datetime.combine(current_due, datetime.min.time())
    loan.last_interest_payment_date = datetime.combine(today, datetime.min.time())

    # Balance = principal only (accrued_interest is zero after compounding)
    loan.balance = loan.current_principal

    # -----------------------------------------------------------------
    # NEW: Check for full repayment and DELETE livestock
    # -----------------------------------------------------------------
    if loan.current_principal <= Decimal('0.01'):
        loan.status = 'completed'
        loan.current_principal = Decimal('0')
        loan.balance = Decimal('0')
        # Delete associated livestock
        if loan.livestock:
            livestock = loan.livestock
            loan.livestock_id = None
            db.session.delete(livestock)
            # If you want to log this, you can do it here

    return loan


# ---------------------------------------------------------------------------
# Period helpers  (unchanged)
# ---------------------------------------------------------------------------

def _get_current_period_key(loan):
    today = datetime.now().date()
    if not loan.disbursement_date:
        return "unknown"
    disb = loan.disbursement_date.date()
    days_since = (today - disb).days
    week_num = days_since // 7
    return f"{disb.isoformat()}-W{week_num}"


def _get_current_period_interest(loan):
    if loan.repayment_plan == 'daily':
        raw_interest = (loan.current_principal * Decimal('0.045')).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
    else:
        raw_interest = (loan.current_principal * Decimal('0.30')).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )

    current_period = _get_current_period_key(loan)
    if loan.interest_prepaid_period == current_period:
        prepaid = loan.interest_prepaid_amount or Decimal('0')
        return max(Decimal('0'), raw_interest - prepaid)
    return raw_interest


# ---------------------------------------------------------------------------
# Apply payment  (unchanged — relies on the fixed accrual above)
# ---------------------------------------------------------------------------

def _apply_payment(loan, payment_type, payment_amount, notes, method='Cash'):
    if payment_type == 'interest':
        if loan.repayment_plan == 'daily':
            total_unpaid = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)
            max_payable = total_unpaid
            period_label = 'day'
        else:
            current_period = _get_current_period_key(loan)
            raw_interest = (loan.current_principal * Decimal('0.30')).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
            if loan.interest_prepaid_period == current_period:
                already_paid = loan.interest_prepaid_amount or Decimal('0')
                max_payable = max(Decimal('0'), raw_interest - already_paid)
            else:
                max_payable = raw_interest
                already_paid = Decimal('0')

            if max_payable <= Decimal('0.01'):
                prepaid_display = float(already_paid) if loan.interest_prepaid_period == current_period else 0
                return (
                    f'Interest for this week has already been paid '
                    f'(KSh {prepaid_display:,.2f}). '
                    f'Next interest payment available after the week ends.',
                    400
                )
            period_label = 'week'

        if payment_amount > max_payable + Decimal('0.01'):
            return (
                f'Interest payment cannot exceed KSh {float(max_payable):,.2f} for this {period_label}.',
                400
            )

        if loan.repayment_plan == 'daily':
            loan.interest_paid += payment_amount
            loan.amount_paid += payment_amount
            notes_text = notes or f'{method} interest payment of KSh {float(payment_amount):,.2f}'
        else:
            loan.interest_prepaid_period = current_period
            loan.interest_prepaid_amount = (loan.interest_prepaid_amount or Decimal('0')) + payment_amount
            loan.interest_paid += payment_amount
            loan.amount_paid += payment_amount
            notes_text = notes or f'{method} interest payment of KSh {float(payment_amount):,.2f} (prepaid for this week)'

    elif payment_type == 'principal':
        if payment_amount > loan.current_principal + Decimal('0.01'):
            return (
                f'Principal payment cannot exceed current principal of '
                f'{float(loan.current_principal):,.2f}',
                400
            )
        loan.principal_paid += payment_amount
        loan.current_principal -= payment_amount
        if loan.current_principal < Decimal('0'):
            loan.current_principal = Decimal('0')
        loan.amount_paid += payment_amount
        notes_text = notes or f'{method} principal payment of KSh {float(payment_amount):,.2f}'

    else:
        return ("Invalid payment_type. Must be 'principal' or 'interest'", 400)

    return notes_text

# ---------------------------------------------------------------------------
# Loan summary  (unchanged)
# ---------------------------------------------------------------------------

def _loan_summary(loan):
    current_period = _get_current_period_key(loan)
    period_interest = _get_current_period_interest(loan)
    period_prepaid = Decimal('0')
    period_already_paid = False

    if loan.interest_prepaid_period == current_period:
        period_prepaid = loan.interest_prepaid_amount or Decimal('0')
        period_already_paid = period_prepaid >= period_interest - Decimal('0.01')

    if loan.repayment_plan == 'weekly' and loan.interest_rate > 0:
        unpaid_current_week = max(Decimal('0'), period_interest - period_prepaid)
        unpaid_total = unpaid_current_week
    else:
        unpaid_total = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)

    return {
        'id': loan.id,
        'amount_paid': float(loan.amount_paid),
        'principal_paid': float(loan.principal_paid),
        'interest_paid': float(loan.interest_paid),
        'current_principal': float(loan.current_principal),
        'accrued_interest': float(loan.accrued_interest),
        'unpaid_interest': float(unpaid_total),
        'balance': float(loan.balance),
        'due_date': loan.due_date.isoformat() if loan.due_date else None,
        'status': loan.status,
        'repayment_plan': loan.repayment_plan,
        'interest_type': loan.interest_type,
        'current_period_interest': float(period_interest),
        'period_interest_prepaid': float(period_prepaid),
        'period_interest_fully_paid': period_already_paid,
        'interest_prepaid_period': loan.interest_prepaid_period,
    }


# ---------------------------------------------------------------------------
# Payment endpoints  (unchanged)
# ---------------------------------------------------------------------------

@payments_bp.route('/cash', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer', 'hr_manager'])
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


@payments_bp.route('/mpesa/manual', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer', 'hr_manager'])
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


@payments_bp.route('/mpesa/stk-push', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer', 'hr_manager'])
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