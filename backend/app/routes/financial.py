from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta, date
from decimal import Decimal
from app import db
from app.models import (
    User, Loan, Transaction, Livestock, Payment,
    PettyCashFunding, PettyCashExpense, Investor, InvestorReturn,
    SalaryTransaction
)
from flask_cors import CORS
from app.utils.decorators import role_required
from app.utils.security import log_audit
from sqlalchemy import func, and_, or_
import json
from app.services.reporting_period import resolve_period, ReportingPeriod, _month_name
from app.services.financial_aggregator import (
    aggregate as agg_period,
    daily_breakdown,
    transactions_in,
)

allowed_origins = [
    'http://localhost:5173',
    'https://www.nagolie.com',
    'https://nagolie.com'
]

financial_bp = Blueprint('financial', __name__, url_prefix='/api/financial')
CORS(financial_bp, origins=allowed_origins, supports_credentials=True)


# ---------- HELPERS ----------
def get_week_range(date_str):
    """Return (start_date, end_date) for the week (Sunday–Saturday) containing the given date."""
    date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
    # Find the most recent Sunday (or the Sunday of that week)
    start = date_obj - timedelta(days=date_obj.weekday() + 1)  # weekday: Monday=0, Sunday=6
    end = start + timedelta(days=6)
    return start, end

def _resolve_period_from_request():
    """Build a ReportingPeriod from query params. All report endpoints use this."""
    return resolve_period(
        request.args.get("period_type"),
        date_str=request.args.get("date"),
        month_str=request.args.get("month"),
        start_date_str=request.args.get("start_date"),
        end_date_str=request.args.get("end_date"),
    )


# -------------------- Petty Cash Management --------------------

@financial_bp.route('/petty-cash/fund', methods=['POST'])
@jwt_required()
@role_required(['director'])
def fund_petty_cash():
    """Director allocates funds to petty cash."""
    data = request.get_json()
    amount = Decimal(str(data.get('amount', 0)))
    notes = data.get('notes', '')
    if amount <= 0:
        return jsonify({'error': 'Amount must be positive'}), 400

    user_id = int(get_jwt_identity())
    funding = PettyCashFunding(
        amount=amount,
        funded_by=user_id,
        notes=notes
    )
    db.session.add(funding)
    db.session.commit()
    log_audit('petty_cash_funded', 'petty_cash_funding', funding.id, {'amount': float(amount)})
    return jsonify({'success': True, 'funding': funding.to_dict()}), 201


@financial_bp.route('/petty-cash/expense', methods=['POST'])
@jwt_required()
@role_required(['secretary', 'director'])
def add_petty_cash_expense():
    """Record a petty cash expense (Secretary or Director)."""
    data = request.get_json()
    description = data.get('description', '').strip()
    amount = Decimal(str(data.get('amount', 0)))
    expense_date = data.get('date')
    notes = data.get('notes', '')
    attachments = data.get('attachments', [])

    if not description or amount <= 0:
        return jsonify({'error': 'Description and positive amount required'}), 400

    if expense_date:
        try:
            expense_date = datetime.strptime(expense_date, '%Y-%m-%d').date()
        except:
            return jsonify({'error': 'Invalid date format'}), 400
    else:
        expense_date = datetime.utcnow().date()

    user_id = int(get_jwt_identity())
    expense = PettyCashExpense(
        description=description,
        amount=amount,
        date=expense_date,
        recorded_by=user_id,
        notes=notes,
        attachments=attachments
    )
    db.session.add(expense)
    db.session.commit()
    log_audit('petty_cash_expense', 'petty_cash_expense', expense.id, {'amount': float(amount)})
    return jsonify({'success': True, 'expense': expense.to_dict()}), 201


@financial_bp.route('/petty-cash/transactions', methods=['GET'])
@jwt_required()
@role_required(['secretary', 'director'])
def get_petty_cash_transactions():
    """Get all petty cash transactions (funding + expenses) sorted by date."""
    fundings = PettyCashFunding.query.all()
    expenses = PettyCashExpense.query.all()
    combined = [f.to_dict() for f in fundings] + [e.to_dict() for e in expenses]
    combined.sort(key=lambda x: x.get('funded_at') or x.get('date'), reverse=True)
    return jsonify(combined), 200


@financial_bp.route('/petty-cash/balance', methods=['GET'])
@jwt_required()
def get_petty_cash_balance():
    """Calculate current petty cash balance."""
    total_funded = db.session.query(func.sum(PettyCashFunding.amount)).scalar() or Decimal('0')
    total_expenses = db.session.query(func.sum(PettyCashExpense.amount)).scalar() or Decimal('0')
    balance = total_funded - total_expenses
    return jsonify({
        'total_funded': float(total_funded),
        'total_expenses': float(total_expenses),
        'balance': float(balance)
    }), 200


@financial_bp.route('/petty-cash/report', methods=['GET'])
@jwt_required()
@role_required(['director'])
def get_petty_cash_report():
    """Generate petty cash report for a date range."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    if not start_date or not end_date:
        return jsonify({'error': 'start_date and end_date required'}), 400
    try:
        start = datetime.strptime(start_date, '%Y-%m-%d').date()
        end = datetime.strptime(end_date, '%Y-%m-%d').date()
    except:
        return jsonify({'error': 'Invalid date format'}), 400

    # Fundings in range – use func.date()
    fundings = PettyCashFunding.query.filter(
        func.date(PettyCashFunding.funded_at) >= start,
        func.date(PettyCashFunding.funded_at) <= end
    ).all()

    # Expenses in range
    expenses = PettyCashExpense.query.filter(
        PettyCashExpense.date >= start,
        PettyCashExpense.date <= end
    ).all()

    total_funded = sum(f.amount for f in fundings)
    total_expenses = sum(e.amount for e in expenses)
    opening_balance = db.session.query(func.sum(PettyCashFunding.amount)).filter(
        func.date(PettyCashFunding.funded_at) < start
    ).scalar() or Decimal('0')
    opening_balance -= db.session.query(func.sum(PettyCashExpense.amount)).filter(
        PettyCashExpense.date < start
    ).scalar() or Decimal('0')

    return jsonify({
        'start_date': start.isoformat(),
        'end_date': end.isoformat(),
        'opening_balance': float(opening_balance),
        'total_funded': float(total_funded),
        'total_expenses': float(total_expenses),
        'closing_balance': float(opening_balance + total_funded - total_expenses),
        'fundings': [f.to_dict() for f in fundings],
        'expenses': [e.to_dict() for e in expenses]
    }), 200


# ------------------------------------------------------------------ Loan report
@financial_bp.route('/loan-report', methods=['GET'])
@jwt_required()
@role_required(['director', 'head_of_it', 'admin'])
def get_loan_financial_report():
    try:
        period = _resolve_period_from_request()
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    # Loans disbursed in period
    loans_in_period = Loan.query.filter(
        Loan.disbursement_date >= period.query_start_utc,
        Loan.disbursement_date < period.query_end_utc,
    ).all()
    total_lent = sum(l.principal_amount for l in loans_in_period)

    # Payments made in the period
    payments = Transaction.query.filter(
        Transaction.transaction_type == 'payment',
        Transaction.status == 'completed',
        Transaction.created_at >= period.query_start_utc,
        Transaction.created_at < period.query_end_utc,
    ).all()
    principal_collected = sum(
        (t.amount for t in payments if t.payment_type == 'principal'),
        Decimal('0'),
    )
    interest_collected = sum(
        (t.amount for t in payments if t.payment_type == 'interest'),
        Decimal('0'),
    )

    # Outstanding principal and interest (active + bad_debt as of end_date)
    as_of_dt = period.query_end_utc
    active_loans = Loan.query.filter(
        Loan.status == 'active',
        Loan.disbursement_date < as_of_dt,
    ).all()
    outstanding_principal = sum(l.current_principal for l in active_loans)
    outstanding_interest = sum(
        (max(Decimal('0'), l.accrued_interest - l.interest_paid) for l in active_loans),
        Decimal('0'),
    )

    # Bad debt
    bad_debt_loans = Loan.query.filter(
        Loan.status == 'bad_debt',
        Loan.disbursement_date < as_of_dt,
    ).all()
    bad_debt_principal = sum(l.current_principal for l in bad_debt_loans)
    bad_debt_interest = sum(
        (max(Decimal('0'), l.accrued_interest - l.interest_paid) for l in bad_debt_loans),
        Decimal('0'),
    )
    total_bad_debt = bad_debt_principal + bad_debt_interest
    outstanding_principal += bad_debt_principal
    outstanding_interest += bad_debt_interest

    # Claims
    claimed_loans = Loan.query.filter(
        Loan.status == 'claimed',
        Loan.updated_at >= period.query_start_utc,
        Loan.updated_at < period.query_end_utc,
    ).all()
    total_claimed_amount = sum((l.principal_amount for l in claimed_loans), Decimal('0'))
    total_recovered_value = sum(
        (l.livestock.estimated_value or Decimal('0') for l in claimed_loans if l.livestock),
        Decimal('0'),
    )

    # Waivers
    waiver_transactions = Transaction.query.filter(
        Transaction.transaction_type == 'adjustment',
        Transaction.payment_method == 'waiver',
        Transaction.status == 'completed',
        Transaction.created_at >= period.query_start_utc,
        Transaction.created_at < period.query_end_utc,
    ).all()
    total_waived_amount = sum((abs(t.amount) for t in waiver_transactions), Decimal('0'))

    revenue = interest_collected
    recovery_rate = (
        (principal_collected / total_lent * 100) if total_lent > 0 else Decimal('0')
    )

    return jsonify({
        'period': period.as_dict(),
        'total_money_lent': float(total_lent),
        'principal_collected': float(principal_collected),
        'interest_collected': float(interest_collected),
        'outstanding_principal': float(outstanding_principal),
        'outstanding_interest': float(outstanding_interest),
        'total_claimed_amount': float(total_claimed_amount),
        'total_recovered_value': float(total_recovered_value),
        'total_waived_amount': float(total_waived_amount),
        'total_bad_debt': float(total_bad_debt),
        'loan_revenue': float(revenue),
        'loan_recovery_rate': float(recovery_rate),
        'claims_profit_loss': float(total_recovered_value - total_claimed_amount),
        'start_date': period.start_date.isoformat(),
        'end_date': period.end_date.isoformat(),
    }), 200

# ------------------------------------------------------------------ Company report
@financial_bp.route('/company-report', methods=['GET'])
@jwt_required()
@role_required(['director', 'admin', 'head_of_it'])
def get_company_financial_report():
    try:
        period = _resolve_period_from_request()
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    data = agg_period(period)
    data['transactions'] = transactions_in(period)
    return jsonify(data), 200


# ------------------------------------------------------------------ Revenue analysis
@financial_bp.route('/revenue-analysis', methods=['GET'])
@jwt_required()
@role_required(['director', 'head_of_it', 'admin'])
def get_revenue_analysis():
    try:
        period = _resolve_period_from_request()
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    data = agg_period(period)
    return jsonify({
        'period': data['period'],
        'total_money_in': data['money_in']['total'],
        'total_money_out': data['money_out']['total'],
        'net_revenue': data['net_cash_flow'],
        'profit_loss': data['profit_loss'],
    }), 200



@financial_bp.route('/claims-analysis', methods=['GET'])
@jwt_required()
@role_required(['director', 'head_of_it', 'admin'])
def get_claims_analysis():
    """Analyze claims: total owed vs recovered value."""
    claimed_loans = Loan.query.filter_by(status='claimed').all()
    total_owed = Decimal('0')
    total_recovered = Decimal('0')
    for loan in claimed_loans:
        total_owed += loan.principal_amount
        if loan.livestock:
            total_recovered += loan.livestock.estimated_value or Decimal('0')
    profit_loss = total_recovered - total_owed
    recovery_rate = (total_recovered / total_owed * 100) if total_owed > 0 else 0

    return jsonify({
        'total_claim_amount': float(total_owed),
        'total_claim_recoveries': float(total_recovered),
        'total_claim_profits': float(max(Decimal('0'), profit_loss)),
        'total_claim_losses': float(max(Decimal('0'), -profit_loss)),
        'claim_recovery_rate': float(recovery_rate)
    }), 200


@financial_bp.route('/waived-analysis', methods=['GET'])
@jwt_required()
@role_required(['director', 'head_of_it', 'admin'])
def get_waived_analysis():
    """Analyze waived loans."""
    waiver_transactions = Transaction.query.filter(
        Transaction.transaction_type == 'adjustment',
        Transaction.payment_method == 'waiver'
    ).all()
    total_waived = sum(abs(t.amount) for t in waiver_transactions)
    count = len(waiver_transactions)

    return jsonify({
        'total_waived_amount': float(total_waived),
        'number_of_waived_loans': count,
        'waiver_trends': [],
        'waiver_impact_on_revenue': float(total_waived)
    }), 200

# ------------------------------------------------------------------ Weekly report
@financial_bp.route('/weekly-report', methods=['GET'])
@jwt_required()
@role_required(['director', 'head_of_it', 'admin'])
def get_weekly_report():
    """Weekly report. Honours ?date= (any day in the week) or defaults to today's week."""
    try:
        period = _resolve_period_from_request()
        if period.kind != 'weekly':
            # Force weekly if user opens this endpoint directly
            from app.services.reporting_period import resolve_period as rp
            period = rp('weekly', date_str=period.start_date.isoformat())
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    data = agg_period(period)
    days = daily_breakdown(period)

    # Claims performance for the week
    claimed_this_week = Loan.query.filter(
        Loan.status == 'claimed',
        Loan.updated_at >= period.query_start_utc,
        Loan.updated_at < period.query_end_utc,
    ).all()
    claims_recovered = sum(
        (l.livestock.estimated_value or Decimal('0') for l in claimed_this_week if l.livestock),
        Decimal('0'),
    )
    claims_owed = sum((l.principal_amount for l in claimed_this_week), Decimal('0'))

    waived_this_week = Loan.query.filter(
        Loan.status == 'waived',
        Loan.updated_at >= period.query_start_utc,
        Loan.updated_at < period.query_end_utc,
    ).all()
    waived_amount = sum((l.principal_amount for l in waived_this_week), Decimal('0'))

    data.update({
        'week_start': period.start_date.isoformat(),
        'week_end': period.end_date.isoformat(),
        'claims_performance': {
            'total_claimed': float(claims_owed),
            'recovered_value': float(claims_recovered),
            'profit_loss': float(claims_recovered - claims_owed),
        },
        'waived_loans': {
            'count': len(waived_this_week),
            'amount_waived': float(waived_amount),
        },
        'daily_breakdown': {
            'days': [d['weekday'] for d in days],
            'dates': [d['date'] for d in days],
            'money_in': [d['money_in'] for d in days],
            'money_out': [d['money_out'] for d in days],
        },
        'executive_summary': (
            f"Week ending {period.end_date.strftime('%B %d, %Y')}: "
            f"Money In = KES {data['money_in']['total']:,.2f}, "
            f"Money Out = KES {data['money_out']['total']:,.2f}, "
            f"Net = KES {data['net_cash_flow']:,.2f}."
        ),
    })
    return jsonify(data), 200


# ------------------------------------------------------------------ Monthly report
@financial_bp.route('/monthly-report', methods=['GET'])
@jwt_required()
@role_required(['director', 'head_of_it', 'admin'])
def get_monthly_report():
    try:
        period = _resolve_period_from_request()
        if period.kind != 'monthly':
            from app.services.reporting_period import resolve_period as rp
            from datetime import date as _d
            today = _d.today()
            period = rp('monthly', month_str=f"{today.year}-{today.month:02d}")
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    data = agg_period(period)

    # 12-month rolling series for the chart
    from app.services.reporting_period import month_bounds
    y = period.year or datetime.utcnow().year
    monthly_in, monthly_out, months = [], [], []
    for m in range(1, 13):
        ms, me = month_bounds(y, m)
        from app.services.reporting_period import ReportingPeriod as RP
        p = RP(kind='monthly', start_date=ms, end_date=me, label=f"{m}/{y}", month=m, year=y)
        agg = agg_period(p)
        months.append(_month_name(m))
        monthly_in.append(agg['money_in']['total'])
        monthly_out.append(agg['money_out']['total'])

    data['monthly_breakdown'] = {
        'months': months,
        'money_in': monthly_in,
        'money_out': monthly_out,
    }
    return jsonify(data), 200


# ------------------------------------------------------------------ Dashboard
@financial_bp.route('/dashboard-summary', methods=['GET'])
@jwt_required()
@role_required(['director', 'head_of_it', 'admin'])
def get_financial_dashboard_summary():
    """Same numbers as Company Report for the current week — no divergence."""
    try:
        period = _resolve_period_from_request()
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    data = agg_period(period)

    total_lent = db.session.query(func.sum(Loan.principal_amount)).filter(
        Loan.status.in_(['active', 'completed'])
    ).scalar() or Decimal('0')
    total_principal_collected = db.session.query(func.sum(Loan.principal_paid)).filter(
        Loan.status.in_(['active', 'completed'])
    ).scalar() or Decimal('0')
    total_interest_collected = db.session.query(func.sum(Loan.interest_paid)).filter(
        Loan.status.in_(['active', 'completed'])
    ).scalar() or Decimal('0')
    outstanding_principal = db.session.query(func.sum(Loan.current_principal)).filter(
        Loan.status == 'active'
    ).scalar() or Decimal('0')
    outstanding_interest = db.session.query(
        func.sum(Loan.accrued_interest - Loan.interest_paid)
    ).filter(Loan.status == 'active').scalar() or Decimal('0')

    bad_debt_loans = Loan.query.filter_by(status='bad_debt').all()
    bad_debt_principal = sum(l.current_principal for l in bad_debt_loans)
    bad_debt_interest = sum(
        (max(Decimal('0'), l.accrued_interest - l.interest_paid) for l in bad_debt_loans),
        Decimal('0'),
    )
    total_bad_debt = bad_debt_principal + bad_debt_interest
    recovery_rate = (
        (total_principal_collected / total_lent * 100) if total_lent > 0 else Decimal('0')
    )
    total_waived = db.session.query(func.sum(Loan.principal_amount)).filter(
        Loan.status == 'waived'
    ).scalar() or Decimal('0')

    return jsonify({
        'period': period.as_dict(),
        'loan_metrics': {
            'total_money_lent': float(total_lent),
            'total_principal_collected': float(total_principal_collected),
            'total_interest_collected': float(total_interest_collected),
            'outstanding_principal': float(outstanding_principal),
            'outstanding_interest': float(outstanding_interest),
            'loan_recovery_rate': float(recovery_rate),
            'total_bad_debt': float(total_bad_debt),
        },
        'company_metrics': {
            'money_in_total': data['money_in']['total'],
            'money_out_total': data['money_out']['total'],
            'net_cash_flow': data['net_cash_flow'],
            'total_petty_cash_expenses': data['money_out']['petty_cash'],
            'profit_loss': data['profit_loss'],
            'claims_profit_loss': 0,
            'total_waived_amount': float(total_waived),
        },
    }), 200

# ------------------------------------------------------------------ Insights
@financial_bp.route('/insights', methods=['GET'])
@jwt_required()
@role_required(['director', 'head_of_it', 'admin'])
def get_financial_insights():
    try:
        period = _resolve_period_from_request()
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    data = agg_period(period)

    # Expense category with highest value
    cats = {k: v for k, v in data['money_out'].items() if k != 'total'}
    top_cat_key = max(cats, key=cats.get) if cats else None
    friendly = {
        'loan_disbursements': 'Loan Disbursements',
        'loan_topups': 'Loan Top-ups',
        'petty_cash': 'Petty Cash',
        'operational': 'Operating Expenses',
        'salaries': 'Salaries',
        'salary_advances': 'Salary Advances',
        'investor_returns': 'Investor Returns',
    }.get(top_cat_key, 'N/A')

    return jsonify({
        'period': data['period'],
        'highest_expense_category': friendly,
        'highest_expense_amount': cats.get(top_cat_key, 0) if top_cat_key else 0,
        'total_money_in': data['money_in']['total'],
        'total_money_out': data['money_out']['total'],
        'net_cash_flow': data['net_cash_flow'],
        'profit_loss': data['profit_loss'],
    }), 200
Note: _month_name 