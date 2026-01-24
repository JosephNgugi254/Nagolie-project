from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from app.models import User
from app import db
import traceback

def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            # Verify JWT is present in request
            print("Step 1: Verifying JWT in request...")
            verify_jwt_in_request()
            print("✓ JWT verified")
            
            # Get user identity from JWT and convert to int
            print("Step 2: Getting user identity...")
            user_id_str = get_jwt_identity()
            print(f"✓ User ID from JWT: {user_id_str}")
            
            # Convert to int
            print("Step 3: Converting to int...")
            user_id = int(user_id_str)
            print(f"✓ User ID as int: {user_id}")
            
            # Get user from database
            print("Step 4: Fetching user from database...")
            user = db.session.get(User, user_id)
            print(f"✓ User found: {user.username if user else 'None'}")
            
            if not user:
                print("✗ User not found in database")
                return jsonify({'error': 'User not found'}), 404
            
            # Check role
            print(f"Step 5: Checking role... User role: {user.role}")
            if user.role != 'admin':
                print(f"✗ User role '{user.role}' is not 'admin'")
                return jsonify({'error': 'Admin access required'}), 403
            
            print("✓ All checks passed, calling function")
            # If everything is fine, call the original function
            return fn(*args, **kwargs)
            
        except ValueError as e:
            print(f"✗ ValueError: {str(e)}")
            traceback.print_exc()
            return jsonify({'error': f'Invalid user ID format: {str(e)}'}), 401
            
        except Exception as e:
            print(f"✗ Exception in admin_required: {str(e)}")
            print(f"Exception type: {type(e).__name__}")
            traceback.print_exc()
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

def investor_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            print("Step 1: Verifying JWT for investor...")
            verify_jwt_in_request()
            
            print("Step 2: Getting user identity for investor...")
            user_id_str = get_jwt_identity()
            print(f"✓ Investor user ID from JWT: {user_id_str}")
            
            user_id = int(user_id_str)
            user = db.session.get(User, int(user_id))
            
            if not user:
                print("✗ Investor user not found")
                return jsonify({'error': 'User not found'}), 404
                
            print(f"✓ Investor user found: {user.username}, role: {user.role}")
            
            if user.role != 'investor':
                print(f"✗ User role '{user.role}' is not 'investor'")
                return jsonify({'error': 'Investor access required'}), 403
                
            return fn(*args, **kwargs)
            
        except Exception as e:
            print(f"✗ Exception in investor_required: {str(e)}")
            traceback.print_exc()
            return jsonify({'error': f'Invalid authentication: {str(e)}'}), 401
            
    return wrapper