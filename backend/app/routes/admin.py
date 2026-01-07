from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
from decimal import Decimal
from app import db
from app.models import Client, Loan, Livestock, Transaction, User
from app.utils.security import admin_required, log_audit
from sqlalchemy.orm import selectinload
from sqlalchemy import and_, or_
from app.routes.payments import recalculate_loan

admin_bp = Blueprint('admin', __name__)

@admin_bp.before_request
def handle_options_request():
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'OK'})
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:5173')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
        return response

@admin_bp.route('/test', methods=['GET', 'OPTIONS'])
@jwt_required()
def test_endpoint():
    """Test endpoint to verify API is working"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = db.session.get(User, user_id)
        
        return jsonify({
            'success': True,
            'message': 'Admin API is working',
            'user': user.to_dict() if user else None,
            'timestamp': datetime.utcnow().isoformat()
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 500

@admin_bp.route('/applications', methods=['GET', 'OPTIONS'])
@jwt_required()
@admin_required
def get_applications():
    """Get all loan applications (pending loans) - ADMIN ONLY"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        applications = Loan.query.filter_by(status='pending').order_by(Loan.created_at.desc()).all()
        
        applications_data = []
        for app in applications:
            client_name = app.client.full_name if app.client else 'Unknown'
            phone_number = app.client.phone_number if app.client else 'N/A'
            id_number = app.client.id_number if app.client else 'N/A'
            
            location = 'N/A'
            if app.client and app.client.location:
                location = app.client.location
            elif app.livestock and app.livestock.location:
                location = app.livestock.location
            
            livestock_type = 'N/A'
            livestock_count = 0
            estimated_value = 0
            photos = []
            
            if app.livestock:
                livestock_type = app.livestock.livestock_type or 'N/A'
                livestock_count = app.livestock.count or 0
                estimated_value = float(app.livestock.estimated_value) if app.livestock.estimated_value else 0
                photos = app.livestock.photos if app.livestock.photos else []
            
            additional_info = "None"
            if app.notes:
                additional_info = app.notes
            elif app.notes == "":
                additional_info = "None provided"
            
            applications_data.append({
                'id': app.id,
                'date': app.created_at.isoformat() if app.created_at else None,
                'name': client_name,
                'phone': phone_number,
                'idNumber': id_number,
                'loanAmount': float(app.principal_amount),
                'livestock': livestock_type,
                'livestockType': livestock_type,
                'livestockCount': livestock_count,
                'estimatedValue': estimated_value,
                'location': location,
                'additionalInfo': additional_info,
                'photos': photos,
                'status': app.status
            })
        
        return jsonify(applications_data), 200
    except Exception as e:
        print(f"Error fetching applications: {str(e)}")
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/applications/<int:loan_id>/approve', methods=['POST', 'OPTIONS'])
@jwt_required()
@admin_required
def approve_application(loan_id):
    """Approve a loan application - ADMIN ONLY"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan application not found'}), 404
        
        if loan.status != 'pending':
            return jsonify({'error': 'Loan application already processed'}), 400
        
        loan.interest_rate = Decimal('30.0')
        interest_amount = loan.principal_amount * (loan.interest_rate / 100)
        loan.total_amount = loan.principal_amount + interest_amount
        loan.balance = loan.total_amount
        
        loan.current_principal = loan.principal_amount
        loan.principal_paid = Decimal('0')
        loan.interest_paid = Decimal('0')
        
        loan.status = 'active'
        loan.disbursement_date = datetime.utcnow()
        loan.due_date = datetime.utcnow() + timedelta(days=7)
        
        transaction = Transaction(
            loan_id=loan.id,
            transaction_type='disbursement',
            amount=loan.principal_amount,
            payment_method='cash',
            notes='Loan approved and disbursed',
            status='completed',
            created_at=datetime.utcnow()
        )
        
        db.session.add(transaction)
        db.session.commit()
        
        log_audit('loan_approved', 'loan', loan.id, {
            'client': loan.client.full_name if loan.client else 'Unknown',
            'amount': float(loan.principal_amount),
            'interest_rate': float(loan.interest_rate),
            'total_amount': float(loan.total_amount)
        })
        
        return jsonify({
            'success': True,
            'message': 'Loan approved successfully',
            'loan': loan.to_dict(),
            'transaction': transaction.to_dict()
        }), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error approving application: {str(e)}")
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/applications/<int:loan_id>/reject', methods=['POST', 'OPTIONS'])
@jwt_required()
@admin_required
def reject_application(loan_id):
    """Reject a loan application - ADMIN ONLY"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan application not found'}), 404
        
        if loan.status != 'pending':
            return jsonify({'error': 'Loan application already processed'}), 400
        
        # Update loan status
        loan.status = 'rejected'
        
        # If there's associated livestock, mark it as inactive
        if loan.livestock:
            loan.livestock.status = 'inactive'
        
        db.session.commit()
        
        log_audit('loan_rejected', 'loan', loan.id, {
            'client': loan.client.full_name if loan.client else 'Unknown',
            'amount': float(loan.principal_amount)
        })
        
        return jsonify({
            'success': True,
            'message': 'Loan application rejected'
        }), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error rejecting application: {str(e)}")
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/livestock', methods=['GET', 'OPTIONS'])
@jwt_required()
@admin_required
def get_all_livestock():
    """Get all livestock for gallery - ADMIN ONLY - OPTIMIZED"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
    
    try:
        # Use selectinload with the correct singular 'loan' backref
        livestock = Livestock.query.options(
            selectinload(Livestock.client),
            selectinload(Livestock.loan)  # Changed from 'loans' to 'loan' (singular)
        ).filter_by(status='active').all()
        
        livestock_data = []
        today = datetime.now().date()
        
        for item in livestock:
            location_field = item.location or ''
            
            # Parse location field for description and location
            if '|' in location_field:
                parts = location_field.split('|', 1)
                if len(parts) == 2:
                    description = parts[0].strip()
                    actual_location = parts[1].strip() or 'Isinya, Kajiado'
                else:
                    description = location_field.strip()
                    actual_location = 'Isinya, Kajiado'
            else:
                # Check if it's a description or location
                if any(word in location_field.lower() for word in ['cow', 'goat', 'sheep', 'chicken', 'bull', 'calf', 'healthy', 'good', 'excellent']):
                    description = location_field.strip()
                    actual_location = 'Isinya, Kajiado'
                else:
                    description = 'Available for purchase'
                    actual_location = location_field.strip() or 'Isinya, Kajiado'
            
            # Admin-added livestock
            if item.client_id is None:
                available_info = 'Available now'
                livestock_type = item.livestock_type or 'Unknown'
                days_remaining = 0
                is_admin_added = True
            else:
                # Client livestock - Check if there's an active loan
                client_loan = None
                
                # Since the relationship is one-to-one via backref, check if loan exists
                if hasattr(item, 'loan') and item.loan:
                    # item.loan is a single Loan object (or list of Loan objects)
                    # Check if it's a list or single object
                    if isinstance(item.loan, list):
                        # If it's a list, filter for active loans
                        active_loans = [loan for loan in item.loan if loan.status == 'active']
                        client_loan = active_loans[0] if active_loans else None
                    elif hasattr(item.loan, 'status') and item.loan.status == 'active':
                        # If it's a single object and active
                        client_loan = item.loan
                
                # Fallback: query directly if backref didn't load properly
                if not client_loan:
                    client_loan = Loan.query.filter_by(
                        livestock_id=item.id,
                        status='active'
                    ).first()
                
                # If still no active loan, skip this livestock
                if not client_loan:
                    continue
                
                client_name = item.client.full_name if item.client else 'Unknown'
                description = f"Collateral for {client_name}'s loan"
                livestock_type = item.livestock_type or 'Unknown'
                is_admin_added = False
                
                # Calculate days remaining
                if client_loan.due_date:
                    due_date = client_loan.due_date
                    if isinstance(due_date, str):
                        due_date = datetime.strptime(due_date, '%Y-%m-%d').date()
                    elif hasattr(due_date, 'date'):
                        due_date = due_date.date()
                    
                    days_remaining = (due_date - today).days
                    
                    if days_remaining > 0:
                        available_info = f'Available in {days_remaining} days'
                    elif days_remaining == 0:
                        available_info = 'Available now'
                    else:
                        available_info = 'Available (overdue)'
                        days_remaining = 0
                else:
                    available_info = 'Available after loan repayment'
                    days_remaining = 7
            
            livestock_data.append({
                'id': item.id,
                'title': f"{livestock_type.capitalize()} - {item.count} head",
                'type': livestock_type,
                'count': item.count,
                'price': float(item.estimated_value) if item.estimated_value else 0,
                'description': description,
                'images': item.photos if item.photos else [],
                'availableInfo': available_info,
                'daysRemaining': days_remaining,
                'location': actual_location,  # Add location field
                'status': item.status,
                'isAdminAdded': is_admin_added
            })
        
        return jsonify(livestock_data), 200
        
    except Exception as e:
        print(f"Livestock error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/livestock/gallery', methods=['GET', 'OPTIONS'])
def get_public_livestock_gallery():
    """Get paginated livestock gallery for public view - FIXED DESCRIPTION & LOCATION"""
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'OK'})
        origin = request.headers.get('Origin')
        allowed_origins = [
            'http://localhost:5173',
            'https://www.nagolie.com',
            'https://nagolie.com'
        ]
        
        if origin in allowed_origins:
            response.headers.add('Access-Control-Allow-Origin', origin)
        else:
            response.headers.add('Access-Control-Allow-Origin', '*')
        
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept')
        response.headers.add('Access-Control-Allow-Methods', 'GET,OPTIONS')
        return response
    
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 12, type=int)
        
        livestock = Livestock.query.filter(Livestock.status == 'active').all()
        
        livestock_data = []
        today = datetime.now().date()
        
        for item in livestock:
            location_field = (item.location or '').strip()
            
            # DEFAULTS (will be overridden if better data exists)
            description = 'Available for purchase'
            actual_location = 'Isinya, Kajiado'
            
            # CASE 1: Old bad data with "claimed from" — clean it
            if 'claimed from' in location_field.lower():
                description = 'Available for purchase'
                actual_location = 'Isinya, Kajiado'
            
            # CASE 2: Proper format "description|location" — USE IT FULLY
            elif '|' in location_field:
                parts = location_field.split('|', 1)  # Split only on first pipe
                if len(parts) == 2:
                    desc_part = parts[0].strip()
                    loc_part = parts[1].strip()
                    
                    # Only use custom description if it's meaningful (not empty or generic fallback)
                    if desc_part and desc_part.lower() not in ['', 'available for purchase', 'livestock for purchase']:
                        description = desc_part
                    actual_location = loc_part or 'Isinya, Kajiado'
                else:
                    # Malformed: has pipe but no second part → treat as location
                    actual_location = location_field.strip() or 'Isinya, Kajiado'
            
            # CASE 3: No pipe at all
            else:
                # If the entire field looks like a real location (e.g. "Kitengela"), use it
                if location_field:
                    # Simple heuristic: if it contains common location words or format
                    if any(keyword in location_field.lower() for keyword in ['kajiado', 'isinya', 'kitengela', 'ngong', 'town', 'county']):
                        actual_location = location_field
                    else:
                        # Otherwise, assume it was meant to be a description
                        if location_field.lower() not in ['available for purchase', 'livestock for purchase']:
                            description = location_field
                        actual_location = 'Isinya, Kajiado'
                # else: empty → keep defaults
            
            # Availability logic
            if item.client_id is None:
                # Admin-added or claimed → available now
                available_info = 'Available now'
                days_remaining = 0
            else:
                associated_loan = Loan.query.filter_by(
                    livestock_id=item.id
                ).order_by(Loan.created_at.desc()).first()
                
                if not associated_loan:
                    continue
                
                loan_status = associated_loan.status
                
                if loan_status in ['rejected', 'pending']:
                    continue
                elif loan_status == 'active':
                    if associated_loan.due_date:
                        due_date = associated_loan.due_date
                        if isinstance(due_date, str):
                            due_date = datetime.strptime(due_date, '%Y-%m-%d').date()
                        elif hasattr(due_date, 'date'):
                            due_date = due_date.date()
                        
                        days_remaining = (due_date - today).days
                        available_info = 'Available now' if days_remaining <= 0 else f'Available in {days_remaining} days'
                    else:
                        available_info = 'Contact for availability'
                        days_remaining = 7
                elif loan_status in ['completed', 'defaulted', 'claimed']:
                    available_info = 'Available now'
                    days_remaining = 0
                else:
                    continue
            
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
                'location': actual_location
            })
        
        # Sort: available now first
        livestock_data.sort(key=lambda x: (
            0 if 'now' in x['availableInfo'].lower() else 1,
            x['daysRemaining']
        ))
        
        # Pagination
        total = len(livestock_data)
        start = (page - 1) * per_page
        end = start + per_page
        paginated_items = livestock_data[start:end]
        
        response = jsonify({
            'items': paginated_items,
            'total': total,
            'pages': (total + per_page - 1) // per_page,
            'current_page': page,
            'per_page': per_page
        })
        
        origin = request.headers.get('Origin')
        allowed_origins = ['http://localhost:5173', 'https://www.nagolie.com', 'https://nagolie.com']
        if origin in allowed_origins:
            response.headers.add('Access-Control-Allow-Origin', origin)
        else:
            response.headers.add('Access-Control-Allow-Origin', '*')
        
        return response, 200
        
    except Exception as e:
        print(f"Livestock gallery error: {str(e)}")
        import traceback
        traceback.print_exc()
        
        response = jsonify({'error': 'Failed to load gallery'})
        origin = request.headers.get('Origin')
        allowed_origins = ['http://localhost:5173', 'https://www.nagolie.com', 'https://nagolie.com']
        if origin in allowed_origins:
            response.headers.add('Access-Control-Allow-Origin', origin)
        else:
            response.headers.add('Access-Control-Allow-Origin', '*')
        
        return response, 500

# Helper function to generate proper livestock description
def generate_livestock_description(livestock_type, count):
    """Generate a proper description for livestock with correct pluralization"""
    if not livestock_type:
        return 'Livestock available for purchase'
    
    livestock_type = livestock_type.lower()
    
    # Common livestock types and their singular forms
    singular_forms = {
        'cattle': 'cow',
        'goats': 'goat',
        'sheep': 'sheep',
        'chickens': 'chicken',
        'poultry': 'chicken',
        'pigs': 'pig',
        'rabbits': 'rabbit',
        'turkeys': 'turkey',
        'ducks': 'duck',
        'geese': 'goose'
    }
    
    # If count is 1, use singular form
    if count == 1:
        if livestock_type in singular_forms:
            singular = singular_forms[livestock_type]
            return f"{singular.capitalize()} available for purchase"
        elif livestock_type.endswith('s') and not livestock_type.endswith('ss'):
            # Try to make singular by removing 's'
            singular = livestock_type[:-1]
            return f"{singular.capitalize()} available for purchase"
        else:
            return f"{livestock_type.capitalize()} available for purchase"
    else:
        # Plural form
        if livestock_type in ['sheep', 'deer', 'fish', 'cattle']:
            return f"{livestock_type.capitalize()} available for purchase"
        elif not livestock_type.endswith('s'):
            return f"{livestock_type.capitalize()}s available for purchase"
        else:
            return f"{livestock_type.capitalize()} available for purchase"

@admin_bp.route('/transactions', methods=['GET', 'OPTIONS'])
@jwt_required()
@admin_required
def get_all_transactions():
    """Get all transactions - ADMIN ONLY"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        transactions = Transaction.query.order_by(Transaction.created_at.desc()).all()
        transactions_data = []
        
        for txn in transactions:
            loan = txn.loan
            client_name = loan.client.full_name if loan and loan.client else 'Unknown'
            
            receipt = 'N/A'
            if txn.payment_method == 'mpesa' and txn.mpesa_receipt:
                receipt = txn.mpesa_receipt
            elif txn.payment_method == 'cash':
                receipt = 'Cash'
            
            status = txn.status
            if not status:
                if txn.transaction_type == 'disbursement':
                    status = 'completed'
                else:
                    status = 'completed'
            
            if txn.transaction_type == 'disbursement':
                status = 'completed'
            
            transactions_data.append({
                'id': txn.id,
                'date': txn.created_at.isoformat() if txn.created_at else None,
                'clientName': client_name,
                'type': txn.transaction_type,
                'payment_type': txn.payment_type,  # ADD THIS LINE
                'amount': float(txn.amount),
                'method': txn.payment_method or 'cash',
                'status': status,
                'receipt': receipt,
                'notes': txn.notes or '',
                'mpesa_receipt': txn.mpesa_receipt,
                'loan_id': txn.loan_id
            })
        
        return jsonify(transactions_data), 200
    except Exception as e:
        print(f"Transactions error: {str(e)}")
        return jsonify({'error': str(e)}), 500
        
@admin_bp.route('/livestock', methods=['POST', 'OPTIONS'])
@jwt_required()
@admin_required
def add_livestock():
    """Add livestock to gallery - ADMIN ONLY"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        data = request.json
        
        # Format: "description|location"
        description = data.get('description', '').strip()
        location = data.get('location', 'Isinya, Kajiado').strip()
        
        # If no description provided, create one based on livestock type
        if not description:
            livestock_type = data.get('type', '').capitalize()
            count = data.get('count', 1)
            
            if count == 1:
                description = f"{livestock_type} available for purchase"
            else:
                if not livestock_type.endswith('s'):
                    description = f"{livestock_type}s available for purchase"
                else:
                    description = f"{livestock_type} available for purchase"
        
        location_field = f"{description}|{location}"
        
        livestock = Livestock(
            client_id=None,
            livestock_type=data['type'],
            count=data['count'],
            estimated_value=Decimal(str(data['price'])),
            location=location_field,  # Store as "description|location"
            photos=data.get('images', []),
            status='active'
        )
        
        db.session.add(livestock)
        db.session.commit()
        
        log_audit('livestock_added', 'livestock', livestock.id, {
            'type': livestock.livestock_type,
            'count': livestock.count,
            'description': description,
            'location': location
        })
        
        return jsonify({
            'success': True,
            'message': 'Livestock added successfully',
            'livestock': livestock.to_dict()
        }), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error adding livestock: {str(e)}")
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/livestock/<int:livestock_id>', methods=['PUT', 'OPTIONS'])
@jwt_required()
@admin_required
def update_livestock(livestock_id):
    """Update livestock in gallery - ADMIN ONLY"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        livestock = db.session.get(Livestock, livestock_id)
        if not livestock:
            return jsonify({'error': 'Livestock not found'}), 404
        
        data = request.json
        
        if 'type' in data:
            livestock.livestock_type = data['type']
        if 'count' in data:
            livestock.count = data['count']
        if 'price' in data:
            livestock.estimated_value = Decimal(str(data['price']))
        
        # Update the combined location field
        if 'description' in data or 'location' in data:
            # Get description and location from request
            description = data.get('description', '').strip()
            location = data.get('location', 'Isinya, Kajiado').strip()
            
            # If no description provided, create one based on livestock type
            if not description:
                livestock_type = data.get('type', livestock.livestock_type or '').capitalize()
                count = data.get('count', livestock.count or 1)
                
                if count == 1:
                    description = f"{livestock_type} available for purchase"
                else:
                    if not livestock_type.endswith('s'):
                        description = f"{livestock_type}s available for purchase"
                    else:
                        description = f"{livestock_type} available for purchase"
            
            # Format: "description|location"
            livestock.location = f"{description}|{location}"
        
        if 'images' in data:
            livestock.photos = data['images']
        
        db.session.commit()
        
        log_audit('livestock_updated', 'livestock', livestock.id, {
            'type': livestock.livestock_type,
            'count': livestock.count,
            'description': description if 'description' in locals() else 'N/A',
            'location': location if 'location' in locals() else 'N/A'
        })
        
        return jsonify({
            'success': True,
            'message': 'Livestock updated successfully',
            'livestock': livestock.to_dict()
        }), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error updating livestock: {str(e)}")
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/livestock/<int:livestock_id>', methods=['DELETE', 'OPTIONS'])
@jwt_required()
@admin_required
def delete_livestock(livestock_id):
    """Delete livestock from gallery - ADMIN ONLY"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        livestock = db.session.get(Livestock, livestock_id)
        if not livestock:
            return jsonify({'error': 'Livestock not found'}), 404
        
        db.session.delete(livestock)
        db.session.commit()
        
        log_audit('livestock_deleted', 'livestock', livestock_id, {
            'type': livestock.livestock_type,
            'count': livestock.count
        })
        
        return jsonify({
            'success': True,
            'message': 'Livestock deleted successfully'
        }), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting livestock: {str(e)}")
        return jsonify({'error': str(e)}), 500
  
@admin_bp.route('/send-reminder', methods=['POST', 'OPTIONS'])
@jwt_required()
@admin_required
def send_reminder():
    """Send SMS reminder to client using Africa's Talking API"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        data = request.json
        client_id = data.get('client_id')
        phone = data.get('phone')
        message = data.get('message')
        
        print(f"Received SMS request - Client ID: {client_id}, Phone: {phone}")
        
        if not phone or not message:
            return jsonify({
                'success': False,
                'error': 'Phone number and message are required'
            }), 400

        return jsonify({
            'success': False,
            'error': 'SMS service is not configured'
        }), 500
            
    except Exception as e:
        print(f"Error in send_reminder route: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@admin_bp.route('/claim-ownership', methods=['POST', 'OPTIONS'])
@jwt_required()
@admin_required
def claim_ownership():
    """Claim ownership of livestock for overdue loans - ADMIN ONLY"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        data = request.get_json()
        client_id = data.get('client_id')
        loan_id = data.get('loan_id')
        
        print(f"Claiming ownership - Client ID: {client_id}, Loan ID: {loan_id}")
        
        loan = Loan.query.filter_by(id=loan_id, client_id=client_id, status='active').first()
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
        
        if loan.due_date:
            due_date = loan.due_date.date() if hasattr(loan.due_date, 'date') else loan.due_date
            if due_date >= datetime.now().date():
                return jsonify({'error': 'Loan is not overdue and cannot be claimed'}), 400
        
        livestock = Livestock.query.filter_by(id=loan.livestock_id).first()
        if not livestock:
            return jsonify({'error': 'Livestock not found'}), 404
        
        print(f"Found livestock: {livestock.livestock_type}, Client ID: {livestock.client_id}")
        
        # Get the client's location before claiming
        client_location = 'Isinya, Kajiado'
        if livestock.client and livestock.client.location:
            client_location = livestock.client.location
        
        # Get livestock type and format description with proper pluralization
        livestock_type = livestock.livestock_type or 'Livestock'
        
        # Convert the plural livestock_type to singular for count = 1
        # Common livestock types in the database and their singular forms
        singular_forms = {
            'cattle': 'cow',
            'goats': 'goat',
            'sheep': 'sheep',  # sheep is both singular and plural
            'chickens': 'chicken',
            'poultry': 'chicken',
            'pigs': 'pig',
            'rabbits': 'rabbit',
            'turkeys': 'turkey',
            'ducks': 'duck',
            'geese': 'goose'
        }
        
        # Handle pluralization based on count
        if livestock.count == 1:
            # SINGULAR: If we have a known singular form, use it
            if livestock_type in singular_forms:
                singular_type = singular_forms[livestock_type]
                description = f"{singular_type.capitalize()} available for purchase"
            else:
                # Try to guess singular by removing 's' from the end
                if livestock_type.endswith('s') and not livestock_type.endswith('ss'):
                    # Remove trailing 's' for regular plurals
                    singular_type = livestock_type[:-1]
                    description = f"{singular_type.capitalize()} available for purchase"
                else:
                    # For irregular or unknown types, use as-is
                    description = f"{livestock_type.capitalize()} available for purchase"
        else:
            # PLURAL
            # Check if the type is already plural
            if livestock_type.endswith('s') or livestock_type in ['sheep', 'deer', 'fish', 'cattle']:
                # Already plural or irregular plural
                description = f"{livestock_type.capitalize()} available for purchase"
            else:
                # Add 's' to make it plural
                description = f"{livestock_type.capitalize()}s available for purchase"
        
        print(f"Generated description: {description} (count: {livestock.count}, type: {livestock_type})")
        
        # Format: "description|location"
        new_location_field = f"{description}|{client_location}"
        
        # Update livestock - make it available for purchase
        livestock.status = 'active'
        livestock.client_id = None
        livestock.location = new_location_field  # Store as "description|location"
        
        # Update loan status
        loan.status = 'claimed'
        loan.balance = 0
        loan.amount_paid = loan.total_amount
        
        # Create claim transaction
        transaction = Transaction(
            loan_id=loan.id,
            transaction_type='claim',
            amount=0,
            payment_method='claim',
            notes=f'Livestock claimed due to overdue loan. Original livestock: {livestock.livestock_type} (ID: {livestock.id})'
        )
        db.session.add(transaction)
        
        db.session.commit()
        
        log_audit('livestock_claimed', 'loan', loan.id, {
            'client_id': client_id,
            'livestock_id': livestock.id,
            'livestock_type': livestock.livestock_type,
            'count': livestock.count,
            'location_set_to': new_location_field
        })
        
        return jsonify({
            'success': True,
            'message': f'Successfully claimed ownership of {livestock.livestock_type}. The livestock is now available in the gallery.',
            'livestock': {
                'id': livestock.id,
                'type': livestock.livestock_type,
                'count': livestock.count,
                'location': client_location,
                'status': 'active'
            }
        })
        
    except Exception as e:
        db.session.rollback()
        print(f"Error claiming ownership: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to claim ownership: {str(e)}'}), 500

@admin_bp.route('/loans/<int:loan_id>/topup', methods=['POST', 'OPTIONS'])
@jwt_required()
@admin_required
def process_topup(loan_id):
    """Process loan top-up or adjustment - ADMIN ONLY"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        data = request.json
        
        topup_amount = Decimal(str(data.get('topup_amount', 0)))
        adjustment_amount = Decimal(str(data.get('adjustment_amount', 0)))
        disbursement_method = data.get('disbursement_method', 'cash')
        mpesa_reference = data.get('mpesa_reference', '')
        notes = data.get('notes', '')
        
        if topup_amount <= 0 and adjustment_amount == 0:
            return jsonify({'error': 'Invalid amount provided'}), 400
        
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
        
        if loan.status != 'active':
            return jsonify({'error': 'Loan is not active'}), 400
        
        old_principal = loan.principal_amount
        old_total = loan.total_amount
        old_balance = loan.balance
        
        if topup_amount > 0:
            loan.principal_amount += topup_amount
            interest_amount = loan.principal_amount * (loan.interest_rate / 100)
            loan.total_amount = loan.principal_amount + interest_amount
            loan.balance = loan.total_amount - loan.amount_paid
            
            transaction_type = 'topup'
            transaction_amount = topup_amount
            transaction_notes = f'Loan top-up of {format_currency(topup_amount)}'
            
        else:
            new_principal = adjustment_amount
            if new_principal <= 0:
                return jsonify({'error': 'Adjustment amount must be positive'}), 400
                
            loan.principal_amount = new_principal
            interest_amount = loan.principal_amount * (loan.interest_rate / 100)
            loan.total_amount = loan.principal_amount + interest_amount
            loan.balance = loan.total_amount - loan.amount_paid
            
            transaction_type = 'adjustment'
            transaction_amount = new_principal - old_principal
            transaction_notes = f'Loan adjustment from {format_currency(old_principal)} to {format_currency(new_principal)}'
        
        if notes:
            transaction_notes += f'. {notes}'
        
        transaction = Transaction(
            loan_id=loan.id,
            transaction_type=transaction_type,
            amount=transaction_amount,
            payment_method=disbursement_method,
            mpesa_receipt=mpesa_reference.upper() if disbursement_method == 'mpesa' else None,
            notes=transaction_notes,
            status='completed'
        )
        
        db.session.add(transaction)
        db.session.commit()
        
        log_audit('loan_modified', 'loan', loan.id, {
            'client': loan.client.full_name if loan.client else 'Unknown',
            'old_principal': float(old_principal),
            'new_principal': float(loan.principal_amount),
            'old_total': float(old_total),
            'new_total': float(loan.total_amount),
            'old_balance': float(old_balance),
            'new_balance': float(loan.balance),
            'type': transaction_type
        })
        
        return jsonify({
            'success': True,
            'message': f'Loan {transaction_type} processed successfully',
            'loan': loan.to_dict(),
            'transaction': transaction.to_dict()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Error processing top-up/adjustment: {str(e)}")
        return jsonify({'error': str(e)}), 500

def format_currency(amount):
    return f"KES {float(amount):,.2f}"

@admin_bp.route('/approved-loans', methods=['GET', 'OPTIONS'])
@jwt_required()
@admin_required
def get_approved_loans():
    """Get approved loans - HEAVILY OPTIMIZED"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
   
    try:
        # Single optimized query with explicit joins
        loans = db.session.query(
            Loan.id,
            Loan.principal_amount,
            Loan.disbursement_date,
            Loan.notes,
            Client.full_name.label('client_name'),
            Client.phone_number,
            Client.id_number,
            Client.location.label('client_location'),
            Livestock.livestock_type,
            Livestock.count,
            Livestock.estimated_value,
            Livestock.photos,
            Livestock.location.label('livestock_location')
        ).join(
            Client, Loan.client_id == Client.id
        ).outerjoin(
            Livestock, Loan.livestock_id == Livestock.id
        ).filter(
            Loan.status == 'active'
        ).order_by(
            Loan.disbursement_date.desc()
        ).limit(100).all()
       
        # Fast Python processing
        approved_loans_data = []
        for loan in loans:
            approved_loans_data.append({
                'id': loan.id,
                'date': loan.disbursement_date.isoformat() if loan.disbursement_date else None,
                'name': loan.client_name,
                'phone': loan.phone_number,
                'idNumber': loan.id_number,
                'loanAmount': float(loan.principal_amount),
                'livestockType': loan.livestock_type or 'N/A',
                'livestockCount': loan.count or 0,
                'estimatedValue': float(loan.estimated_value) if loan.estimated_value else 0,
                'location': loan.client_location or loan.livestock_location or 'N/A',
                'additionalInfo': loan.notes or "None provided",
                'photos': loan.photos if loan.photos else [],
                'status': 'active'
            })
       
        return jsonify(approved_loans_data), 200
    except Exception as e:
        print(f"Approved loans error: {str(e)}")
        return jsonify({'error': 'Failed to load approved loans'}), 500

@admin_bp.route('/dashboard', methods=['GET', 'OPTIONS'])
@jwt_required()
@admin_required
def get_dashboard_stats():
    """Get dashboard statistics with accurate calculations - ADMIN ONLY"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200

    try:
        total_clients = db.session.query(Client).join(Loan).filter(
            Loan.status.in_(['active', 'completed'])
        ).distinct().count()

        total_lent = (
            db.session.query(db.func.sum(Loan.principal_amount))
            .filter(Loan.status.in_(['active', 'completed']))
            .scalar() or 0
        )

        total_lent_float = float(total_lent) if total_lent else 0.0

        KNOWN_INFLATION_AMOUNT = 30500
        total_lent_adjusted = total_lent_float - KNOWN_INFLATION_AMOUNT if total_lent_float > KNOWN_INFLATION_AMOUNT else total_lent_float
        if total_lent_adjusted < 0:
            total_lent_adjusted = 0

        total_received = (
            db.session.query(db.func.sum(Loan.amount_paid))
            .filter(Loan.status.in_(['active', 'completed']))
            .scalar() or 0
        )

        total_principal_paid = (
            db.session.query(db.func.sum(Loan.principal_paid))
            .filter(Loan.status.in_(['active', 'completed']))
            .scalar() or 0
        )

        currently_lent = (
            db.session.query(db.func.sum(Loan.current_principal))
            .filter(Loan.status == 'active')
            .scalar() or 0
        )

        available_funds = float(total_principal_paid) - float(currently_lent)
        if available_funds < 0:
            available_funds = 0

        today = datetime.now().date()
        due_today = Loan.query.filter(
            Loan.status == 'active',
            db.func.date(Loan.due_date) == today
        ).all()

        due_today_data = []
        for loan in due_today:
            from app.routes.payments import recalculate_loan
            loan = recalculate_loan(loan)

            due_today_data.append({
                'id': loan.id,
                'client_id': loan.client_id,
                'loan_id': loan.id,
                'client_name': loan.client.full_name if loan.client else 'Unknown',
                'balance': float(loan.balance),
                'current_principal': float(loan.current_principal),
                'phone': loan.client.phone_number if loan.client else 'N/A'
            })

        overdue = Loan.query.filter(
            Loan.status == 'active',
            Loan.due_date < datetime.now()
        ).all()

        overdue_data = []
        for loan in overdue:
            from app.routes.payments import recalculate_loan
            loan = recalculate_loan(loan)

            # FIX: Handle both datetime and date objects
            if loan.due_date:
                due_date_value = loan.due_date
                # If it's a datetime, get the date part
                if hasattr(due_date_value, 'date'):
                    due_date_value = due_date_value.date()
                
                days_overdue = (datetime.now().date() - due_date_value).days
            else:
                days_overdue = 0

            overdue_data.append({
                'id': loan.id,
                'client_id': loan.client_id,
                'loan_id': loan.id,
                'client_name': loan.client.full_name if loan.client else 'Unknown',
                'balance': float(loan.balance),
                'current_principal': float(loan.current_principal),
                'days_overdue': days_overdue,
                'phone': loan.client.phone_number if loan.client else 'N/A'
            })

        return jsonify({
            'total_clients': total_clients,
            'total_lent': total_lent_adjusted,
            'total_received': float(total_received),
            'available_funds': float(available_funds),
            'due_today': due_today_data,
            'overdue': overdue_data
        }), 200

    except Exception as e:
        print(f"Dashboard error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    
@admin_bp.route('/payment-stats', methods=['GET', 'OPTIONS'])
@jwt_required()
@admin_required
def get_payment_stats():
    """Get payment statistics for all clients with revenue tracking - ADMIN ONLY"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200

    try:
        loans_with_payments = Loan.query.filter(
            Loan.status.in_(['active', 'completed'])
        ).order_by(Loan.disbursement_date.desc()).all()

        payment_stats = []
        total_principal_available = Decimal('0')
        total_revenue_collected = Decimal('0')

        for loan in loans_with_payments:
            client_name = loan.client.full_name if loan.client else 'Unknown'
            phone_number = loan.client.phone_number if loan.client else 'N/A'

            principal_paid = loan.principal_paid if loan.principal_paid is not None else Decimal('0')
            interest_paid = loan.interest_paid if loan.interest_paid is not None else Decimal('0')
            current_principal = loan.current_principal if loan.current_principal is not None else loan.principal_amount

            payment_stats.append({
                'id': loan.id,
                'client_id': loan.client_id,
                'name': client_name,
                'phone': phone_number,
                'borrowed_date': loan.disbursement_date.isoformat() if loan.disbursement_date else None,
                'borrowed_amount': float(loan.principal_amount),
                'principal_paid': float(principal_paid),
                'current_principal': float(current_principal),
                'interest_paid': float(interest_paid),
                'status': loan.status
            })

            total_principal_available += principal_paid
            total_revenue_collected += interest_paid

        currently_lent = (
            db.session.query(db.func.sum(Loan.current_principal))
            .filter(Loan.status == 'active')
            .scalar() or 0
        )

        available_for_lending = float(total_principal_available) - float(currently_lent)

        return jsonify({
            'payment_stats': payment_stats,
            'total_principal_collected': float(total_principal_available),
            'currently_lent': float(currently_lent),
            'available_for_lending': available_for_lending,
            'revenue_collected': float(total_revenue_collected)
        }), 200

    except Exception as e:
        print(f"Payment stats error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/clients', methods=['GET', 'OPTIONS'])
@jwt_required()
@admin_required
def get_all_clients():
    """Get all clients with updated loan details and accurate balances - ADMIN ONLY"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200

    try:
        from app.routes.payments import recalculate_loan

        clients_with_loans = db.session.query(Client).join(Loan).filter(
            Loan.status == 'active'
        ).distinct().all()

        clients_data = []

        for client in clients_with_loans:
            active_loan = Loan.query.filter_by(
                client_id=client.id,
                status='active'
            ).first()

            if active_loan:
                active_loan = recalculate_loan(active_loan)
                db.session.commit()

                current_principal = active_loan.current_principal if active_loan.current_principal is not None else active_loan.principal_amount
                principal_paid = active_loan.principal_paid if active_loan.principal_paid is not None else Decimal('0')
                interest_paid = active_loan.interest_paid if active_loan.interest_paid is not None else Decimal('0')

                if active_loan.due_date:
                    due_date = active_loan.due_date.date() if hasattr(active_loan.due_date, 'date') else active_loan.due_date
                    today = datetime.now().date()
                    days_left = (due_date - today).days
                    days_overdue = abs(days_left) if days_left < 0 else 0
                else:
                    days_left = 7
                    days_overdue = 0

                clients_data.append({
                    'id': client.id,
                    'loan_id': active_loan.id,
                    'name': client.full_name,
                    'phone': client.phone_number,
                    'idNumber': client.id_number,
                    'borrowedDate': active_loan.disbursement_date.isoformat() if active_loan.disbursement_date else None,
                    'borrowedAmount': float(active_loan.principal_amount),
                    'currentPrincipal': float(current_principal),
                    'expectedReturnDate': active_loan.due_date.isoformat(),
                    'amountPaid': float(active_loan.amount_paid),
                    'principalPaid': float(principal_paid),
                    'interestPaid': float(interest_paid),
                    'balance': float(active_loan.balance),
                    'daysLeft': days_left,
                    'daysOverdue': days_overdue,
                    'lastInterestPayment': active_loan.last_interest_payment_date.isoformat() if active_loan.last_interest_payment_date else None
                })

        return jsonify(clients_data), 200
    except Exception as e:
        print(f"Clients error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# Run this once in a Python shell or create a migration script
# def fix_existing_claimed_livestock():
#     """Fix existing claimed livestock with old format"""
#     from app import db
#     from app.models import Livestock, Client
#     from datetime import datetime
    
#     # Find all claimed livestock with old format
#     claimed_livestock = Livestock.query.filter(
#         Livestock.status == 'active',
#         Livestock.client_id.is_(None),
#         Livestock.location.contains("Available (claimed from")
#     ).all()
    
#     for item in claimed_livestock:
#         print(f"Fixing livestock ID {item.id}: {item.livestock_type}")
        
#         # Try to find the original client to get location
#         original_location = 'Isinya, Kajiado'
        
#         # Create proper description with pluralization
#         livestock_type = item.livestock_type or 'Livestock'
#         if item.count == 1:
#             description = f"{livestock_type.capitalize()} available for purchase"
#         else:
#             if not livestock_type.endswith('s'):
#                 description = f"{livestock_type.capitalize()}s available for purchase"
#             else:
#                 description = f"{livestock_type.capitalize()} available for purchase"
        
#         # Format: "description|location"
#         new_location_field = f"{description}|{original_location}"
        
#         item.location = new_location_field
#         print(f"  Updated to: {new_location_field}")
    
#     db.session.commit()
#     print(f"Fixed {len(claimed_livestock)} claimed livestock records")