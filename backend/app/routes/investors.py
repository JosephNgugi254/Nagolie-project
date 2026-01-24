from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
from decimal import Decimal
from app import db
from app.models import Investor, InvestorReturn, Livestock, Loan, User
from app.utils.security import admin_required, investor_required, log_audit
from app.schemas.user_schema import ChangePasswordSchema, ChangeUsernameSchema
from marshmallow import ValidationError
from sqlalchemy.orm import selectinload
from sqlalchemy import func

investor_bp = Blueprint('investor', __name__)

@investor_bp.route('/dashboard', methods=['GET'])
@jwt_required()
@investor_required
def get_investor_dashboard():
    """Get investor dashboard data with NEW return calculation and security coverage"""
    try:
        user_id = get_jwt_identity()
        user = db.session.get(User, int(user_id))
        
        if not user or not user.investor_profile:
            return jsonify({'error': 'Investor profile not found'}), 404
        
        investor = user.investor_profile
        
        # Calculate total money lent out from this investor's account
        total_money_lent = db.session.query(func.sum(Loan.principal_amount)).filter(
            Loan.investor_id == investor.id,
            Loan.funding_source == 'investor',
            Loan.status.in_(['active', 'completed'])
        ).scalar() or 0
        
        # Calculate investment balance: investment_amount - total_money_lent
        investment_balance = investor.investment_amount - total_money_lent
        if investment_balance < 0:
            investment_balance = Decimal('0')
        
        # Get livestock owned by this investor
        investor_livestock = Livestock.query.filter(
            Livestock.investor_id == investor.id,
            Livestock.status == 'active'
        ).options(selectinload(Livestock.client)).all()
        
        # Calculate total livestock value for this investor
        total_livestock_value = db.session.query(func.sum(Livestock.estimated_value)).filter(
            Livestock.investor_id == investor.id,
            Livestock.status == 'active'
        ).scalar() or 0
        
        # NEW: Calculate security coverage ratio: (livestock value + investment balance) / investment amount * 100
        coverage_ratio = 0
        if investor.investment_amount > 0:
            total_coverage_value = total_livestock_value + investment_balance
            coverage_ratio = (total_coverage_value / investor.investment_amount) * 100
        
        # NEW: Calculate next return amount - 40% of investment amount
        next_return_amount = investor.investment_amount * Decimal('0.40')
        
        # Get investor's return history
        returns_history = InvestorReturn.query.filter_by(
            investor_id=investor.id
        ).order_by(InvestorReturn.return_date.desc()).limit(10).all()
        
        # Format livestock data for gallery
        livestock_data = []
        today = datetime.now().date()
        for item in investor_livestock:
            # Calculate days remaining (if applicable)
            days_remaining = 0
            
            # item.loan is a list (InstrumentedList), so we need to check if it exists and get the first one
            if hasattr(item, 'loan') and item.loan:
                # Get the first loan (there might be multiple in theory, but we use the first)
                loan_list = list(item.loan) if hasattr(item.loan, '__iter__') else [item.loan]
                
                if loan_list and loan_list[0] and loan_list[0].due_date:
                    due_date = loan_list[0].due_date
                    # Convert to date if it's a datetime
                    if isinstance(due_date, datetime):
                        due_date = due_date.date()
                    days_remaining = max(0, (due_date - today).days)
            
            # Create description
            description = item.description or f"{item.livestock_type.capitalize()} - {item.count} head available"
            
            # Create available info
            available_info = "Available"
            if days_remaining > 0:
                available_info = f"{days_remaining} days remaining"
            elif days_remaining == 0:
                available_info = "Due today"
            
            livestock_data.append({
                'id': item.id,
                'title': f"{item.livestock_type.capitalize()} - {item.count} head",
                'type': item.livestock_type,
                'count': item.count,
                'price': float(item.estimated_value) if item.estimated_value else 0,
                'description': description,
                'images': item.photos if item.photos else [],
                'availableInfo': available_info,
                'daysRemaining': days_remaining,
                'location': item.location or 'Isinya, Kajiado'
            })
        
        return jsonify({
            'investor': investor.to_dict(),
            'stats': {
                'investment_balance': float(investment_balance),
                'total_money_lent': float(total_money_lent),
                'total_returns_received': float(investor.total_returns_received),
                'total_livestock_value': float(total_livestock_value),
                'coverage_ratio': float(coverage_ratio),
                'next_return_date': investor.next_return_date.isoformat() if investor.next_return_date else None,
                'next_return_amount': float(next_return_amount),
                'next_return_percentage': '40%',
                'security_coverage_breakdown': {
                    'livestock_value': float(total_livestock_value),
                    'investment_balance': float(investment_balance),
                    'total_coverage': float(total_livestock_value + investment_balance),
                    'investment_amount': float(investor.investment_amount)
                }
            },
            'livestock': livestock_data,
            'returns_history': [r.to_dict() for r in returns_history]
        }), 200
        
    except Exception as e:
        print(f"Investor dashboard error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    
@investor_bp.route('/returns', methods=['GET'])
@jwt_required()
@investor_required
def get_investor_returns():
    """Get investor's return history"""
    try:
        user_id = get_jwt_identity()
        user = db.session.get(User, int(user_id))
        
        if not user or not user.investor_profile:
            return jsonify({'error': 'Investor profile not found'}), 404
        
        returns = InvestorReturn.query.filter_by(
            investor_id=user.investor_profile.id
        ).order_by(InvestorReturn.return_date.desc()).all()
        
        return jsonify([r.to_dict() for r in returns]), 200
        
    except Exception as e:
        print(f"Investor returns error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@investor_bp.route('/share-livestock/<int:livestock_id>', methods=['POST'])
@jwt_required()
@investor_required
def share_livestock(livestock_id):
    """Share livestock link with custom message"""
    try:
        data = request.json
        livestock = db.session.get(Livestock, livestock_id)
        
        if not livestock or livestock.status != 'active':
            return jsonify({'error': 'Livestock not found or not available'}), 404
        
        # Get custom message or use default
        message = data.get('message', f"Check out this livestock available for purchase: {livestock.livestock_type}")
        
        # Generate shareable link
        frontend_url = request.headers.get('Origin', 'http://localhost:5173')
        share_link = f"{frontend_url}/#gallery?livestock={livestock_id}"
        
        log_audit('livestock_shared', 'livestock', livestock_id, {
            'investor_id': get_jwt_identity(),
            'message': message
        })
        
        return jsonify({
            'success': True,
            'message': 'Livestock shared successfully',
            'share_link': share_link,
            'whatsapp_link': f"https://wa.me/?text={message} - {share_link}",
            'facebook_link': f"https://www.facebook.com/sharer/sharer.php?u={share_link}&quote={message}"
        }), 200
        
    except Exception as e:
        print(f"Share livestock error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@investor_bp.route('/inquire-livestock/<int:livestock_id>', methods=['POST'])
@jwt_required()
@investor_required
def inquire_livestock(livestock_id):
    """Send inquiry about livestock to CEO"""
    try:
        data = request.json
        message = data.get('message', '')
        livestock = db.session.get(Livestock, livestock_id)
        
        if not livestock:
            return jsonify({'error': 'Livestock not found'}), 404
        
        # Get investor info
        user_id = get_jwt_identity()
        user = db.session.get(User, int(user_id))
        
        if not user or not user.investor_profile:
            return jsonify({'error': 'Investor profile not found'}), 404
        
        investor = user.investor_profile
        
        # Create inquiry message
        inquiry_message = f"Inquiry from Investor {investor.name} ({investor.phone}) about livestock:\n"
        inquiry_message += f"Livestock: {livestock.livestock_type} - {livestock.count} head\n"
        inquiry_message += f"Price: KES {livestock.estimated_value:,.2f}\n"
        if message:
            inquiry_message += f"\nMessage: {message}\n"
        
        inquiry_message += f"\nLivestock Details: {livestock.description or 'Available for purchase'}\n"
        
        log_audit('livestock_inquiry', 'livestock', livestock_id, {
            'investor_id': investor.id,
            'investor_name': investor.name,
            'message': message
        })
        
        return jsonify({
            'success': True,
            'message': 'Inquiry prepared successfully',
            'sms_message': inquiry_message,
            'ceo_phone': '+254721451707'
        }), 200
        
    except Exception as e:
        print(f"Inquiry error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@investor_bp.route('/account/update-username', methods=['PUT'])
@jwt_required()
@investor_required
def update_username():
    """Update investor's username with validation"""
    try:
        schema = ChangeUsernameSchema()
        data = schema.load(request.json)

        user_id = get_jwt_identity()
        user = db.session.get(User, int(user_id))
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        new_username = data['new_username']
        current_password = data['current_password']
        
        if not user.check_password(current_password):
            return jsonify({'error': 'Current password is incorrect'}), 400
        
        existing_user = User.query.filter_by(username=new_username).first()
        if existing_user and existing_user.id != user.id:
            return jsonify({'error': 'Username already exists'}), 400
        
        old_username = user.username
        user.username = new_username
        
        db.session.commit()
        
        log_audit('username_changed', 'user', user.id, {
            'old_username': old_username,
            'new_username': new_username
        })
        
        return jsonify({
            'success': True,
            'message': 'Username updated successfully',
            'new_username': user.username
        }), 200
        
    except ValidationError as ve:
        return jsonify({'error': ve.messages}), 400
    except Exception as e:
        db.session.rollback()
        print(f"Username update error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@investor_bp.route('/account/update-password', methods=['PUT'])
@jwt_required()
@investor_required
def update_password():
    """Update investor's password with validation"""
    try:
        schema = ChangePasswordSchema()
        schema.context['new_password'] = request.json.get('new_password')
        data = schema.load(request.json)

        user_id = get_jwt_identity()
        user = db.session.get(User, int(user_id))
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        current_password = data['current_password']
        new_password = data['new_password']
        
        if not user.check_password(current_password):
            return jsonify({'error': 'Current password is incorrect'}), 400
        
        if user.check_password(new_password):
            return jsonify({'error': 'New password cannot be the same as current password'}), 400
        
        user.set_password(new_password)
        db.session.commit()
        
        log_audit('password_changed', 'user', user.id, {})
        
        return jsonify({
            'success': True,
            'message': 'Password updated successfully'
        }), 200
        
    except ValidationError as ve:
        return jsonify({'error': ve.messages}), 400
    except Exception as e:
        db.session.rollback()
        print(f"Password update error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@investor_bp.route('/account/validate-password', methods=['POST'])
@jwt_required()
@investor_required
def validate_password():
    """Validate current password without changing it"""
    try:
        user_id = get_jwt_identity()
        user = db.session.get(User, int(user_id))
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        data = request.json
        current_password = data.get('current_password')
        
        if not current_password:
            return jsonify({'error': 'Current password is required'}), 400
        
        is_valid = user.check_password(current_password)
        
        return jsonify({
            'success': True,
            'is_valid': is_valid
        }), 200
        
    except Exception as e:
        print(f"Password validation error: {str(e)}")
        return jsonify({'error': str(e)}), 500