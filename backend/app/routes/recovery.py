from flask import Blueprint, request, jsonify, url_for
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import (Loan, Client, Livestock, User, Comment, PrivateMessage, Defaulter, Transaction, UserLoanCommentRead, ClientAssignment, ReportComment, FlaggedLoan)
from app.utils.decorators import role_required
from app.routes.payments import recalculate_loan, _apply_payment, _loan_summary, _get_current_period_interest, _get_current_period_key
from app.utils.cloudinary_upload import upload_base64_image
import cloudinary.uploader
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy.orm import joinedload
import io
from flask import send_file
from app.models import MessageAttachment
from app.services.ledger import record_ledger_entry
from app.routes.payments import compute_overdue
from flask_cors import cross_origin



recovery_bp = Blueprint('recovery', __name__)



def get_week_number(disbursement_date):
    """Week 1 = first 7 days, Week 2 = days 7-14, etc."""
    if not disbursement_date:
        return 1
    delta = datetime.utcnow() - disbursement_date
    return max(1, (delta.days // 7) + 1)


# ---------------------------------------------------------------------------
# Recovery data – now includes pre‑period interest tracking
# ---------------------------------------------------------------------------

@recovery_bp.route('', methods=['GET'])
@jwt_required()
@role_required(['admin','director', 'secretary', 'accountant', 'valuer','head_of_it','deputy_director', 'client_relations_officer', 'hr_manager'])
def get_recovery_data():
    user_id = int(get_jwt_identity())
    
    # Subquery to get IDs of loans that are flagged and unresolved
    flagged_subq = db.session.query(FlaggedLoan.loan_id).filter(FlaggedLoan.resolved == False).subquery()
    
    loans = Loan.query.options(
        joinedload(Loan.client), joinedload(Loan.livestock)
    ).filter(
        Loan.status == 'active',
        Loan.id.notin_(flagged_subq)   # exclude flagged loans
    ).all()
    
    result = {}
    today = datetime.utcnow().date()
    
    for loan in loans:
        loan = recalculate_loan(loan)
        today = datetime.utcnow().date()
        overdue_days, overdue_weeks = compute_overdue(loan, today)
        
        due_day = loan.disbursement_date.strftime('%A') if loan.disbursement_date else 'Monday'
        client = loan.client
        lv = loan.livestock
        
        collateral = loan.collateral_text or (f"{lv.count} {lv.livestock_type}" if lv else '')
        
        # ---- Pre-period interest info ----
        current_period = _get_current_period_key(loan)
        raw_weekly_interest = (loan.current_principal * Decimal('0.30')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        period_prepaid = Decimal('0')
        period_fully_paid = False
        if loan.interest_prepaid_period == current_period:
            period_prepaid = loan.interest_prepaid_amount or Decimal('0')
            period_fully_paid = period_prepaid >= raw_weekly_interest - Decimal('0.01')
        
        # Determine the interest amount for the current period (1 week or 1 day)
        if loan.repayment_plan == 'weekly' and loan.interest_rate > 0:
            periodic_interest = float(raw_weekly_interest)          # 30% of current principal
        elif loan.repayment_plan == 'daily' and loan.interest_rate > 0:
            periodic_interest = float((loan.current_principal * Decimal('0.045')).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            ))                                                      # 4.5% of current principal
        else:
            periodic_interest = 0.0     
        
        if loan.repayment_plan == 'weekly' and loan.interest_rate > 0:
            if loan.interest_prepaid_period == current_period:
                unpaid_interest = float(max(Decimal('0'), raw_weekly_interest - period_prepaid))
            else:
                unpaid_interest = float(raw_weekly_interest)
        else:
            unpaid_interest = float(max(Decimal('0'), loan.accrued_interest - loan.interest_paid))
        
        week_number = get_week_number(loan.disbursement_date)
        is_defaulter = Defaulter.query.filter_by(loan_id=loan.id, resolved=False).first() is not None
        
        if loan.due_date:
            due = loan.due_date.date() if hasattr(loan.due_date, 'date') else loan.due_date
            days_left = (due - today).days
        else:
            days_left = 0
        
        # ---------- NEW: Detect waived loans and get original principal ----------
        is_waiver = (loan.interest_rate == 0 and loan.repayment_plan == 'daily')
        original_principal = None
        if is_waiver and loan.parent_loan_id:
            parent = db.session.get(Loan, loan.parent_loan_id)
            if parent:
                original_principal = float(parent.principal_amount)
        
        result.setdefault(due_day, []).append({
            'id': loan.id,
            'disbursement_date': loan.disbursement_date.isoformat() + 'Z' if loan.disbursement_date else None,
            'name': client.full_name if client else 'Unknown',
            'collateral': collateral,
            'location': client.location if client else '',
            'id_number': client.id_number if client else '',
            'contacts': client.phone_number if client else '',
            'principal_amount': float(loan.principal_amount),
            'current_principal': float(loan.current_principal),
            'interest': periodic_interest,
            'accrued_interest': unpaid_interest,
            'week': week_number,
            'days_left': days_left,
            'is_defaulter': is_defaulter,
            'repayment_plan': loan.repayment_plan,
            'interest_type': loan.interest_type,
            'current_period_interest': float(raw_weekly_interest),
            'period_interest_prepaid': float(period_prepaid),
            'period_interest_fully_paid': period_fully_paid,
            'interest_prepaid_period': loan.interest_prepaid_period,
            'interest_prepaid_amount': float(loan.interest_prepaid_amount or 0),
            'interest_rate': float(loan.interest_rate),
            'overdue_days': overdue_days,
            'overdue_weeks': overdue_weeks,
            # ---------- NEW fields ----------
            'is_waiver': is_waiver,
            'original_principal': original_principal,
        })
    
    for day in result:
        result[day].sort(key=lambda x: x['name'])
    
    return jsonify(result), 200

# ---------------------------------------------------------------------------
# Payment endpoint – already uses _apply_payment() (no changes needed)
# ---------------------------------------------------------------------------

@recovery_bp.route('/loan/<int:loan_id>/payment', methods=['POST'])
@jwt_required()
@role_required(['director', 'secretary', 'head_of_it','deputy_director', 'client_relations_officer', 'hr_manager'])
def process_recovery_payment(loan_id):
    """
    Process a payment from the recovery module.
    Uses the same _apply_payment() logic as the admin panel.
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

        record_ledger_entry(
            loan=loan,
            event_type='payment',
            transaction=txn,
            amount=payment_amount,
            notes=result,
            reference=method_label,
            user_id=get_jwt_identity()
        )
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
# All other routes (comments, messages, defaulters, etc.) remain unchanged
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
@role_required(['director', 'secretary', 'head_of_it', 'deputy_director', 'secretary', 'client_relations_officer', 'valuer', 'hr_manager'])
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
@role_required(['director', 'secretary', 'head_of_it', 'deputy_director','secretary', 'client_relations_officer', 'valuer', 'hr_manager'])
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

    ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
    uploaded = []

    for f in request.files.getlist('files'):
        mime = f.mimetype
        print(f"Uploading file: {f.filename}, MIME: {mime}")

        if mime in ALLOWED_IMAGE_TYPES:
            # ✅ Upload image to Cloudinary
            print("  -> Using Cloudinary (image)")
            try:
                r = cloudinary.uploader.upload(f, folder='chat_attachments', resource_type='image')
                url = r['secure_url']
                uploaded.append({
                    'url': url,
                    'filename': f.filename,
                    'mime_type': mime
                })
            except Exception as e:
                print(f"  -> Cloudinary error: {str(e)}")
                return jsonify({'error': f'Cloudinary upload failed: {str(e)}'}), 500
        else:
            # ✅ Store non-image files in database
            print("  -> Using database storage")
            try:
                attachment = MessageAttachment(
                    filename=f.filename,
                    mime_type=mime,
                    file_data=f.read()
                )
                db.session.add(attachment)
                db.session.commit()
                url = url_for('recovery.get_message_attachment', attachment_id=attachment.id, _external=False)
                uploaded.append({
                    'url': url,
                    'filename': f.filename,
                    'mime_type': mime
                })
            except Exception as e:
                db.session.rollback()
                print(f"  -> Database store error: {str(e)}")
                return jsonify({'error': f'Database store failed: {str(e)}'}), 500

    return jsonify({'uploads': uploaded}), 200

@recovery_bp.route('/messages/attachment/<int:attachment_id>', methods=['GET'])
@jwt_required()
def get_message_attachment(attachment_id):
    attachment = MessageAttachment.query.get_or_404(attachment_id)
    return send_file(
        io.BytesIO(attachment.file_data),
        mimetype=attachment.mime_type,
        as_attachment=True,
        download_name=attachment.filename
    )

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

@recovery_bp.route('/loan/<int:loan_id>/claim', methods=['POST'])
@jwt_required()
@role_required(['director', 'secretary', 'head_of_it', 'accountant', 'valuer', 'deputy_director', 'client_relations_officer', 'hr_manager'])
def claim_ownership(loan_id):
    try:
        loan = db.session.get(Loan, loan_id)
        if not loan or loan.status != 'active':
            return jsonify({'error': 'Loan not found or not active'}), 404

        due = loan.due_date.date() if hasattr(loan.due_date, 'date') else loan.due_date
        if due >= datetime.now().date():
            return jsonify({'error': 'Loan not overdue'}), 400

        lv = Livestock.query.filter_by(id=loan.livestock_id).first()
        if not lv:
            return jsonify({'error': 'Livestock not found'}), 404

        loc = (lv.client.location if lv.client and lv.client.location else None) or 'Isinya, Kajiado'
        lv.description = 'Livestock for purchase'
        lv.location = loc
        lv.status = 'active'
        lv.client_id = None

        loan.status = 'claimed'
        loan.balance = 0
        loan.amount_paid = loan.total_amount

        db.session.add(Transaction(
            loan_id=loan.id, transaction_type='claim', amount=0,
            payment_method='claim', notes='Claimed overdue'
        ))
        db.session.commit()
        txn = Transaction(...)   # existing
        db.session.commit()
        record_ledger_entry(
            loan=loan,
            event_type='claimed',
            transaction=txn,
            amount=0,
            notes='Claimed overdue',
            user_id=get_jwt_identity()
        )
        db.session.commit()

        return jsonify({'success': True, 'message': f'Claimed {lv.livestock_type}'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
    

@recovery_bp.route('/loan/<int:loan_id>/renew', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'head_of_it','deputy_director', 'client_relations_officer', 'hr_manager'])
def renew_loan_recovery(loan_id):
    try:
        from app.routes.payments import recalculate_loan
        from datetime import datetime, timedelta
        from decimal import Decimal

        data = request.get_json() or {}
        new_principal = data.get('new_principal')
        new_repayment_plan = data.get('new_repayment_plan')   # <-- READ FROM REQUEST

        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
        if loan.status != 'active':
            return jsonify({'error': 'Loan is not active'}), 400

        loan = recalculate_loan(loan)

        # Determine the new principal
        if new_principal is not None:
            try:
                new_principal = Decimal(str(new_principal))
                if new_principal <= 0:
                    return jsonify({'error': 'New principal must be positive'}), 400
            except:
                return jsonify({'error': 'Invalid new_principal value'}), 400
        else:
            new_principal = loan.current_principal + (loan.accrued_interest - loan.interest_paid)
            if new_principal <= Decimal('0.01'):
                return jsonify({'error': 'No outstanding balance to renew'}), 400

        # Validate and set the repayment plan
        if new_repayment_plan not in ['weekly', 'daily']:
            new_repayment_plan = loan.repayment_plan   # fallback

        now = datetime.utcnow()
        # Eligibility check
        disburse = loan.disbursement_date or loan.created_at
        days_since = (now - disburse).days
        if days_since < 14 and loan.due_date > now:
            return jsonify({'error': 'Loan is not yet eligible for renewal'}), 400

        # Mark old loan as renewed
        loan.status = 'renewed'
        loan.balance = Decimal('0')
        loan.amount_paid = loan.total_amount
        loan.notes = (loan.notes or '') + f"\nRenewed on {now.isoformat()}"

        # Create new loan with the chosen plan
        if new_repayment_plan == 'daily':
            interest_rate = Decimal('4.5')
            interest_type = 'simple'
            due_date = now + timedelta(days=14)
        else:
            interest_rate = Decimal('30.0')
            interest_type = 'compound'
            due_date = now + timedelta(days=7)

        new_loan = Loan(
            client_id=loan.client_id,
            livestock_id=loan.livestock_id,
            principal_amount=new_principal,
            current_principal=new_principal,
            total_amount=new_principal,
            balance=new_principal,
            interest_rate=interest_rate,
            interest_type=interest_type,
            repayment_plan=new_repayment_plan,          # <-- USE THE NEW PLAN
            funding_source=loan.funding_source,
            investor_id=loan.investor_id,
            disbursement_date=now,
            due_date=due_date,
            status='active',
            collateral_text=loan.collateral_text,
            notes=f"Renewal of loan #{loan.id} - new plan: {new_repayment_plan}",
            created_at=now,
            principal_paid=Decimal('0'),
            interest_paid=Decimal('0'),
            accrued_interest=Decimal('0'),
            last_interest_payment_date=now,
            interest_prepaid_period=None,
            interest_prepaid_amount=Decimal('0'),
            parent_loan_id=loan.id,
            root_loan_id=loan.root_loan_id or loan.id
        )

        db.session.add(new_loan)
        db.session.flush()

        txn = Transaction(
            loan_id=loan.id,
            transaction_type='renewal',
            amount=new_principal,
            payment_method='renewal',
            notes=f'Loan renewed. New loan ID: {new_loan.id} | Plan: {new_repayment_plan}',
            status='completed',
            created_at=now
        )
        db.session.add(txn)

        if new_loan.livestock:
            new_loan.livestock.description = f"Collateral for renewed loan #{new_loan.id}"

        db.session.commit()

        # Record ledger entries
        record_ledger_entry(
            loan=loan,
            event_type='renewal_merged',
            transaction=txn,
            amount=new_principal,
            notes=f'Loan renewed into new loan ID {new_loan.id}',
            reference=str(new_loan.id),
            user_id=get_jwt_identity()
        )
        record_ledger_entry(
            loan=new_loan,
            event_type='renewal_created',
            transaction=None,
            amount=new_loan.principal_amount,
            notes=f'Renewal of loan #{loan.id} – Plan: {new_repayment_plan}',
            reference=str(loan.id),
            user_id=get_jwt_identity()
        )
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Loan renewed. New loan ID: {new_loan.id}',
            'old_loan': loan.to_dict(),
            'new_loan': new_loan.to_dict(),
            'new_principal': float(new_principal),
            'new_repayment_plan': new_repayment_plan
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
        
@recovery_bp.route('/loan/<int:loan_id>/transactions', methods=['GET'])
@jwt_required()
@role_required(['director', 'secretary', 'accountant', 'valuer', 'head_of_it', 'deputy_director', 'client_relations_officer', 'hr_manager'])
def get_loan_transactions(loan_id):
    try:
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
        transactions = Transaction.query.filter_by(loan_id=loan_id).order_by(Transaction.created_at.desc()).all()
        result = [{
            'id': t.id,
            'date': t.created_at.isoformat() if t.created_at else None,
            'type': t.transaction_type,
            'payment_type': t.payment_type,
            'amount': float(t.amount),
            'method': t.payment_method,
            'status': t.status,
            'notes': t.notes,
            'mpesa_receipt': t.mpesa_receipt
        } for t in transactions]
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    

# Edit private message (only sender can edit, and only if not read? optional)
@recovery_bp.route('/messages/<int:message_id>', methods=['PUT'])
@jwt_required()
def edit_private_message(message_id):
    user_id = int(get_jwt_identity())
    msg = PrivateMessage.query.get_or_404(message_id)
    if msg.sender_id != user_id:
        return jsonify({'error': 'You can only edit your own messages'}), 403
    data = request.json
    if 'content' not in data:
        return jsonify({'error': 'Content required'}), 400
    msg.content = data['content']
    msg.edited = True   # you may want to add an 'edited' column to PrivateMessage
    msg.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'success': True, 'message': msg.to_dict()}), 200

# Delete private message (only sender)
@recovery_bp.route('/messages/<int:message_id>', methods=['DELETE'])
@jwt_required()
def delete_private_message(message_id):
    user_id = int(get_jwt_identity())
    msg = PrivateMessage.query.get_or_404(message_id)
    if msg.sender_id != user_id:
        return jsonify({'error': 'You can only delete your own messages'}), 403
    db.session.delete(msg)
    db.session.commit()
    return jsonify({'success': True}), 200

@recovery_bp.route('/reports/assignments', methods=['GET'])
@jwt_required()
@role_required(['secretary', 'client_relations_officer'])
def get_my_assigned_clients():
    officer_id = int(get_jwt_identity())
    report_date = request.args.get('date')
    if report_date:
        try:
            report_date = datetime.strptime(report_date, '%Y-%m-%d').date()
        except:
            return jsonify({'error': 'Invalid date format'}), 400
    else:
        report_date = datetime.utcnow().date()

    from app.routes.admin import get_assigned_clients_for_user
    assigned = get_assigned_clients_for_user(officer_id)

    for client in assigned:
        snapshot = ReportComment.query.filter_by(
            loan_id=client['loan_id'],
            officer_id=officer_id,
            report_date=report_date
        ).first()
        if snapshot:
            # Use snapshot values if they exist, otherwise fall back to current
            client['current_principal'] = float(snapshot.current_principal) if snapshot.current_principal is not None else client['current_principal']
            client['unpaid_interest'] = float(snapshot.unpaid_interest) if snapshot.unpaid_interest is not None else client['unpaid_interest']
            client['total_balance'] = float(snapshot.total_balance) if snapshot.total_balance is not None else client['total_balance']
            client['comment'] = snapshot.comment
        else:
            client['comment'] = ''

    from app.models import DayAssignment
    day_assignments = DayAssignment.query.filter_by(user_id=officer_id).all()
    assigned_days = [da.day_of_week for da in day_assignments]

    response = jsonify({'clients': assigned, 'assigned_days': assigned_days})
    origin = request.headers.get('Origin')
    allowed_origins = ['http://localhost:5173', 'https://www.nagolie.com', 'https://nagolie.com']
    if origin in allowed_origins:
        response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response, 200

@recovery_bp.route('/reports/comment', methods=['POST'])
@jwt_required()
@role_required(['secretary', 'client_relations_officer'])
def save_report_comment():
    officer_id = int(get_jwt_identity())
    data = request.json
    loan_id = data.get('loan_id')
    comment_text = data.get('comment', '')
    report_date = datetime.utcnow().date()

    if not loan_id:
        return jsonify({'error': 'loan_id required'}), 400

    loan = db.session.get(Loan, loan_id)
    if not loan or loan.status != 'active':
        return jsonify({'error': 'Loan not found or not active'}), 404

    loan = recalculate_loan(loan, save=False)   # read only

    if loan.repayment_plan == 'weekly' and loan.interest_rate > 0:
        current_period = _get_current_period_key(loan)
        period_interest = _get_current_period_interest(loan)
        if loan.interest_prepaid_period == current_period:
            prepaid = loan.interest_prepaid_amount or Decimal('0')
            unpaid_interest = float(max(Decimal('0'), period_interest - prepaid))
        else:
            unpaid_interest = float(period_interest)
    else:
        unpaid_interest = float(max(Decimal('0'), loan.accrued_interest - loan.interest_paid))

    current_principal = float(loan.current_principal)
    total_balance = current_principal + unpaid_interest

    comment = ReportComment.query.filter_by(
        loan_id=loan_id, officer_id=officer_id, report_date=report_date
    ).first()
    if comment:
        comment.comment = comment_text
        comment.updated_at = datetime.utcnow()
    else:
        comment = ReportComment(
            loan_id=loan_id, officer_id=officer_id,
            report_date=report_date, comment=comment_text
        )
        db.session.add(comment)

    comment.current_principal = current_principal
    comment.unpaid_interest = unpaid_interest
    comment.total_balance = total_balance
    comment.interest_rate = float(loan.interest_rate)
    comment.repayment_plan = loan.repayment_plan

    db.session.commit()
    return jsonify({'success': True}), 200

@recovery_bp.route('/flag-loan/<int:loan_id>', methods=['POST'])
@jwt_required()
@role_required(['secretary', 'client_relations_officer', 'admin', 'director', 'hr_manager'])
def flag_loan(loan_id):
    """Officer flags a client for valuer attention."""
    user_id = int(get_jwt_identity())
    loan = db.session.get(Loan, loan_id)
    if not loan or loan.status != 'active':
        return jsonify({'error': 'Loan not found or not active'}), 404

    # Check if already flagged and unresolved
    existing = FlaggedLoan.query.filter_by(loan_id=loan_id, resolved=False).first()
    if existing:
        return jsonify({'error': 'Loan already flagged'}), 400

    # Get current active assignment
    ass = ClientAssignment.query.filter_by(loan_id=loan_id, is_active=True).first()
    prev_officer_id = ass.officer_id if ass else None

    # Deactivate current assignment
    if ass:
        ass.is_active = False

    flagged = FlaggedLoan(
        loan_id=loan_id,
        flagged_by=user_id,
        previous_officer_id=prev_officer_id,
        flag_reason=request.json.get('reason', '')
    )
    db.session.add(flagged)
    db.session.commit()

    return jsonify({'success': True, 'message': 'Loan flagged for valuer'}), 200


@recovery_bp.route('/resolve-flag/<int:loan_id>', methods=['POST'])
@jwt_required()
@role_required(['valuer', 'admin', 'director', 'hr_manager'])
def resolve_flag(loan_id):
    """Valuer resolves a flagged loan – moves it back to original officer."""
    user_id = int(get_jwt_identity())
    flagged = FlaggedLoan.query.filter_by(loan_id=loan_id, resolved=False).first()
    if not flagged:
        return jsonify({'error': 'No unresolved flag for this loan'}), 404

    flagged.resolved = True
    flagged.resolved_at = datetime.utcnow()
    flagged.resolved_by = user_id

    # Restore previous assignment (or create a new day-based one)
    prev_officer_id = flagged.previous_officer_id
    if prev_officer_id:
        # Reactivate day assignment or create new manual assignment
        # First deactivate any existing active assignments for this loan
        ClientAssignment.query.filter_by(loan_id=loan_id, is_active=True).update({'is_active': False})
        new_ass = ClientAssignment(
            loan_id=loan_id,
            officer_id=prev_officer_id,
            assignment_type='manual',
            assigned_by=user_id,
            override_reason='Restored after valuer resolution',
            is_active=True
        )
        db.session.add(new_ass)
    else:
        # Fallback: assign based on day of week (refresh day assignments later)
        from app.routes.admin import refresh_day_assignments
        refresh_day_assignments()   # this will create day assignments for all loans

    db.session.commit()
    return jsonify({'success': True, 'message': 'Flag resolved, loan reassigned to original officer'}), 200


@recovery_bp.route('/flagged-clients', methods=['GET'])
@jwt_required()
@role_required(['valuer', 'admin', 'director', 'hr_manager'])
def get_flagged_clients():
    """Return all currently flagged loans with client details, balances, and livestock value."""
    flagged = FlaggedLoan.query.filter_by(resolved=False).all()
    result = []
    for f in flagged:
        loan = f.loan
        if not loan or loan.status != 'active':
            continue
        loan = recalculate_loan(loan)
        client = loan.client
        livestock = loan.livestock

        # Calculate unpaid interest correctly
        if loan.repayment_plan == 'weekly' and loan.interest_rate > 0:
            current_period = _get_current_period_key(loan)
            period_interest = _get_current_period_interest(loan)
            if loan.interest_prepaid_period == current_period:
                prepaid = loan.interest_prepaid_amount or Decimal('0')
                unpaid_interest = float(max(Decimal('0'), period_interest - prepaid))
            else:
                unpaid_interest = float(period_interest)
        else:
            unpaid_interest = float(max(Decimal('0'), loan.accrued_interest - loan.interest_paid))

        collateral_value = float(livestock.estimated_value) if livestock else 0

        result.append({
            'flag_id': f.id,
            'loan_id': loan.id,
            'client_name': client.full_name if client else 'Unknown',
            'phone': client.phone_number if client else '',
            'current_principal': float(loan.current_principal),
            'unpaid_interest': unpaid_interest,
            'total_outstanding': float(loan.current_principal) + unpaid_interest,
            'collateral_value': collateral_value,
            'flagged_at': f.flagged_at.isoformat() + 'Z',
            'flagged_by_username': f.flagger.username if f.flagger else None,
            'valuer_notes': f.valuer_notes or '',
            'repayment_plan': loan.repayment_plan,
            'interest_rate': float(loan.interest_rate),
            'location': client.location if client and client.location else '',

        })
    return jsonify(result), 200


@recovery_bp.route('/flagged-clients/<int:loan_id>/notes', methods=['PUT'])
@jwt_required()
@role_required(['valuer', 'admin', 'director', 'hr_manager'])
def update_valuer_notes(loan_id):
    """Auto-save valuer notes for a flagged loan."""
    data = request.json
    notes = data.get('notes', '')
    flagged = FlaggedLoan.query.filter_by(loan_id=loan_id, resolved=False).first()
    if not flagged:
        return jsonify({'error': 'No unresolved flag for this loan'}), 404
    flagged.valuer_notes = notes
    db.session.commit()
    return jsonify({'success': True}), 200

@recovery_bp.route('/loan/<int:loan_id>/report-comments', methods=['GET'])
@jwt_required()
@role_required(['valuer', 'admin', 'director', 'hr_manager'])
def get_loan_report_comments(loan_id):
    """Return all report comments (daily loan report notes) for a given loan."""
    comments = ReportComment.query.filter_by(loan_id=loan_id).order_by(ReportComment.created_at.desc()).all()
    return jsonify([{
        'id': c.id,
        'comment': c.comment,
        'report_date': c.report_date.isoformat(),
        'officer_name': c.officer.username,
        'created_at': c.created_at.isoformat()
    } for c in comments]), 200