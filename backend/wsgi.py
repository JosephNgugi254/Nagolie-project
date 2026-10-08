# wsgi.py
"""
WSGI entrypoint for Nagolie backend.

IMPORTANT — order matters:
  1. Set EVENTLET_NO_GREENDNS before anything imports eventlet, so
     eventlet's greendns monkey-patch is disabled (it breaks DNS in
     some containers: "Failed to resolve 'api.cloudinary.com' /
     [Errno -3] Lookup timed out").
  2. monkey_patch() BEFORE importing the Flask app, so Flask, Socket.IO,
     requests, urllib3, ssl, threading etc. all pick up the green versions.
  3. Only then import the app.
"""

import os

# ---- 1. Disable eventlet's greendns BEFORE importing eventlet --------
os.environ.setdefault("EVENTLET_NO_GREENDNS", "yes")

# ---- 2. Patch eventlet BEFORE importing the app ----------------------
import eventlet
eventlet.monkey_patch(socket=True, select=True, ssl=True, time=True)

# ---- 3. Now it is safe to import the app -----------------------------
from app import create_app
from app.utils.extensions import socketio

app = create_app()


if __name__ == "__main__":
    # Local dev only. In production:
    #   gunicorn -k eventlet -w 1 wsgi:app
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)