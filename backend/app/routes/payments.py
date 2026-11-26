from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime, timedelta
from app import db, limiter
from app.models import Payment, Loan, Transaction, LoanLedger
from app.utils.daraja import DarajaAPI
from app.utils.security import log_audit
from app.utils.decorators import role_required
from app.services.ledger import record_ledger_entry
from app.utils.interest_helpers import _get_current_period_key, _get_current_period_interest
from collections import defaultdict
from app.utils.time import now_eat, today_eat
from zoneinfo import ZoneInfo

payments_bp = Blueprint('payments', __name__)

# ---------------------------------------------------------------------------
# Overdue helper  (unchanged)
# ---------------------------------------------------------------------------


def compute_overdue(loan, today=None):
    if today is None:
        today = today_eat()
    elif isinstance(today, datetime):
        if today.tzinfo is not None:
            today = today.astimezone(ZoneInfo("Africa/Nairobi"))
        today = today.date()

    if loan.status != 'active':
        return 0, 0

    if not loan.disbursement_date:
        return 0, 0

    disbursement = loan.disbursement_date

    if isinstance(disbursement, datetime):
        if disbursement.tzinfo is not None:
            disbursement = disbursement.astimezone(
                ZoneInfo("Africa/Nairobi")
            )
        disb = disbursement.date()
    else:
        disb = disbursement

    days_since = (today - disb).days

    if loan.repayment_plan == 'daily':
        overdue_days = max(0, days_since - 14)
        return overdue_days, 0

    else:
        if days_since == 0:
            week_number = 1
        elif days_since % 7 == 0:
            week_number = days_since // 7
        else:
            week_number = days_since // 7 + 1

        overdue_weeks = max(0, week_number - 2)

        return 0, overdue_weeks


def compute_historical_unpaid_interest(loan, as_of_date):
    """
    Return unpaid interest for a loan as of a historical date.
    Uses the same replay engine as historical reports.
    """

    if isinstance(as_of_date, datetime):
        if as_of_date.tzinfo is not None:
            as_of_date = as_of_date.astimezone(
                ZoneInfo("Africa/Nairobi")
            )
        as_of_date = as_of_date.date()

    elif not isinstance(as_of_date, date):
        as_of_date = today_eat()

    _, unpaid = loan_state_as_of(loan, as_of_date)

    return unpaid

# ---------------------------------------------------------------------------
# Core interest-accrual engine
# ---------------------------------------------------------------------------


def recalculate_loan(loan, save=True):
    """Bring a loan's financial fields fully up-to-date using Kenya time."""

    if loan.status != 'active':
        return loan

    if not loan.interest_rate or Decimal(str(loan.interest_rate)) == 0:
        loan.balance = loan.current_principal
        return loan

    today = today_eat()

    if not loan.disbursement_date:
        loan.disbursement_date = now_eat()

    if not loan.last_interest_payment_date:
        loan.last_interest_payment_date = loan.disbursement_date

    if loan.repayment_plan == 'daily' and not loan.last_compounding_date:
        loan.last_compounding_date = loan.disbursement_date

    last_interest_date = loan.last_interest_payment_date

    if isinstance(last_interest_date, datetime):
        if last_interest_date.tzinfo is not None:
            last_interest_date = last_interest_date.astimezone(
                ZoneInfo("Africa/Nairobi")
            )
        last_interest_date = last_interest_date.date()

    if loan.repayment_plan == 'daily':
        return _accrue_daily(
            loan,
            today,
            last_interest_date,
            save=save
        )

    elif loan.repayment_plan == 'weekly':
        return _accrue_weekly(
            loan,
            today,
            last_interest_date,
            save=save
        )

    return loan

def _record_accrual(
    loan,
    amount,
    notes,
    event_date,
    save=True,
    event_type='accrual',
    reference='AUTO'
):
    """
    Record an accrual or compounding event in the immutable loan ledger.

    Multiple events on the same date are permitted. For example, a
    compounding event and the new day's interest accrual can both occur
    on the same date and must both be recorded.
    """
    if not save:
        return

    record_ledger_entry(
        loan=loan,
        event_type=event_type,
        amount=amount,
        notes=notes,
        event_date=event_date,
        user_id=None,
        reference=reference
    )

    if (
        not loan.last_accrual_recorded
        or event_date > loan.last_accrual_recorded
    ):
        loan.last_accrual_recorded = event_date

# ---------------------------------------------------------------------------
# Daily accrual  
# ---------------------------------------------------------------------------


def _accrue_daily(loan, today, last_date, save=True):
    """
    Daily interest accrual with weekly compounding.

    Day 0: Interest is added immediately, once only.
    Day 1: No interest.
    Day 2 through day 7: Daily interest.
    Day 8: First compounding event.
    Subsequent compounding: Every 7 days.

    Previously paid interest is never capitalised again.
    """

    if not loan.disbursement_date:
        return loan

    kenya_tz = ZoneInfo("Africa/Nairobi")

    def as_kenya_date(value):
        if isinstance(value, datetime):
            if value.tzinfo is not None:
                value = value.astimezone(kenya_tz)
            return value.date()
        return value

    # ---------------------------------------------------------
    # NORMALISE DATES
    # ---------------------------------------------------------

    disb = as_kenya_date(loan.disbursement_date)
    today = as_kenya_date(today)

    if not loan.last_compounding_date:
        loan.last_compounding_date = loan.disbursement_date

    if loan.last_interest_payment_date is None:
        loan.last_interest_payment_date = datetime.combine(
            disb,
            datetime.min.time()
        )

    last_interest_date = as_kenya_date(
        loan.last_interest_payment_date
    )

    # ---------------------------------------------------------
    # DECIMAL NORMALISATION
    # ---------------------------------------------------------

    principal = Decimal(str(loan.current_principal or 0))
    accrued = Decimal(str(loan.accrued_interest or 0))
    interest_paid = Decimal(str(loan.interest_paid or 0))

    daily_rate = Decimal('0.045')

    first_due = disb + timedelta(days=7)
    first_compounding = first_due + timedelta(days=1)

    # ---------------------------------------------------------
    # DAY ZERO DUPLICATE PROTECTION
    # ---------------------------------------------------------

    if last_interest_date == disb and accrued == Decimal('0'):

        day_zero_start = datetime.combine(
            disb,
            datetime.min.time()
        )

        day_zero_end = day_zero_start + timedelta(days=1)

        day_zero_recorded = False

        # Check whether a day-zero accrual already exists.
        if loan.id is not None:
            day_zero_recorded = LoanLedger.query.filter(
                LoanLedger.loan_id == loan.id,
                LoanLedger.event_type == 'accrual',
                LoanLedger.event_date >= day_zero_start,
                LoanLedger.event_date < day_zero_end
            ).first() is not None

        if not day_zero_recorded:

            day_interest = (
                principal * daily_rate
            ).quantize(
                Decimal('0.01'),
                rounding=ROUND_HALF_UP
            )

            accrued += day_interest

            loan.current_principal = principal
            loan.accrued_interest = accrued
            loan.interest_paid = interest_paid

            _record_accrual(
                loan=loan,
                amount=day_interest,
                notes='Daily interest accrued on disbursement day (day 0)',
                event_date=day_zero_start,
                save=save
            )

    # ---------------------------------------------------------
    # PROCESS EACH DAY
    # ---------------------------------------------------------

    current_date = last_interest_date + timedelta(days=1)
    day_one_date = disb + timedelta(days=1)

    while current_date <= today:

        # -----------------------------------------------------
        # WEEKLY COMPOUNDING
        # -----------------------------------------------------

        is_compounding_day = (
            current_date >= first_compounding
            and (current_date - first_compounding).days % 7 == 0
        )

        if is_compounding_day:

            net_to_capitalise = max(
                Decimal('0'),
                accrued - interest_paid
            )

            principal += net_to_capitalise

            # Clear the completed interest period.
            accrued = Decimal('0')
            interest_paid = Decimal('0')

            loan.current_principal = principal
            loan.accrued_interest = accrued
            loan.interest_paid = interest_paid

            loan.interest_prepaid_period = None
            loan.interest_prepaid_amount = Decimal('0')

            loan.last_compounding_date = datetime.combine(
                current_date,
                datetime.min.time()
            )

            _record_accrual(
                loan=loan,
                amount=net_to_capitalise,
                notes=(
                    'Weekly compounding – net capitalised: '
                    f'{net_to_capitalise:.2f}'
                ),
                event_date=datetime.combine(
                    current_date,
                    datetime.min.time()
                ),
                save=save,
                event_type='compound_interest',
                reference='COMPOUND'
            )

            loan.due_date = datetime.combine(
                current_date + timedelta(days=6),
                datetime.min.time()
            )

        # -----------------------------------------------------
        # DAILY INTEREST ACCRUAL
        # -----------------------------------------------------

        if current_date != day_one_date:

            day_interest = (
                principal * daily_rate
            ).quantize(
                Decimal('0.01'),
                rounding=ROUND_HALF_UP
            )

            accrued += day_interest

            loan.current_principal = principal
            loan.accrued_interest = accrued
            loan.interest_paid = interest_paid

            _record_accrual(
                loan=loan,
                amount=day_interest,
                notes=(
                    'Daily interest accrued for '
                    f'{current_date.strftime("%Y-%m-%d")}'
                ),
                event_date=datetime.combine(
                    current_date,
                    datetime.min.time()
                ),
                save=save
            )

        loan.last_interest_payment_date = datetime.combine(
            current_date,
            datetime.min.time()
        )

        current_date += timedelta(days=1)

    # ---------------------------------------------------------
    # FINAL BALANCE
    # ---------------------------------------------------------

    unpaid = max(
        Decimal('0'),
        accrued - interest_paid
    )

    loan.current_principal = principal
    loan.accrued_interest = accrued
    loan.interest_paid = interest_paid

    loan.balance = principal + unpaid

    # ---------------------------------------------------------
    # COMPLETION CHECK
    # ---------------------------------------------------------

    if (
        principal <= Decimal('0.01')
        and unpaid <= Decimal('0.01')
    ):

        loan.status = 'completed'
        loan.current_principal = Decimal('0')
        loan.accrued_interest = Decimal('0')
        loan.interest_paid = Decimal('0')
        loan.balance = Decimal('0')

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

# Weekly accrual  
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
        days_since_disbursement = (current_due - disb).days
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
                save=save,
                event_type='compound_interest',
                reference='COMPOUND'
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
    # FIXED: Check for full repayment by total outstanding (principal + unpaid interest)
    # -----------------------------------------------------------------
    # Compute any unpaid interest (should be zero after compounding, but safe)
    unpaid_interest = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)
    total_outstanding = loan.current_principal + unpaid_interest

    if total_outstanding <= Decimal('0.01'):
        loan.status = 'completed'
        loan.current_principal = Decimal('0')
        loan.balance = Decimal('0')
        # Delete associated livestock
        if loan.livestock:
            livestock = loan.livestock
            loan.livestock_id = None
            db.session.delete(livestock)

    return loan

# ---------------------------------------------------------------------------
# Period helpers  (unchanged)
# ---------------------------------------------------------------------------


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
# Loan summary  
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
        unpaid_total = max(Decimal('0'), period_interest - period_prepaid)
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
        data = request.get_json(silent=True) or {}

        body = data.get('Body', {}).get('stkCallback', {})
        code = body.get('ResultCode')
        cid = body.get('CheckoutRequestID')

        if not cid:
            return jsonify({
                'ResultCode': 1,
                'ResultDesc': 'Missing Checkout Request ID'
            }), 400

        # Lock the payment row to prevent duplicate callbacks
        # from processing the same payment simultaneously.
        payment = Payment.query.filter_by(
            checkout_request_id=cid
        ).with_for_update().first()

        if not payment:
            return jsonify({
                'ResultCode': 1,
                'ResultDesc': 'Payment not found'
            }), 404

        # Idempotency protection:
        # A completed payment must never be applied again.
        if payment.status == 'completed':
            return jsonify({
                'ResultCode': 0,
                'ResultDesc': 'Payment already processed'
            }), 200

        if code == 0:

            items = body.get(
                'CallbackMetadata', {}
            ).get('Item', [])

            rd = {
                item['Name']: item.get('Value')
                for item in items
                if 'Name' in item
            }

            cb_amt = Decimal(
                str(rd.get('Amount', 0))
            ).quantize(
                Decimal('0.01'),
                rounding=ROUND_HALF_UP
            )

            receipt = rd.get('MpesaReceiptNumber')
            phone = rd.get('PhoneNumber')

            if cb_amt <= Decimal('0') or not receipt:
                payment.status = 'failed'
                payment.result_code = '1'
                payment.result_desc = 'Invalid callback payment details'
                payment.completed_at = now_eat()

                db.session.commit()

                return jsonify({
                    'ResultCode': 0,
                    'ResultDesc': 'Callback received; payment details require review'
                }), 200

            # Verify that the callback amount matches the
            # amount requested through the STK push.
            expected_amount = Decimal(
                str(payment.amount or 0)
            ).quantize(
                Decimal('0.01'),
                rounding=ROUND_HALF_UP
            )

            if cb_amt != expected_amount:
                payment.status = 'failed'
                payment.result_code = '1'
                payment.result_desc = (
                    f'Amount mismatch. Expected {expected_amount}, '
                    f'received {cb_amt}. Manual reconciliation required.'
                )
                payment.completed_at = now_eat()

                db.session.commit()

                return jsonify({
                    'ResultCode': 0,
                    'ResultDesc': 'Callback received; amount requires reconciliation'
                }), 200

            # Lock the loan as well while applying the payment.
            loan = Loan.query.filter_by(
                id=payment.loan_id
            ).with_for_update().first()

            if not loan or loan.status != 'active':
                payment.status = 'failed'
                payment.result_code = '1'
                payment.result_desc = 'Loan not found or not active'
                payment.completed_at = now_eat()

                db.session.commit()

                return jsonify({
                    'ResultCode': 0,
                    'ResultDesc': 'Callback received; loan requires review'
                }), 200

            ptype = payment.payment_type or 'principal'

            loan = recalculate_loan(loan)

            result = _apply_payment(
                loan,
                ptype,
                cb_amt,
                '',
                method=f'M-Pesa {receipt}'
            )

            if isinstance(result, tuple):
                payment.status = 'failed'
                payment.result_code = '1'
                payment.result_desc = result[0]
                payment.completed_at = now_eat()

                db.session.commit()

                return jsonify({
                    'ResultCode': 0,
                    'ResultDesc': 'Callback received; payment requires review'
                }), 200

            loan = recalculate_loan(loan)

            payment.status = 'completed'
            payment.mpesa_receipt_number = receipt
            payment.phone_number = phone or payment.phone_number
            payment.result_code = str(code)
            payment.result_desc = body.get('ResultDesc')
            payment.completed_at = now_eat()

            txn = Transaction(
                loan_id=loan.id,
                transaction_type='payment',
                payment_type=ptype,
                amount=cb_amt,
                payment_method='mpesa',
                mpesa_receipt=receipt,
                notes=result,
                status='completed'
            )

            db.session.add(txn)
            db.session.flush()

            # Record the ledger entry in the same transaction.
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
            payment.status = 'failed'
            payment.result_code = str(code)
            payment.result_desc = body.get('ResultDesc')
            payment.completed_at = now_eat()

            db.session.commit()

        return jsonify({
            'ResultCode': 0,
            'ResultDesc': 'Success'
        }), 200

    except Exception as e:
        current_app.logger.exception(
            f'M-Pesa callback error: {e}'
        )
        db.session.rollback()

        return jsonify({
            'ResultCode': 1,
            'ResultDesc': 'Failed'
        }), 500


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


# ===========================================================================
# Historical loan state reconstruction
# ---------------------------------------------------------------------------
# Answers: "As of <as_of>, what is this loan's outstanding principal and
# unpaid interest?" — by replaying disbursement, compounding and payments
# up to that date instead of reading the live row fields.
# ===========================================================================

def _txns_upto(loan, as_of):
    """Return all completed transactions for a loan on or before `as_of`."""
    return Transaction.query.filter(
        Transaction.loan_id == loan.id,
        Transaction.status == 'completed',
        Transaction.created_at <= as_of,
    ).all()



def _simulate_daily(loan, as_of_date, txns):
    """
    Pure replay of a daily loan up to `as_of_date`.

    Returns:
        (principal, unpaid_interest)

    Does not mutate the loan or its transactions.

    Rules:
    - Day 0: Interest is added immediately.
    - Day 1: No interest is added.
    - Day 2 onwards: Interest is added daily.
    - First compounding: Day 8.
    - Subsequent compounding: Every 7 days.
    - Compounding capitalises only unpaid interest.
    - Previously paid interest must never be capitalised again.
    - Payments are applied after that day's accrual and affect
      the outstanding balance from the following day.
    """

    # ---------------------------------------------------------
    # NORMALISE DATES
    # ---------------------------------------------------------

    disb = (
        loan.disbursement_date.date()
        if isinstance(loan.disbursement_date, datetime)
        else loan.disbursement_date
    )

    if isinstance(as_of_date, datetime):
        as_of_date = as_of_date.date()

    if not loan.disbursement_date or disb > as_of_date:
        return Decimal('0'), Decimal('0')

    # ---------------------------------------------------------
    # NORMALISE FINANCIAL VALUES
    # ---------------------------------------------------------

    original_principal = Decimal(
        str(loan.principal_amount or 0)
    )

    interest_rate = Decimal(
        str(loan.interest_rate or 0)
    )

    # Preserve the existing daily interest business rule.
    daily_rate = Decimal('0.045')

    # ---------------------------------------------------------
    # ZERO-INTEREST / WAIVED LOANS
    # ---------------------------------------------------------

    if interest_rate == Decimal('0'):

        principal = original_principal

        for t in txns:

            txn_date = (
                t.created_at.date()
                if isinstance(t.created_at, datetime)
                else t.created_at
            )

            # Ignore transactions after the requested date.
            if txn_date > as_of_date:
                continue

            if t.payment_type == 'principal':
                principal -= Decimal(str(t.amount or 0))

        return max(Decimal('0'), principal), Decimal('0')

    # ---------------------------------------------------------
    # PREPARE PAYMENT BUCKETS
    # ---------------------------------------------------------

    principal_pmts = defaultdict(lambda: Decimal('0'))
    interest_pmts = defaultdict(lambda: Decimal('0'))

    for t in txns:

        txn_date = (
            t.created_at.date()
            if isinstance(t.created_at, datetime)
            else t.created_at
        )

        if txn_date > as_of_date:
            continue

        amount = Decimal(str(t.amount or 0))

        if t.payment_type == 'principal':
            principal_pmts[txn_date] += amount

        elif t.payment_type == 'interest':
            interest_pmts[txn_date] += amount

    # ---------------------------------------------------------
    # INITIAL STATE
    # ---------------------------------------------------------

    principal = original_principal
    accrued = Decimal('0')
    interest_paid = Decimal('0')

    # Day 0: Add one day's interest immediately.
    day_zero_interest = (
        principal * daily_rate
    ).quantize(
        Decimal('0.01'),
        rounding=ROUND_HALF_UP
    )

    accrued += day_zero_interest

    day_one_date = disb + timedelta(days=1)

    # First due date and first compounding date.
    due_date = disb + timedelta(days=7)
    first_compounding = due_date + timedelta(days=1)

    current_date = disb + timedelta(days=1)

    # ---------------------------------------------------------
    # REPLAY EACH DAY
    # ---------------------------------------------------------

    while current_date <= as_of_date:

        # -----------------------------------------------------
        # WEEKLY COMPOUNDING
        # -----------------------------------------------------

        is_compounding_day = (
            current_date >= first_compounding
            and
            (current_date - first_compounding).days % 7 == 0
        )

        if is_compounding_day:

            # Only the unpaid portion is capitalised.
            net_to_capitalise = max(
                Decimal('0'),
                accrued - interest_paid
            )

            # Capitalise unpaid interest.
            principal += net_to_capitalise

            # IMPORTANT:
            # The completed interest period is settled.
            #
            # Clear the entire period, including the portion
            # that was already paid. Otherwise previously paid
            # interest can be capitalised in a later period.
            accrued = Decimal('0')
            interest_paid = Decimal('0')

        # -----------------------------------------------------
        # DAILY INTEREST ACCRUAL
        # -----------------------------------------------------

        # Skip interest on day 1 only.
        if current_date != day_one_date:

            day_interest = (
                principal * daily_rate
            ).quantize(
                Decimal('0.01'),
                rounding=ROUND_HALF_UP
            )

            accrued += day_interest

        # -----------------------------------------------------
        # APPLY PRINCIPAL PAYMENTS
        # -----------------------------------------------------

        # Payments are applied after today's interest accrual.
        # Their effect on principal starts from the next day.
        if current_date in principal_pmts:

            principal -= principal_pmts[current_date]

            if principal < Decimal('0'):
                principal = Decimal('0')

        # -----------------------------------------------------
        # APPLY INTEREST PAYMENTS
        # -----------------------------------------------------

        if current_date in interest_pmts:

            interest_paid += interest_pmts[current_date]

        current_date += timedelta(days=1)

    # ---------------------------------------------------------
    # FINAL OUTSTANDING INTEREST
    # ---------------------------------------------------------

    unpaid_interest = max(
        Decimal('0'),
        accrued - interest_paid
    )

    return principal, unpaid_interest


def _simulate_weekly(loan, as_of_date, txns):
    """
    Pure replay of a weekly loan up to `as_of_date`.
    Returns (principal, unpaid_interest). Does not mutate `loan`.

    Weekly plans capitalise interest every 7 days; unpaid interest is
    normally zero because it has been rolled into principal.
    """
    disb = (
        loan.disbursement_date.date()
        if hasattr(loan.disbursement_date, 'date')
        else loan.disbursement_date
    )
    if disb > as_of_date:
        return Decimal('0'), Decimal('0')

    if not loan.interest_rate or loan.interest_rate == 0:
        principal = Decimal(str(loan.principal_amount or 0))
        for t in txns:
            if t.payment_type == 'principal':
                principal -= t.amount
        return max(Decimal('0'), principal), Decimal('0')

    weekly_rate = Decimal('0.30')

    principal = Decimal(str(loan.principal_amount or 0))
    interest_paid = Decimal('0')

    principal_pmts = defaultdict(lambda: Decimal('0'))
    interest_pmts = defaultdict(lambda: Decimal('0'))
    for t in txns:
        d = t.created_at.date() if hasattr(t.created_at, 'date') else t.created_at
        if t.payment_type == 'principal':
            principal_pmts[d] += t.amount
        elif t.payment_type == 'interest':
            interest_pmts[d] += t.amount

    # Walk week by week. Compounding fires at midnight of the day AFTER each due date.
    current_due = disb + timedelta(days=7)
    while current_due + timedelta(days=1) <= as_of_date:
        week_interest = (principal * weekly_rate).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
        # Apply any interest payments made during this week before compounding.
        # (Simplification: payments between the previous due date and this one.)
        prev_due = current_due - timedelta(days=7)
        for d, amt in list(interest_pmts.items()):
            if prev_due < d <= current_due:
                interest_paid += amt
                interest_pmts[d] = Decimal('0')

        net = max(Decimal('0'), week_interest - interest_paid)
        principal += net
        interest_paid = Decimal('0')

        # Apply principal payments that occurred during this week.
        for d, amt in list(principal_pmts.items()):
            if prev_due < d <= current_due:
                principal -= amt
                principal_pmts[d] = Decimal('0')
        if principal < 0:
            principal = Decimal('0')

        current_due += timedelta(days=7)

    # Any remaining interest payments since the last due date.
    for amt in interest_pmts.values():
        interest_paid += amt
    for amt in principal_pmts.values():
        principal -= amt
    if principal < 0:
        principal = Decimal('0')

    # Weekly interest is fully capitalised → unpaid interest is 0.
    return principal, Decimal('0')



def loan_state_as_of(loan, as_of):
    """
    Reconstruct outstanding principal and unpaid interest as of a
    historical date.

    Does not modify the loan record or call recalculate_loan.
    Safe for historical report calculations.
    """
    if not loan or not loan.disbursement_date:
        return Decimal('0'), Decimal('0')

    kenya_tz = ZoneInfo("Africa/Nairobi")

    def to_kenya_date(value):
        if isinstance(value, datetime):
            if value.tzinfo is not None:
                value = value.astimezone(kenya_tz)
            return value.date()

        if isinstance(value, date):
            return value

        return None

    # Normalise the reporting date.
    as_of_date = to_kenya_date(as_of)

    if as_of_date is None:
        as_of_date = today_eat()

    # Normalise the disbursement date.
    disb = to_kenya_date(loan.disbursement_date)

    if disb is None or disb > as_of_date:
        return Decimal('0'), Decimal('0')

    # Freeze bad-debt loans at the date they were flagged.
    if loan.status == 'bad_debt':
        frozen = (
            getattr(loan, 'status_changed_at', None)
            or loan.updated_at
        )

        if frozen:
            frozen_date = to_kenya_date(frozen)

            if frozen_date and frozen_date < as_of_date:
                as_of_date = frozen_date

    # Include completed transactions up to the end of the reporting date.
    txns = _txns_upto(
        loan,
        datetime.combine(as_of_date, datetime.max.time())
    )

    interest_rate = Decimal(str(loan.interest_rate or 0))

    if loan.repayment_plan == 'daily' and interest_rate > 0:
        return _simulate_daily(loan, as_of_date, txns)

    elif loan.repayment_plan == 'weekly' and interest_rate > 0:
        return _simulate_weekly(loan, as_of_date, txns)

    else:
        # Waived or unsupported plan: reconstruct principal only.
        principal = Decimal(str(loan.principal_amount or 0))

        for transaction in txns:
            if transaction.payment_type == 'principal':
                amount = Decimal(str(transaction.amount or 0))
                principal -= amount

        return max(Decimal('0'), principal), Decimal('0')

__all__ = ['recalculate_loan', '_apply_payment', '_loan_summary', 'loan_state_as_of']