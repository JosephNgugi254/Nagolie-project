# app/services/ledger.py
from decimal import Decimal
from datetime import datetime
from app import db
from app.models import LoanLedger

def record_ledger_entry(loan, event_type, transaction=None, amount=Decimal('0'),
                        notes=None, reference=None, user_id=None, event_date=None):
    """
    Capture current balances of the loan and store as a ledger entry.
    Should be called after any state change (payment, accrual, renewal, etc.)
    """
    if event_date is None:
        event_date = datetime.utcnow()

    # Compute current interest balance (unpaid interest)
    interest_balance = max(Decimal('0'), loan.accrued_interest - loan.interest_paid)

    entry = LoanLedger(
        loan_id=loan.id,
        transaction_id=transaction.id if transaction else None,
        event_type=event_type,
        event_date=event_date,
        principal_balance=loan.current_principal,
        interest_balance=interest_balance,
        penalty_balance=Decimal('0'),   # currently not used
        total_outstanding=loan.balance,
        amount=amount,
        notes=notes,
        reference=reference,
        created_by=user_id,
        created_at=event_date
    )
    db.session.add(entry)
    db.session.flush()
    return entry