# app/utils/time.py
from datetime import datetime, timedelta, date

EAT = timedelta(hours=3)   # Kenya has no DST

def now_eat() -> datetime:
    """Current wall-clock time in Nairobi (UTC+3), tz-naive."""
    return datetime.utcnow() + EAT

def today_eat() -> date:
    return now_eat().date()

def as_eat(dt: datetime) -> datetime:
    """Interpret a naive-UTC datetime as Nairobi time."""
    if dt is None:
        return None
    return dt + EAT