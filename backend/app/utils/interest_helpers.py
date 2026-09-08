from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

def _get_current_week_number(loan, as_of_date=None):
    """
    Return the current week number (1-indexed) for a weekly loan.
    Week 1 = days 0 through 7 (inclusive). Week 2 = days 8 through 14, etc.
    """
    if not loan.disbursement_date:
        return 1
    disb = loan.disbursement_date.date() if hasattr(loan.disbursement_date, 'date') else loan.disbursement_date
    if as_of_date is None:
        as_of_date = datetime.now().date()
    else:
        as_of_date = as_of_date.date() if hasattr(as_of_date, 'date') else as_of_date
    days_since = (as_of_date - disb).days
    if days_since < 0:
        return 1
    # Due date is at days 7, 14, 21, ...
    # Those days belong to the current week (the one that just ended)
    if days_since == 0:
        return 1
    if days_since % 7 == 0:
        return days_since // 7
    else:
        return days_since // 7 + 1

def _get_current_period_key(loan, as_of_date=None):
    """
    Return the period key (e.g., '2026-07-20-W1') for the current week.
    """
    if not loan.disbursement_date:
        return "unknown"
    disb = loan.disbursement_date.date() if hasattr(loan.disbursement_date, 'date') else loan.disbursement_date
    week_num = _get_current_week_number(loan, as_of_date)
    return f"{disb.isoformat()}-W{week_num}"

def _get_current_period_interest(loan, as_of_date=None):
    """
    Return the unpaid interest for the current period (today or as_of_date).
    For weekly loans: raw weekly interest minus any prepaid amount for that week.
    For daily loans: returns raw daily interest (caller should handle accrued - paid).
    """
    if loan.interest_rate == 0:
        return Decimal('0')
    if loan.repayment_plan == 'daily':
        # For daily, we use the standard accrued - paid calculation elsewhere.
        # This helper returns the raw daily interest for the current day.
        raw_interest = (loan.current_principal * Decimal('0.045')).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
        return raw_interest
    else:  # weekly
        raw_interest = (loan.current_principal * Decimal('0.30')).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
        current_period = _get_current_period_key(loan, as_of_date)
        if loan.interest_prepaid_period == current_period:
            prepaid = loan.interest_prepaid_amount or Decimal('0')
            return max(Decimal('0'), raw_interest - prepaid)
        return raw_interest

def _get_period_key_for_date(loan, as_of_date):
    """
    Return the period key for the week that contains as_of_date.
    """
    if not loan.disbursement_date:
        return None
    return _get_current_period_key(loan, as_of_date)

def _get_period_interest_at_date(loan, as_of_date):
    """
    Returns the unpaid interest for the period that includes as_of_date,
    considering prepayments for that period.
    """
    if loan.repayment_plan == 'daily' and loan.interest_rate > 0:
        # For daily, we rely on the accumulated accrued_interest - interest_paid.
        # We'll use the current values (since historical recalculation is complex).
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
        return Decimal('0')