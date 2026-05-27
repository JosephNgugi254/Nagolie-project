from flask_socketio import SocketIO, emit, join_room, leave_room
from flask import request
from flask_jwt_extended import decode_token
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode='eventlet',
    ping_interval=10,   # send a ping every 10 seconds
    ping_timeout=20     # wait 20 seconds before considering connection dead
)

user_connections = {}   # user_id -> connection count
sid_to_user = {}        # socket_id -> user_id

def get_user_from_token():
    auth_header = request.headers.get('Authorization')
    if auth_header:
        try:
            token = auth_header.split(' ')[1]
            payload = decode_token(token)
            user_id = payload.get('sub')
            if user_id:
                from app.models import User
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

    # ✅ Send already-online users to this new client
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
    from app import db                     # ← import here
    from app.models import PrivateMessage, User   # ← import here

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
    from app import db                     # ← import here
    from app.models import PrivateMessage   # ← import here

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