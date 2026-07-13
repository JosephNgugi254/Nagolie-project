from flask import Blueprint, request, jsonify, send_file, url_for
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import CompanyDocument, MessageAttachment, User
from app.utils.decorators import role_required
from app.utils.cloudinary_upload import upload_base64_image, delete_image
import cloudinary.uploader
from datetime import datetime
import io

company_profile_bp = Blueprint('company_profile', __name__)

# ─── LIST all documents (filter by category) ───
@company_profile_bp.route('/documents', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director'])
def list_documents():
    category = request.args.get('category')
    query = CompanyDocument.query
    if category:
        query = query.filter_by(category=category)
    docs = query.order_by(CompanyDocument.created_at.desc()).all()
    return jsonify([d.to_dict() for d in docs]), 200

# ─── UPLOAD a document ───
# ─── UPLOAD a document ───
@company_profile_bp.route('/documents', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director'])
def upload_document():
    try:
        data = request.form
        name = data.get('name', '').strip()
        category = data.get('category', '').strip()
        description = data.get('description', '').strip()
        if not name or not category:
            return jsonify({'error': 'Name and category are required'}), 400

        file = request.files.get('file')
        if not file:
            return jsonify({'error': 'No file provided'}), 400

        user_id = int(get_jwt_identity())
        attachment_id = None
        public_id = None
        file_url = None
        file_type = None

        # Determine if it's an image
        if file.mimetype and file.mimetype.startswith('image/'):
            # Upload to Cloudinary – keep full HTTPS URL
            upload_result = cloudinary.uploader.upload(
                file,
                folder='company_documents',
                resource_type='image'
            )
            file_url = upload_result.get('secure_url')
            public_id = upload_result.get('public_id')
            file_type = 'image'
        else:
            # Store in database (MessageAttachment)
            attachment = MessageAttachment(
                filename=file.filename,
                mime_type=file.mimetype or 'application/octet-stream',
                file_data=file.read()
            )
            db.session.add(attachment)
            db.session.flush()  # get attachment.id
            attachment_id = attachment.id
            # ✅ STORE RELATIVE PATH (without /api prefix)
            file_url = f"/company-profile/attachment/{attachment_id}"
            file_type = 'file'

        doc = CompanyDocument(
            name=name,
            category=category,
            description=description or '',
            file_url=file_url,
            file_type=file_type,
            public_id=public_id,
            attachment_id=attachment_id,
            uploaded_by=user_id
        )
        db.session.add(doc)
        db.session.commit()

        return jsonify({'success': True, 'document': doc.to_dict()}), 201

    except Exception as e:
        db.session.rollback()
        print(f"Upload error: {e}")
        return jsonify({'error': str(e)}), 500
    
# ─── DELETE a document ───
@company_profile_bp.route('/documents/<int:doc_id>', methods=['DELETE'])
@jwt_required()
@role_required(['admin', 'director'])
def delete_document(doc_id):
    doc = CompanyDocument.query.get_or_404(doc_id)
    # Delete from Cloudinary if image
    if doc.public_id:
        try:
            cloudinary.uploader.destroy(doc.public_id)
        except:
            pass
    # Delete attachment if stored in DB
    if doc.attachment_id:
        att = MessageAttachment.query.get(doc.attachment_id)
        if att:
            db.session.delete(att)
    db.session.delete(doc)
    db.session.commit()
    return jsonify({'success': True}), 200

# ─── SERVE attachment (for DB‑stored files) ───
@company_profile_bp.route('/attachment/<int:attachment_id>', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director'])
def get_attachment(attachment_id):
    att = MessageAttachment.query.get_or_404(attachment_id)
    return send_file(
        io.BytesIO(att.file_data),
        mimetype=att.mime_type,
        as_attachment=True,
        download_name=att.filename
    )