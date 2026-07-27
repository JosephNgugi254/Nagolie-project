from decimal import Decimal
from datetime import datetime
from app import db
from app.models import LoanLedger
from app.utils.interest_helpers import _get_period_interest_at_date   # new helper

def record_ledger_entry(loan, event_type, transaction=None, amount=Decimal('0'),
                        notes=None, reference=None, user_id=None, event_date=None):
    if event_date is None:
        event_date = datetime.utcnow()

    # Compute interest balance as of the event_date
    interest_balance = _get_period_interest_at_date(loan, event_date)

    total_outstanding = loan.current_principal + interest_balance

    entry = LoanLedger(
        loan_id=loan.id,
        transaction_id=transaction.id if transaction else None,
        event_type=event_type,
        event_date=event_date,
        principal_balance=loan.current_principal,
        interest_balance=interest_balance,
        penalty_balance=Decimal('0'),
        total_outstanding=total_outstanding,
        amount=amount,
        notes=notes,
        reference=reference,
        created_by=user_id,
        created_at=datetime.utcnow()
    )
    db.session.add(entry)
    db.session.flush()
    return entry