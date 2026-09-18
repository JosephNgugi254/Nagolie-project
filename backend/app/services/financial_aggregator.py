"""One authoritative aggregator for Money In / Money Out.

Every financial report in the system calls `aggregate(period)` and reads
from the returned dict. No endpoint re-implements the SQL.
"""
from __future__ import annotations

from collections import OrderedDict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, or_

from app import db
from app.models import (
    InvestorReturn,
    Loan,
    PettyCashExpense,
    SalaryTransaction,
    Transaction,
)
from app.services.reporting_period import (
    ReportingPeriod,
    eat_day_start_utc,
    eat_day_end_utc,
    utc_to_eat_date,
)

ZERO = Decimal("0")


def _d(x) -> Decimal:
    return Decimal(str(x)) if x is not None else ZERO


# ------------------------------------------------------------------ helpers

def _txn_sum(*filters) -> Decimal:
    q = db.session.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.status == "completed", *filters
    )
    return _d(q.scalar())


def _sum(model_col, *filters) -> Decimal:
    q = db.session.query(func.coalesce(func.sum(model_col), 0)).filter(*filters)
    return _d(q.scalar())


def _period_filter(col, period: ReportingPeriod):
    return and_(col >= period.query_start_utc, col < period.query_end_utc)


# ------------------------------------------------------------------ Money In

def _money_in(period: ReportingPeriod) -> "OrderedDict[str, Decimal]":
    txn_period = _period_filter(Transaction.created_at, period)

    principal = _txn_sum(
        txn_period,
        Transaction.transaction_type == "payment",
        Transaction.payment_type == "principal",
    )
    interest = _txn_sum(
        txn_period,
        Transaction.transaction_type == "payment",
        Transaction.payment_type == "interest",
    )
    # other loan payments (payment without explicit payment_type)
    other_loan = _txn_sum(
        txn_period,
        Transaction.transaction_type == "payment",
        or_(Transaction.payment_type.is_(None), Transaction.payment_type == ""),
    )
    other_income = _txn_sum(
        txn_period, Transaction.transaction_type == "other_income"
    )

    # Claims recovered value: loan status changed to 'claimed' in the period.
    # The Transaction row exists with amount=0 (marker only); the economic
    # recovery lives on the livestock.
    claimed_loans = (
        Loan.query.filter(
            Loan.status == "claimed",
            Loan.updated_at >= period.query_start_utc,
            Loan.updated_at < period.query_end_utc,
        ).all()
    )
    claims_value = sum(
        _d(l.livestock.estimated_value) for l in claimed_loans if l.livestock
    )

    return OrderedDict([
        ("principal_payments", principal),
        ("interest_payments", interest),
        ("other_loan_payments", other_loan),
        ("claims_recoveries", _d(claims_value)),
        ("other_income", other_income),
    ])


# ----------------------------------------------------------------- Money Out

def _money_out(period: ReportingPeriod) -> "OrderedDict[str, Decimal]":
    txn_period = _period_filter(Transaction.created_at, period)

    disbursements = _txn_sum(
        txn_period, Transaction.transaction_type == "disbursement"
    )
    topups = _txn_sum(txn_period, Transaction.transaction_type == "topup")
    operational = _txn_sum(
        txn_period, Transaction.transaction_type == "operational"
    )

    petty = _sum(
        PettyCashExpense.amount,
        PettyCashExpense.date >= period.start_date,
        PettyCashExpense.date <= period.end_date,
    )

    salaries = _sum(
        SalaryTransaction.amount,
        SalaryTransaction.transaction_type == "salary_payment",
        SalaryTransaction.created_at >= period.query_start_utc,
        SalaryTransaction.created_at < period.query_end_utc,
    )
    advances = _sum(
        SalaryTransaction.amount,
        SalaryTransaction.transaction_type == "advance",
        SalaryTransaction.created_at >= period.query_start_utc,
        SalaryTransaction.created_at < period.query_end_utc,
    )

    investor_returns = _sum(
        InvestorReturn.amount,
        InvestorReturn.status == "completed",
        InvestorReturn.transaction_type == "return",
        InvestorReturn.return_date >= period.query_start_utc,
        InvestorReturn.return_date < period.query_end_utc,
    )

    return OrderedDict([
        ("loan_disbursements", disbursements),
        ("loan_topups", topups),
        ("petty_cash", petty),
        ("operational", operational),
        ("salaries", salaries),
        ("salary_advances", advances),
        ("investor_returns", investor_returns),
    ])


# --------------------------------------------------------------- public API

def aggregate(period: ReportingPeriod) -> dict[str, Any]:
    money_in = _money_in(period)
    money_out = _money_out(period)

    total_in = sum(money_in.values(), ZERO)
    total_out = sum(money_out.values(), ZERO)
    net = total_in - total_out

    return {
        "period": period.as_dict(),
        "money_in": {**{k: float(v) for k, v in money_in.items()},
                      "total": float(total_in)},
        "money_out": {**{k: float(v) for k, v in money_out.items()},
                       "total": float(total_out)},
        "net_cash_flow": float(net),
        # Revenue = interest + other income + claim recoveries − operational
        # expenses − salaries − petty cash − investor returns.
        # Loan disbursements/top-ups are balance-sheet movements, not P&L.
        "profit_loss": float(
            money_in["interest_payments"]
            + money_in["other_income"]
            + money_in["claims_recoveries"]
            - money_out["operational"]
            - money_out["salaries"]
            - money_out["salary_advances"]
            - money_out["petty_cash"]
            - money_out["investor_returns"]
        ),
    }


# ---------------------------------------------------------- daily breakdown

def daily_breakdown(period: ReportingPeriod) -> list[dict]:
    """One row per calendar day in the period (EAT). Useful for weekly charts."""
    days: list[dict] = []
    cur = period.start_date
    while cur <= period.end_date:
        day_start = eat_day_start_utc(cur)
        day_end = eat_day_end_utc(cur)

        day_in = _txn_sum(
            Transaction.created_at >= day_start,
            Transaction.created_at < day_end,
            Transaction.transaction_type.in_(["payment", "other_income"]),
        )
        day_out = _txn_sum(
            Transaction.created_at >= day_start,
            Transaction.created_at < day_end,
            Transaction.transaction_type.in_(
                ["disbursement", "topup", "operational"]
            ),
        )
        day_out += _sum(
            PettyCashExpense.amount,
            PettyCashExpense.date == cur,
        )
        day_out += _sum(
            SalaryTransaction.amount,
            SalaryTransaction.created_at >= day_start,
            SalaryTransaction.created_at < day_end,
        )
        day_out += _sum(
            InvestorReturn.amount,
            InvestorReturn.status == "completed",
            InvestorReturn.transaction_type == "return",
            InvestorReturn.return_date >= day_start,
            InvestorReturn.return_date < day_end,
        )

        days.append({
            "date": cur.isoformat(),
            "weekday": cur.strftime("%A"),
            "money_in": float(day_in),
            "money_out": float(day_out),
        })
        cur += timedelta(days=1)
    return days


# ------------------------------------------------------- transaction details

def transactions_in(period: ReportingPeriod) -> list[dict]:
    """Full transaction list for the period, unified across tables."""
    rows: list[dict] = []

    # loans transactions
    txns = (
        Transaction.query.filter(
            Transaction.status == "completed",
            Transaction.created_at >= period.query_start_utc,
            Transaction.created_at < period.query_end_utc,
        )
        .order_by(Transaction.created_at.asc())
        .all()
    )
    for t in txns:
        rows.append({
            "date": t.created_at.isoformat(),
            "source": "loan",
            "reference": t.mpesa_receipt or t.mpesa_reference or f"TXN-{t.id}",
            "type": t.transaction_type,
            "payment_type": t.payment_type,
            "description": t.notes or "",
            "amount": float(t.amount),
            "loan_id": t.loan_id,
            "investor_id": t.investor_id,
            "method": t.payment_method,
        })

    # petty cash
    for e in PettyCashExpense.query.filter(
        PettyCashExpense.date >= period.start_date,
        PettyCashExpense.date <= period.end_date,
    ).all():
        rows.append({
            "date": datetime.combine(e.date, datetime.min.time()).isoformat(),
            "source": "petty_cash",
            "reference": f"PC-{e.id}",
            "type": "expense",
            "payment_type": None,
            "description": e.description,
            "amount": float(e.amount),
            "loan_id": None,
            "investor_id": None,
            "method": "cash",
        })

    # salaries
    for s in SalaryTransaction.query.filter(
        SalaryTransaction.created_at >= period.query_start_utc,
        SalaryTransaction.created_at < period.query_end_utc,
    ).all():
        rows.append({
            "date": s.created_at.isoformat(),
            "source": "salary",
            "reference": s.reference or f"SAL-{s.id}",
            "type": s.transaction_type,
            "payment_type": None,
            "description": s.notes or "",
            "amount": float(s.amount),
            "loan_id": None,
            "investor_id": None,
            "method": s.payment_method,
        })

    # investor returns
    for r in InvestorReturn.query.filter(
        InvestorReturn.status == "completed",
        InvestorReturn.transaction_type == "return",
        InvestorReturn.return_date >= period.query_start_utc,
        InvestorReturn.return_date < period.query_end_utc,
    ).all():
        rows.append({
            "date": r.return_date.isoformat(),
            "source": "investor_return",
            "reference": r.mpesa_receipt or f"RET-{r.id}",
            "type": "investor_return",
            "payment_type": None,
            "description": r.notes or "",
            "amount": float(r.amount),
            "loan_id": None,
            "investor_id": r.investor_id,
            "method": r.payment_method,
        })

    rows.sort(key=lambda r: r["date"])
    return rows