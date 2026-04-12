from flask import Blueprint, request, jsonify
from flask_cors import CORS, cross_origin
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
from decimal import Decimal
from app import db
from app.models import Client, Loan, Livestock, Transaction, User, Investor, InvestorReturn
from app.utils.security import admin_required, log_audit
from sqlalchemy.orm import selectinload
from sqlalchemy import func
from app.routes.payments import recalculate_loan, _loan_summary
import json
import secrets
import string

admin_bp = Blueprint('admin', __name__)

allowed_origins = [
    'http://localhost:5173',
    'https://www.nagolie.com',
    'https://nagolie.com'
]
CORS(admin_bp, origins=allowed_origins, supports_credentials=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def format_currency(amount):
    return f"KES {float(amount):,.2f}"


def generate_livestock_description(livestock_type, count):
    if not livestock_type:
        return 'Livestock available for purchase'
    livestock_type = livestock_type.lower()
    singular_forms = {
        'cattle': 'cow', 'goats': 'goat', 'sheep': 'sheep',
        'chickens': 'chicken', 'poultry': 'chicken', 'pigs': 'pig',
        'rabbits': 'rabbit', 'turkeys': 'turkey', 'ducks': 'duck', 'geese': 'goose'
    }
    if count == 1:
        singular = singular_forms.get(livestock_type)
        if singular:
            return f"{singular.capitalize()} available for purchase"
        if livestock_type.endswith('s') and not livestock_type.endswith('ss'):
            return f"{livestock_type[:-1].capitalize()} available for purchase"
        return f"{livestock_type.capitalize()} available for purchase"
    if livestock_type in ['sheep', 'deer', 'fish', 'cattle']:
        return f"{livestock_type.capitalize()} available for purchase"
    if not livestock_type.endswith('s'):
        return f"{livestock_type.capitalize()}s available for purchase"
    return f"{livestock_type.capitalize()} available for purchase"


def generate_credentials(investor_id):
    random_chars = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(4))
    return f"inv{investor_id}_{random_chars}", secrets.token_urlsafe(32)


def _days_left_label(loan, today):
    """
    Return (days_left_int, label_string) for a loan.

    Weekly: counts down from 7 within each week cycle; resets each week.
    Daily : counts down from 14 (one-off).
    Negative values mean the loan is past its due date (overdue).
    """
    if not loan.due_date:
        return 0, 'N/A'

    due = loan.due_date.date() if hasattr(loan.due_date, 'date') else loan.due_date
    days_left = (due - today).days
    return days_left, days_left


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------

@admin_bp.route('/test', methods=['GET'])
@jwt_required()
def test_endpoint():
    try:
        user = db.session.get(User, int(get_jwt_identity()))
        return jsonify({'success': True, 'message': 'Admin API working',
                        'user': user.to_dict() if user else None}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Applications (pending loans)
# ---------------------------------------------------------------------------

@admin_bp.route('/applications', methods=['GET'])
@jwt_required()
@admin_required
def get_applications():
    try:
        apps = Loan.query.filter_by(status='pending').order_by(Loan.created_at.desc()).all()
        result = []
        for app in apps:
            c = app.client
            lv = app.livestock
            result.append({
                'id': app.id,
                'date': app.created_at.isoformat() if app.created_at else None,
                'name': c.full_name if c else 'Unknown',
                'phone': c.phone_number if c else 'N/A',
                'idNumber': c.id_number if c else 'N/A',
                'loanAmount': float(app.principal_amount),
                'livestock': lv.livestock_type if lv else 'N/A',
                'livestockType': lv.livestock_type if lv else 'N/A',
                'livestockCount': lv.count if lv else 0,
                'estimatedValue': float(lv.estimated_value) if lv and lv.estimated_value else 0,
                'location': (c.location if c and c.location else None) or (lv.location if lv and lv.location else 'N/A'),
                'additionalInfo': app.notes or 'None',
                'photos': lv.photos if lv and lv.photos else [],
                'status': app.status,
                'repayment_plan': app.repayment_plan or 'weekly'
            })
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Approve application
# ---------------------------------------------------------------------------

@admin_bp.route('/applications/<int:loan_id>/approve', methods=['POST'])
@jwt_required()
@admin_required
def approve_application(loan_id):
    try:
        data           = request.get_json()
        funding_source = data.get('funding_source', 'company')
        investor_id    = data.get('investor_id')

        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
        if loan.status != 'pending':
            return jsonify({'error': 'Already processed'}), 400

        investor = None
        available_balance = None
        if funding_source == 'investor' and investor_id:
            investor = db.session.get(Investor, investor_id)
            if not investor or investor.account_status != 'active':
                return jsonify({'error': 'Invalid or inactive investor'}), 400
            total_lent = db.session.query(func.sum(Loan.principal_amount)).filter(
                Loan.investor_id == investor.id,
                Loan.funding_source == 'investor',
                Loan.status.in_(['active', 'completed'])
            ).scalar() or Decimal('0')
            available_balance = investor.current_investment - total_lent
            if loan.principal_amount > available_balance:
                return jsonify({'error': f'Insufficient funds. Available: {float(available_balance):.2f}'}), 400

        now = datetime.utcnow()
        loan.status            = 'active'
        loan.disbursement_date = now

        # ── Interest settings by plan ──────────────────────────────────
        if loan.repayment_plan == 'daily':
            loan.interest_rate = Decimal('4.5')
            loan.interest_type = 'simple'
            # Daily plan: due in 14 days (fixed, does NOT roll over)
            loan.due_date = now + timedelta(days=14)
        else:
            loan.interest_rate = Decimal('30.0')
            loan.interest_type = 'compound'
            # Weekly plan: first due in 7 days; rolls forward each week (max 2 weeks)
            loan.due_date = now + timedelta(days=7)

        # ── Initialise financial fields ────────────────────────────────
        # No upfront interest – accrual happens lazily via recalculate_loan.
        loan.total_amount              = loan.principal_amount
        loan.balance                   = loan.principal_amount
        loan.current_principal         = loan.principal_amount
        loan.principal_paid            = Decimal('0')
        loan.interest_paid             = Decimal('0')
        loan.accrued_interest          = Decimal('0')
        loan.amount_paid               = Decimal('0')
        loan.last_interest_payment_date = now

        loan.funding_source = funding_source
        if funding_source == 'investor' and investor:
            loan.investor_id = investor.id

        txn = Transaction(
            loan_id=loan.id, transaction_type='disbursement',
            amount=loan.principal_amount, payment_method='cash',
            notes=f'Loan approved. Plan: {loan.repayment_plan}. Funding: {funding_source}',
            status='completed', created_at=now
        )
        db.session.add(txn)

        if loan.livestock:
            if funding_source == 'investor' and investor:
                loan.livestock.investor_id    = investor.id
                loan.livestock.ownership_type = 'investor'
            else:
                loan.livestock.ownership_type = 'company'

        db.session.commit()

        log_audit('loan_approved', 'loan', loan.id, {
            'client': loan.client.full_name if loan.client else '?',
            'amount': float(loan.principal_amount),
            'plan': loan.repayment_plan,
        })

        return jsonify({
            'success': True,
            'message': 'Loan approved successfully',
            'loan': loan.to_dict(),
            'transaction': txn.to_dict(),
            'investor_available_balance': float(available_balance - loan.principal_amount) if available_balance is not None else None
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Reject application
# ---------------------------------------------------------------------------

@admin_bp.route('/applications/<int:loan_id>/reject', methods=['POST'])
@jwt_required()
@admin_required
def reject_application(loan_id):
    try:
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Not found'}), 404
        if loan.status != 'pending':
            return jsonify({'error': 'Already processed'}), 400
        loan.status = 'rejected'
        if loan.livestock:
            loan.livestock.status = 'inactive'
        db.session.commit()
        return jsonify({'success': True, 'message': 'Rejected'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------

@admin_bp.route('/clients', methods=['GET'])
@jwt_required()
@admin_required
def get_all_clients():
    try:
        today = datetime.now().date()

        # ── KEY CHANGE: Get ALL active loans, not just one per client ──────
        active_loans = Loan.query.filter_by(status='active').all()

        clients_data = []
        for active_loan in active_loans:
            client = active_loan.client
            if not client:
                continue

            # Bring interest/balance up to date
            active_loan = recalculate_loan(active_loan)
            db.session.commit()

            current_principal = active_loan.current_principal or active_loan.principal_amount
            principal_paid    = active_loan.principal_paid    or Decimal('0')
            interest_paid     = active_loan.interest_paid     or Decimal('0')
            unpaid_interest   = max(Decimal('0'), active_loan.accrued_interest - interest_paid)

            if active_loan.due_date:
                due  = active_loan.due_date.date() if hasattr(active_loan.due_date, 'date') else active_loan.due_date
                days_left = (due - today).days
            else:
                days_left = 0

            last_ip = active_loan.last_interest_payment_date
            weeks_overdue = 0
            if last_ip:
                ld = last_ip.date() if hasattr(last_ip, 'date') else last_ip
                if ld < today:
                    weeks_overdue = (today - ld).days // 7

            # Pre-period interest info
            from app.routes.payments import _get_current_period_key, _get_current_period_interest
            current_period = _get_current_period_key(active_loan)
            period_interest = _get_current_period_interest(active_loan)
            period_prepaid = Decimal('0')
            period_interest_paid = False
            if active_loan.interest_prepaid_period == current_period:
                period_prepaid = active_loan.interest_prepaid_amount or Decimal('0')
                period_interest_paid = period_prepaid >= period_interest - Decimal('0.01')

            clients_data.append({
                'id':               client.id,
                'loan_id':          active_loan.id,
                'name':             client.full_name,
                'phone':            client.phone_number,
                'idNumber':         client.id_number,
                'borrowedDate':     active_loan.disbursement_date.isoformat() if active_loan.disbursement_date else None,
                'borrowedAmount':   float(active_loan.principal_amount),
                'currentPrincipal': float(current_principal),
                'expectedReturnDate': active_loan.due_date.isoformat() if active_loan.due_date else None,
                'amountPaid':       float(active_loan.amount_paid),
                'principalPaid':    float(principal_paid),
                'interestPaid':     float(interest_paid),
                'balance':          float(active_loan.balance),
                'daysLeft':         days_left,
                'weeks_overdue':    weeks_overdue,
                'lastInterestPayment': last_ip.isoformat() if last_ip else None,
                'interest_type':    active_loan.interest_type,
                'repayment_plan':   active_loan.repayment_plan,
                'unpaidInterest':   float(unpaid_interest),
                'accrued_interest': float(active_loan.accrued_interest),
                # New pre-period tracking fields
                'current_period_interest': float(period_interest),
                'period_interest_prepaid': float(period_prepaid),
                'period_interest_fully_paid': period_interest_paid,
            })

        # Sort by client name then loan date for clean display
        clients_data.sort(key=lambda x: (x['name'], x['borrowedDate'] or ''))

        return jsonify(clients_data), 200

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    
# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@admin_bp.route('/dashboard', methods=['GET'])
@jwt_required()
@admin_required
def get_dashboard_stats():
    try:
        total_clients = db.session.query(Client).join(Loan).filter(
            Loan.status.in_(['active', 'completed'])
        ).distinct().count()

        total_lent = float(db.session.query(func.sum(Loan.principal_amount)).filter(
            Loan.status.in_(['active', 'completed'])
        ).scalar() or 0)
        KNOWN_INFLATION = 30500
        total_lent_adj = max(0, total_lent - KNOWN_INFLATION)

        total_received = float(db.session.query(func.sum(Loan.amount_paid)).filter(
            Loan.status.in_(['active', 'completed'])
        ).scalar() or 0)

        total_principal_paid = float(db.session.query(func.sum(Loan.principal_paid)).filter(
            Loan.status.in_(['active', 'completed'])
        ).scalar() or 0)

        currently_lent = float(db.session.query(func.sum(Loan.current_principal)).filter(
            Loan.status == 'active'
        ).scalar() or 0)

        available_funds = max(0, total_principal_paid - currently_lent)
        today = datetime.now().date()

        # Due today
        due_today_loans = Loan.query.filter(
            Loan.status == 'active',
            db.func.date(Loan.due_date) == today
        ).all()
        due_today_data = []
        for loan in due_today_loans:
            loan = recalculate_loan(loan)
            due_today_data.append({
                'id': loan.id, 'client_id': loan.client_id, 'loan_id': loan.id,
                'client_name': loan.client.full_name if loan.client else 'Unknown',
                'balance': float(loan.balance),
                'current_principal': float(loan.current_principal),
                'phone': loan.client.phone_number if loan.client else 'N/A',
                'repayment_plan': loan.repayment_plan,
            })

        # Overdue (unpaid interest > 0)
        overdue_loans = Loan.query.filter(
            Loan.status == 'active',
            Loan.accrued_interest > Loan.interest_paid
        ).all()
        overdue_data = []
        for loan in overdue_loans:
            loan = recalculate_loan(loan)
            last_ip = loan.last_interest_payment_date
            if last_ip:
                ld = last_ip.date() if hasattr(last_ip, 'date') else last_ip
                weeks_overdue = (today - ld).days // 7
            else:
                weeks_overdue = 0
            overdue_data.append({
                'id': loan.id, 'client_id': loan.client_id, 'loan_id': loan.id,
                'client_name': loan.client.full_name if loan.client else 'Unknown',
                'balance': float(loan.balance),
                'current_principal': float(loan.current_principal),
                'weeks_overdue': weeks_overdue,
                'phone': loan.client.phone_number if loan.client else 'N/A',
                'repayment_plan': loan.repayment_plan,
            })

        return jsonify({
            'total_clients': total_clients,
            'total_lent': total_lent_adj,
            'total_received': total_received,
            'available_funds': available_funds,
            'due_today': due_today_data,
            'overdue': overdue_data
        }), 200

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Payment stats
# ---------------------------------------------------------------------------

@admin_bp.route('/payment-stats', methods=['GET'])
@jwt_required()
@admin_required
def get_payment_stats():
    try:
        loans = Loan.query.filter(
            Loan.status.in_(['active', 'completed'])
        ).order_by(Loan.disbursement_date.desc()).all()

        stats = []
        total_principal_paid = Decimal('0')
        total_revenue        = Decimal('0')

        for loan in loans:
            pp = loan.principal_paid or Decimal('0')
            ip = loan.interest_paid  or Decimal('0')
            acc_int = loan.accrued_interest or Decimal('0')

            # Get client details safely
            client = loan.client
            client_name = client.full_name if client else 'Unknown'
            client_phone = client.phone_number if client else 'N/A'
            client_id_number = client.id_number if client else 'N/A'

            stats.append({
                'id': loan.id,
                'client_id': loan.client_id,
                'name': client_name,
                'phone': client_phone,
                'id_number': client_id_number,                      # ✅ NEW
                'borrowed_date': loan.disbursement_date.isoformat() if loan.disbursement_date else None,
                'borrowed_amount': float(loan.principal_amount),
                'principal_paid': float(pp),
                'current_principal': float(loan.current_principal or loan.principal_amount),
                'interest_paid': float(ip),
                'accrued_interest': float(acc_int),                 # ✅ NEW (if needed)
                'expected_return_date': loan.due_date.isoformat() if loan.due_date else None,  # ✅ NEW
                'status': loan.status
            })

            total_principal_paid += pp
            total_revenue        += ip

        currently_lent = float(db.session.query(func.sum(Loan.current_principal)).filter(
            Loan.status == 'active').scalar() or 0)

        return jsonify({
            'payment_stats': stats,
            'total_principal_collected': float(total_principal_paid),
            'currently_lent': currently_lent,
            'available_for_lending': float(total_principal_paid) - currently_lent,
            'revenue_collected': float(total_revenue)
        }), 200

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ---------------------------------------------------------------------------
# Livestock
# ---------------------------------------------------------------------------

@admin_bp.route('/livestock', methods=['GET'])
@jwt_required()
@admin_required
def get_all_livestock():
    try:
        page     = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        pag      = Livestock.query.options(
            selectinload(Livestock.client),
            selectinload(Livestock.loan),
            selectinload(Livestock.investor)
        ).filter_by(status='active').paginate(page=page, per_page=per_page, error_out=False)

        today = datetime.now().date()
        items = []
        for item in pag.items:
            description    = item.description or 'Available for purchase'
            actual_location = item.location or 'Isinya, Kajiado'
            investor_name  = item.investor.name if item.investor else None

            if item.client_id is None:
                available_info = 'Available now'; days_remaining = 0; is_admin_added = True
            else:
                client_loan = None
                if hasattr(item, 'loan') and item.loan:
                    cl = item.loan if not isinstance(item.loan, list) else next(
                        (l for l in item.loan if l.status == 'active'), None)
                    if cl and cl.status == 'active':
                        client_loan = cl
                if not client_loan:
                    client_loan = Loan.query.filter_by(livestock_id=item.id, status='active').first()
                if not client_loan:
                    continue
                description   = f"Collateral for {item.client.full_name}'s loan" if item.client else description
                is_admin_added = False
                if client_loan.due_date:
                    due = client_loan.due_date.date() if hasattr(client_loan.due_date, 'date') else client_loan.due_date
                    days_remaining = (due - today).days
                    available_info = f'Available in {days_remaining} days' if days_remaining > 0 else 'Available now'
                    if days_remaining < 0:
                        available_info = 'Available (overdue)'; days_remaining = 0
                else:
                    available_info = 'Available after repayment'; days_remaining = 7

            items.append({
                'id': item.id,
                'title': f"{item.livestock_type.capitalize()} - {item.count} head",
                'type': item.livestock_type, 'count': item.count,
                'price': float(item.estimated_value) if item.estimated_value else 0,
                'description': description, 'images': item.photos or [],
                'availableInfo': available_info, 'daysRemaining': days_remaining,
                'location': actual_location, 'status': item.status,
                'isAdminAdded': is_admin_added,
                'ownership_type': item.ownership_type or 'company',
                'investor_name': investor_name
            })

        return jsonify({
            'items': items, 'total': pag.total,
            'pages': pag.pages, 'current_page': page, 'per_page': per_page
        }), 200

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/livestock/gallery', methods=['GET'])
@cross_origin(origins="*")
def get_public_livestock_gallery():
    try:
        page     = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 12, type=int)
        all_lv   = Livestock.query.filter(Livestock.status == 'active').all()
        today    = datetime.now().date()
        result   = []

        for item in all_lv:
            desc = str(item.description or '').strip()
            if not desc or desc in ('NaN', 'None') or 'claimed' in desc.lower():
                desc = 'Livestock for purchase'
            if '|' in desc:
                desc = desc.split('|', 1)[0].strip()

            loc = str(item.location or '').strip()
            if not loc or loc in ('NaN', 'None'):
                loc = 'Isinya, Kajiado'
            if '|' in loc:
                p1, p2 = [p.strip() for p in loc.split('|', 1)]
                kw = ['isinya', 'kajiado', 'town', 'county', 'moonlight', 'kwa', 'timo']
                loc = p2 if any(k in p2.lower() for k in kw) else (p1 if any(k in p1.lower() for k in kw) else 'Isinya, Kajiado')
            if 'available' in loc.lower() or 'claimed' in loc.lower():
                loc = 'Isinya, Kajiado'

            available_info = 'Available now'; days_remaining = 0; include = False
            assoc = None

            if item.client_id is None:
                include = True
            else:
                assoc = Loan.query.filter_by(livestock_id=item.id).order_by(Loan.created_at.desc()).first()
                if not assoc or assoc.status in ['claimed', 'rejected', 'pending']:
                    continue
                include = True
                if assoc.status == 'active' and assoc.due_date:
                    due = assoc.due_date.date() if hasattr(assoc.due_date, 'date') else assoc.due_date
                    days_remaining = (due - today).days
                    available_info = 'Available now' if days_remaining <= 0 else f'Available in {days_remaining} days'

            if not include:
                continue
            if assoc and 'Collateral for' in desc:
                desc = 'Livestock for purchase'

            result.append({
                'id': item.id,
                'title': f"{item.livestock_type.capitalize()} - {item.count} head",
                'type': item.livestock_type, 'count': item.count,
                'price': float(item.estimated_value) if item.estimated_value else 0,
                'description': desc, 'images': item.photos or [],
                'availableInfo': available_info, 'daysRemaining': days_remaining,
                'location': loc
            })

        result.sort(key=lambda x: (0 if 'now' in x['availableInfo'].lower() else 1, x['daysRemaining']))
        total = len(result)
        start = (page - 1) * per_page
        return jsonify({
            'items': result[start:start + per_page], 'total': total,
            'pages': (total + per_page - 1) // per_page,
            'current_page': page, 'per_page': per_page
        }), 200

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': 'Failed to load gallery'}), 500


@admin_bp.route('/transactions', methods=['GET'])
@jwt_required()
@admin_required
def get_all_transactions():
    try:
        txns = Transaction.query.order_by(Transaction.created_at.desc()).all()
        result = []
        for t in txns:
            cn = t.loan.client.full_name if t.loan and t.loan.client else 'Unknown'
            receipt = 'N/A'
            if t.payment_method == 'mpesa' and t.mpesa_receipt:
                receipt = t.mpesa_receipt
            elif t.payment_method == 'cash':
                receipt = 'Cash'
            result.append({
                'id': t.id, 'date': t.created_at.isoformat() if t.created_at else None,
                'clientName': cn, 'type': t.transaction_type, 'payment_type': t.payment_type,
                'amount': float(t.amount), 'method': t.payment_method or 'cash',
                'status': t.status or 'completed', 'receipt': receipt,
                'notes': t.notes or '', 'mpesa_receipt': t.mpesa_receipt, 'loan_id': t.loan_id
            })
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/livestock', methods=['POST'])
@jwt_required()
@admin_required
def add_livestock():
    try:
        data = request.json
        desc = data.get('description', '').strip() or generate_livestock_description(data.get('type', '').capitalize(), data.get('count', 1))
        image_urls = []
        if data.get('images'):
            from app.utils.cloudinary_upload import upload_base64_image
            for img in data['images']:
                try:
                    image_urls.append(upload_base64_image(img, folder='livestock'))
                except Exception as e:
                    print(f"Image upload failed: {e}")
        lv = Livestock(client_id=None, livestock_type=data['type'], count=data['count'],
                       estimated_value=Decimal(str(data['price'])), description=desc,
                       location=data.get('location', 'Isinya, Kajiado'), photos=image_urls, status='active')
        db.session.add(lv)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Added', 'livestock': lv.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/livestock/<int:livestock_id>', methods=['PUT'])
@jwt_required()
@admin_required
def update_livestock(livestock_id):
    try:
        lv = db.session.get(Livestock, livestock_id)
        if not lv:
            return jsonify({'error': 'Not found'}), 404
        data = request.json
        if 'type'        in data: lv.livestock_type   = data['type']
        if 'count'       in data: lv.count             = data['count']
        if 'price'       in data: lv.estimated_value   = Decimal(str(data['price']))
        if 'description' in data: lv.description       = data['description'].strip()
        if 'location'    in data: lv.location          = data['location'].strip()
        if 'images' in data:
            from app.utils.cloudinary_upload import upload_base64_image
            urls = []
            for img in data['images']:
                if isinstance(img, str) and img.startswith('http'):
                    urls.append(img)
                else:
                    try:
                        urls.append(upload_base64_image(img, folder='livestock'))
                    except Exception as e:
                        print(f"Image upload failed: {e}")
            lv.photos = urls
        db.session.commit()
        return jsonify({'success': True, 'livestock': lv.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/livestock/<int:livestock_id>', methods=['DELETE'])
@jwt_required()
@admin_required
def delete_livestock(livestock_id):
    try:
        lv = db.session.get(Livestock, livestock_id)
        if not lv:
            return jsonify({'error': 'Not found'}), 404
        db.session.delete(lv)
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/send-reminder', methods=['POST'])
@jwt_required()
@admin_required
def send_reminder():
    data = request.json
    if not data.get('phone') or not data.get('message'):
        return jsonify({'success': False, 'error': 'Phone and message required'}), 400
    return jsonify({'success': False, 'error': 'SMS service not configured'}), 500


@admin_bp.route('/claim-ownership', methods=['POST'])
@jwt_required()
@admin_required
def claim_ownership():
    try:
        data      = request.get_json()
        loan      = Loan.query.filter_by(id=data.get('loan_id'), client_id=data.get('client_id'), status='active').first()
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
        due = loan.due_date.date() if hasattr(loan.due_date, 'date') else loan.due_date
        if due >= datetime.now().date():
            return jsonify({'error': 'Loan not overdue'}), 400
        lv = Livestock.query.filter_by(id=loan.livestock_id).first()
        if not lv:
            return jsonify({'error': 'Livestock not found'}), 404
        loc = (lv.client.location if lv.client and lv.client.location else None) or 'Isinya, Kajiado'
        lv.description = 'Livestock for purchase'; lv.location = loc
        lv.status = 'active'; lv.client_id = None
        loan.status = 'claimed'; loan.balance = 0; loan.amount_paid = loan.total_amount
        db.session.add(Transaction(loan_id=loan.id, transaction_type='claim', amount=0, payment_method='claim', notes='Claimed overdue'))
        db.session.commit()
        return jsonify({'success': True, 'message': f'Claimed {lv.livestock_type}'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/loans/<int:loan_id>/topup', methods=['POST'])
@jwt_required()
@admin_required
def process_topup(loan_id):
    try:
        data             = request.json
        topup_amount     = Decimal(str(data.get('topup_amount', 0)))
        adjustment_amount = Decimal(str(data.get('adjustment_amount', 0)))
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Not found'}), 404
        if loan.status != 'active':
            return jsonify({'error': 'Not active'}), 400
        old_principal = loan.principal_amount
        if topup_amount > 0:
            loan.principal_amount  += topup_amount
            loan.current_principal += topup_amount
            loan.total_amount       = loan.principal_amount
            loan.balance            = loan.current_principal
            txn_type = 'topup'; txn_amt = topup_amount
            txn_notes = f'Top-up of {format_currency(topup_amount)}'
        elif adjustment_amount > 0:
            loan.principal_amount  = adjustment_amount
            loan.current_principal = adjustment_amount
            loan.total_amount      = adjustment_amount
            loan.balance           = adjustment_amount
            txn_type = 'adjustment'; txn_amt = adjustment_amount - old_principal
            txn_notes = f'Adjustment {format_currency(old_principal)} → {format_currency(adjustment_amount)}'
        else:
            return jsonify({'error': 'Invalid amount'}), 400
        if data.get('notes'):
            txn_notes += f'. {data["notes"]}'
        db.session.add(Transaction(loan_id=loan.id, transaction_type=txn_type, amount=txn_amt,
                                   payment_method=data.get('disbursement_method', 'cash'),
                                   mpesa_receipt=data.get('mpesa_reference', '').upper() or None,
                                   notes=txn_notes, status='completed'))
        db.session.commit()
        return jsonify({'success': True, 'loan': loan.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/approved-loans', methods=['GET'])
@jwt_required()
@admin_required
def get_approved_loans():
    try:
        loans = db.session.query(
            Loan.id, Loan.principal_amount, Loan.disbursement_date, Loan.notes, Loan.repayment_plan,
            Client.full_name.label('client_name'), Client.phone_number, Client.id_number,
            Client.location.label('client_location'),
            Livestock.livestock_type, Livestock.count, Livestock.estimated_value,
            Livestock.photos, Livestock.location.label('livestock_location')
        ).join(Client, Loan.client_id == Client.id
        ).outerjoin(Livestock, Loan.livestock_id == Livestock.id
        ).filter(Loan.status == 'active'
        ).order_by(Loan.disbursement_date.desc()).limit(100).all()

        return jsonify([{
            'id': l.id,
            'date': l.disbursement_date.isoformat() if l.disbursement_date else None,
            'name': l.client_name, 'phone': l.phone_number, 'idNumber': l.id_number,
            'loanAmount': float(l.principal_amount),
            'livestockType': l.livestock_type or 'N/A', 'livestockCount': l.count or 0,
            'estimatedValue': float(l.estimated_value) if l.estimated_value else 0,
            'location': l.client_location or l.livestock_location or 'N/A',
            'additionalInfo': l.notes or 'None provided',
            'photos': l.photos or [], 'status': 'active',
            'repayment_plan': l.repayment_plan or 'weekly'
        } for l in loans]), 200
    except Exception as e:
        return jsonify({'error': 'Failed to load approved loans'}), 500


# ---------------------------------------------------------------------------
# Investor routes (unchanged from working version – kept compact)
# ---------------------------------------------------------------------------

@admin_bp.route('/investors', methods=['GET', 'POST'])
@jwt_required()
@admin_required
def manage_investors():
    if request.method == 'GET':
        try:
            investors = Investor.query.all()
            result = []
            for inv in investors:
                total_lent = db.session.query(func.sum(Loan.principal_amount)).filter(
                    Loan.investor_id == inv.id, Loan.funding_source == 'investor',
                    Loan.status.in_(['active', 'completed'])
                ).scalar() or Decimal('0')
                d = inv.to_dict()
                d['total_lent_amount']  = float(total_lent)
                d['available_balance']  = float(max(Decimal('0'), inv.current_investment - total_lent))
                d['investment_amount']  = float(inv.current_investment)
                result.append(d)
            return jsonify(result), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    try:
        data = request.json
        for f in ['name', 'phone', 'id_number', 'investment_amount']:
            if not data.get(f):
                return jsonify({'error': f'Missing: {f}'}), 400
        if Investor.query.filter((Investor.phone == data['phone']) | (Investor.id_number == data['id_number'])).first():
            return jsonify({'error': 'Investor already exists'}), 400
        now = datetime.utcnow()
        inv = Investor(name=data['name'], phone=data['phone'], id_number=data['id_number'],
                       email=data.get('email'), initial_investment=Decimal(str(data['investment_amount'])),
                       current_investment=Decimal(str(data['investment_amount'])),
                       invested_date=now, expected_return_date=now + timedelta(days=35),
                       next_return_date=now + timedelta(days=35), account_status='pending', notes=data.get('notes', ''))
        db.session.add(inv); db.session.flush()
        tmp, token = generate_credentials(inv.id)
        origin = request.headers.get('Origin', 'http://localhost:5173')
        link = f"{origin}/investor/complete-registration/{inv.id}?token={token}"
        inv.notes = f"Temporary Password: {tmp}\nRegistration Token: {token}\nAccount Creation Link: {link}\nToken Generated: {now.strftime('%Y-%m-%d %H:%M:%S')}\n{inv.notes or ''}"
        inv.agreement_document = json.dumps({
            'investor_name': inv.name, 'investor_id': inv.id_number, 'phone': inv.phone,
            'email': inv.email or 'Not provided', 'investment_amount': float(inv.initial_investment),
            'date': now.strftime('%d/%m/%Y'), 'return_percentage': '40%',
            'return_amount': float(inv.initial_investment * Decimal('0.40')),
            'expected_return_period': '5 weeks first, then every 4 weeks',
            'early_withdrawal_fee': '15%', 'early_withdrawal_receivable': '85%',
            'agreement_date': now.strftime('%B %d, %Y'),
            'agreement_terms': [
                'Investor shall receive 40% return on investment amount',
                'First return after 5 weeks from investment date',
                'Subsequent returns every 4 weeks',
                'Early withdrawals incur 15% fee; investor receives 85%',
                'All returns processed via M-Pesa or bank transfer'
            ]
        })
        db.session.commit()
        return jsonify({'success': True, 'investor': inv.to_dict(), 'account_creation_link': link, 'temporary_password': tmp}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/investors/<int:investor_id>', methods=['GET', 'PUT', 'DELETE'])
@jwt_required()
@admin_required
def manage_investor(investor_id):
    inv = db.session.get(Investor, investor_id)
    if not inv:
        return jsonify({'error': 'Not found'}), 404
    if request.method == 'GET':
        d = inv.to_dict()
        d['returns'] = [r.to_dict() for r in InvestorReturn.query.filter_by(investor_id=inv.id).all()]
        return jsonify(d), 200
    if request.method == 'PUT':
        try:
            data = request.json
            for f in ['name', 'phone', 'email', 'account_status', 'notes']:
                if f in data: setattr(inv, f, data[f])
            if 'account_status' in data and inv.user:
                inv.user.is_active = (data['account_status'] == 'active')
            db.session.commit()
            return jsonify({'success': True, 'investor': inv.to_dict()}), 200
        except Exception as e:
            db.session.rollback(); return jsonify({'error': str(e)}), 500
    try:
        InvestorReturn.query.filter_by(investor_id=inv.id).delete()
        if inv.user: db.session.delete(inv.user)
        db.session.delete(inv); db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback(); return jsonify({'error': str(e)}), 500


@admin_bp.route('/investors/<int:investor_id>/calculate-return', methods=['GET'])
@jwt_required()
@admin_required
def calculate_investor_return(investor_id):
    try:
        inv = db.session.get(Investor, investor_id)
        if not inv: return jsonify({'error': 'Not found'}), 404
        inv.update_outstanding(); db.session.commit()
        outstanding = inv.outstanding_returns or Decimal('0')
        next_exp    = inv.current_investment * Decimal('0.40')
        max_pay     = outstanding + next_exp
        early       = request.args.get('early_withdrawal', 'false').lower() == 'true'
        early_amt   = next_exp * Decimal('0.85') if early else next_exp
        fee_amt     = next_exp - early_amt if early else Decimal('0')
        return jsonify({
            'success': True, 'investor_id': inv.id, 'investor_name': inv.name,
            'total_investment': float(inv.current_investment),
            'outstanding_returns': float(outstanding), 'credit_balance': float(inv.credit_balance or 0),
            'next_expected_return': float(next_exp), 'max_payable': float(max_pay),
            'calculated_return': float(next_exp), 'is_early_withdrawal': early,
            'early_return_amount': float(early_amt), 'early_withdrawal_fee': float(fee_amt),
            'return_percentage': '40%',
            'next_return_date': inv.next_return_date.isoformat() if inv.next_return_date else None,
            'can_process_return': max_pay > 0
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/investors/<int:investor_id>/process-return', methods=['POST'])
@jwt_required()
@admin_required
def process_investor_return(investor_id):
    try:
        inv = db.session.get(Investor, investor_id)
        if not inv: return jsonify({'error': 'Not found'}), 404
        if inv.account_status != 'active': return jsonify({'error': 'Not active'}), 400
        data   = request.json
        amount = Decimal(str(data.get('amount', 0)))
        if amount <= 0: return jsonify({'error': 'Amount must be positive'}), 400
        pm     = data.get('payment_method', 'mpesa')
        inv.update_outstanding(); db.session.flush()
        inv.total_returns_received += amount
        if amount <= inv.outstanding_returns:
            inv.outstanding_returns -= amount
        else:
            remaining = amount - inv.outstanding_returns
            inv.outstanding_returns = Decimal('0'); inv.credit_balance += remaining
        ir = InvestorReturn(investor_id=inv.id, amount=amount, return_date=datetime.utcnow(),
                            payment_method=pm, mpesa_receipt=(data.get('mpesa_receipt','') or '').upper() if pm=='mpesa' else '',
                            notes=data.get('notes',''), status='completed',
                            is_early_withdrawal=data.get('is_early_withdrawal', False), early_withdrawal_fee=Decimal('0'))
        db.session.add(ir); inv.last_return_date = datetime.utcnow(); db.session.commit()
        return jsonify({'success': True, 'return': ir.to_dict(), 'investor': inv.to_dict(),
                        'outstanding_remaining': float(inv.outstanding_returns),
                        'credit_balance': float(inv.credit_balance)}), 200
    except Exception as e:
        db.session.rollback(); return jsonify({'error': str(e)}), 500


@admin_bp.route('/investors/stats', methods=['GET'])
@jwt_required()
@admin_required
def get_investor_stats():
    try:
        tlv  = float(db.session.query(func.sum(Livestock.estimated_value)).filter(Livestock.status=='active').scalar() or 0)
        ai   = Investor.query.filter_by(account_status='active').all()
        pi   = Investor.query.filter_by(account_status='pending').all()
        ii   = Investor.query.filter_by(account_status='inactive').all()
        ti   = sum(float(i.current_investment) for i in ai)
        tr   = sum(float(i.total_returns_received) for i in ai)
        today= datetime.utcnow().date()
        due  = [{'id':i.id,'name':i.name,'phone':i.phone,
                 'next_return_date':i.next_return_date.isoformat(),
                 'expected_return':float(i.current_investment*Decimal('0.10')),
                 'total_returns_received':float(i.total_returns_received)}
                for i in ai if i.next_return_date and i.next_return_date.date()<=today]
        return jsonify({'total_livestock_value':tlv,'total_investors':len(ai)+len(pi)+len(ii),
                        'active_investors':len(ai),'pending_investors':len(pi),'inactive_investors':len(ii),
                        'total_investment':ti,'total_returns_paid':tr,'coverage_ratio':tlv/ti if ti else 0,
                        'due_for_returns':due}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/investors/<int:investor_id>/create-user-account', methods=['POST'])
@jwt_required()
@admin_required
def create_investor_user_account(investor_id):
    try:
        inv = db.session.get(Investor, investor_id)
        if not inv: return jsonify({'error': 'Not found'}), 404
        if inv.user: return jsonify({'error': 'Already has account'}), 400
        if inv.account_status != 'pending': return jsonify({'error': 'Not pending'}), 400
        notes = inv.notes or ''
        # Check for valid existing credentials
        stored = {l.split(': ',1)[0].strip(): l.split(': ',1)[1] for l in notes.split('\n') if ': ' in l}
        if all(k in stored for k in ['Temporary Password','Registration Token','Account Creation Link','Token Generated']):
            gen_time = datetime.strptime(stored['Token Generated'], '%Y-%m-%d %H:%M:%S')
            if (datetime.utcnow() - gen_time).total_seconds() < 86400:
                return jsonify({'success': True, 'message': 'Using existing credentials',
                                'link': stored['Account Creation Link'],
                                'temporary_password': stored['Temporary Password'],
                                'investor': {'id':inv.id,'name':inv.name,'phone':inv.phone,'email':inv.email}}), 200
        tmp, token = generate_credentials(inv.id)
        origin = request.headers.get('Origin', 'http://localhost:5173')
        link   = f"{origin}/investor/complete-registration/{investor_id}?token={token}"
        lines  = [l for l in notes.split('\n') if not any(l.strip().startswith(k) for k in
                  ['Temporary Password:','Registration Token:','Account Creation Link:','Token Generated:'])]
        lines += [f'Temporary Password: {tmp}', f'Registration Token: {token}',
                  f'Account Creation Link: {link}',
                  f'Token Generated: {datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")}']
        inv.notes = '\n'.join(lines)
        db.session.commit()
        return jsonify({'success': True, 'link': link, 'temporary_password': tmp,
                        'investor': {'id':inv.id,'name':inv.name,'phone':inv.phone,'email':inv.email}}), 200
    except Exception as e:
        db.session.rollback(); return jsonify({'error': str(e)}), 500


@admin_bp.route('/investors/<int:investor_id>/adjust-investment', methods=['POST'])
@jwt_required()
@admin_required
def adjust_investor_investment(investor_id):
    try:
        data   = request.json
        adj    = data.get('adjustment_type')
        amount = Decimal(str(data.get('amount')))
        if not adj or amount <= 0: return jsonify({'error': 'Invalid input'}), 400
        inv = db.session.get(Investor, investor_id)
        if not inv: return jsonify({'error': 'Not found'}), 404
        old = inv.current_investment
        pm  = data.get('payment_method','cash')
        ref = (data.get('mpesa_reference','') or '').upper() if pm=='mpesa' else ''
        if adj == 'topup':
            ir = InvestorReturn(investor_id=inv.id, amount=amount, return_date=datetime.utcnow(),
                                payment_method=pm, mpesa_receipt=ref,
                                notes=f"Top-up. {data.get('notes','')}", status='completed', transaction_type='topup')
            db.session.add(ir)
            inv.current_investment += amount; inv.total_topups += amount; action='topped up'
        else:
            diff = amount - inv.current_investment
            if diff != 0:
                tt = 'adjustment_up' if diff > 0 else 'adjustment_down'
                db.session.add(InvestorReturn(investor_id=inv.id, amount=abs(diff), return_date=datetime.utcnow(),
                                              payment_method=pm, mpesa_receipt=ref,
                                              notes=f"Adj {old}→{amount}. {data.get('notes','')}", status='completed', transaction_type=tt))
            inv.current_investment = amount
            inv.total_topups = max(Decimal('0'), inv.current_investment - inv.initial_investment)
            action='adjusted'
        inv.notes = (inv.notes or '') + f"\nInvestment {action}: {old}→{inv.current_investment}"
        db.session.commit()
        return jsonify({'success': True, 'investor': inv.to_dict(),
                        'old_amount': float(old), 'new_amount': float(inv.current_investment)}), 200
    except Exception as e:
        db.session.rollback(); return jsonify({'error': str(e)}), 500


@admin_bp.route('/investor-transactions', methods=['GET'])
@jwt_required()
@admin_required
def get_investor_transactions():
    try:
        rows = []
        for ir in InvestorReturn.query.order_by(InvestorReturn.return_date.desc()).all():
            if not ir.investor: continue
            dt = ir.transaction_type or 'return'
            if dt == 'return' and ir.is_early_withdrawal: dt = 'early_withdrawal'
            rows.append({'id': f"investor_{ir.id}", 'date': ir.return_date.isoformat() if ir.return_date else None,
                         'type': dt, 'transaction_type': dt, 'investor_id': ir.investor.id,
                         'investor_name': ir.investor.name, 'amount': float(ir.amount),
                         'method': ir.payment_method, 'payment_method': ir.payment_method,
                         'mpesa_receipt': ir.mpesa_receipt, 'notes': ir.notes, 'status': ir.status,
                         'created_at': ir.return_date.isoformat() if ir.return_date else None})
        for loan in Loan.query.filter(Loan.funding_source=='investor', Loan.investor_id.isnot(None)).order_by(Loan.disbursement_date.desc()).all():
            if not loan.investor: continue
            rows.append({'id': f"loan_{loan.id}", 'date': loan.disbursement_date.isoformat() if loan.disbursement_date else None,
                         'type': 'disbursement', 'transaction_type': 'disbursement',
                         'investor_id': loan.investor.id, 'investor_name': loan.investor.name,
                         'amount': float(loan.principal_amount), 'method': 'bank', 'payment_method': 'bank',
                         'notes': f'Disbursement to {loan.client.full_name if loan.client else "?"}',
                         'status': 'completed', 'created_at': loan.disbursement_date.isoformat() if loan.disbursement_date else None})
        for inv in Investor.query.all():
            rows.append({'id': f"initial_{inv.id}", 'date': inv.invested_date.isoformat() if inv.invested_date else None,
                         'type': 'initial_investment', 'transaction_type': 'initial_investment',
                         'investor_id': inv.id, 'investor_name': inv.name,
                         'amount': float(inv.initial_investment), 'method': 'bank', 'payment_method': 'bank',
                         'notes': f'Initial investment from {inv.name}', 'status': 'completed',
                         'created_at': inv.invested_date.isoformat() if inv.invested_date else None})
        rows.sort(key=lambda x: x['date'] or '0', reverse=True)
        return jsonify(rows), 200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/investors/<int:investor_id>/statement', methods=['GET'])
@jwt_required()
@admin_required
def get_investor_statement(investor_id):
    try:
        inv = db.session.get(Investor, investor_id)
        if not inv: return jsonify({'error': 'Not found'}), 404
        txns    = [{'date': inv.invested_date.isoformat() if inv.invested_date else None,
                    'type': 'initial_investment', 'transaction_type': 'initial_investment',
                    'description': 'Initial Investment', 'amount': float(inv.initial_investment),
                    'balance': float(inv.initial_investment)}]
        balance = inv.initial_investment
        for r in InvestorReturn.query.filter_by(investor_id=investor_id).order_by(InvestorReturn.return_date).all():
            if r.transaction_type in ['topup','adjustment_up']:
                amt = float(r.amount); tt = r.transaction_type
            elif r.transaction_type == 'adjustment_down':
                amt = -float(r.amount); tt = 'adjustment'
            else:
                amt = -float(r.amount); tt = 'return'
            balance += amt
            txns.append({'date': r.return_date.isoformat() if r.return_date else None, 'type': tt,
                         'transaction_type': tt, 'description': r.notes or tt,
                         'amount': amt, 'balance': float(balance), 'method': r.payment_method,
                         'mpesa_receipt': r.mpesa_receipt, 'notes': r.notes})
        for loan in Loan.query.filter_by(investor_id=investor_id, funding_source='investor').order_by(Loan.disbursement_date).all():
            amt = -float(loan.principal_amount); balance += amt
            txns.append({'date': loan.disbursement_date.isoformat() if loan.disbursement_date else None,
                         'type': 'disbursement', 'transaction_type': 'disbursement',
                         'description': f'Loan to {loan.client.full_name if loan.client else "?"}',
                         'amount': amt, 'balance': float(balance), 'method': 'bank',
                         'notes': f'Principal recovered: {float(loan.principal_paid or 0)}'})
        txns.sort(key=lambda x: x['date'] or '0')
        funded = Loan.query.filter_by(investor_id=investor_id, funding_source='investor').all()
        total_returns = sum(float(r.amount) for r in InvestorReturn.query.filter_by(investor_id=investor_id) if r.transaction_type == 'return')
        return jsonify({'success': True, 'investor': inv.to_dict(), 'transactions': txns,
                        'summary': {'total_invested': float(inv.current_investment),
                                    'total_returns_paid': total_returns,
                                    'total_amount_disbursed': sum(float(l.principal_amount) for l in funded),
                                    'current_balance': float(balance),
                                    'total_loans_funded': len(funded)}}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500