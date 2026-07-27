from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP


def _get_current_period_key(loan, as_of_date=None):
    """Return the period key (e.g., '2026-07-20-W3') for the current week,
    based on either today or the given as_of_date.
    """
    if not loan.disbursement_date:
        return "unknown"

    # Normalize as_of_date to a date object
    if as_of_date is None:
        as_of_date = datetime.now().date()
    else:
        as_of_date = as_of_date.date() if hasattr(as_of_date, 'date') else as_of_date

    disb = loan.disbursement_date
    disb = disb.date() if hasattr(disb, 'date') else disb

    due = loan.due_date
    if due:
        due = due.date() if hasattr(due, 'date') else due
    else:
        due = disb + timedelta(days=7)

    days_since = (as_of_date - disb).days
    week_num = days_since // 7
    return f"{disb.isoformat()}-W{week_num}"


def _get_current_period_interest(loan):
    """Return the unpaid interest for the current period (today)."""
    if loan.repayment_plan == 'daily':
        raw_interest = (loan.current_principal * Decimal('0.045')).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
    else:  # weekly
        raw_interest = (loan.current_principal * Decimal('0.30')).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )

    current_period = _get_current_period_key(loan)
    if loan.interest_prepaid_period == current_period:
        prepaid = loan.interest_prepaid_amount or Decimal('0')
        return max(Decimal('0'), raw_interest - prepaid)
    return raw_interest


def _get_period_key_for_date(loan, as_of_date):
    """
    Return the period key for the week that contains `as_of_date`.
    Both arguments are normalized to `date` objects to avoid type errors.
    """
    disb = loan.disbursement_date
    if disb is None:
        return None

    # Normalize disbursement_date to date
    disb = disb.date() if hasattr(disb, 'date') else disb

    # Normalize as_of_date to date
    if as_of_date is None:
        return None
    as_of_date = as_of_date.date() if hasattr(as_of_date, 'date') else as_of_date

    days_since = (as_of_date - disb).days
    week_num = days_since // 7 + 1   # week numbering starting at 1
    return f"{disb.isoformat()}-W{week_num}"


def _get_period_interest_at_date(loan, as_of_date):
    """
    Returns the unpaid interest for the period that includes `as_of_date`,
    considering prepayments for that period.
    """
    if loan.repayment_plan == 'daily' and loan.interest_rate > 0:
        # For daily, we just use accrued - paid (simple)
        return max(Decimal('0'), loan.accrued_interest - loan.interest_paid)

    elif loan.repayment_plan == 'weekly' and loan.interest_rate > 0:
        raw_interest = (loan.current_principal * Decimal('0.30')).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
        period_key = _get_period_key_for_date(loan, as_of_date)
        if loan.interest_prepaid_period == period_key:
            prepaid = loan.interest_prepaid_amount or Decimal('0')
            return max(Decimal('0'), raw_interest - prepaid)
        return raw_interest

    else:
        # Fallback for zero‑rate or unknown plans
        return max(Decimal('0'), loan.accrued_interest - loan.interest_paid)