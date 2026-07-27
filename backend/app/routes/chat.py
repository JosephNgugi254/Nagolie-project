from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import User, Group, GroupMember, PrivateMessage
from datetime import datetime
import traceback

chat_bp = Blueprint('chat', __name__, url_prefix='/api/chat')

# ---------- Helper ----------
def check_group_membership(group_id, user_id):
    member = GroupMember.query.filter_by(group_id=group_id, user_id=user_id, is_active=True).first()
    return member is not None

# ---------- Test CORS Endpoint ----------
@chat_bp.route('/ping', methods=['GET'])
def ping():
    return jsonify({'message': 'CORS is working!'}), 200

# ---------- Create Group ----------
@chat_bp.route('/groups', methods=['POST', 'OPTIONS'])
@jwt_required()
def create_group():
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 200

    try:
        user_id = int(get_jwt_identity())
        data = request.json
        name = data.get('name', '').strip()
        participant_ids = data.get('participant_ids', [])
        profile_picture = data.get('profile_picture', None)

        if not name:
            response = jsonify({'error': 'Group name is required'})
            response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            return response, 400
        if len(participant_ids) < 1:
            response = jsonify({'error': 'At least one member required'})
            response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            return response, 400

        users = User.query.filter(User.id.in_(participant_ids)).all()
        if len(users) != len(participant_ids):
            response = jsonify({'error': 'Some users not found'})
            response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            return response, 400

        group = Group(name=name, profile_picture=profile_picture, created_by=user_id)
        db.session.add(group)
        db.session.flush()

        creator_member = GroupMember(group_id=group.id, user_id=user_id, is_admin=True, is_active=True)
        db.session.add(creator_member)

        for uid in participant_ids:
            if uid == user_id:
                continue
            member = GroupMember(group_id=group.id, user_id=uid, is_active=True)
            db.session.add(member)

        db.session.commit()
        response = jsonify(group.to_dict(include_members=True))
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 201
    except Exception as e:
        traceback.print_exc()
        response = jsonify({'error': str(e), 'trace': traceback.format_exc()})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 500

# ---------- Get groups for current user ----------
@chat_bp.route('/groups', methods=['GET', 'OPTIONS'])
@jwt_required()
def get_my_groups():
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 200

    try:
        user_id = int(get_jwt_identity())
        memberships = GroupMember.query.filter_by(user_id=user_id, is_active=True).all()
        groups = [m.group for m in memberships]
        response = jsonify([g.to_dict() for g in groups])
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 200
    except Exception as e:
        traceback.print_exc()
        response = jsonify({'error': str(e), 'trace': traceback.format_exc()})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 500

# ---------- Get group details ----------
@chat_bp.route('/groups/<int:group_id>', methods=['GET', 'OPTIONS'])
@jwt_required()
def get_group_details(group_id):
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 200

    try:
        user_id = int(get_jwt_identity())
        if not check_group_membership(group_id, user_id):
            response = jsonify({'error': 'You are not a member of this group'})
            response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            return response, 403

        group = db.session.get(Group, group_id)
        if not group:
            response = jsonify({'error': 'Group not found'})
            response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            return response, 404

        messages = PrivateMessage.query.filter_by(group_id=group_id).order_by(PrivateMessage.created_at.desc()).limit(50).all()
        messages.reverse()

        result = group.to_dict(include_members=True)
        result['messages'] = [m.to_dict() for m in messages]
        response = jsonify(result)
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 200
    except Exception as e:
        traceback.print_exc()
        response = jsonify({'error': str(e), 'trace': traceback.format_exc()})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 500

# ---------- Send message to group ----------
@chat_bp.route('/groups/<int:group_id>/messages', methods=['POST', 'OPTIONS'])
@jwt_required()
def send_group_message(group_id):
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 200

    try:
        user_id = int(get_jwt_identity())
        if not check_group_membership(group_id, user_id):
            response = jsonify({'error': 'You are not a member of this group'})
            response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            return response, 403

        data = request.json
        content = data.get('content', '').strip()
        attachment_url = data.get('attachment_url')
        attachment_type = data.get('attachment_type')
        attachment_name = data.get('attachment_name')
        reply_to_id = data.get('reply_to_id')

        if not content and not attachment_url:
            response = jsonify({'error': 'Content or attachment required'})
            response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            return response, 400

        msg = PrivateMessage(
            sender_id=user_id,
            group_id=group_id,
            content=content,
            attachment_url=attachment_url,
            attachment_type=attachment_type,
            attachment_name=attachment_name,
            status='sent',
            is_system_message=False
        )
        if reply_to_id:
            reply_to = PrivateMessage.query.get(reply_to_id)
            if reply_to and reply_to.group_id == group_id:
                msg.reply_to_id = reply_to_id

        db.session.add(msg)
        db.session.commit()
        response = jsonify(msg.to_dict())
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 201
    except Exception as e:
        traceback.print_exc()
        response = jsonify({'error': str(e), 'trace': traceback.format_exc()})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 500

# ---------- Leave group ----------
@chat_bp.route('/groups/<int:group_id>/leave', methods=['POST', 'OPTIONS'])
@jwt_required()
def leave_group(group_id):
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 200

    try:
        user_id = int(get_jwt_identity())
        member = GroupMember.query.filter_by(group_id=group_id, user_id=user_id, is_active=True).first()
        if not member:
            response = jsonify({'error': 'You are not a member of this group'})
            response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            return response, 403

        member.is_active = False

        user = db.session.get(User, user_id)
        system_msg = PrivateMessage(
            sender_id=user_id,
            group_id=group_id,
            content=f'{user.username} left',
            status='sent',
            is_system_message=True
        )
        db.session.add(system_msg)
        db.session.commit()

        response = jsonify({'success': True})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 200
    except Exception as e:
        traceback.print_exc()
        response = jsonify({'error': str(e), 'trace': traceback.format_exc()})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 500

# ---------- Edit message ----------
@chat_bp.route('/messages/<int:message_id>', methods=['PUT', 'OPTIONS'])
@jwt_required()
def edit_group_message(message_id):
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 200

    try:
        user_id = int(get_jwt_identity())
        msg = PrivateMessage.query.get_or_404(message_id)
        if msg.sender_id != user_id:
            response = jsonify({'error': 'You can only edit your own messages'})
            response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            return response, 403
        if msg.is_system_message:
            response = jsonify({'error': 'Cannot edit system messages'})
            response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            return response, 400
        data = request.json
        new_content = data.get('content', '').strip()
        if not new_content:
            response = jsonify({'error': 'Content cannot be empty'})
            response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            return response, 400
        msg.content = new_content
        msg.edited = True
        msg.updated_at = datetime.utcnow()
        db.session.commit()
        response = jsonify(msg.to_dict())
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 200
    except Exception as e:
        traceback.print_exc()
        response = jsonify({'error': str(e), 'trace': traceback.format_exc()})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 500

# ---------- Delete message ----------
@chat_bp.route('/messages/<int:message_id>', methods=['DELETE', 'OPTIONS'])
@jwt_required()
def delete_group_message(message_id):
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 200

    try:
        user_id = int(get_jwt_identity())
        msg = PrivateMessage.query.get_or_404(message_id)
        if msg.sender_id != user_id:
            response = jsonify({'error': 'You can only delete your own messages'})
            response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            return response, 403
        if msg.is_system_message:
            response = jsonify({'error': 'Cannot delete system messages'})
            response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            return response, 400
        db.session.delete(msg)
        db.session.commit()
        response = jsonify({'success': True})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 200
    except Exception as e:
        traceback.print_exc()
        response = jsonify({'error': str(e), 'trace': traceback.format_exc()})
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 500
    
@chat_bp.route('/groups/<int:group_id>/read', methods=['POST', 'OPTIONS'])
@jwt_required()
def mark_group_read(group_id):
    if request.method == 'OPTIONS':
        return '', 200

    user_id = int(get_jwt_identity())
    if not check_group_membership(group_id, user_id):
        return jsonify({'error': 'You are not a member of this group'}), 403

    messages = PrivateMessage.query.filter_by(group_id=group_id).filter(
        PrivateMessage.sender_id != user_id,
        PrivateMessage.status != 'read'
    ).all()
    for msg in messages:
        msg.status = 'read'
        msg.read = True
        msg.read_at = datetime.utcnow()

    db.session.commit()
    return jsonify({'success': True}), 200