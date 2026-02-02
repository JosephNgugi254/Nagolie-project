from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from marshmallow import ValidationError
from app import db
from app.models import User, Investor
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

# In auth.py, update the login function:
@auth_bp.route('/login', methods=['POST'])
def login():
    """User login - now handles admin, investor, and other roles"""
    schema = UserLoginSchema()
    
    try:
        data = schema.load(request.json)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400
    
    user = User.query.filter_by(username=data['username']).first()
    
    if not user or not user.check_password(data['password']):
        return jsonify({'error': 'Invalid username or password'}), 401
    
    # Check if account is active (for investors)
    if user.role == 'investor' and user.investor_profile:
        if user.investor_profile.account_status != 'active':
            return jsonify({'error': 'Your account has been deactivated. Please contact admin for support.'}), 403
    
    # Create token with string identity
    access_token = create_access_token(identity=str(user.id))
    
    # Get additional role-specific data
    user_data = user.to_dict()
    
    if user.role == 'investor' and user.investor_profile:
        user_data['investor_profile'] = user.investor_profile.to_dict()
    
    # Determine redirect based on role
    redirect_to = '/admin' if user.role == 'admin' else '/investor'
    
    return jsonify({
        'access_token': access_token,
        'user': user_data,
        'redirect_to': redirect_to
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
        
        if not data or not data.get('username') or not data.get('password'):
            return jsonify({
                'success': False,
                'error': 'Username and password required'
            }), 400
        
        # Create admin user using the proper User model method
        admin_user = User(
            username=data['username'],
            email=data.get('email', 'nagolie7@gmail.com'),
            role='admin'
        )
        admin_user.set_password(data['password'])  # FIXED: Use the model method
        
        db.session.add(admin_user)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Admin user created successfully!',
            'user': admin_user.to_dict()  # FIXED: Use the model's to_dict method
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to create admin: {str(e)}'
        }), 500

@auth_bp.route('/create-admin-now', methods=['POST'])
def create_admin_now():
    """Direct admin creation - no validation"""
    try:
        # Delete any existing admin with same username to avoid conflicts
        User.query.filter_by(username='admin').delete()
        db.session.commit()
        
        # Create new admin user
        admin_user = User(
            username='admin',
            email='nagolie7@gmail.com',
            role='admin'
        )
        admin_user.set_password('n@g0l13')
        
        db.session.add(admin_user)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Admin user created successfully!',
            'login_credentials': {
                'username': 'admin',
                'password': 'n@g0l13'
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to create admin: {str(e)}'
        }), 500
    
@auth_bp.route('/test', methods=['GET'])
def test_route():
    return jsonify({"message": "Auth routes are working!"}), 200

@auth_bp.route('/init-db', methods=['POST'])
def init_database():
    """Initialize database with all tables and create admin user"""
    try:
        # Create all tables
        db.create_all()
        
        # Check if admin already exists
        existing_admin = User.query.filter_by(role='admin').first()
        if existing_admin:
            return jsonify({
                'success': False,
                'error': 'Admin user already exists'
            }), 400
        
        # Create admin user
        admin_user = User(
            username='admin',
            email='nagolie7@gmail.com',
            role='admin'
        )
        admin_user.set_password('n@g0l13')
        
        db.session.add(admin_user)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Database initialized and admin user created successfully!',
            'credentials': {
                'username': 'admin',
                'password': 'n@g0l13'
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to initialize database: {str(e)}'
        }), 500
    
@auth_bp.route('/check-tables', methods=['GET'])
def check_tables():
    """Check if all database tables are created"""
    try:
        from sqlalchemy import inspect, text
        
        inspector = inspect(db.engine)
        tables = inspector.get_table_names()
        
        required_tables = ['users', 'clients', 'loans', 'livestock', 'transactions', 'payments', 'audit_logs']
        missing_tables = [table for table in required_tables if table not in tables]
        
        # Count records in each table - FIXED: Use text() for SQL expressions
        table_counts = {}
        for table in tables:
            if table in required_tables:
                count = db.session.execute(text(f'SELECT COUNT(*) FROM {table}')).scalar()
                table_counts[table] = count
        
        return jsonify({
            'success': True,
            'tables_exist': tables,
            'missing_tables': missing_tables,
            'table_counts': table_counts,
            'all_tables_exist': len(missing_tables) == 0
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to check tables: {str(e)}'
        }), 500
    
@auth_bp.route('/investor/register/<int:investor_id>', methods=['POST'])
def investor_register(investor_id):
    """Complete investor registration with temporary password verification"""
    try:
        data = request.json
        temporary_password = data.get('temporary_password')
        username = data.get('username')
        password = data.get('password')
        confirmPassword = data.get('confirmPassword')  # Optional but good to have
        
        if not all([temporary_password, username, password]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Validate password confirmation if provided
        if confirmPassword and password != confirmPassword:
            return jsonify({'error': 'Passwords do not match'}), 400
        
        investor = Investor.query.get(investor_id)
        if not investor:
            return jsonify({'error': 'Investor not found'}), 404
        
        # Check if account is pending
        if investor.account_status != 'pending':
            return jsonify({'error': 'Investor account is already active or inactive'}), 400
        
        # Verify temporary password from notes
        notes = investor.notes or ""
        lines = notes.split('\n')
        stored_temp_password = None
        
        for line in lines:
            line = line.strip()
            if line.startswith('Temporary Password:'):
                stored_temp_password = line.split(': ', 1)[1] if ': ' in line else None
                break
        
        # Verify temporary password
        if not stored_temp_password:
            return jsonify({'error': 'Temporary password not found. Please contact admin.'}), 400
        
        if stored_temp_password != temporary_password:
            return jsonify({'error': 'Invalid temporary password'}), 400
        
        # Check if username exists
        if User.query.filter_by(username=username).first():
            return jsonify({'error': 'Username already exists'}), 400
        
        # Check if investor already has user account
        if investor.user:
            return jsonify({'error': 'Investor already has an account'}), 400
        
        # Create user account
        user = User(
            username=username,
            email=investor.email or f"{investor.phone}@nagolie.com",
            role='investor'
        )
        user.set_password(password)
        
        # Link investor to user
        investor.user = user
        investor.account_status = 'active'
        
        # Remove temporary password from notes (keep timestamp for audit)
        new_notes = []
        for line in notes.split('\n'):
            line = line.strip()
            if not line.startswith('Temporary Password:'):
                new_notes.append(line)
        
        investor.notes = '\n'.join(new_notes).strip()
        
        db.session.add(user)
        db.session.commit()
        
        # Create login token
        access_token = create_access_token(identity=str(user.id))
        
        log_audit('investor_account_created', 'investor', investor.id, {
            'username': username
        })
        
        return jsonify({
            'success': True,
            'message': 'Investor account created successfully',
            'access_token': access_token,
            'user': user.to_dict(),
            'investor': investor.to_dict(),
            'redirect_to': '/investor'  
        }), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"Investor registration error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    
@auth_bp.route('/investor/info/<int:investor_id>', methods=['GET'])
def get_investor_info(investor_id):
    """Get investor information for registration page"""
    try:
        investor = Investor.query.get(investor_id)
        if not investor:
            return jsonify({'error': 'Investor not found'}), 404
        
        # Only return basic info (no sensitive data)
        return jsonify({
            'success': True,
            'investor': {
                'id': investor.id,
                'name': investor.name,
                'investment_amount': float(investor.current_investment),
                'phone': investor.phone,
                'email': investor.email,
                'account_status': investor.account_status,
                'invested_date': investor.invested_date.isoformat() if investor.invested_date else None
            }
        }), 200
    except Exception as e:
        print(f"Error getting investor info: {str(e)}")
        return jsonify({'error': str(e)}), 500