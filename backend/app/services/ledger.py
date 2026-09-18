# app/services/ledger.py
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, date, timedelta
from sqlalchemy import func
from app import db
from app.models import LoanLedger, Loan
from app.utils.interest_helpers import _get_period_key_for_date


# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────

def _period_label(loan: Loan, on_date: date) -> str:
    """Human-readable period for the statement. Deterministic."""
    if not loan.disbursement_date:
        return "—"
    disb = (loan.disbursement_date.date()
            if hasattr(loan.disbursement_date, 'date')
            else loan.disbursement_date)
    days = (on_date - disb).days
    if days < 0:
        return "—"
    if loan.repayment_plan == 'daily':
        return f"Day {days}"           # Day 0 = disbursement
    # weekly
    week = days // 7 + 1
    wk_start = disb + timedelta(days=(week - 1) * 7)
    wk_end   = wk_start + timedelta(days=6)
    return f"Wk {week} ({wk_start.strftime('%d %b')}–{wk_end.strftime('%d %b')})"


def _next_sequence(loan_id: int) -> int:
    mx = (db.session.query(func.max(LoanLedger.sequence))
          .filter_by(loan_id=loan_id)
          .scalar())
    return (mx or 0) + 1


def _chain_root_id(loan: Loan) -> int:
    return loan.root_loan_id or loan.id


def _compute_interest_after(loan: Loan, event_date: datetime) -> Decimal:
    """
    Authoritative after-state for interest, computed from the loan's
    CURRENT in-memory state. This is correct because record_ledger_entry
    is always called AFTER the loan has been mutated for the event.

    Rules
    -----
    • 0% (waived)          → 0
    • Daily                → accrued_interest - interest_paid  (never negative)
    • Weekly               → pending period interest
                             (current_principal × 0.30 − prepaid for this period)
    """
    if not loan.interest_rate or Decimal(loan.interest_rate) == 0:
        return Decimal('0')

    if loan.repayment_plan == 'daily':
        accrued = Decimal(loan.accrued_interest or 0)
        paid    = Decimal(loan.interest_paid  or 0)
        return max(Decimal('0'), accrued - paid)

    # ── weekly ──
    raw = (Decimal(loan.current_principal or 0) * Decimal('0.30')).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )
    key = _get_period_key_for_date(loan, event_date)
    if key and loan.interest_prepaid_period == key:
        prepaid = Decimal(loan.interest_prepaid_amount or 0)
        return max(Decimal('0'), raw - prepaid)
    return raw


# ─────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────

def record_ledger_entry(
    loan: Loan,
    event_type: str,
    transaction=None,
    amount: Decimal = Decimal('0'),
    *,
    # ─── optional override of the after-state ───
    # If omitted, we fall back to the loan's current in-memory values.
    # The fallback is CORRECT because every call site invokes this
    # function AFTER mutating the loan for the event being recorded.
    principal_after: Decimal = None,
    interest_after:  Decimal = None,
    event_date: datetime = None,
    notes: str = None,
    reference: str = None,
    user_id: int = None,
    period_label: str = None,
) -> LoanLedger:
    """
    Append an immutable ledger snapshot.

    `principal_after` / `interest_after` are the authoritative balances
    AFTER the event. Callers may pass them explicitly (best practice),
    but the function will derive sane defaults from the loan object
    when they are not supplied.
    """
    when      = event_date or datetime.utcnow()
    when_date = when.date() if isinstance(when, datetime) else when

    # ── fallback resolution ──
    if principal_after is None:
        principal_after = Decimal(loan.current_principal or 0)
    if interest_after is None:
        interest_after = _compute_interest_after(loan, when)

    principal_after = max(Decimal('0'), Decimal(principal_after))
    interest_after  = max(Decimal('0'), Decimal(interest_after))

    entry = LoanLedger(
        loan_id           = loan.id,
        transaction_id    = transaction.id if transaction else None,
        event_type        = event_type,
        event_date        = when,
        sequence          = _next_sequence(loan.id),
        principal_balance = principal_after,
        interest_balance  = interest_after,
        total_outstanding = principal_after + interest_after,
        amount            = amount,
        period_label      = period_label or _period_label(loan, when_date),
        notes             = notes,
        reference         = reference,
        created_by        = user_id,
        created_at        = datetime.utcnow(),
        root_loan_id      = _chain_root_id(loan),
    )
    db.session.add(entry)
    db.session.flush()
    return entry