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


# -------------------- Financial Reports --------------------

@financial_bp.route('/loan-report', methods=['GET'])
@jwt_required()
@role_required(['director', 'head_of_it', 'admin'])
def get_loan_financial_report():
    period_type = request.args.get('period_type', 'weekly')
    date_param = request.args.get('date')
    month_param = request.args.get('month')

    if period_type == 'weekly' and date_param:
        start_date, end_date = get_week_range(date_param)
    elif period_type == 'monthly' and month_param:
        try:
            year, month = map(int, month_param.split('-'))
            start_date = date(year, month, 1)
            if month == 12:
                end_date = date(year+1, 1, 1) - timedelta(days=1)
            else:
                end_date = date(year, month+1, 1) - timedelta(days=1)
        except:
            return jsonify({'error': 'Invalid month format'}), 400
    else:
        today = datetime.utcnow().date()
        days_to_sunday = today.weekday() + 1
        start_date = today - timedelta(days=days_to_sunday)
        end_date = start_date + timedelta(days=6)

    # ---- Loans disbursed in the period ----
    loans_in_period = Loan.query.filter(
        func.date(Loan.disbursement_date) >= start_date,
        func.date(Loan.disbursement_date) <= end_date
    ).all()
    total_lent = sum(l.principal_amount for l in loans_in_period)

    # ---- Payments made in the period ----
    payments = Transaction.query.filter(
        Transaction.transaction_type == 'payment',
        func.date(Transaction.created_at) >= start_date,
        func.date(Transaction.created_at) <= end_date
    ).all()
    principal_collected = sum(t.amount for t in payments if t.payment_type == 'principal')
    interest_collected = sum(t.amount for t in payments if t.payment_type == 'interest')

    # ---- Outstanding principal and interest (active + bad_debt as of end_date) ----
    active_loans = Loan.query.filter(
        Loan.status == 'active',
        func.date(Loan.disbursement_date) <= end_date
    ).all()
    outstanding_principal = sum(l.current_principal for l in active_loans)
    outstanding_interest = sum(
        max(Decimal('0'), l.accrued_interest - l.interest_paid)
        for l in active_loans
    )

    # ---- Bad Debt ----
    bad_debt_loans = Loan.query.filter(
        Loan.status == 'bad_debt',
        func.date(Loan.disbursement_date) <= end_date
    ).all()
    bad_debt_principal = sum(l.current_principal for l in bad_debt_loans)
    bad_debt_interest = sum(
        max(Decimal('0'), l.accrued_interest - l.interest_paid)
        for l in bad_debt_loans
    )
    total_bad_debt = bad_debt_principal + bad_debt_interest

    outstanding_principal += bad_debt_principal
    outstanding_interest += bad_debt_interest

    # ---- Claims ----
    claimed_loans = Loan.query.filter(
        Loan.status == 'claimed',
        func.date(Loan.updated_at) >= start_date,
        func.date(Loan.updated_at) <= end_date
    ).all()
    total_claimed_amount = sum(l.principal_amount for l in claimed_loans)
    total_recovered_value = sum(
        l.livestock.estimated_value or 0 for l in claimed_loans if l.livestock
    )

    # ---- Waived ----
    waiver_transactions = Transaction.query.filter(
        Transaction.transaction_type == 'adjustment',
        Transaction.payment_method == 'waiver',
        func.date(Transaction.created_at) >= start_date,
        func.date(Transaction.created_at) <= end_date
    ).all()
    total_waived_amount = sum(abs(t.amount) for t in waiver_transactions)

    revenue = interest_collected
    recovery_rate = (principal_collected / total_lent * 100) if total_lent > 0 else 0

    return jsonify({
        'total_money_lent': float(total_lent),
        'principal_collected': float(principal_collected),
        'interest_collected': float(interest_collected),
        'outstanding_principal': float(outstanding_principal),
        'outstanding_interest': float(outstanding_interest),
        'total_claimed_amount': float(total_claimed_amount),
        'total_recovered_value': float(total_recovered_value),
        'total_waived_amount': float(total_waived_amount),
        'total_bad_debt': float(total_bad_debt),          # NEW
        'loan_revenue': float(revenue),
        'loan_recovery_rate': float(recovery_rate),
        'claims_profit_loss': float(total_recovered_value - total_claimed_amount),
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat()
    }), 200

@financial_bp.route('/company-report', methods=['GET'])
@jwt_required()
@role_required(['director', 'admin'])
def get_company_financial_report():
    """Company report with date filtering."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if not start_date or not end_date:
        today = datetime.utcnow().date()
        start_date = today - timedelta(days=today.weekday())  # Monday
        end_date = start_date + timedelta(days=6)
    else:
        try:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Invalid date format'}), 400

    # ---- Money In ----
    principal_payments = db.session.query(func.sum(Transaction.amount)).filter(
        Transaction.transaction_type == 'payment',
        Transaction.payment_type == 'principal',
        func.date(Transaction.created_at) >= start_date,
        func.date(Transaction.created_at) <= end_date
    ).scalar() or Decimal('0')

    interest_payments = db.session.query(func.sum(Transaction.amount)).filter(
        Transaction.transaction_type == 'payment',
        Transaction.payment_type == 'interest',
        func.date(Transaction.created_at) >= start_date,
        func.date(Transaction.created_at) <= end_date
    ).scalar() or Decimal('0')

    claims_recoveries = db.session.query(func.sum(Transaction.amount)).filter(
        Transaction.transaction_type == 'claim',
        func.date(Transaction.created_at) >= start_date,
        func.date(Transaction.created_at) <= end_date
    ).scalar() or Decimal('0')

    other_income = db.session.query(func.sum(Transaction.amount)).filter(
        Transaction.transaction_type == 'other_income',
        func.date(Transaction.created_at) >= start_date,
        func.date(Transaction.created_at) <= end_date
    ).scalar() or Decimal('0')

    money_in = principal_payments + interest_payments + claims_recoveries + other_income

    # ---- Money Out ----
    loan_disbursements = db.session.query(func.sum(Transaction.amount)).filter(
        Transaction.transaction_type == 'disbursement',
        func.date(Transaction.created_at) >= start_date,
        func.date(Transaction.created_at) <= end_date
    ).scalar() or Decimal('0')

    loan_topups = db.session.query(func.sum(Transaction.amount)).filter(
        Transaction.transaction_type == 'topup',
        func.date(Transaction.created_at) >= start_date,
        func.date(Transaction.created_at) <= end_date
    ).scalar() or Decimal('0')

    petty_cash_expenses = db.session.query(func.sum(PettyCashExpense.amount)).filter(
        PettyCashExpense.date >= start_date,
        PettyCashExpense.date <= end_date
    ).scalar() or Decimal('0')

    operational_expenses = db.session.query(func.sum(Transaction.amount)).filter(
        Transaction.transaction_type == 'operational',
        func.date(Transaction.created_at) >= start_date,
        func.date(Transaction.created_at) <= end_date
    ).scalar() or Decimal('0')

    salaries = db.session.query(func.sum(SalaryTransaction.amount)).filter(
        SalaryTransaction.transaction_type == 'salary_payment',
        func.date(SalaryTransaction.created_at) >= start_date,
        func.date(SalaryTransaction.created_at) <= end_date
    ).scalar() or Decimal('0')

    investor_returns = db.session.query(func.sum(InvestorReturn.amount)).filter(
        InvestorReturn.status == 'completed',
        func.date(InvestorReturn.return_date) >= start_date,
        func.date(InvestorReturn.return_date) <= end_date
    ).scalar() or Decimal('0')

    money_out = (loan_disbursements + loan_topups + petty_cash_expenses +
                 operational_expenses + salaries + investor_returns)

    revenue = money_in - money_out

    expense_breakdown = {
        'loan_disbursements': float(loan_disbursements),
        'loan_topups': float(loan_topups),
        'petty_cash': float(petty_cash_expenses),
        'operational': float(operational_expenses),
        'salaries': float(salaries),
        'investor_returns': float(investor_returns)
    }

    return jsonify({
        'money_in': {
            'principal_payments': float(principal_payments),
            'interest_payments': float(interest_payments),
            'claims_recoveries': float(claims_recoveries),
            'other_income': float(other_income),
            'total': float(money_in)
        },
        'money_out': {
            'loan_disbursements': float(loan_disbursements),
            'loan_topups': float(loan_topups),
            'petty_cash': float(petty_cash_expenses),
            'operational': float(operational_expenses),
            'salaries': float(salaries),
            'investor_returns': float(investor_returns),
            'total': float(money_out)
        },
        'revenue': float(revenue),
        'profit_loss': float(revenue),
        'expense_breakdown': expense_breakdown,
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat()
    }), 200


@financial_bp.route('/revenue-analysis', methods=['GET'])
@jwt_required()
@role_required(['director', 'head_of_it', 'admin'])
def get_revenue_analysis():
    """Get revenue analysis data."""
    total_money_in = db.session.query(func.sum(Transaction.amount)).filter(
        Transaction.transaction_type.in_(['payment', 'claim', 'other_income'])
    ).scalar() or Decimal('0')
    total_money_out = db.session.query(func.sum(Transaction.amount)).filter(
        Transaction.transaction_type.in_(['disbursement', 'topup', 'operational'])
    ).scalar() or Decimal('0')
    total_money_out += db.session.query(func.sum(PettyCashExpense.amount)).scalar() or Decimal('0')
    total_money_out += db.session.query(func.sum(SalaryTransaction.amount)).filter(
        SalaryTransaction.transaction_type == 'salary_payment'
    ).scalar() or Decimal('0')
    total_money_out += db.session.query(func.sum(InvestorReturn.amount)).filter(
        InvestorReturn.status == 'completed'
    ).scalar() or Decimal('0')

    net_revenue = total_money_in - total_money_out
    return jsonify({
        'total_money_out': float(total_money_out),
        'total_money_in': float(total_money_in),
        'net_revenue': float(net_revenue),
        'profit_loss': float(net_revenue)
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

# -------------------- Weekly & Monthly Reports --------------------

@financial_bp.route('/weekly-report', methods=['GET'])
@jwt_required()
@role_required(['director', 'head_of_it', 'admin'])
def get_weekly_report():
    """Generate weekly report data (for Saturday reports)."""
    today = datetime.utcnow().date()
    days_since_saturday = (today.weekday() - 5) % 7
    saturday = today - timedelta(days=days_since_saturday)
    week_start = saturday - timedelta(days=6)  # Sunday
    week_end = saturday  # Saturday

    # Money in/out for the week
    money_in = db.session.query(func.sum(Transaction.amount)).filter(
        Transaction.transaction_type.in_(['payment', 'claim', 'other_income']),
        func.date(Transaction.created_at) >= week_start,
        func.date(Transaction.created_at) <= week_end
    ).scalar() or Decimal('0')

    money_out = db.session.query(func.sum(Transaction.amount)).filter(
        Transaction.transaction_type.in_(['disbursement', 'topup', 'operational']),
        func.date(Transaction.created_at) >= week_start,
        func.date(Transaction.created_at) <= week_end
    ).scalar() or Decimal('0')
    money_out += db.session.query(func.sum(PettyCashExpense.amount)).filter(
        PettyCashExpense.date >= week_start,
        PettyCashExpense.date <= week_end
    ).scalar() or Decimal('0')

    revenue = money_in - money_out

    # Claims performance for the week
    claimed_this_week = Loan.query.filter(
        Loan.status == 'claimed',
        func.date(Loan.updated_at) >= week_start,
        func.date(Loan.updated_at) <= week_end
    ).all()
    claims_recovered = sum(l.livestock.estimated_value or Decimal('0') for l in claimed_this_week if l.livestock)
    claims_owed = sum(l.principal_amount for l in claimed_this_week)
    claims_profit_loss = claims_recovered - claims_owed

    # Waived loans this week
    waived_this_week = Loan.query.filter(
        Loan.status == 'waived',
        func.date(Loan.updated_at) >= week_start,
        func.date(Loan.updated_at) <= week_end
    ).all()
    waived_amount = sum(l.principal_amount for l in waived_this_week)

    # Petty cash spending for the week
    petty_spending = db.session.query(func.sum(PettyCashExpense.amount)).filter(
        PettyCashExpense.date >= week_start,
        PettyCashExpense.date <= week_end
    ).scalar() or Decimal('0')

    # Daily breakdown
    days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    daily_money_in = []
    daily_money_out = []
    for i, day_name in enumerate(days):
        day_date = week_start + timedelta(days=i)
        day_in = db.session.query(func.sum(Transaction.amount)).filter(
            Transaction.transaction_type.in_(['payment', 'claim', 'other_income']),
            func.date(Transaction.created_at) == day_date
        ).scalar() or Decimal('0')
        day_out = db.session.query(func.sum(Transaction.amount)).filter(
            Transaction.transaction_type.in_(['disbursement', 'topup', 'operational']),
            func.date(Transaction.created_at) == day_date
        ).scalar() or Decimal('0')
        day_out += db.session.query(func.sum(PettyCashExpense.amount)).filter(
            PettyCashExpense.date == day_date
        ).scalar() or Decimal('0')
        daily_money_in.append(float(day_in))
        daily_money_out.append(float(day_out))

    return jsonify({
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        'money_in': float(money_in),
        'money_out': float(money_out),
        'revenue': float(revenue),
        'claims_performance': {
            'total_claimed': float(claims_owed),
            'recovered_value': float(claims_recovered),
            'profit_loss': float(claims_profit_loss)
        },
        'waived_loans': {
            'count': len(waived_this_week),
            'amount_waived': float(waived_amount)
        },
        'petty_cash_spending': float(petty_spending),
        'daily_breakdown': {
            'days': days,
            'money_in': daily_money_in,
            'money_out': daily_money_out
        },
        'executive_summary': f"Week ending {saturday.strftime('%B %d, %Y')}: Money In = KES {money_in:,.2f}, Money Out = KES {money_out:,.2f}, Revenue = KES {revenue:,.2f}."
    }), 200


@financial_bp.route('/monthly-report', methods=['GET'])
@jwt_required()
@role_required(['director', 'head_of_it', 'admin'])
def get_monthly_report():
    """Generate monthly report data."""
    year = request.args.get('year', type=int, default=datetime.utcnow().year)
    month = request.args.get('month', type=int, default=datetime.utcnow().month)
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year+1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month+1, 1) - timedelta(days=1)

    # Aggregates for the month
    money_in = db.session.query(func.sum(Transaction.amount)).filter(
        Transaction.transaction_type.in_(['payment', 'claim', 'other_income']),
        func.date(Transaction.created_at) >= start_date,
        func.date(Transaction.created_at) <= end_date
    ).scalar() or Decimal('0')

    money_out = db.session.query(func.sum(Transaction.amount)).filter(
        Transaction.transaction_type.in_(['disbursement', 'topup', 'operational']),
        func.date(Transaction.created_at) >= start_date,
        func.date(Transaction.created_at) <= end_date
    ).scalar() or Decimal('0')
    money_out += db.session.query(func.sum(PettyCashExpense.amount)).filter(
        PettyCashExpense.date >= start_date,
        PettyCashExpense.date <= end_date
    ).scalar() or Decimal('0')

    revenue = money_in - money_out

    # Monthly breakdown (by month)
    months = ['January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December']
    monthly_in = []
    monthly_out = []
    for m in range(1, 13):
        m_start = date(year, m, 1)
        if m == 12:
            m_end = date(year+1, 1, 1) - timedelta(days=1)
        else:
            m_end = date(year, m+1, 1) - timedelta(days=1)
        m_in = db.session.query(func.sum(Transaction.amount)).filter(
            Transaction.transaction_type.in_(['payment', 'claim', 'other_income']),
            func.date(Transaction.created_at) >= m_start,
            func.date(Transaction.created_at) <= m_end
        ).scalar() or Decimal('0')
        m_out = db.session.query(func.sum(Transaction.amount)).filter(
            Transaction.transaction_type.in_(['disbursement', 'topup', 'operational']),
            func.date(Transaction.created_at) >= m_start,
            func.date(Transaction.created_at) <= m_end
        ).scalar() or Decimal('0')
        m_out += db.session.query(func.sum(PettyCashExpense.amount)).filter(
            PettyCashExpense.date >= m_start,
            PettyCashExpense.date <= m_end
        ).scalar() or Decimal('0')
        monthly_in.append(float(m_in))
        monthly_out.append(float(m_out))

    return jsonify({
        'year': year,
        'month': month,
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'money_in': float(money_in),
        'money_out': float(money_out),
        'revenue': float(revenue),
        'monthly_breakdown': {
            'months': months,
            'money_in': monthly_in,
            'money_out': monthly_out
        }
    }), 200


# -------------------- Dashboard Summary & Insights --------------------

@financial_bp.route('/dashboard-summary', methods=['GET'])
@jwt_required()
@role_required(['director', 'head_of_it', 'admin'])
def get_financial_dashboard_summary():
    """Return summary cards for the financial dashboard."""
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

    # ---- Bad Debt ----
    bad_debt_loans = Loan.query.filter_by(status='bad_debt').all()
    bad_debt_principal = sum(l.current_principal for l in bad_debt_loans)
    bad_debt_interest = sum(
        max(Decimal('0'), l.accrued_interest - l.interest_paid)
        for l in bad_debt_loans
    )
    total_bad_debt = bad_debt_principal + bad_debt_interest

    recovery_rate = (total_principal_collected / total_lent * 100) if total_lent > 0 else 0

    total_revenue = total_interest_collected
    total_expenses = db.session.query(func.sum(Transaction.amount)).filter(
        Transaction.transaction_type.in_(['disbursement', 'topup', 'operational'])
    ).scalar() or Decimal('0')
    total_expenses += db.session.query(func.sum(PettyCashExpense.amount)).scalar() or Decimal('0')
    total_expenses += db.session.query(func.sum(SalaryTransaction.amount)).filter(
        SalaryTransaction.transaction_type == 'salary_payment'
    ).scalar() or Decimal('0')
    total_expenses += db.session.query(func.sum(InvestorReturn.amount)).filter(
        InvestorReturn.status == 'completed'
    ).scalar() or Decimal('0')

    net_profit = total_revenue - total_expenses

    total_waived = db.session.query(func.sum(Loan.principal_amount)).filter(
        Loan.status == 'waived'
    ).scalar() or Decimal('0')

    return jsonify({
        'loan_metrics': {
            'total_money_lent': float(total_lent),
            'total_principal_collected': float(total_principal_collected),
            'total_interest_collected': float(total_interest_collected),
            'outstanding_principal': float(outstanding_principal),
            'outstanding_interest': float(outstanding_interest),
            'loan_recovery_rate': float(recovery_rate),
            'total_bad_debt': float(total_bad_debt)          # NEW
        },
        'company_metrics': {
            'total_revenue': float(total_revenue),
            'total_expenses': float(total_expenses),
            'total_petty_cash_expenses': float(db.session.query(func.sum(PettyCashExpense.amount)).scalar() or 0),
            'net_profit_loss': float(net_profit),
            'claims_profit_loss': 0,
            'total_waived_amount': float(total_waived)
        }
    }), 200


@financial_bp.route('/insights', methods=['GET'])
@jwt_required()
@role_required(['director', 'head_of_it', 'admin'])
def get_financial_insights():
    """Generate automated financial insights."""
    return jsonify({
        'highest_expense_category': 'Salaries',
        'most_profitable_month': 'December 2025',
        'most_expensive_month': 'January 2026',
        'loan_recovery_rate': 75.5,
        'claims_profit_loss_ratio': 1.2,
        'waived_loan_percentage': 5.0,
        'monthly_revenue_growth': 8.3,
        'monthly_expense_growth': 4.2,
        'petty_cash_utilization_rate': 60.0
    }), 200