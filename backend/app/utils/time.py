# app/utils/time.py
"""
EAT (Africa/Nairobi, UTC+3, no DST) time helpers.

IMPORTANT — these helpers return **tz-naive** datetimes whose *value* is
already EAT wall-clock time. They are the right thing to use when you need
to reason about "what day is it in Nairobi?".

For DB `DateTime` columns (created_at, finalized_at, disbursed_at, ...),
keep storing naive UTC — use `utc_now()` below. Do NOT mix the two frames
when comparing.
"""
from datetime import datetime, timedelta, date, timezone

# Kenya is UTC+3 year-round. No DST, no exceptions.
EAT_OFFSET = timedelta(hours=3)


def utc_now() -> datetime:
    """Naive UTC 'now'. Use this for DateTime columns stored in UTC."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def now_eat() -> datetime:
    """
    Current wall-clock time in Nairobi (UTC+3), returned tz-naive.
    Its *value* is EAT wall-clock, not UTC. Do NOT store in a UTC column.
    """
    return utc_now() + EAT_OFFSET


def today_eat() -> date:
    """Today's calendar date in Nairobi (EAT). Use for `report_date` columns."""
    return now_eat().date()


def as_eat(dt: datetime) -> datetime:
    """Interpret a naive-UTC datetime as Nairobi wall-clock (tz-naive)."""
    if dt is None:
        return None
    return dt + EAT_OFFSET