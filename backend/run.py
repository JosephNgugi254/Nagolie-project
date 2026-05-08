# run.py
import eventlet
eventlet.monkey_patch()   # MUST be the first line

from app import create_app
from app.extensions import socketio   # your socketio instance from extensions.py

app = create_app()

if __name__ == '__main__':
    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=True,
        allow_unsafe_werkzeug=True   # only needed for development
    )