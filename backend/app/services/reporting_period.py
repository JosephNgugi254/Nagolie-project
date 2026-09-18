"""Centralised reporting-period service. Every report uses this.

EAT (Africa/Nairobi, UTC+3, no DST) is the ONLY reporting timezone.
All UTC columns in the DB are converted once at the query boundary.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal, Optional
from zoneinfo import ZoneInfo

REPORTING_TZ = ZoneInfo("Africa/Nairobi")


def eat_day_start_utc(d: date) -> datetime:
    """00:00 EAT of calendar day `d`, expressed as an aware UTC datetime."""
    return datetime.combine(d, time(0, 0), tzinfo=REPORTING_TZ).astimezone(timezone.utc)


def eat_day_end_utc(d: date) -> datetime:
    """00:00 EAT of the day after `d`, as UTC. Exclusive upper bound."""
    return eat_day_start_utc(d + timedelta(days=1))


def utc_to_eat_date(ts: datetime) -> date:
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(REPORTING_TZ).date()


def utc_to_eat_datetime(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(REPORTING_TZ)


PeriodKind = Literal["daily", "weekly", "monthly", "custom"]


@dataclass(frozen=True)
class ReportingPeriod:
    kind: PeriodKind
    start_date: date
    end_date: date
    label: str
    week_start: Optional[date] = None
    week_end: Optional[date] = None
    month: Optional[int] = None
    year: Optional[int] = None

    @property
    def query_start_utc(self) -> datetime:
        return eat_day_start_utc(self.start_date)

    @property
    def query_end_utc(self) -> datetime:
        return eat_day_end_utc(self.end_date)

    def as_dict(self) -> dict:
        return {
            "kind": self.kind,
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "query_start": self.query_start_utc.isoformat(),
            "query_end": self.query_end_utc.isoformat(),
            "label": self.label,
            "week_start": self.week_start.isoformat() if self.week_start else None,
            "week_end": self.week_end.isoformat() if self.week_end else None,
            "month": self.month,
            "year": self.year,
        }


# ---------------------------------------------------------------- resolvers

def week_bounds(d: date) -> tuple[date, date]:
    """Sunday-start week containing `d`."""
    days_since_sunday = (d.weekday() + 1) % 7   # Sun=0, Mon=1, ..., Sat=6
    start = d - timedelta(days=days_since_sunday)
    return start, start + timedelta(days=6)


def month_bounds(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return start, end - timedelta(days=1)


def _month_name(month: int) -> str:
    return [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ][month - 1]


def resolve_period(
    period_type: str | None = None,
    *,
    date_str: str | None = None,
    month_str: str | None = None,
    start_date_str: str | None = None,
    end_date_str: str | None = None,
    now_utc: datetime | None = None,
) -> ReportingPeriod:
    """Resolve user input into a canonical ReportingPeriod.

    Priority:
      1. explicit start_date & end_date  → custom
      2. period_type == weekly  + date   → weekly
      3. period_type == monthly + month  → monthly
      4. period_type == daily   + date   → daily
      5. none of the above               → current weekly (EAT)
    """
    if now_utc is None:
        now_utc = datetime.now(timezone.utc)
    today_eat = utc_to_eat_date(now_utc)

    # 1. custom
    if start_date_str and end_date_str:
        try:
            s = datetime.strptime(start_date_str, "%Y-%m-%d").date()
            e = datetime.strptime(end_date_str, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValueError("start_date and end_date must be YYYY-MM-DD") from exc
        if e < s:
            raise ValueError("end_date must be on or after start_date")
        return ReportingPeriod(
            kind="custom", start_date=s, end_date=e,
            label=f"{s.strftime('%d %b %Y')} – {e.strftime('%d %b %Y')}",
        )

    pt = (period_type or "").lower().strip()

    # 2. weekly
    if pt == "weekly" and date_str:
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValueError("date must be YYYY-MM-DD") from exc
        ws, we = week_bounds(d)
        return ReportingPeriod(
            kind="weekly", start_date=ws, end_date=we,
            week_start=ws, week_end=we,
            label=f"Week: {ws.strftime('%d %b %Y')} – {we.strftime('%d %b %Y')}",
        )

    # 3. monthly
    if pt == "monthly" and month_str:
        try:
            y, m = (int(x) for x in month_str.split("-"))
            ms, me = month_bounds(y, m)
        except Exception as exc:
            raise ValueError("month must be YYYY-MM") from exc
        return ReportingPeriod(
            kind="monthly", start_date=ms, end_date=me,
            month=m, year=y, label=f"{_month_name(m)} {y}",
        )

    # 4. daily
    if pt == "daily" and date_str:
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValueError("date must be YYYY-MM-DD") from exc
        return ReportingPeriod(
            kind="daily", start_date=d, end_date=d,
            label=d.strftime("%d %B %Y"),
        )

    # 5. default = current Sunday–Saturday week
    ws, we = week_bounds(today_eat)
    return ReportingPeriod(
        kind="weekly", start_date=ws, end_date=we,
        week_start=ws, week_end=we,
        label=f"Week: {ws.strftime('%d %b %Y')} – {we.strftime('%d %b %Y')}",
    )


def period_for_kind(period: ReportingPeriod, kind: PeriodKind) -> ReportingPeriod:
    """Used by charts that need e.g. day-by-day buckets inside a week."""
    # Currently only used for daily granularity inside weekly charts.
    return period