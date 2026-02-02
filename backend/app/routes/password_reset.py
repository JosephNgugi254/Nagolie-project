from flask import Blueprint, request, jsonify, current_app
from datetime import datetime, timedelta
import secrets
from app import db
from app.models import User, Investor, PasswordResetToken
from decimal import Decimal
from sqlalchemy import and_

password_reset_bp = Blueprint('password_reset', __name__)

@password_reset_bp.before_request
def handle_options_request():
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'OK'})
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:5173')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS')
        return response

@password_reset_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    """Initiate password reset process for investors"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        
        if not email:
            return jsonify({
                'success': False,
                'error': 'Email is required'
            }), 400
        
        print(f"Processing password reset request for: {email}")
        
        # Find user by email
        user = User.query.filter_by(email=email).first()
        
        # Always return success for security (don't reveal if user exists)
        if not user:
            print(f"No user found with email: {email}")
            return jsonify({
                'success': True,
                'message': 'If your email is registered, you will receive a password reset link.',
                'email_exists': False
            }), 200
        
        # Check if user is an investor
        if user.role != 'investor':
            print(f"User {email} is not an investor (role: {user.role})")
            return jsonify({
                'success': True,
                'message': 'If your email is registered, you will receive a password reset link.',
                'email_exists': False
            }), 200
        
        # Check if user has investor profile
        investor = Investor.query.filter_by(user_id=user.id).first()
        if not investor:
            print(f"No investor profile found for user: {user.id}")
            return jsonify({
                'success': True,
                'message': 'If your email is registered, you will receive a password reset link.',
                'email_exists': False
            }), 200
        
        # Delete any existing valid tokens for this user
        PasswordResetToken.query.filter_by(
            user_id=user.id,
            used=False
        ).filter(
            PasswordResetToken.expires_at > datetime.utcnow()
        ).delete(synchronize_session=False)
        
        # Generate secure token
        token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(hours=24)
        
        # Create reset token
        reset_token = PasswordResetToken(
            user_id=user.id,
            token=token,
            expires_at=expires_at,
            used=False
        )
        
        db.session.add(reset_token)
        db.session.commit()
        
        print(f"Reset token created for user {user.id}: {token[:10]}...")
        
        # Get investor's current total investment
        current_investment = float(investor.current_investment) if investor.current_investment else 0.00
        
        return jsonify({
            'success': True,
            'message': 'Password reset instructions have been sent to your email.',
            'reset_token': token,
            'email_exists': True,
            'investor_name': investor.name,
            'current_investment': current_investment
        }), 200
            
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error in forgot password: {str(e)}", exc_info=True)
        # Always return success for security
        return jsonify({
            'success': True,
            'message': 'If your email is registered, you will receive a password reset link.',
            'email_exists': False
        }), 200

@password_reset_bp.route('/validate-reset-token', methods=['POST'])
def validate_reset_token():
    """Validate password reset token"""
    try:
        data = request.get_json()
        token = data.get('token', '').strip()
        
        if not token:
            return jsonify({
                'valid': False, 
                'error': 'Token is required'
            }), 400
        
        print(f"Validating token: {token[:10]}...")
        
        # Find token
        reset_token = PasswordResetToken.query.filter_by(token=token).first()
        
        if not reset_token:
            print("Token not found")
            return jsonify({
                'valid': False, 
                'error': 'Invalid or expired token'
            }), 400
        
        # Check if token is valid
        if not reset_token.is_valid():
            print(f"Token invalid: used={reset_token.used}, expired={datetime.utcnow() > reset_token.expires_at}")
            return jsonify({
                'valid': False, 
                'error': 'Token has expired or been used'
            }), 400
        
        # Get user and investor info
        user = reset_token.user
        investor = Investor.query.filter_by(user_id=user.id).first()
        
        if not investor:
            print(f"No investor profile for user {user.id}")
            return jsonify({
                'valid': False, 
                'error': 'Invalid investor account'
            }), 400
        
        current_investment = float(investor.current_investment) if investor.current_investment else 0.00
        
        print(f"Token validated for investor: {investor.name}")
        
        return jsonify({
            'valid': True,
            'investor_name': investor.name,
            'user_email': user.email,
            'current_investment': current_investment
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error validating token: {str(e)}", exc_info=True)
        return jsonify({
            'valid': False, 
            'error': 'Invalid token'
        }), 400

@password_reset_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """Reset password with token and security question"""
    try:
        data = request.get_json()
        token = data.get('token', '').strip()
        security_answer = data.get('security_answer', '').strip()
        new_password = data.get('new_password', '')
        confirm_password = data.get('confirm_password', '')
        
        print(f"Resetting password for token: {token[:10]}...")
        
        # Validate inputs
        if not token:
            return jsonify({
                'success': False,
                'error': 'Token is required'
            }), 400
        
        if not security_answer:
            return jsonify({
                'success': False,
                'error': 'Security answer is required'
            }), 400
        
        if not new_password:
            return jsonify({
                'success': False,
                'error': 'New password is required'
            }), 400
        
        if new_password != confirm_password:
            return jsonify({
                'success': False,
                'error': 'Passwords do not match'
            }), 400
        
        if len(new_password) < 6:
            return jsonify({
                'success': False,
                'error': 'Password must be at least 6 characters long'
            }), 400
        
        # Find token
        reset_token = PasswordResetToken.query.filter_by(token=token).first()
        
        if not reset_token:
            return jsonify({
                'success': False,
                'error': 'Invalid or expired token'
            }), 400
        
        # Check if token is valid
        if not reset_token.is_valid():
            return jsonify({
                'success': False,
                'error': 'Token has expired or been used'
            }), 400
        
        # Get user and investor
        user = reset_token.user
        investor = Investor.query.filter_by(user_id=user.id).first()
        
        if not investor:
            return jsonify({
                'success': False,
                'error': 'Invalid investor account'
            }), 400
        
        # Verify security answer
        try:
            # Parse the answer
            answer_value = Decimal(str(security_answer))
            expected_value = investor.current_investment
            
            # Allow some tolerance for rounding
            tolerance = Decimal('0.01')
            if abs(answer_value - expected_value) > tolerance:
                print(f"Security answer mismatch: got {answer_value}, expected {expected_value}")
                return jsonify({
                    'success': False,
                    'error': 'Incorrect security answer'
                }), 400
        except Exception as e:
            print(f"Error parsing security answer: {str(e)}")
            return jsonify({
                'success': False,
                'error': 'Invalid security answer format. Please enter a number (e.g., 100000.00)'
            }), 400
        
        # Update password
        user.set_password(new_password)
        
        # Mark token as used
        reset_token.used = True
        
        db.session.commit()
        
        print(f"Password reset successful for investor: {investor.name}")
        
        return jsonify({
            'success': True,
            'message': 'Password has been reset successfully. You can now log in with your new password.'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error resetting password: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to reset password. Please try again.'
        }), 500