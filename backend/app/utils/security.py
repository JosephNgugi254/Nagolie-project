from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from app.models import User
from app import db

def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            # Verify JWT is present in request
            verify_jwt_in_request()
            
            # Get user identity from JWT and convert to int
            user_id_str = get_jwt_identity()
            user_id = int(user_id_str)
            
            # Get user from database
            user = db.session.get(User, user_id)
            
            if not user:
                return jsonify({'error': 'User not found'}), 404
            
            if user.role != 'admin':
                return jsonify({'error': 'Admin access required'}), 403
            
            # If everything is fine, call the original function
            return fn(*args, **kwargs)
            
        except Exception as e:
            return jsonify({'error': f'Authentication failed: {str(e)}'}), 401
            
    return wrapper

def log_audit(action, entity_type=None, entity_id=None, details=None):
    """Helper function to log audit trail"""
    from app.models import AuditLog
    
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str) if user_id_str else None
        
        log = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
            ip_address=request.remote_addr
        )
        db.session.add(log)
        db.session.commit()
    except Exception as e:
        print(f"Audit log error: {str(e)}")
        # Don't raise the error, just log it