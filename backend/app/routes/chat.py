# app/routes/chat.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import User, Group, GroupMember, PrivateMessage, GroupReadStatus
from datetime import datetime
import traceback
from app import socketio

chat_bp = Blueprint('chat', __name__, url_prefix='/api/chat')


# ---------- Helper ----------
def check_group_membership(group_id, user_id):
    return GroupMember.query.filter_by(
        group_id=group_id, user_id=user_id, is_active=True
    ).first() is not None


# ---------- Ping ----------
@chat_bp.route('/ping', methods=['GET'])
def ping():
    return jsonify({'message': 'CORS is working!'}), 200


# ---------- Create Group ----------
@chat_bp.route('/groups', methods=['POST'])
@jwt_required()
def create_group():
    try:
        user_id = int(get_jwt_identity())
        data = request.json or {}
        name = data.get('name', '').strip()
        participant_ids = data.get('participant_ids', [])
        profile_picture = data.get('profile_picture', None)

        if not name:
            return jsonify({'error': 'Group name is required'}), 400
        if len(participant_ids) < 1:
            return jsonify({'error': 'At least one member required'}), 400

        users = User.query.filter(User.id.in_(participant_ids)).all()
        if len(users) != len(participant_ids):
            return jsonify({'error': 'Some users not found'}), 400

        group = Group(name=name, profile_picture=profile_picture, created_by=user_id)
        db.session.add(group)
        db.session.flush()

        # Creator becomes admin
        db.session.add(GroupMember(
            group_id=group.id, user_id=user_id, is_admin=True, is_active=True
        ))

        for uid in participant_ids:
            if uid == user_id:
                continue
            db.session.add(GroupMember(
                group_id=group.id, user_id=uid, is_active=True
            ))

        db.session.commit()
        return jsonify(group.to_dict(include_members=True)), 201
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------- Delete Group ----------
@chat_bp.route('/groups/<int:group_id>', methods=['DELETE'])
@jwt_required()
def delete_group(group_id):
    try:
        user_id = int(get_jwt_identity())
        group = db.session.get(Group, group_id)
        if not group:
            return jsonify({'error': 'Group not found'}), 404
        if group.created_by != user_id:
            return jsonify({'error': 'Only the group admin can delete the group'}), 403

        # Tell everyone in the room BEFORE we delete the rows
        socketio.emit('group_deleted', {'group_id': group_id}, room=f'group_{group_id}')

        PrivateMessage.query.filter_by(group_id=group_id).delete()
        GroupMember.query.filter_by(group_id=group_id).delete()
        GroupReadStatus.query.filter_by(group_id=group_id).delete()

        db.session.delete(group)
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------- List my groups ----------
@chat_bp.route('/groups', methods=['GET'])
@jwt_required()
def get_my_groups():
    try:
        user_id = int(get_jwt_identity())
        memberships = GroupMember.query.filter_by(user_id=user_id, is_active=True).all()
        groups = [m.group for m in memberships]
        return jsonify([g.to_dict() for g in groups]), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------- Group details (members + recent messages) ----------
@chat_bp.route('/groups/<int:group_id>', methods=['GET'])
@jwt_required()
def get_group_details(group_id):
    try:
        user_id = int(get_jwt_identity())
        if not check_group_membership(group_id, user_id):
            return jsonify({'error': 'You are not a member of this group'}), 403

        group = db.session.get(Group, group_id)
        if not group:
            return jsonify({'error': 'Group not found'}), 404

        messages = (
            PrivateMessage.query
            .filter_by(group_id=group_id)
            .order_by(PrivateMessage.created_at.desc())
            .limit(50)
            .all()
        )
        messages.reverse()

        result = group.to_dict(include_members=True)
        result['messages'] = [m.to_dict() for m in messages]
        return jsonify(result), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------- Send group message (HTTP fallback) ----------
@chat_bp.route('/groups/<int:group_id>/messages', methods=['POST'])
@jwt_required()
def send_group_message(group_id):
    try:
        user_id = int(get_jwt_identity())
        if not check_group_membership(group_id, user_id):
            return jsonify({'error': 'You are not a member of this group'}), 403

        data = request.json or {}
        content = data.get('content', '').strip()
        attachment_url  = data.get('attachment_url')
        attachment_type = data.get('attachment_type')
        attachment_name = data.get('attachment_name')
        reply_to_id     = data.get('reply_to_id')

        if not content and not attachment_url:
            return jsonify({'error': 'Content or attachment required'}), 400

        msg = PrivateMessage(
            sender_id=user_id,
            group_id=group_id,
            content=content,
            attachment_url=attachment_url,
            attachment_type=attachment_type,
            attachment_name=attachment_name,
            status='sent',
            is_system_message=False,
        )

        # Validate the reply target actually lives in this group
        if reply_to_id:
            replied = db.session.get(PrivateMessage, reply_to_id)
            if replied and replied.group_id == group_id:
                msg.reply_to_id = reply_to_id

        db.session.add(msg)
        db.session.commit()

        # Push over socket so other members get it in real time
        try:
            socketio.emit(
                'new_group_message',
                {'message': msg.to_dict(), 'sender': msg.sender.username if msg.sender else None},
                room=f'group_{group_id}',
            )
        except Exception:
            pass

        return jsonify(msg.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------- Leave group ----------
@chat_bp.route('/groups/<int:group_id>/leave', methods=['POST'])
@jwt_required()
def leave_group(group_id):
    try:
        user_id = int(get_jwt_identity())
        member = GroupMember.query.filter_by(
            group_id=group_id, user_id=user_id, is_active=True
        ).first()
        if not member:
            return jsonify({'error': 'You are not a member of this group'}), 403

        member.is_active = False

        user = db.session.get(User, user_id)
        system_msg = PrivateMessage(
            sender_id=user_id,
            group_id=group_id,
            content=f'{user.username} left',
            status='sent',
            is_system_message=True,
        )
        db.session.add(system_msg)
        db.session.commit()

        socketio.emit(
            'new_group_message',
            {'message': system_msg.to_dict()},
            room=f'group_{group_id}',
        )
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------- Edit message (group) ----------
@chat_bp.route('/messages/<int:message_id>', methods=['PUT'])
@jwt_required()
def edit_group_message(message_id):
    try:
        user_id = int(get_jwt_identity())
        msg = PrivateMessage.query.get_or_404(message_id)

        if msg.sender_id != user_id:
            return jsonify({'error': 'You can only edit your own messages'}), 403
        if msg.is_system_message:
            return jsonify({'error': 'Cannot edit system messages'}), 400

        data = request.json or {}
        new_content = data.get('content', '').strip()
        if not new_content:
            return jsonify({'error': 'Content cannot be empty'}), 400

        msg.content = new_content
        msg.edited = True
        msg.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify(msg.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------- Delete message ----------
@chat_bp.route('/messages/<int:message_id>', methods=['DELETE'])
@jwt_required()
def delete_group_message(message_id):
    try:
        user_id = int(get_jwt_identity())
        msg = PrivateMessage.query.get_or_404(message_id)

        if msg.sender_id != user_id:
            return jsonify({'error': 'You can only delete your own messages'}), 403
        if msg.is_system_message:
            return jsonify({'error': 'Cannot delete system messages'}), 400

        db.session.delete(msg)
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------- Mark group read ----------
@chat_bp.route('/groups/<int:group_id>/read', methods=['POST'])
@jwt_required()
def mark_group_read(group_id):
    user_id = int(get_jwt_identity())
    if not check_group_membership(group_id, user_id):
        return jsonify({'error': 'You are not a member of this group'}), 403

    now = datetime.utcnow()

    # Message-level read flag
    messages = PrivateMessage.query.filter_by(group_id=group_id).filter(
        PrivateMessage.sender_id != user_id,
        PrivateMessage.status != 'read',
    ).all()
    for m in messages:
        m.status = 'read'
        m.read = True
        m.read_at = now

    # Per-user cursor for unread-count endpoint
    read_status = GroupReadStatus.query.filter_by(
        user_id=user_id, group_id=group_id
    ).first()
    if not read_status:
        read_status = GroupReadStatus(user_id=user_id, group_id=group_id)
        db.session.add(read_status)
    read_status.last_read_at = now

    db.session.commit()
    return jsonify({'success': True}), 200


# ---------- Group unread counts ----------
@chat_bp.route('/groups/unread-counts', methods=['GET'])
@jwt_required()
def get_group_unread_counts():
    user_id = int(get_jwt_identity())
    memberships = GroupMember.query.filter_by(user_id=user_id, is_active=True).all()
    result = {}
    for m in memberships:
        read_status = GroupReadStatus.query.filter_by(
            user_id=user_id, group_id=m.group_id
        ).first()
        last_read = read_status.last_read_at if read_status else datetime.min
        count = PrivateMessage.query.filter(
            PrivateMessage.group_id == m.group_id,
            PrivateMessage.sender_id != user_id,
            PrivateMessage.created_at > last_read,
        ).count()
        result[m.group_id] = count
    return jsonify(result), 200


# ---------- Add member to group ----------
@chat_bp.route('/groups/<int:group_id>/members', methods=['POST'])
@jwt_required()
def add_group_member(group_id):
    user_id = int(get_jwt_identity())
    group = Group.query.get_or_404(group_id)
    if group.created_by != user_id:
        return jsonify({'error': 'Only the group admin can add members'}), 403

    new_user_id = (request.json or {}).get('user_id')
    if not new_user_id:
        return jsonify({'error': 'user_id required'}), 400

    existing = GroupMember.query.filter_by(
        group_id=group_id, user_id=new_user_id
    ).first()
    if existing:
        if existing.is_active:
            return jsonify({'error': 'User already in group'}), 400
        existing.is_active = True
        existing.joined_at = datetime.utcnow()
    else:
        db.session.add(GroupMember(group_id=group_id, user_id=new_user_id))

    new_user = User.query.get(new_user_id)
    sys_msg = PrivateMessage(
        sender_id=user_id,
        group_id=group_id,
        content=f"{new_user.username} was added to the group",
        is_system_message=True,
        status='sent',
    )
    db.session.add(sys_msg)
    db.session.commit()

    socketio.emit(
        'new_group_message',
        {'message': sys_msg.to_dict()},
        room=f'group_{group_id}',
    )
    return jsonify({'success': True}), 201