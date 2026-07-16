from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from decimal import Decimal
from app import db
from app.models import User, StaffSalarySetting, SalaryAdvanceRequest, SalaryTransaction, PrivateMessage
from app.utils.decorators import role_required
from app.utils.security import log_audit
import logging

logger = logging.getLogger(__name__)

salary_bp = Blueprint('salary', __name__, url_prefix='/api/salary')


def get_current_month():
    return datetime.utcnow().strftime('%Y-%m')


def get_staff_roles():
    # Include head_of_it so they can request advances
    return ['head_of_it', 'client_relations_officer', 'valuer', 'secretary', 'hr_manager']


def is_staff(user):
    return user.role in get_staff_roles()


# ---------- Staff salary settings (director & hr_manager only) ----------
@salary_bp.route('/staff-settings', methods=['GET'])
@jwt_required()
@role_required(['director', 'hr_manager'])
def get_staff_settings():
    """Get all staff with their salary setting for a given month."""
    try:
        month = request.args.get('month', get_current_month())
        staff_users = User.query.filter(User.role.in_(get_staff_roles())).all()
        result = []
        for u in staff_users:
            setting = StaffSalarySetting.query.filter_by(user_id=u.id, month=month).first()
            result.append({
                'user_id': u.id,
                'username': u.username,
                'role': u.role,
                'month': month,
                'salary_amount': float(setting.salary_amount) if setting else 0.0,
                'setting_id': setting.id if setting else None,
            })
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error in get_staff_settings: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500


@salary_bp.route('/staff-settings', methods=['POST'])
@jwt_required()
@role_required(['director'])
def set_staff_salary():
    try:
        data = request.json
        user_id = data.get('user_id')
        month = data.get('month', get_current_month())
        salary_amount = Decimal(str(data.get('salary_amount', 0)))

        if not user_id or salary_amount < 0:
            return jsonify({'error': 'Invalid data'}), 400

        setting = StaffSalarySetting.query.filter_by(user_id=user_id, month=month).first()
        if setting:
            setting.salary_amount = salary_amount
            setting.updated_at = datetime.utcnow()
        else:
            setting = StaffSalarySetting(user_id=user_id, month=month, salary_amount=salary_amount)
            db.session.add(setting)
        db.session.commit()

        log_audit('salary_setting_updated', 'staff_salary_setting', setting.id, {
            'user_id': user_id, 'month': month, 'salary_amount': float(salary_amount)
        })
        return jsonify({'success': True, 'setting': {
            'user_id': user_id, 'month': month, 'salary_amount': float(salary_amount)
        }}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in set_staff_salary: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500


# ---------- Advance requests (staff can create, director/hr can view all) ----------
@salary_bp.route('/advance-requests', methods=['GET'])
@jwt_required()
def get_advance_requests():
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        if user.role in ['director', 'hr_manager']:
            requests = SalaryAdvanceRequest.query.order_by(SalaryAdvanceRequest.requested_at.desc()).all()
        else:
            requests = SalaryAdvanceRequest.query.filter_by(user_id=user_id).order_by(SalaryAdvanceRequest.requested_at.desc()).all()

        result = [r.to_dict() for r in requests]
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error in get_advance_requests: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500


@salary_bp.route('/advance-requests', methods=['POST'])
@jwt_required()
def create_advance_request():
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or not is_staff(user):
            return jsonify({'error': 'Only staff can request advances'}), 403

        data = request.json
        amount = Decimal(str(data.get('amount', 0)))
        note = data.get('note', '').strip()

        if amount <= 0 or amount > 5000:
            return jsonify({'error': 'Amount must be between 1 and 5000 KES'}), 400
        if not note:
            return jsonify({'error': 'Note is required'}), 400

        month = data.get('month', get_current_month())
        existing = SalaryAdvanceRequest.query.filter_by(user_id=user_id, month=month, status='pending').first()
        if existing:
            return jsonify({'error': 'You already have a pending request for this month'}), 400

        req = SalaryAdvanceRequest(
            user_id=user_id,
            amount=amount,
            note=note,
            month=month,
            status='pending'
        )
        db.session.add(req)
        db.session.flush()

        # Notify directors
        directors = User.query.filter_by(role='director').all()
        for director in directors:
            msg = PrivateMessage(
                sender_id=user_id,
                recipient_id=director.id,
                content=f"New salary advance request from {user.username} for KES {amount:.2f}.\n Note: {note}",
                status='sent'
            )
            db.session.add(msg)

        db.session.commit()

        log_audit('advance_request_created', 'salary_advance_request', req.id, {
            'user_id': user_id, 'amount': float(amount), 'month': month
        })

        return jsonify({'success': True, 'request': req.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in create_advance_request: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500


# ---------- Process advance request (approve/reject) – includes private message ----------
@salary_bp.route('/advance-requests/<int:request_id>/process', methods=['PUT'])
@jwt_required()
@role_required(['director', 'hr_manager'])
def process_advance_request(request_id):
    try:
        data = request.json
        action = data.get('action')
        reason = data.get('reason', '')

        req = SalaryAdvanceRequest.query.get(request_id)
        if not req:
            return jsonify({'error': 'Request not found'}), 404
        if req.status != 'pending':
            return jsonify({'error': 'Request already processed'}), 400

        director_id = int(get_jwt_identity())
        director = User.query.get(director_id)
        staff = User.query.get(req.user_id)

        if action == 'reject':
            req.status = 'rejected'
            req.rejected_reason = reason
            req.processed_at = datetime.utcnow()
            db.session.commit()

            # Send private message to the staff who requested
            if director and staff:
                msg_content = (
                    f"❌ Your salary advance request of KES {req.amount:.2f} for {req.month} "
                    f"has been rejected.\nReason: {reason}"
                )
                msg = PrivateMessage(
                    sender_id=director.id,
                    recipient_id=staff.id,
                    content=msg_content,
                    status='sent'
                )
                db.session.add(msg)
                db.session.commit()

            log_audit('advance_request_rejected', 'salary_advance_request', req.id, {'user_id': req.user_id})
            return jsonify({'success': True, 'status': 'rejected'}), 200

        elif action == 'approve':
            req.status = 'approved'
            req.processed_at = datetime.utcnow()
            db.session.commit()

            # Send approval notification
            if director and staff:
                msg_content = (
                    f"✅ Your salary advance request of KES {req.amount:.2f} for {req.month} "
                    f"has been approved. Please wait for payment processing."
                )
                msg = PrivateMessage(
                    sender_id=director.id,
                    recipient_id=staff.id,
                    content=msg_content,
                    status='sent'
                )
                db.session.add(msg)
                db.session.commit()

            log_audit('advance_request_approved', 'salary_advance_request', req.id, {'user_id': req.user_id})
            return jsonify({'success': True, 'status': 'approved'}), 200

        else:
            return jsonify({'error': 'Invalid action'}), 400
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in process_advance_request: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500


@salary_bp.route('/advance-requests/<int:request_id>/pay', methods=['POST'])
@jwt_required()
@role_required(['director'])
def pay_advance_request(request_id):
    try:
        data = request.json
        mpesa_ref = data.get('mpesa_reference', '').strip()
        payment_method = data.get('payment_method', 'mpesa')
        notes = data.get('notes', '')

        req = SalaryAdvanceRequest.query.get(request_id)
        if not req:
            return jsonify({'error': 'Request not found'}), 404
        if req.status != 'approved':
            return jsonify({'error': 'Request must be approved before payment'}), 400

        txn = SalaryTransaction(
            user_id=req.user_id,
            month=req.month,
            amount=req.amount,
            transaction_type='advance',
            reference=mpesa_ref if payment_method == 'mpesa' else None,
            payment_method=payment_method,
            notes=notes,
            created_by=int(get_jwt_identity()),
            advance_request_id=req.id
        )
        db.session.add(txn)

        req.status = 'paid'
        req.mpesa_reference = mpesa_ref
        req.payment_method = payment_method
        req.processed_at = datetime.utcnow()

        db.session.commit()

        log_audit('advance_request_paid', 'salary_advance_request', req.id, {
            'amount': float(req.amount), 'reference': mpesa_ref
        })

        return jsonify({'success': True, 'transaction': txn.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in pay_advance_request: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500


# ---------- Direct salary payment (director only) ----------
@salary_bp.route('/salary-payment', methods=['POST'])
@jwt_required()
@role_required(['director'])
def record_salary_payment():
    try:
        data = request.json
        user_id = data.get('user_id')
        month = data.get('month', get_current_month())
        amount = Decimal(str(data.get('amount', 0)))
        payment_method = data.get('payment_method', 'cash')
        reference = data.get('reference', '')
        notes = data.get('notes', '')

        if not user_id or amount <= 0:
            return jsonify({'error': 'Invalid data'}), 400

        setting = StaffSalarySetting.query.filter_by(user_id=user_id, month=month).first()
        if not setting:
            return jsonify({'error': 'Salary not set for this user/month'}), 400

        txn = SalaryTransaction(
            user_id=user_id,
            month=month,
            amount=amount,
            transaction_type='salary_payment',
            reference=reference,
            payment_method=payment_method,
            notes=notes,
            created_by=int(get_jwt_identity())
        )
        db.session.add(txn)
        db.session.commit()

        log_audit('salary_payment_recorded', 'salary_transaction', txn.id, {
            'user_id': user_id, 'amount': float(amount), 'month': month
        })

        return jsonify({'success': True, 'transaction': txn.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in record_salary_payment: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500


# ---------- Staff stats (any staff, including head_of_it) ----------
@salary_bp.route('/my-stats', methods=['GET'])
@jwt_required()
def my_salary_stats():
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or not is_staff(user):
            return jsonify({'error': 'Only staff can view their salary stats'}), 403

        month = request.args.get('month', get_current_month())

        # Get salary setting for this month
        setting = StaffSalarySetting.query.filter_by(user_id=user_id, month=month).first()
        total_salary = Decimal(setting.salary_amount) if setting else Decimal('0')

        # All transactions for this user (no month filter)
        all_transactions = SalaryTransaction.query.filter_by(user_id=user_id).order_by(SalaryTransaction.created_at.desc()).all()

        # Month-specific transactions for stats
        month_transactions = [t for t in all_transactions if t.month == month]

        total_advances = Decimal('0')
        total_paid = Decimal('0')
        for txn in month_transactions:
            if txn.transaction_type == 'advance':
                total_advances += txn.amount
            total_paid += txn.amount

        balance = total_salary - total_paid
        pending_requests = SalaryAdvanceRequest.query.filter_by(user_id=user_id, month=month, status='pending').all()

        return jsonify({
            'month': month,
            'total_salary': float(total_salary),
            'total_advances': float(total_advances),
            'total_paid': float(total_paid),
            'balance': float(balance),
            'pending_requests': [{'id': r.id, 'amount': float(r.amount), 'note': r.note, 'requested_at': r.requested_at.isoformat()} for r in pending_requests],
            'transactions': [t.to_dict() for t in all_transactions]  # <- all transactions, not just month
        }), 200
    except Exception as e:
        logger.error(f"Error in my_salary_stats: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500

# ---------- Report data (director & hr_manager only) ----------
@salary_bp.route('/staff-report/<int:user_id>', methods=['GET'])
@jwt_required()
@role_required(['director', 'hr_manager'])
def get_staff_report_data(user_id):
    try:
        month = request.args.get('month', get_current_month())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        setting = StaffSalarySetting.query.filter_by(user_id=user_id, month=month).first()
        total_salary = Decimal(setting.salary_amount) if setting else Decimal('0')

        transactions = SalaryTransaction.query.filter_by(user_id=user_id, month=month).all()
        advances = [t for t in transactions if t.transaction_type == 'advance']
        salary_payments = [t for t in transactions if t.transaction_type == 'salary_payment']
        total_advances = sum(t.amount for t in advances)
        total_paid = sum(t.amount for t in transactions)
        balance = total_salary - total_paid

        data = {
            'user': user.username,
            'role': user.role,
            'month': month,
            'total_salary': float(total_salary),
            'total_advances': float(total_advances),
            'total_salary_paid': float(sum(t.amount for t in salary_payments)),
            'total_paid': float(total_paid),
            'balance': float(balance),
            'advances': [{'amount': float(t.amount), 'date': t.created_at.isoformat(), 'reference': t.reference, 'payment_method': t.payment_method} for t in advances],
            'salary_payments': [{'amount': float(t.amount), 'date': t.created_at.isoformat(), 'reference': t.reference, 'payment_method': t.payment_method} for t in salary_payments],
        }
        return jsonify(data), 200
    except Exception as e:
        logger.error(f"Error in get_staff_report_data: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500
    
@salary_bp.route('/transactions', methods=['GET'])
@jwt_required()
@role_required(['director', 'hr_manager'])
def get_salary_transactions():
    """
    Get all salary transactions with optional filters.
    Query params:
        - user_id (int): filter by specific staff
        - month (str): filter by month (YYYY-MM)
        - start_date (str): filter by creation date >=
        - end_date (str): filter by creation date <=
        - search (str): search by staff username
    """
    try:
        user_id = request.args.get('user_id', type=int)
        month = request.args.get('month')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        search = request.args.get('search', '').strip()

        query = SalaryTransaction.query.join(User, SalaryTransaction.user_id == User.id)

        if user_id:
            query = query.filter(SalaryTransaction.user_id == user_id)
        if month:
            query = query.filter(SalaryTransaction.month == month)
        if start_date:
            query = query.filter(SalaryTransaction.created_at >= start_date)
        if end_date:
            query = query.filter(SalaryTransaction.created_at <= end_date)
        if search:
            query = query.filter(User.username.ilike(f'%{search}%'))

        transactions = query.order_by(SalaryTransaction.created_at.desc()).all()
        return jsonify([t.to_dict() for t in transactions]), 200
    except Exception as e:
        logger.error(f"Error in get_salary_transactions: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500