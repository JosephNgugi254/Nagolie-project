from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
from decimal import Decimal
from app import db
from app.models import Client, Loan, Livestock, Transaction, User, Investor, InvestorReturn
from app.utils.security import admin_required, log_audit
from sqlalchemy.orm import selectinload
from sqlalchemy import and_, or_, func
from app.routes.payments import recalculate_loan
import json
import secrets
import string

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

# @admin_bp.route('/applications/<int:loan_id>/approve', methods=['POST', 'OPTIONS'])
# @jwt_required()
# @admin_required
# def approve_application(loan_id):
#     """Approve a loan application - ADMIN ONLY"""
#     if request.method == 'OPTIONS':
#         return jsonify({'status': 'OK'}), 200
        
#     try:
#         data = request.get_json()
        
#         # Get funding source data
#         funding_source = data.get('funding_source', 'company')  # 'company' or 'investor'
#         investor_id = data.get('investor_id')
        
#         loan = db.session.get(Loan, loan_id)
#         if not loan:
#             return jsonify({'error': 'Loan application not found'}), 404
        
#         if loan.status != 'pending':
#             return jsonify({'error': 'Loan application already processed'}), 400
        
#         # Validate investor if funding source is investor
#         investor = None
#         if funding_source == 'investor' and investor_id:
#             investor = db.session.get(Investor, investor_id)
#             if not investor or investor.account_status != 'active':
#                 return jsonify({'error': 'Invalid or inactive investor selected'}), 400
            
#             # Check if investor has sufficient funds
#             # You might want to add a check here for investor's available funds
#             # For now, we'll assume the funds are available
        
#         # Update loan status and details
#         loan.interest_rate = Decimal('30.0')
#         interest_amount = loan.principal_amount * (loan.interest_rate / 100)
#         loan.total_amount = loan.principal_amount + interest_amount
#         loan.balance = loan.total_amount
        
#         loan.current_principal = loan.principal_amount
#         loan.principal_paid = Decimal('0')
#         loan.interest_paid = Decimal('0')
        
#         loan.status = 'active'
#         loan.disbursement_date = datetime.utcnow()
#         loan.due_date = datetime.utcnow() + timedelta(days=7)
        
#         # Record funding source
#         loan.funding_source = funding_source
#         if funding_source == 'investor' and investor:
#             loan.investor_id = investor.id
        
#         transaction = Transaction(
#             loan_id=loan.id,
#             transaction_type='disbursement',
#             amount=loan.principal_amount,
#             payment_method='cash',
#             notes='Loan approved and disbursed',
#             status='completed',
#             created_at=datetime.utcnow()
#         )
        
#         db.session.add(transaction)
        
#         # Update livestock with ownership information
#         if loan.livestock:
#             if funding_source == 'investor' and investor:
#                 loan.livestock.investor_id = investor.id
#                 loan.livestock.ownership_type = 'investor'
#             else:
#                 loan.livestock.ownership_type = 'company'
        
#         db.session.commit()
        
#         log_audit('loan_approved', 'loan', loan.id, {
#             'client': loan.client.full_name if loan.client else 'Unknown',
#             'amount': float(loan.principal_amount),
#             'funding_source': funding_source,
#             'investor_id': investor.id if investor else None,
#             'interest_rate': float(loan.interest_rate),
#             'total_amount': float(loan.total_amount)
#         })
        
#         return jsonify({
#             'success': True,
#             'message': 'Loan approved successfully',
#             'loan': loan.to_dict(),
#             'transaction': transaction.to_dict()
#         }), 200
#     except Exception as e:
#         db.session.rollback()
#         print(f"Error approving application: {str(e)}")
#         return jsonify({'error': str(e)}), 500

@admin_bp.route('/applications/<int:loan_id>/approve', methods=['POST', 'OPTIONS'])
@jwt_required()
@admin_required
def approve_application(loan_id):
    """Approve a loan application - ADMIN ONLY"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        data = request.get_json()
        
        funding_source = data.get('funding_source', 'company')
        investor_id = data.get('investor_id')
        
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan application not found'}), 404
        
        if loan.status != 'pending':
            return jsonify({'error': 'Loan application already processed'}), 400
        
        investor = None
        if funding_source == 'investor' and investor_id:
            investor = db.session.get(Investor, investor_id)
            if not investor or investor.account_status != 'active':
                return jsonify({'error': 'Invalid or inactive investor selected'}), 400
            
            # Calculate available balance
            total_lent = db.session.query(func.sum(Loan.principal_amount)).filter(
                Loan.investor_id == investor.id,
                Loan.funding_source == 'investor',
                Loan.status.in_(['active', 'completed'])
            ).scalar() or Decimal('0')
            
            available_balance = investor.current_investment - total_lent
            
            if loan.principal_amount > available_balance:
                return jsonify({
                    'error': f'Insufficient funds! Investor only has {available_balance} available, but loan requires {loan.principal_amount}'
                }), 400
        
        # Rest of the approval logic...
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
        
        loan.funding_source = funding_source
        if funding_source == 'investor' and investor:
            loan.investor_id = investor.id
        
        # Create transaction
        transaction = Transaction(
            loan_id=loan.id,
            transaction_type='disbursement',
            amount=loan.principal_amount,
            payment_method='cash',
            notes=f'Loan approved and disbursed. Funding source: {funding_source}',
            status='completed',
            created_at=datetime.utcnow()
        )
        db.session.add(transaction)
        
        # Update livestock ownership
        if loan.livestock:
            if funding_source == 'investor' and investor:
                loan.livestock.investor_id = investor.id
                loan.livestock.ownership_type = 'investor'
            else:
                loan.livestock.ownership_type = 'company'
        
        db.session.commit()
        
        log_audit('loan_approved', 'loan', loan.id, {
            'client': loan.client.full_name if loan.client else 'Unknown',
            'amount': float(loan.principal_amount),
            'funding_source': funding_source,
            'investor_id': investor.id if investor else None
        })
        
        return jsonify({
            'success': True,
            'message': 'Loan approved successfully',
            'loan': loan.to_dict(),
            'transaction': transaction.to_dict(),
            'investor_available_balance': float(available_balance - loan.principal_amount) if investor else None
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
    """Get all livestock for gallery - ADMIN ONLY - USING SEPARATE FIELDS"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
    
    try:
        livestock = Livestock.query.options(
            selectinload(Livestock.client),
            selectinload(Livestock.loan),
            selectinload(Livestock.investor)
        ).filter_by(status='active').all()
        
        livestock_data = []
        today = datetime.now().date()
        
        for item in livestock:
            # Use separate description and location fields
            description = item.description or 'Available for purchase'
            actual_location = item.location or 'Isinya, Kajiado'
            
            # Determine ownership
            ownership_type = item.ownership_type or 'company'
            investor_name = None
            if item.investor:
                investor_name = item.investor.name
            
            # Admin-added livestock
            if item.client_id is None:
                available_info = 'Available now'
                days_remaining = 0
                is_admin_added = True
            else:
                # Client livestock - Check if there's an active loan
                client_loan = None
                
                if hasattr(item, 'loan') and item.loan:
                    if isinstance(item.loan, list):
                        active_loans = [loan for loan in item.loan if loan.status == 'active']
                        client_loan = active_loans[0] if active_loans else None
                    elif hasattr(item.loan, 'status') and item.loan.status == 'active':
                        client_loan = item.loan
                
                if not client_loan:
                    client_loan = Loan.query.filter_by(
                        livestock_id=item.id,
                        status='active'
                    ).first()
                
                if not client_loan:
                    continue
                
                client_name = item.client.full_name if item.client else 'Unknown'
                description = f"Collateral for {client_name}'s loan"
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
                'title': f"{item.livestock_type.capitalize()} - {item.count} head",
                'type': item.livestock_type,
                'count': item.count,
                'price': float(item.estimated_value) if item.estimated_value else 0,
                'description': description,
                'images': item.photos if item.photos else [],
                'availableInfo': available_info,
                'daysRemaining': days_remaining,
                'location': actual_location,
                'status': item.status,
                'isAdminAdded': is_admin_added,
                'ownership_type': ownership_type,
                'investor_name': investor_name
            })
        
        return jsonify(livestock_data), 200
        
    except Exception as e:
        print(f"Livestock error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/livestock/gallery', methods=['GET', 'OPTIONS'])
def get_public_livestock_gallery():
    """Get paginated livestock gallery for public view - FIXED FOR CLAIMED LIVESTOCK"""
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
        
        # Get all active livestock
        livestock = Livestock.query.filter(Livestock.status == 'active').all()
        
        livestock_data = []
        today = datetime.now().date()
        
        for item in livestock:
            # Get description - handle None, NaN, or empty values
            description = item.description
            if not description or description == 'NaN' or description == 'None' or str(description).strip() == '':
                description = 'Livestock for purchase'
            
            # Clean description: remove any "claimed from" references for public view
            description = str(description)
            if 'claimed' in description.lower():
                description = 'Livestock for purchase'
            
            # Clean description: remove any pipe characters
            if '|' in description:
                # Split by pipe and take only the description part (before pipe)
                parts = description.split('|', 1)
                description = parts[0].strip()
            
            # Get location - handle None, NaN, or empty values
            actual_location = item.location
            if not actual_location or actual_location == 'NaN' or actual_location == 'None' or str(actual_location).strip() == '':
                actual_location = 'Isinya, Kajiado'
            
            # Clean location: remove any description parts and "claimed from" references
            actual_location = str(actual_location)
            if '|' in actual_location:
                # Split by pipe
                parts = actual_location.split('|', 1)
                # Check which part looks more like a location
                part1 = parts[0].strip()
                part2 = parts[1].strip() if len(parts) > 1 else ''
                
                # Determine which part is the location
                location_keywords = ['isinya', 'kajiado', 'town', 'county', 'moonlight', 'kwa', 'timo', 'naresho']
                
                if any(keyword in part2.lower() for keyword in location_keywords):
                    actual_location = part2
                elif any(keyword in part1.lower() for keyword in location_keywords):
                    actual_location = part1
                else:
                    actual_location = 'Isinya, Kajiado'
            
            # Clean location: remove any "available" or "claimed" text
            if 'available' in actual_location.lower() or 'claimed' in actual_location.lower():
                actual_location = 'Isinya, Kajiado'
            
            # Ensure description is not empty
            if not description or description.strip() == '':
                description = 'Livestock for purchase'
            
            # Ensure location is not empty
            if not actual_location or actual_location.strip() == '':
                actual_location = 'Isinya, Kajiado'
            
            # Availability logic
            should_include = False
            available_info = 'Available now'
            days_remaining = 0
            
            if item.client_id is None:
                # Admin-added livestock - always available
                should_include = True
            else:
                # Client livestock - check loan status
                associated_loan = Loan.query.filter_by(
                    livestock_id=item.id
                ).order_by(Loan.created_at.desc()).first()
                
                if not associated_loan:
                    continue
                
                loan_status = associated_loan.status
                
                # Do NOT show claimed livestock to public
                if loan_status == 'claimed':
                    continue
                
                if loan_status in ['rejected', 'pending']:
                    continue
                elif loan_status == 'active':
                    should_include = True
                    if associated_loan.due_date:
                        due_date = associated_loan.due_date
                        if isinstance(due_date, str):
                            try:
                                due_date = datetime.strptime(due_date, '%Y-%m-%d').date()
                            except:
                                due_date = today
                        elif hasattr(due_date, 'date'):
                            due_date = due_date.date()
                        else:
                            due_date = today
                        
                        days_remaining = (due_date - today).days
                        if days_remaining <= 0:
                            available_info = 'Available now'
                        else:
                            available_info = f'Available in {days_remaining} days'
                    else:
                        available_info = 'Contact for availability'
                        days_remaining = 7
                elif loan_status in ['completed', 'defaulted']:
                    should_include = True
                else:
                    continue
            
            if not should_include:
                continue
            
            # For client-owned livestock (collateral), use generic description
            if item.client_id is not None and associated_loan:
                if 'Collateral for' in description:
                    description = 'Livestock for purchase'
            
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
        
        # Use separate description and location fields
        description = data.get('description', '').strip()
        if not description:
            livestock_type = data.get('type', '').capitalize()
            count = data.get('count', 1)
            description = generate_livestock_description(livestock_type, count)
        
        livestock = Livestock(
            client_id=None,
            livestock_type=data['type'],
            count=data['count'],
            estimated_value=Decimal(str(data['price'])),
            description=description,  # SEPARATE FIELD
            location=data.get('location', 'Isinya, Kajiado'),  # SEPARATE FIELD
            photos=data.get('images', []),
            status='active'
        )
        
        db.session.add(livestock)
        db.session.commit()
        
        log_audit('livestock_added', 'livestock', livestock.id, {
            'type': livestock.livestock_type,
            'count': livestock.count,
            'description': livestock.description,
            'location': livestock.location
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
        if 'description' in data:
            livestock.description = data['description'].strip()
        if 'location' in data:
            livestock.location = data['location'].strip()
        if 'images' in data:
            livestock.photos = data['images']
        
        db.session.commit()
        
        log_audit('livestock_updated', 'livestock', livestock.id, {
            'type': livestock.livestock_type,
            'count': livestock.count,
            'description': livestock.description,
            'location': livestock.location
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
        
        # Generate proper description
        livestock_type = livestock.livestock_type or 'Livestock'
        
        # Use separate fields instead of combined string
        livestock.description = 'Livestock for purchase'
        livestock.location = client_location
        
        # Update livestock - make it available for purchase
        livestock.status = 'active'
        livestock.client_id = None
        
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
            'description_set_to': 'Livestock for purchase',
            'location_set_to': client_location
        })
        
        return jsonify({
            'success': True,
            'message': f'Successfully claimed ownership of {livestock.livestock_type}. The livestock is now available in the gallery.',
            'livestock': {
                'id': livestock.id,
                'type': livestock.livestock_type,
                'count': livestock.count,
                'location': client_location,
                'description': 'Livestock for purchase',
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

# investor routes

# In admin.py, add this function near the top of the file after imports
def calculate_investor_lent_amount(investor_id):
    """
    Calculate total amount of investor's money that has been lent out
    """
    # Sum all principal amounts of loans funded by this investor
    lent_amount = db.session.query(db.func.sum(Loan.principal_amount)).filter(
        Loan.investor_id == investor_id,
        Loan.funding_source == 'investor',
        Loan.status.in_(['active', 'completed'])
    ).scalar() or 0
    
    return lent_amount

def calculate_investor_return_amount(investor, period_end_date):
    """
    Calculate 10% return based on the amount lent out by the investor
    up to the specified period_end_date
    
    Args:
        investor: Investor object
        period_end_date: The end date of the return period (datetime)
    """
    # Calculate the start date of the period
    if investor.last_return_date:
        # Subsequent returns: last 7 days
        period_start = investor.last_return_date
    else:
        # First return: last 14 days from investment date
        period_start = investor.invested_date
    
    # Calculate the lent amount during this period
    # Sum principal amounts of loans disbursed between period_start and period_end_date
    lent_amount_in_period = db.session.query(db.func.sum(Loan.principal_amount)).filter(
        Loan.investor_id == investor.id,
        Loan.funding_source == 'investor',
        Loan.disbursement_date >= period_start,
        Loan.disbursement_date <= period_end_date,
        Loan.status.in_(['active', 'completed'])
    ).scalar() or 0
    
    # Calculate 10% return on the lent amount
    return_amount = lent_amount_in_period * Decimal('0.10')
    
    return return_amount

@admin_bp.route('/investors', methods=['GET', 'POST', 'OPTIONS'])
@jwt_required()
@admin_required
def manage_investors():
    """Get all investors or create new investor"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
    
    if request.method == 'GET':
        try:
            # Get all investors
            investors = Investor.query.all()
            investor_data = []
            
            for investor in investors:
                # Calculate total money lent out (Active + Completed loans)
                # This matches the logic used in investors.py dashboard
                total_lent = db.session.query(db.func.sum(Loan.principal_amount)).filter(
                    Loan.investor_id == investor.id,
                    Loan.funding_source == 'investor',
                    Loan.status.in_(['active', 'completed'])
                ).scalar() or Decimal('0')
                
                # Calculate available balance
                # Investment amount minus what is currently out in loans
                available_balance = investor.current_investment - total_lent
                if available_balance < Decimal('0'):
                    available_balance = Decimal('0')
                
                # Get basic dict and add the new calculated fields
                investor_dict = investor.to_dict()
                investor_dict['total_lent_amount'] = float(total_lent)
                investor_dict['available_balance'] = float(available_balance)
                investor_dict['investment_amount'] = float(investor.current_investment)
                
                investor_data.append(investor_dict)
                
            return jsonify(investor_data), 200
        except Exception as e:
            print(f"Error fetching investors: {str(e)}")
            import traceback
            traceback.print_exc()  # Add this for debugging
            return jsonify({'error': str(e)}), 500

    if request.method == 'POST':
        try:
            data = request.json
            # Validate required fields
            required_fields = ['name', 'phone', 'id_number', 'investment_amount']
            for field in required_fields:
                if not data.get(field):
                    return jsonify({'error': f'Missing required field: {field}'}), 400
            # Check if investor already exists
            existing_investor = Investor.query.filter(
                (Investor.phone == data['phone']) |
                (Investor.id_number == data['id_number'])
            ).first()
            if existing_investor:
                return jsonify({'error': 'Investor with this phone or ID number already exists'}), 400
            # Create investor with NEW return schedule (5 weeks for first return)
            current_time = datetime.utcnow()
            investor = Investor(
                name=data['name'],
                phone=data['phone'],
                id_number=data['id_number'],
                email=data.get('email', None),
                initial_investment=Decimal(str(data['investment_amount'])),
                current_investment=Decimal(str(data['investment_amount'])),
                invested_date=current_time,
                # NEW: First return after 5 weeks (35 days)
                expected_return_date=current_time + timedelta(days=35),
                next_return_date=current_time + timedelta(days=35), # Changed to 35 days
                account_status='pending',
                notes=data.get('notes', '')
            )
            db.session.add(investor)
            db.session.flush()
            # Generate secure temporary password
            random_chars = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(4))
            temp_password = f"inv{investor.id}_{random_chars}"
            token = secrets.token_urlsafe(32)
            investor.notes = (
                f"Temporary Password: {temp_password}\n"
                f"Registration Token: {token}\n"
                f"{investor.notes or ''}"
            )
            # Generate agreement data with NEW return schedule
            agreement_data = {
                'investor_name': investor.name,
                'investor_id': investor.id_number,
                'phone': investor.phone,
                'email': investor.email or 'Not provided',
                'investment_amount': float(investor.initial_investment),
                'date': current_time.strftime('%d/%m/%Y'),
                'expected_return_period': '5 weeks for first return, then every 4 weeks thereafter',
                'return_percentage': '40%',
                'return_amount': float(Decimal(str(investor.initial_investment)) * Decimal('0.40')),
                'early_withdrawal_fee': '15%',
                'early_withdrawal_receivable': '85%',
                'agreement_date': current_time.strftime('%B %d, %Y'),
                'agreement_terms': [
                    'Investor shall receive 40% return on investment amount',
                    'First return will be processed after 5 weeks from investment date',
                    'Subsequent returns every 4 weeks',
                    'Early withdrawals incur 15% fee, investor receives 85% of expected return',
                    'All returns are processed via M-Pesa or bank transfer'
                ]
            }

            investor.agreement_document = json.dumps(agreement_data)
            db.session.commit()
            frontend_url = request.headers.get('Origin', 'http://localhost:5173')
            account_creation_link = f"{frontend_url}/investor/complete-registration/{investor.id}?token={token}"
            log_audit('investor_created', 'investor', investor.id, {
                'name': investor.name,
                'amount': float(investor.current_investment),
                'email': investor.email
            })
            return jsonify({
                'success': True,
                'message': 'Investor created successfully',
                'investor': investor.to_dict(),
                'account_creation_link': account_creation_link,
                'temporary_password': temp_password,
                'agreement_data': agreement_data
            }), 201
        except Exception as e:
            db.session.rollback()
            print(f"Error creating investor: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
                
# In admin.py, update the manage_investor function:
@admin_bp.route('/investors/<int:investor_id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@jwt_required()
@admin_required
def manage_investor(investor_id):
    """Get, update, or delete specific investor"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    investor = db.session.get(Investor, investor_id)
    if not investor:
        return jsonify({'error': 'Investor not found'}), 404
    
    if request.method == 'GET':
        investor_data = investor.to_dict()
        returns = InvestorReturn.query.filter_by(investor_id=investor.id).all()
        investor_data['returns'] = [r.to_dict() for r in returns]
        
        return jsonify(investor_data), 200
    
    elif request.method == 'PUT':
        try:
            data = request.json
            
            # Update allowed fields
            allowed_fields = ['name', 'phone', 'email', 'account_status', 'notes']
            for field in allowed_fields:
                if field in data:
                    setattr(investor, field, data[field])
            
            # For account status change, also handle user account
            if 'account_status' in data:
                if investor.user:
                    investor.user.is_active = (data['account_status'] == 'active')
            
            db.session.commit()
            
            log_audit('investor_updated', 'investor', investor.id, {
                'fields_updated': [field for field in allowed_fields if field in data],
                'status': investor.account_status
            })
            
            return jsonify({
                'success': True,
                'message': 'Investor updated successfully',
                'investor': investor.to_dict()
            }), 200
            
        except Exception as e:
            db.session.rollback()
            print(f"Error updating investor: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    elif request.method == 'DELETE':
        try:
            print(f"DEBUG: Starting delete for investor ID: {investor_id}")
            
            # Get investor with user relationship
            investor = Investor.query.options(db.joinedload(Investor.user)).get(investor_id)
            if not investor:
                return jsonify({'error': 'Investor not found'}), 404
            
            investor_name = investor.name
            user_id = investor.user.id if investor.user else None
            
            print(f"DEBUG: Investor: {investor_name}, User ID: {user_id}")
            
            # STEP 1: Delete investor returns
            InvestorReturn.query.filter_by(investor_id=investor.id).delete()
            print(f"DEBUG: Deleted investor returns")
            
            # STEP 2: Delete investor
            db.session.delete(investor)
            print(f"DEBUG: Investor marked for deletion")
            
            # STEP 3: Delete user if exists
            if investor.user:
                print(f"DEBUG: Attempting to delete user {user_id}")
                
                # Clean up any remaining references (constraints should handle it, but be safe)
                if user_id:
                    # Set transactions.created_by to NULL (constraint should do this, but explicit is safer)
                    db.session.execute(
                        "UPDATE transactions SET created_by = NULL WHERE created_by = :user_id",
                        {"user_id": user_id}
                    )
                    print(f"DEBUG: Set transactions.created_by to NULL for user {user_id}")
                
                # Delete the user (constraints will cascade/delete related records)
                db.session.delete(investor.user)
                print(f"DEBUG: User marked for deletion")
            
            # Commit transaction
            db.session.commit()
            print(f"DEBUG: Transaction committed successfully")
            
            return jsonify({
                'success': True,
                'message': 'Investor deleted successfully'
            }), 200
            
        except Exception as e:
            db.session.rollback()
            print(f"DEBUG: Error in transaction: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

@admin_bp.route('/investors/<int:investor_id>/calculate-return', methods=['GET', 'OPTIONS'])
@jwt_required()
@admin_required
def calculate_investor_return(investor_id):
    """Calculate the return amount for an investor - NEW: 40% of investment amount"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        investor = db.session.get(Investor, investor_id)
        if not investor:
            return jsonify({'error': 'Investor not found'}), 404
        
        # Calculate 40% return based on investment amount
        return_amount = investor.current_investment * Decimal('0.40')
        
        # Check if early withdrawal
        is_early_withdrawal = request.args.get('early_withdrawal', 'false').lower() == 'true'
        
        if is_early_withdrawal:
            # Apply 15% fee for early withdrawal
            early_return_amount = return_amount * Decimal('0.85')
            fee_amount = return_amount - early_return_amount
        else:
            early_return_amount = return_amount
            fee_amount = Decimal('0')
        
        return jsonify({
            'success': True,
            'investor_id': investor.id,
            'investor_name': investor.name,
            'total_investment': float(investor.current_investment),
            'calculated_return': float(return_amount),
            'is_early_withdrawal': is_early_withdrawal,
            'early_return_amount': float(early_return_amount) if is_early_withdrawal else float(return_amount),
            'early_withdrawal_fee': float(fee_amount),
            'return_percentage': '40%',
            'next_return_date': investor.next_return_date.isoformat() if investor.next_return_date else None,
            'last_return_date': investor.last_return_date.isoformat() if investor.last_return_date else None,
            'can_process_return': current_date.date() >= investor.next_return_date.date() if investor.next_return_date else False
        }), 200
        
    except Exception as e:
        print(f"Error calculating investor return: {str(e)}")
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/investors/<int:investor_id>/process-return', methods=['POST', 'OPTIONS'])
@jwt_required()
@admin_required
def process_investor_return(investor_id):
    """Process 40% return payment to investor based on investment amount"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        investor = db.session.get(Investor, investor_id)
        if not investor:
            return jsonify({'error': 'Investor not found'}), 404
        
        if investor.account_status != 'active':
            return jsonify({'error': 'Investor account is not active'}), 400
        
        data = request.json
        payment_method = data.get('payment_method', 'mpesa')
        mpesa_receipt = data.get('mpesa_receipt', '')
        notes = data.get('notes', '')
        
        # Check if this is an early withdrawal
        is_early_withdrawal = data.get('is_early_withdrawal', False)
        
        # Get current date for return
        current_date = datetime.utcnow()
        
        # Calculate 40% return based on investment amount
        return_amount = investor.current_investment  * Decimal('0.40')
        
        # Apply early withdrawal fee if applicable
        if is_early_withdrawal:
            # 15% fee, investor gets 85% of expected amount
            fee_amount = return_amount * Decimal('0.15')
            return_amount = return_amount - fee_amount
            notes = f"Early withdrawal with 15% fee applied. {notes}"
        
        if return_amount <= 0:
            return jsonify({
                'success': False,
                'message': 'Invalid return amount calculation.'
            }), 400
        
        # Create return record
        investor_return = InvestorReturn(
            investor_id=investor.id,
            amount=return_amount,
            return_date=current_date,
            payment_method=payment_method,
            mpesa_receipt=mpesa_receipt.upper() if payment_method == 'mpesa' else '',
            notes=notes,
            status='completed',
            is_early_withdrawal=is_early_withdrawal
        )
        
        # Update investor stats
        investor.total_returns_received += return_amount
        investor.last_return_date = current_date
        
        # Calculate next return date
        # FIRST RETURN: If this is the first return (no previous returns)
        if investor.total_returns_received - return_amount <= 0:
            # First return was after 5 weeks, now set next for 4 weeks after this return
            investor.next_return_date = current_date + timedelta(days=28)
        else:
            # SUBSEQUENT RETURNS: Every 4 weeks (28 days) after last return
            investor.next_return_date = current_date + timedelta(days=28)
        
        db.session.add(investor_return)
        db.session.commit()
        
        log_audit('investor_return_processed', 'investor_return', investor_return.id, {
            'investor': investor.name,
            'return_amount': float(return_amount),
            'is_early_withdrawal': is_early_withdrawal,
            'investment_amount': float(investor.current_investment ),
            'payment_method': payment_method
        })
        
        return jsonify({
            'success': True,
            'message': f'Return of {format_currency(return_amount)} processed successfully',
            'return': investor_return.to_dict(),
            'investor': investor.to_dict(),
            'calculated_based_on': {
                'investment_amount': float(investor.current_investment ),
                'return_percentage': '40%',
                'is_early_withdrawal': is_early_withdrawal,
                'next_return_date': investor.next_return_date.isoformat()
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Error processing investor return: {str(e)}")
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/investors/stats', methods=['GET', 'OPTIONS'])
@jwt_required()
@admin_required
def get_investor_stats():
    """Get overall investor statistics"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        # Calculate total livestock value
        total_livestock_value = db.session.query(db.func.sum(Livestock.estimated_value)).filter(
            Livestock.status == 'active'
        ).scalar() or 0
        
        # Get investor stats
        active_investors = Investor.query.filter_by(account_status='active').all()
        pending_investors = Investor.query.filter_by(account_status='pending').all()
        inactive_investors = Investor.query.filter_by(account_status='inactive').all()
        
        total_investors = len(active_investors) + len(pending_investors) + len(inactive_investors)
        total_investment = sum(float(inv.current_investment ) for inv in active_investors)
        total_returns_paid = sum(float(inv.total_returns_received) for inv in active_investors)
        
        # Calculate coverage ratio
        coverage_ratio = float(total_livestock_value) / total_investment if total_investment > 0 else 0
        
        # Get investors due for returns
        today = datetime.utcnow().date()
        due_for_returns = []
        
        for inv in active_investors:
            if inv.next_return_date and inv.next_return_date.date() <= today:
                due_for_returns.append({
                    'id': inv.id,
                    'name': inv.name,
                    'phone': inv.phone,
                    'next_return_date': inv.next_return_date.isoformat(),
                    'expected_return': float(inv.current_investment  * Decimal('0.10')),
                    'total_returns_received': float(inv.total_returns_received)
                })
        
        return jsonify({
            'total_livestock_value': float(total_livestock_value),
            'total_investors': total_investors,
            'active_investors': len(active_investors),
            'pending_investors': len(pending_investors),
            'inactive_investors': len(inactive_investors),
            'total_investment': total_investment,
            'total_returns_paid': total_returns_paid,
            'coverage_ratio': coverage_ratio,
            'due_for_returns': due_for_returns
        }), 200
        
    except Exception as e:
        print(f"Investor stats error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/investors/<int:investor_id>/create-user-account', methods=['POST', 'OPTIONS'])
@jwt_required()
@admin_required
def create_investor_user_account(investor_id):
    """Generate investor user account creation link with proper temporary password"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        investor = db.session.get(Investor, investor_id)
        if not investor:
            return jsonify({'error': 'Investor not found'}), 404
        
        # Check if already has user account
        if investor.user:
            return jsonify({'error': 'Investor already has a user account'}), 400
        
        # Check if account is pending
        if investor.account_status != 'pending':
            return jsonify({'error': 'Investor account is already active or inactive'}), 400
        
        # Parse existing credentials from notes
        notes = investor.notes or ""
        lines = notes.split('\n')
        stored_temp_password = None
        stored_token = None
        stored_link = None
        token_generated_time = None
        
        for line in lines:
            line = line.strip()
            if line.startswith('Temporary Password:'):
                stored_temp_password = line.split(': ', 1)[1] if ': ' in line else None
            elif line.startswith('Registration Token:'):
                stored_token = line.split(': ', 1)[1] if ': ' in line else None
            elif line.startswith('Account Creation Link:'):
                stored_link = line.split(': ', 1)[1] if ': ' in line else None
            elif line.startswith('Token Generated:'):
                try:
                    token_generated_time_str = line.split(': ', 1)[1] if ': ' in line else None
                    if token_generated_time_str:
                        token_generated_time = datetime.strptime(token_generated_time_str, '%Y-%m-%d %H:%M:%S')
                except ValueError:
                    token_generated_time = None
        
        # Check if credentials exist and are less than 24 hours old
        if stored_temp_password and stored_token and stored_link and token_generated_time:
            time_diff = datetime.utcnow() - token_generated_time
            if time_diff.total_seconds() < 24 * 60 * 60:  # 24 hours in seconds
                # Use existing credentials (still valid)
                return jsonify({
                    'success': True,
                    'message': 'Using existing credentials (valid for 24 hours)',
                    'link': stored_link,
                    'temporary_password': stored_temp_password,
                    'investor': {
                        'id': investor.id,
                        'name': investor.name,
                        'phone': investor.phone,
                        'email': investor.email
                    }
                }), 200
        
        # Generate new credentials (either expired or first time)
        import secrets
        import string
        
        # Generate secure temporary password
        random_chars = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(4))
        temp_password = f"inv{investor.id}_{random_chars}"
        token = secrets.token_urlsafe(32)
        
        # Generate the frontend URL
        frontend_url = request.headers.get('Origin', 'http://localhost:5173')
        account_creation_link = f"{frontend_url}/investor/complete-registration/{investor_id}?token={token}"
        
        # Update notes with new credentials and timestamp
        current_time = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        
        # Remove old credential lines if they exist
        lines = notes.split('\n')
        new_lines = []
        for line in lines:
            line = line.strip()
            if not (line.startswith('Temporary Password:') or 
                    line.startswith('Registration Token:') or 
                    line.startswith('Account Creation Link:') or
                    line.startswith('Token Generated:')):
                new_lines.append(line)
        
        # Add new credential lines
        new_lines.append(f'Temporary Password: {temp_password}')
        new_lines.append(f'Registration Token: {token}')
        new_lines.append(f'Account Creation Link: {account_creation_link}')
        new_lines.append(f'Token Generated: {current_time}')
        
        investor.notes = '\n'.join(new_lines)
        
        db.session.commit()
        
        log_audit('investor_account_link_generated', 'investor', investor.id, {
            'name': investor.name,
            'link_generated': True,
            'new_credentials': True
        })
        
        return jsonify({
            'success': True,
            'message': 'New account creation link generated',
            'link': account_creation_link,
            'temporary_password': temp_password,
            'investor': {
                'id': investor.id,
                'name': investor.name,
                'phone': investor.phone,
                'email': investor.email
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Error generating account link: {str(e)}")
        return jsonify({'error': str(e)}), 500

def generate_credentials(investor_id):
    """Generate new temporary password and token."""
    import secrets
    import string
    
    random_chars = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(4))
    temp_password = f"inv{investor_id}_{random_chars}"
    token = secrets.token_urlsafe(32)
    return temp_password, token

def update_notes_with_credentials(notes, temp_password, token):
    """Update notes with new credentials and generation time."""
    # Remove old credential lines
    lines = notes.split('\n')
    new_lines = []
    for line in lines:
        line = line.strip()
        if not (line.startswith('Temporary Password:') or 
                line.startswith('Registration Token:') or 
                line.startswith('Token Generated:')):
            new_lines.append(line)
    
    # Add new credential lines
    new_lines.append(f'Temporary Password: {temp_password}')
    new_lines.append(f'Registration Token: {token}')
    new_lines.append(f'Token Generated: {datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")}')
    
    return '\n'.join(new_lines)

@admin_bp.route('/investors/<int:investor_id>/adjust-investment', methods=['POST', 'OPTIONS'])
@jwt_required()
@admin_required
def adjust_investor_investment(investor_id):
    """Adjust investor's investment amount (top-up or reduction) with SEPARATE tracking for investor transactions"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        data = request.json
        adjustment_type = data.get('adjustment_type')  # 'topup' or 'adjust'
        amount = Decimal(str(data.get('amount')))
        payment_method = data.get('payment_method', 'cash')
        mpesa_reference = data.get('mpesa_reference', '')
        notes = data.get('notes', '')
        
        if not adjustment_type or not amount:
            return jsonify({'error': 'Missing adjustment_type or amount'}), 400
        
        investor = db.session.get(Investor, investor_id)
        if not investor:
            return jsonify({'error': 'Investor not found'}), 404
        
        old_amount = investor.current_investment
        
        if adjustment_type == 'topup':
            if amount <= 0:
                return jsonify({'error': 'Top-up amount must be positive'}), 400

            # DO NOT create transaction in main Transaction table
            # Instead, create an InvestorReturn record for tracking in investor transactions
            investor_return = InvestorReturn(
                investor_id=investor.id,
                amount=amount,
                return_date=datetime.utcnow(),
                payment_method=payment_method,
                mpesa_receipt=mpesa_reference.upper() if payment_method == 'mpesa' else '',
                notes=f"Investment top-up. {notes}",
                status='completed',
                transaction_type='topup'  # Add this field or use notes to distinguish
            )
            db.session.add(investor_return)

            investor.current_investment += amount
            investor.total_topups += amount
            action = 'topped up'
            
        else:  # adjust
            if amount <= 0:
                return jsonify({'error': 'Adjusted amount must be positive'}), 400

            # Calculate the difference
            difference = amount - investor.current_investment

            # Only create investor return record if there's a change
            if difference != 0:
                transaction_type = 'adjustment_up' if difference > 0 else 'adjustment_down'
                investor_return = InvestorReturn(
                    investor_id=investor.id,
                    amount=abs(difference),
                    return_date=datetime.utcnow(),
                    payment_method=payment_method,
                    mpesa_receipt=mpesa_receipt.upper() if payment_method == 'mpesa' else '',
                    notes=f"Investment adjustment from {old_amount} to {amount}. {notes}",
                    status='completed',
                    transaction_type=transaction_type  # Add this field or use notes to distinguish
                )
                db.session.add(investor_return)

            investor.current_investment = amount
            # Recalculate total_topups based on the new current_investment
            investor.total_topups = investor.current_investment - investor.initial_investment
            if investor.total_topups < 0:
                investor.total_topups = Decimal('0')
            action = 'adjusted'
        
        # Update investor's notes
        adjustment_note = f"Investment {action} from {old_amount} to {investor.current_investment}. {notes}"
        if investor.notes:
            investor.notes = f"{investor.notes}\n{adjustment_note}"
        else:
            investor.notes = adjustment_note
        
        db.session.commit()
        
        log_audit('investor_investment_adjusted', 'investor', investor.id, {
            'investor': investor.name,
            'old_amount': float(old_amount),
            'new_amount': float(investor.current_investment),
            'adjustment_type': adjustment_type,
            'difference': float(investor.current_investment - old_amount),
            'payment_method': payment_method,
            'mpesa_reference': mpesa_reference
        })
        
        return jsonify({
            'success': True,
            'message': f'Investment {action} successfully',
            'investor': investor.to_dict(),
            'old_amount': float(old_amount),
            'new_amount': float(investor.current_investment),
            'difference': float(investor.current_investment - old_amount),
            'investor_transaction': investor_return.to_dict() if 'investor_return' in locals() else None
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Error adjusting investor investment: {str(e)}")
        return jsonify({'error': str(e)}), 500
        
@admin_bp.route('/investor-transactions', methods=['GET', 'OPTIONS'])
@jwt_required()
@admin_required
def get_investor_transactions():
    """Get all investor transactions (returns, topups, adjustments, initial investments) - FIXED"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        # Get ALL investor returns including topups and adjustments
        investor_returns = InvestorReturn.query.order_by(InvestorReturn.return_date.desc()).all()
        
        # Get loan disbursements to investors (loans funded by investors)
        investor_loans = Loan.query.filter(
            Loan.funding_source == 'investor',
            Loan.investor_id.isnot(None)
        ).order_by(Loan.disbursement_date.desc()).all()
        
        # Get initial investments (from Investor table)
        investors = Investor.query.all()
        
        transactions_data = []
        
        # Process ALL investor returns (including topups, adjustments, returns)
        for inv_return in investor_returns:
            investor = inv_return.investor
            if not investor:
                continue
            
            # Determine display type based on transaction_type
            display_type = inv_return.transaction_type if inv_return.transaction_type else 'return'
            if display_type == 'return':
                display_type = 'return' if not inv_return.is_early_withdrawal else 'early_withdrawal'
            
            transactions_data.append({
                'id': f"investor_{inv_return.id}",
                'date': inv_return.return_date.isoformat() if inv_return.return_date else None,
                'type': display_type,
                'transaction_type': display_type,
                'investor_id': investor.id,
                'investor_name': investor.name,
                'amount': float(inv_return.amount),
                'method': inv_return.payment_method,
                'payment_method': inv_return.payment_method,
                'mpesa_receipt': inv_return.mpesa_receipt,
                'notes': inv_return.notes,
                'status': inv_return.status,
                'is_early_withdrawal': inv_return.is_early_withdrawal if display_type == 'return' else False,
                'created_at': inv_return.return_date.isoformat() if inv_return.return_date else None
            })
        
        # Process investor-funded loans (disbursements)
        for loan in investor_loans:
            investor = loan.investor
            if not investor:
                continue
                
            transactions_data.append({
                'id': f"loan_{loan.id}",
                'date': loan.disbursement_date.isoformat() if loan.disbursement_date else None,
                'type': 'disbursement',
                'transaction_type': 'disbursement',
                'investor_id': investor.id,
                'investor_name': investor.name,
                'amount': float(loan.principal_amount),
                'method': 'bank',
                'payment_method': 'bank',
                'notes': f'Loan disbursement to {loan.client.full_name if loan.client else "Unknown"}',
                'status': 'completed',
                'created_at': loan.disbursement_date.isoformat() if loan.disbursement_date else None,
                'client_name': loan.client.full_name if loan.client else 'Unknown'
            })
        
        # Add initial investments - FIXED: Use initial_investment instead of initial_amount
        for investor in investors:
            transactions_data.append({
                'id': f"initial_{investor.id}",
                'date': investor.invested_date.isoformat() if investor.invested_date else None,
                'type': 'initial_investment',
                'transaction_type': 'initial_investment',
                'investor_id': investor.id,
                'investor_name': investor.name,
                'amount': float(investor.initial_investment),
                'method': 'bank',
                'payment_method': 'bank',
                'notes': f'Initial investment from {investor.name}',
                'status': 'completed',
                'created_at': investor.invested_date.isoformat() if investor.invested_date else None
            })
        
        # Sort all transactions by date (newest first)
        transactions_data.sort(key=lambda x: (
            x['date'] if x['date'] else '0',
        ), reverse=True)
        
        return jsonify(transactions_data), 200
        
    except Exception as e:
        print(f"Investor transactions error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    
@admin_bp.route('/investors/<int:investor_id>/statement', methods=['GET', 'OPTIONS'])
@jwt_required()
@admin_required
def get_investor_statement(investor_id):
    """Get comprehensive statement for an investor including all transactions - FIXED"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        investor = db.session.get(Investor, investor_id)
        if not investor:
            return jsonify({'error': 'Investor not found'}), 404
        
        # Initialize transactions list
        transactions = []
        
        # 1. Initial investment
        transactions.append({
            'date': investor.invested_date.isoformat() if investor.invested_date else None,
            'type': 'initial_investment',
            'transaction_type': 'initial_investment',
            'description': 'Initial Investment',
            'amount': float(investor.initial_investment),
            'balance': float(investor.initial_investment)
        })
        
        current_balance = investor.initial_investment
        
        # 2. Get all InvestorReturn records (returns, topups, adjustments)
        investor_returns = InvestorReturn.query.filter_by(
            investor_id=investor_id
        ).order_by(InvestorReturn.return_date).all()
        
        for inv_return in investor_returns:
            # Determine transaction type and amount sign
            if inv_return.transaction_type == 'return':
                # Return payment to investor: negative amount (money leaving company)
                amount = -float(inv_return.amount)
                transaction_type = 'return'
                description = f'Return payment - {inv_return.notes}' if inv_return.notes else 'Return payment'
            elif inv_return.transaction_type in ['topup', 'adjustment_up']:
                # Top-up or adjustment up: positive amount (money coming in)
                amount = float(inv_return.amount)
                transaction_type = 'topup' if inv_return.transaction_type == 'topup' else 'adjustment'
                description = f'Investment {inv_return.transaction_type} - {inv_return.notes}' if inv_return.notes else f'Investment {inv_return.transaction_type}'
            elif inv_return.transaction_type == 'adjustment_down':
                # Adjustment down: negative amount (money leaving)
                amount = -float(inv_return.amount)
                transaction_type = 'adjustment'
                description = f'Investment adjustment (decrease) - {inv_return.notes}' if inv_return.notes else 'Investment adjustment (decrease)'
            else:
                # Default to return
                amount = -float(inv_return.amount)
                transaction_type = 'return'
                description = inv_return.notes if inv_return.notes else 'Return payment'
            
            current_balance += amount
            transactions.append({
                'date': inv_return.return_date.isoformat() if inv_return.return_date else None,
                'type': transaction_type,
                'transaction_type': transaction_type,
                'description': description,
                'amount': amount,
                'balance': float(current_balance),
                'method': inv_return.payment_method,
                'mpesa_receipt': inv_return.mpesa_receipt,
                'notes': inv_return.notes
            })
        
        # 3. Get loan disbursements funded by this investor
        funded_loans = Loan.query.filter_by(
            investor_id=investor_id,
            funding_source='investor'
        ).order_by(Loan.disbursement_date).all()
        
        for loan in funded_loans:
            amount = -float(loan.principal_amount)  # Negative: money going out for loan
            current_balance += amount
            
            # Calculate principal recovered from this loan
            principal_recovered = float(loan.principal_paid or 0)
            
            transactions.append({
                'date': loan.disbursement_date.isoformat() if loan.disbursement_date else None,
                'type': 'disbursement',
                'transaction_type': 'disbursement',
                'description': f'Loan to {loan.client.full_name if loan.client else "Unknown"}',
                'amount': amount,
                'balance': float(current_balance),
                'method': 'bank',
                'notes': f'Loan disbursement. Principal recovered: {principal_recovered}'
            })
        
        # 4. Also get any transactions from Transaction table related to this investor
        # (for backwards compatibility)
        investment_txns = Transaction.query.filter(
            Transaction.investor_id == investor_id,
            Transaction.transaction_type.in_(['investor_topup', 'investor_adjustment'])
        ).order_by(Transaction.created_at).all()
        
        for txn in investment_txns:
            if txn.transaction_type == 'investor_adjustment':
                # Check if it's up or down adjustment
                if txn.amount > 0:
                    amount = float(txn.amount)
                    description = 'Investment adjustment (increase)'
                else:
                    amount = float(txn.amount)
                    description = 'Investment adjustment (decrease)'
            else:
                amount = float(txn.amount)
                description = 'Investment top-up'
            
            current_balance += amount
            transactions.append({
                'date': txn.created_at.isoformat() if txn.created_at else None,
                'type': 'topup' if txn.transaction_type == 'investor_topup' else 'adjustment',
                'transaction_type': txn.transaction_type,
                'description': description,
                'amount': amount,
                'balance': float(current_balance),
                'method': txn.payment_method,
                'mpesa_receipt': txn.mpesa_receipt,
                'notes': txn.notes
            })
        
        # Sort all transactions by date
        transactions.sort(key=lambda x: x['date'] if x['date'] else '0')
        
        # Calculate summary
        total_invested = investor.initial_investment
        
        # Add topups and adjustments from investor returns
        for inv_return in investor_returns:
            if inv_return.transaction_type in ['topup', 'adjustment_up']:
                total_invested += inv_return.amount
            elif inv_return.transaction_type == 'adjustment_down':
                total_invested -= inv_return.amount
        
        # Add from Transaction table (backwards compatibility)
        for txn in investment_txns:
            if txn.transaction_type in ['investor_topup', 'investor_adjustment']:
                if txn.amount > 0:
                    total_invested += txn.amount
                else:
                    total_invested -= abs(txn.amount)
        
        total_returns = sum(float(r.amount) for r in investor_returns if r.transaction_type == 'return')
        total_disbursed = sum(float(l.principal_amount) for l in funded_loans)
        
        return jsonify({
            'success': True,
            'investor': investor.to_dict(),
            'transactions': transactions,
            'summary': {
                'total_invested': float(total_invested),
                'total_returns_paid': float(total_returns),
                'total_amount_disbursed': float(total_disbursed),
                'current_balance': float(current_balance),
                'available_for_investment': float(total_invested - total_disbursed),
                'total_loans_funded': len(funded_loans)
            }
        }), 200
        
    except Exception as e:
        print(f"Investor statement error: {str(e)}")
        return jsonify({'error': str(e)}), 500