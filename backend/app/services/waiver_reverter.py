# app/services/waiver_reverter.py
from app import db
from app.models import Loan, Transaction
from app.services.ledger import record_ledger_entry
from datetime import datetime, timedelta
from decimal import Decimal
import pytz
import logging

logger = logging.getLogger(__name__)

UTC = pytz.utc


def run_waiver_reversion():
    """
    Auto-revert every active 0%-interest loan whose waiver window has elapsed.

    A waiver = interest_rate 0 while the ORIGINAL repayment_plan is preserved.
    On reversion:
      • restore original interest_rate, plan & interest_type
      • re-key disbursement_date = now (client becomes a "today" client)
      • reset accrual + payment counters
      • apply day-0 accrual via recalculate_loan()
      • write a ledger entry + audit transaction
      • reassign the officer for the NEW weekday
    """
    from app.routes.payments import recalculate_loan

    now = datetime.now(UTC).replace(tzinfo=None)  # naive-UTC, matches existing DB columns

    waived = Loan.query.filter(
        Loan.status == 'active',
        Loan.interest_rate == 0,
        Loan.due_date.isnot(None),
        Loan.due_date <= now,
    ).all()

    if not waived:
        return 0

    count = 0
    for loan in waived:
        try:
            # ---------------- 1. Resolve original plan & rate ----------------
            original_plan = loan.original_repayment_plan
            original_rate = loan.original_interest_rate

            if (not original_plan or not original_rate) and loan.parent_loan_id:
                parent = db.session.get(Loan, loan.parent_loan_id)
                if parent:
                    if not original_plan:
                        original_plan = parent.repayment_plan
                    if not original_rate or original_rate == 0:
                        original_rate = parent.interest_rate

            original_plan = original_plan or 'weekly'
            if not original_rate or original_rate == 0:
                original_rate = Decimal('30.0') if original_plan == 'weekly' else Decimal('4.5')

            # ---------------- 2. Fully-paid waiver → complete ----------------
            if loan.current_principal is None or loan.current_principal <= Decimal('0.01'):
                loan.status = 'completed'
                loan.balance = Decimal('0')
                if loan.livestock:
                    lv = loan.livestock
                    loan.livestock_id = None
                    db.session.delete(lv)
                db.session.add(loan)
                continue

            # ---------------- 3. Restore plan / rate / type ------------------
            loan.repayment_plan = original_plan
            loan.interest_rate = original_rate
            loan.interest_type = 'compound' if original_plan == 'weekly' else 'simple'

            # ---------------- 4. Re-key date anchors to NOW ------------------
            loan.disbursement_date = now
            loan.last_interest_payment_date = now
            loan.last_compounding_date = now
            loan.due_date = (
                now + timedelta(days=7) if original_plan == 'weekly'
                else now + timedelta(days=14)
            )

            # ---------------- 5. Reset accrual + payment tracking ------------
            loan.accrued_interest = Decimal('0')
            loan.interest_paid = Decimal('0')
            loan.principal_paid = Decimal('0')
            loan.amount_paid = Decimal('0')
            loan.interest_prepaid_period = None
            loan.interest_prepaid_amount = Decimal('0')
            loan.balance = loan.current_principal

            # ---------------- 6. Apply day-0 accrual -------------------------
            loan = recalculate_loan(loan)

            # ---------------- 7. Ledger + audit ------------------------------
            txn = Transaction(
                loan_id=loan.id,
                transaction_type='adjustment',
                amount=Decimal('0'),
                payment_method='revert',
                notes=f'Auto-reverted from waiver to {original_plan} plan '
                      f'at {float(original_rate)}% interest',
                status='completed',
                created_at=now,
            )
            db.session.add(txn)
            db.session.flush()

            record_ledger_entry(
                loan=loan,
                event_type='adjustment',
                transaction=txn,
                amount=Decimal('0'),
                notes=f'Auto-reverted from waiver to {original_plan} plan',
                reference='REVERT-AUTO',
                user_id=None,
            )
            db.session.add(loan)
            count += 1

        except Exception as e:
            logger.exception(f"Waiver reversion failed for loan {loan.id}: {e}")
            db.session.rollback()
            continue

    db.session.commit()

    # ---- Officer reassignment (isolated try/except) ------------------------
    if count:
        try:
            from app.routes.admin import sync_client_assignments
            sync_client_assignments()
        except Exception as e:
            logger.exception(f"Post-reversion assignment sync failed: {e}")

        logger.info(f"Auto-reverted {count} waived loans.")

    return count