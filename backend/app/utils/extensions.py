from flask_socketio import SocketIO, emit, join_room, leave_room
from flask import request
from flask_jwt_extended import decode_token
from app.models import User, PrivateMessage
from app import db
from datetime import datetime

socketio = SocketIO(cors_allowed_origins="*", async_mode='eventlet')
online_users = set()

def get_chat_room(user1_id, user2_id):
    return f"chat_{min(user1_id, user2_id)}_{max(user1_id, user2_id)}"

def get_user_from_token():
    # 1. Try Authorization header
    auth_header = request.headers.get('Authorization')
    if auth_header:
        try:
            token = auth_header.split(' ')[1]
            payload = decode_token(token)
            user_id = payload.get('sub')
            if user_id:
                return User.query.get(int(user_id))
        except:
            pass

    # 2. Fallback to query parameter (for socket.io)
    token = request.args.get('token')
    if token:
        try:
            payload = decode_token(token)
            user_id = payload.get('sub')
            if user_id:
                return User.query.get(int(user_id))
        except:
            pass

    return None

@socketio.on('connect')
def handle_connect():
    user = get_user_from_token()
    if user:
        online_users.add(user.id)
        join_room(f'user_{user.id}')
        emit('user_online', {'user_id': user.id}, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    user = get_user_from_token()
    if user:
        online_users.discard(user.id)
        leave_room(f'user_{user.id}')
        emit('user_offline', {'user_id': user.id}, broadcast=True)

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
    user = get_user_from_token()
    if not user:
        return
    recipient = User.query.get(data['recipient_id'])
    if not recipient:
        return

    recipient_online = recipient.id in online_users

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