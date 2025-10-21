from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from marshmallow import ValidationError
from app import db
from app.models import User
from app.schemas.user_schema import UserRegistrationSchema, UserLoginSchema
from app.utils.security import admin_required, log_audit

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
@jwt_required()
@admin_required
def register():
    """Register new user (admin only)"""
    schema = UserRegistrationSchema()
    
    try:
        data = schema.load(request.json)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400
    
    # Check if user already exists
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already exists'}), 400
    
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already exists'}), 400
    
    # Create new user
    user = User(
        username=data['username'],
        email=data['email'],
        role=data.get('role', 'staff')
    )
    user.set_password(data['password'])
    
    db.session.add(user)
    db.session.commit()
    
    log_audit('user_created', 'user', user.id, {'username': user.username})
    
    return jsonify({
        'message': 'User created successfully',
        'user': user.to_dict()
    }), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    """User login"""
    schema = UserLoginSchema()
    
    try:
        data = schema.load(request.json)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400
    
    user = User.query.filter_by(username=data['username']).first()
    
    if not user or not user.check_password(data['password']):
        return jsonify({'error': 'Invalid username or password'}), 401
    
    # CRITICAL FIX: Create token with string identity
    access_token = create_access_token(identity=str(user.id))
    
    return jsonify({
        'access_token': access_token,
        'user': user.to_dict()
    }), 200

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user info"""
    user_id = get_jwt_identity()
    # FIX: Convert string back to int for database query
    user = db.session.get(User, int(user_id))
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify(user.to_dict()), 200

@auth_bp.route('/setup-admin', methods=['POST'])
def setup_admin():
    """Temporary route to create first admin - REMOVE AFTER USE!"""
    try:
        # Check if any admin already exists
        existing_admin = User.query.filter_by(role='admin').first()
        if existing_admin:
            return jsonify({
                'success': False,
                'error': 'Admin user already exists. Remove this route.'
            }), 400
        
        data = request.get_json()
        
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({
                'success': False,
                'error': 'Email and password required'
            }), 400
        
        # Create admin user
        admin_user = User(
            email=data['email'],
            password_hash=generate_password_hash(data['password']),
            first_name=data.get('first_name', 'Admin'),
            last_name=data.get('last_name', 'User'),
            role='admin',
            is_active=True
        )
        
        db.session.add(admin_user)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Admin user created successfully!',
            'email': admin_user.email
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to create admin: {str(e)}'
        }), 500
    

@auth_bp.route("/run-migrations", methods=["GET"])
def run_migrations():
    from flask_migrate import upgrade
    try:
        upgrade()
        return jsonify({"message": "Migrations applied successfully!"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500