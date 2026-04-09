# app/routes/recovery.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import (Loan, Client, Livestock, User, Comment, PrivateMessage,
                         Defaulter, Transaction, UserLoanCommentRead)
from app.utils.decorators import role_required
from app.routes.payments import recalculate_loan, _apply_payment, _loan_summary
from app.utils.cloudinary_upload import upload_base64_image
import cloudinary.uploader
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy.orm import joinedload

recovery_bp = Blueprint('recovery', __name__)


def get_week_number(disbursement_date):
    """Week 1 = first 7 days, Week 2 = days 7-14, etc."""
    if not disbursement_date:
        return 1
    delta = datetime.utcnow() - disbursement_date
    return max(1, (delta.days // 7) + 1)


# ---------------------------------------------------------------------------
# Recovery data
# ---------------------------------------------------------------------------

@recovery_bp.route('', methods=['GET'])
@jwt_required()
@role_required(['director', 'secretary', 'accountant', 'valuer'])
def get_recovery_data():
    user_id = int(get_jwt_identity())
    loans   = Loan.query.options(
        joinedload(Loan.client), joinedload(Loan.livestock)
    ).filter(Loan.status == 'active').all()

    result = {}
    today  = datetime.utcnow().date()

    for loan in loans:
        loan = recalculate_loan(loan)

        due_day = loan.disbursement_date.strftime('%A') if loan.disbursement_date else 'Monday'
        client  = loan.client
        lv      = loan.livestock

        collateral = loan.collateral_text or (f"{lv.count} {lv.livestock_type}" if lv else '')

        # Periodic interest for display
        if loan.repayment_plan == 'daily':
            periodic_interest = float(loan.current_principal) * 0.045
        else:
            periodic_interest = float(loan.current_principal) * 0.30

        week_number     = get_week_number(loan.disbursement_date)
        is_defaulter    = Defaulter.query.filter_by(loan_id=loan.id, resolved=False).first() is not None
        unpaid_interest = float(max(Decimal('0'), loan.accrued_interest - loan.interest_paid))

        # Days left toward current due_date
        if loan.due_date:
            due       = loan.due_date.date() if hasattr(loan.due_date, 'date') else loan.due_date
            days_left = (due - today).days
        else:
            days_left = 0

        result.setdefault(due_day, []).append({
            'id':               loan.id,
            'disbursement_date': loan.disbursement_date.isoformat() + 'Z' if loan.disbursement_date else None,
            'name':             client.full_name if client else 'Unknown',
            'collateral':       collateral,
            'id_number':        client.id_number if client else '',
            'contacts':         client.phone_number if client else '',
            'principal_amount': float(loan.principal_amount),
            'current_principal': float(loan.current_principal),
            'interest':         periodic_interest,
            'accrued_interest': unpaid_interest,
            'week':             week_number,
            'days_left':        days_left,
            'is_defaulter':     is_defaulter,
            'repayment_plan':   loan.repayment_plan,
            'interest_type':    loan.interest_type,
        })

    for day in result:
        result[day].sort(key=lambda x: x['name'])

    return jsonify(result), 200


# ---------------------------------------------------------------------------
# Add manual client (recovery module)
# ---------------------------------------------------------------------------

@recovery_bp.route('/client', methods=['POST'])
@jwt_required()
@role_required(['director', 'secretary'])
def add_manual_client():
    data = request.json
    for f in ['name', 'phone', 'id_number', 'principal_amount', 'repayment_plan']:
        if not data.get(f):
            return jsonify({'error': f'Missing {f}'}), 400
    try:
        client = Client(full_name=data['name'], phone_number=data['phone'],
                        id_number=data['id_number'],
                        location=data.get('location', 'Isinya, Kajiado'))
        db.session.add(client); db.session.flush()

        principal      = Decimal(str(data['principal_amount']))
        repayment_plan = data['repayment_plan']
        # Manual recovery clients always use simple interest regardless of plan
        interest_rate  = Decimal('4.5') if repayment_plan == 'daily' else Decimal('30.0')
        interest_type  = 'simple'
        now            = datetime.utcnow()
        due_date       = now + timedelta(days=14 if repayment_plan == 'daily' else 7)

        loan = Loan(client_id=client.id, principal_amount=principal,
                    interest_rate=interest_rate, interest_type=interest_type,
                    total_amount=principal, balance=principal,
                    current_principal=principal, principal_paid=Decimal('0'),
                    interest_paid=Decimal('0'), accrued_interest=Decimal('0'),
                    amount_paid=Decimal('0'), disbursement_date=now,
                    last_interest_payment_date=now, due_date=due_date,
                    status='active', repayment_plan=repayment_plan,
                    collateral_text=data.get('collateral_text', ''))
        db.session.add(loan); db.session.commit()

        db.session.add(Transaction(loan_id=loan.id, transaction_type='disbursement',
                                   amount=principal, payment_method='cash',
                                   notes='Manual addition via recovery module', status='completed'))
        db.session.commit()
        return jsonify({'success': True, 'loan': loan.to_dict()}), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Payment endpoint – fully synced with admin panel
# ---------------------------------------------------------------------------

@recovery_bp.route('/loan/<int:loan_id>/payment', methods=['POST'])
@jwt_required()
@role_required(['director', 'secretary'])
def process_recovery_payment(loan_id):
    """
    Process a payment from the recovery module.
    Uses the same _apply_payment() logic as the admin panel so that
    both sides always stay in sync – a single write to the Loan record.
    """
    try:
        data         = request.json
        amount       = data.get('amount')
        payment_type = data.get('payment_type', 'principal')
        method       = data.get('payment_method', 'cash')
        mpesa_ref    = data.get('mpesa_reference', '')
        notes        = data.get('notes', '')

        if not all([loan_id, amount, payment_type]):
            return jsonify({'error': 'Missing required fields'}), 400

        loan = db.session.get(Loan, loan_id)
        if not loan or loan.status != 'active':
            return jsonify({'error': 'Loan not found or not active'}), 404

        loan           = recalculate_loan(loan)
        payment_amount = Decimal(str(amount))
        if payment_amount <= 0:
            return jsonify({'error': 'Amount must be positive'}), 400

        method_label = f'M-Pesa {mpesa_ref}' if method == 'mpesa' else 'Cash'
        result = _apply_payment(loan, payment_type, payment_amount, notes, method=method_label)
        if isinstance(result, tuple):
            return jsonify({'error': result[0]}), result[1]

        loan = recalculate_loan(loan)

        txn = Transaction(
            loan_id=loan.id, transaction_type='payment',
            payment_type=payment_type, amount=payment_amount,
            payment_method=method,
            mpesa_receipt=mpesa_ref.upper() if method == 'mpesa' else None,
            notes=result, status='completed'
        )
        db.session.add(txn)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'{payment_type.capitalize()} payment of KSh {float(payment_amount):,.2f} processed',
            'transaction': txn.to_dict(),
            'loan': _loan_summary(loan),
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

@recovery_bp.route('/loan/<int:loan_id>/comment', methods=['POST'])
@jwt_required()
def add_comment(loan_id):
    uid  = int(get_jwt_identity())
    data = request.json
    if not data.get('content'):
        return jsonify({'error': 'Content required'}), 400
    c = Comment(loan_id=loan_id, user_id=uid, content=data['content'], parent_id=data.get('parent_id'))
    db.session.add(c); db.session.commit()
    return jsonify({'success': True, 'comment': c.to_dict()}), 201


@recovery_bp.route('/loan/<int:loan_id>/comments', methods=['GET'])
@jwt_required()
def get_comments(loan_id):
    comments = Comment.query.filter_by(loan_id=loan_id, parent_id=None).order_by(Comment.created_at).all()
    return jsonify([c.to_dict() for c in comments]), 200


@recovery_bp.route('/loan/<int:loan_id>/comment/<int:comment_id>', methods=['PUT'])
@jwt_required()
def edit_comment(loan_id, comment_id):
    uid = int(get_jwt_identity())
    c   = Comment.query.get_or_404(comment_id)
    if c.user_id != uid:
        return jsonify({'error': 'Unauthorized'}), 403
    if not request.json.get('content'):
        return jsonify({'error': 'Content required'}), 400
    c.content = request.json['content']; c.edited = True; c.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'success': True, 'comment': c.to_dict()}), 200


# ---------------------------------------------------------------------------
# Messaging
# ---------------------------------------------------------------------------

@recovery_bp.route('/messages/send', methods=['POST'])
@jwt_required()
def send_private_message():
    uid  = int(get_jwt_identity())
    data = request.json
    if not data.get('recipient_id') or not data.get('content'):
        return jsonify({'error': 'Recipient and content required'}), 400
    msg = PrivateMessage(sender_id=uid, recipient_id=data['recipient_id'],
                          content=data['content'], attachment_url=data.get('attachment_url'),
                          attachment_type=data.get('attachment_type'), attachment_name=data.get('attachment_name'))
    db.session.add(msg); db.session.commit()
    return jsonify({'success': True, 'message': msg.to_dict()}), 201


@recovery_bp.route('/messages/inbox', methods=['GET'])
@jwt_required()
def get_inbox():
    uid = int(get_jwt_identity())
    msgs = PrivateMessage.query.filter_by(recipient_id=uid).order_by(PrivateMessage.created_at.desc()).all()
    return jsonify([m.to_dict() for m in msgs]), 200


@recovery_bp.route('/messages/unread-count', methods=['GET'])
@jwt_required()
def unread_count():
    uid = int(get_jwt_identity())
    return jsonify({'count': PrivateMessage.query.filter_by(recipient_id=uid, read=False).count()}), 200


@recovery_bp.route('/messages/<int:msg_id>/read', methods=['PUT'])
@jwt_required()
def mark_read(msg_id):
    uid = int(get_jwt_identity())
    msg = PrivateMessage.query.filter_by(id=msg_id, recipient_id=uid).first()
    if not msg:
        return jsonify({'error': 'Not found'}), 404
    msg.read = True
    msg.status = 'read'
    msg.read_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'success': True}), 200


@recovery_bp.route('/loan/<int:loan_id>/defaulter', methods=['POST'])
@jwt_required()
@role_required(['director', 'secretary'])
def mark_defaulter(loan_id):
    uid = int(get_jwt_identity())
    ex  = Defaulter.query.filter_by(loan_id=loan_id).first()
    if ex:
        ex.resolved = False; ex.resolved_at = None; ex.marked_by = uid; ex.marked_at = datetime.utcnow()
        db.session.commit(); return jsonify({'success': True}), 200
    db.session.add(Defaulter(loan_id=loan_id, marked_by=uid)); db.session.commit()
    return jsonify({'success': True}), 201


@recovery_bp.route('/loan/<int:loan_id>/defaulter', methods=['DELETE'])
@jwt_required()
@role_required(['director', 'secretary'])
def resolve_defaulter(loan_id):
    d = Defaulter.query.filter_by(loan_id=loan_id, resolved=False).first()
    if not d: return jsonify({'error': 'Not marked as defaulter'}), 404
    d.resolved = True; d.resolved_at = datetime.utcnow(); db.session.commit()
    return jsonify({'success': True}), 200


@recovery_bp.route('/defaulters', methods=['GET'])
@jwt_required()
@role_required(['valuer'])
def get_defaulters():
    return jsonify([{
        'loan_id': d.loan.id, 'client_name': d.loan.client.full_name,
        'client_phone': d.loan.client.phone_number,
        'collateral': d.loan.collateral_text or (
            f"{d.loan.livestock.count} {d.loan.livestock.livestock_type}" if d.loan.livestock else ''),
        'marked_at': d.marked_at.isoformat() + 'Z'
    } for d in Defaulter.query.filter_by(resolved=False).all()]), 200


@recovery_bp.route('/users', methods=['GET'])
@jwt_required()
def get_users_for_messaging():
    uid   = int(get_jwt_identity())
    users = User.query.filter(User.id != uid).all()
    return jsonify([{'id': u.id, 'username': u.username, 'role': u.role} for u in users]), 200


@recovery_bp.route('/messages/conversation/<int:other_user_id>', methods=['GET'])
@jwt_required()
def get_conversation(other_user_id):
    uid  = int(get_jwt_identity())
    msgs = PrivateMessage.query.filter(
        ((PrivateMessage.sender_id == uid) & (PrivateMessage.recipient_id == other_user_id)) |
        ((PrivateMessage.sender_id == other_user_id) & (PrivateMessage.recipient_id == uid))
    ).order_by(PrivateMessage.created_at).all()
    return jsonify([m.to_dict() for m in msgs]), 200


@recovery_bp.route('/messages/unread-count-by-user', methods=['GET'])
@jwt_required()
def unread_count_by_user():
    uid   = int(get_jwt_identity())
    users = User.query.filter(User.id != uid).all()
    return jsonify({u.id: PrivateMessage.query.filter_by(recipient_id=uid, sender_id=u.id, read=False).count()
                    for u in users}), 200


@recovery_bp.route('/messages/upload', methods=['POST'])
@jwt_required()
def upload_message_attachment():
    if 'files' not in request.files:
        return jsonify({'error': 'No file'}), 400
    uploaded = []
    for f in request.files.getlist('files'):
        try:
            r = cloudinary.uploader.upload(f, folder='chat_attachments', resource_type='auto')
            uploaded.append({'url': r['secure_url'], 'filename': f.filename, 'mime_type': f.mimetype})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    return jsonify({'uploads': uploaded}), 200


@recovery_bp.route('/comment-unread-counts', methods=['GET'])
@jwt_required()
def get_comment_unread_counts():
    uid   = int(get_jwt_identity())
    loans = Loan.query.filter(Loan.status == 'active').all()
    result = {}
    for loan in loans:
        rec = UserLoanCommentRead.query.filter_by(user_id=uid, loan_id=loan.id).first()
        lr  = rec.last_read_at if rec else datetime.min
        result[loan.id] = Comment.query.filter(
            Comment.loan_id == loan.id, Comment.user_id != uid, Comment.created_at > lr
        ).count()
    return jsonify(result), 200


@recovery_bp.route('/loan/<int:loan_id>/comments/read-status', methods=['GET'])
@jwt_required()
def get_comments_with_read_status(loan_id):
    uid = int(get_jwt_identity())
    rec = UserLoanCommentRead.query.filter_by(user_id=uid, loan_id=loan_id).first()
    if not rec:
        rec = UserLoanCommentRead(user_id=uid, loan_id=loan_id, last_read_at=datetime.utcnow())
        db.session.add(rec); db.session.commit()
    comments = Comment.query.filter_by(loan_id=loan_id, parent_id=None).order_by(Comment.created_at).all()
    return jsonify({'last_read_at': rec.last_read_at.isoformat() + 'Z',
                    'comments': [c.to_dict() for c in comments]}), 200


@recovery_bp.route('/loan/<int:loan_id>/comment/mark-read', methods=['POST'])
@jwt_required()
def mark_comments_read(loan_id):
    uid = int(get_jwt_identity())
    rec = UserLoanCommentRead.query.filter_by(user_id=uid, loan_id=loan_id).first()
    if not rec:
        rec = UserLoanCommentRead(user_id=uid, loan_id=loan_id); db.session.add(rec)
    rec.last_read_at = datetime.utcnow(); db.session.commit()
    return jsonify({'success': True}), 200