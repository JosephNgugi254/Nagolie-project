from flask_socketio import SocketIO, emit, join_room, leave_room
from flask import request
from flask_jwt_extended import decode_token
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

# DB instance – imported by models.py
db = SQLAlchemy()

socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode='eventlet',
    ping_interval=10,
    ping_timeout=20
)

user_connections = {}   # user_id -> connection count
sid_to_user = {}        # socket_id -> user_id


# ---------- Helpers ----------
def get_group_room(group_id):
    return f"group_{group_id}"


def get_user_from_token():
    auth_header = request.headers.get('Authorization')
    if auth_header:
        try:
            token = auth_header.split(' ')[1]
            payload = decode_token(token)
            user_id = payload.get('sub')
            if user_id:
                from app.models import User   # local import
                return User.query.get(int(user_id))
        except:
            pass
    token = request.args.get('token')
    if token:
        try:
            payload = decode_token(token)
            user_id = payload.get('sub')
            if user_id:
                from app.models import User
                return User.query.get(int(user_id))
        except:
            pass
    return None


# ---------- Socket events ----------
@socketio.on('connect')
def handle_connect():
    user = get_user_from_token()
    if not user:
        return False

    sid = request.sid
    sid_to_user[sid] = user.id
    user_connections[user.id] = user_connections.get(user.id, 0) + 1

    if user_connections[user.id] == 1:
        join_room(f'user_{user.id}')
        emit('user_online', {'user_id': user.id}, broadcast=True)

    online_ids = [uid for uid in user_connections.keys() if uid != user.id]
    emit('online_users_list', {'user_ids': online_ids}, room=sid)


@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    user_id = sid_to_user.pop(sid, None)
    if not user_id or user_id not in user_connections:
        return

    user_connections[user_id] -= 1
    if user_connections[user_id] == 0:
        del user_connections[user_id]
        leave_room(f'user_{user_id}')
        emit('user_offline', {'user_id': user_id}, broadcast=True)


def get_chat_room(user1_id, user2_id):
    return f"chat_{min(user1_id, user2_id)}_{max(user1_id, user2_id)}"


@socketio.on('join_chat')
def handle_join_chat(data):
    user = get_user_from_token()
    if not user:
        return
    other_user_id = data['other_user_id']
    room = get_chat_room(user.id, other_user_id)
    join_room(room)


@socketio.on('send_message')
def handle_send_message(data):
    from app import db                     # local import
    from app.models import PrivateMessage, User   # local import

    user = get_user_from_token()
    if not user:
        return
    recipient = User.query.get(data['recipient_id'])
    if not recipient:
        return

    recipient_online = recipient.id in user_connections

    msg = PrivateMessage(
        sender_id=user.id,
        recipient_id=recipient.id,
        content=data['content'],
        attachment_url=data.get('attachment_url'),
        attachment_type=data.get('attachment_type'),
        attachment_name=data.get('attachment_name'),
        reply_to_id=data.get('reply_to_id'),  
        status='delivered' if recipient_online else 'sent'
    )
    if recipient_online:
        msg.delivered_at = datetime.utcnow()

    db.session.add(msg)
    db.session.commit()

    room = get_chat_room(user.id, recipient.id)
    socketio.emit('new_message', {
        'message': msg.to_dict(),
        'status': msg.status
    }, room=room)

    emit('message_sent', {
        'message_id': msg.id,
        'status': msg.status
    })


@socketio.on('mark_read')
def handle_mark_read(data):
    from app import db
    from app.models import PrivateMessage

    user = get_user_from_token()
    if not user:
        return
    message_ids = data.get('message_ids', [])
    for msg_id in message_ids:
        msg = PrivateMessage.query.get(msg_id)
        if msg and msg.recipient_id == user.id and msg.status != 'read':
            msg.status = 'read'
            msg.read = True
            msg.read_at = datetime.utcnow()
            db.session.commit()
            room = get_chat_room(msg.sender_id, msg.recipient_id)
            socketio.emit('message_status_update', {
                'message_id': msg.id,
                'status': 'read'
            }, room=room)


# ---------- Call events ----------
@socketio.on('call_offer')
def handle_call_offer(data):
    user = get_user_from_token()
    if not user:
        return
    target_user_id = data['target_user_id']
    room = f'user_{target_user_id}'
    emit('call_offer', {
        'caller_id': user.id,
        'caller_name': user.username,
        'caller_avatar': user.profile_picture,
        'call_type': data['call_type'],
        'offer': data['offer'],
        'call_id': data.get('call_id'),
        'is_group': data.get('is_group', False),
        'participants': data.get('participants', [user.id]),
        'is_mesh': data.get('is_mesh', False), 
    }, room=room)


@socketio.on('call_answer')
def handle_call_answer(data):
    user = get_user_from_token()
    if not user:
        return
    target_user_id = data['target_user_id']
    room = f'user_{target_user_id}'
    emit('call_answer', {
        'answerer_id': user.id,
        'answer': data['answer'],
        'call_id': data['call_id']
    }, room=room)


@socketio.on('call_ice')
def handle_call_ice(data):
    user = get_user_from_token()
    if not user:
        return
    target_user_id = data['target_user_id']
    room = f'user_{target_user_id}'
    emit('call_ice', {
        'sender_id': user.id,
        'candidate': data['candidate'],
        'call_id': data['call_id']
    }, room=room)


@socketio.on('call_end')
def handle_call_end(data):
    user = get_user_from_token()
    if not user:
        return
    call_id = data['call_id']
    participants = data.get('participants', [])
    for p in participants:
        room = f'user_{p}'
        emit('call_ended', {
            'call_id': call_id,
            'ended_by': user.id,
            'duration': data.get('duration', 0)
        }, room=room)


@socketio.on('call_status')
def handle_call_status(data):
    user = get_user_from_token()
    if not user:
        return
    target_user_id = data['target_user_id']
    room = f'user_{target_user_id}'
    emit('call_status', {
        'status': data['status'],
        'call_id': data['call_id'],
        'from': user.id
    }, room=room)


@socketio.on('call_add_participant')
def handle_add_participant(data):
    user = get_user_from_token()
    if not user:
        return
    new_user_id = data['new_user_id']
    call_id = data['call_id']
    existing_participants = data['existing_participants']

    # 1) Invite the new person
    emit('call_invite', {
        'call_id': call_id,
        'inviter_id': user.id,
        'inviter_name': user.username,
        'inviter_avatar': user.profile_picture,
        'call_type': data['call_type'],
        'existing_participants': existing_participants + [new_user_id],
        'offer': data['offer'],
    }, room=f'user_{new_user_id}')

    # 2) Tell every OTHER existing participant to also connect to the new person
    for pid in existing_participants:
        if pid in (user.id, new_user_id):
            continue
        emit('call_mesh_join', {
            'call_id': call_id,
            'new_user_id': new_user_id,
            'call_type': data['call_type'],
        }, room=f'user_{pid}')

@socketio.on('call_leave')
def handle_call_leave(data):
    user = get_user_from_token()
    if not user:
        return
    target = data.get('target_user_id')
    if not target:
        return
    emit('call_peer_left', {
        'call_id': data['call_id'],
        'user_id': user.id,
    }, room=f'user_{target}')

# ---------- Group chat events ----------
@socketio.on('join_group')
def handle_join_group(data):
    from app.models import GroupMember   # local import
    user = get_user_from_token()
    if not user:
        return
    group_id = data['group_id']
    member = GroupMember.query.filter_by(group_id=group_id, user_id=user.id, is_active=True).first()
    if not member:
        return
    room = get_group_room(group_id)
    join_room(room)


@socketio.on('send_group_message')
def handle_send_group_message(data):
    from app import db
    from app.models import GroupMember, PrivateMessage

    user = get_user_from_token()
    if not user:
        return
    group_id = data['group_id']
    member = GroupMember.query.filter_by(group_id=group_id, user_id=user.id, is_active=True).first()
    if not member:
        return

    msg = PrivateMessage(
        sender_id=user.id,
        group_id=group_id,
        content=data['content'],
        attachment_url=data.get('attachment_url'),
        attachment_type=data.get('attachment_type'),
        attachment_name=data.get('attachment_name'),
        reply_to_id=data.get('reply_to_id'),  
        status='sent',
        is_system_message=False
    )
    db.session.add(msg)
    db.session.commit()

    room = get_group_room(group_id)
    socketio.emit('new_group_message', {
        'message': msg.to_dict(),
        'sender': user.username
    }, room=room)

    emit('group_message_sent', {
        'message_id': msg.id,
        'temp_id': data.get('temp_id')
    })