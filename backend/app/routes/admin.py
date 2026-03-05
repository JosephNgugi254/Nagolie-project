from flask import Blueprint, request, jsonify
from flask_cors import CORS, cross_origin
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
from decimal import Decimal
from app import db
from app.models import Client, Loan, Livestock, Transaction, User, Investor, InvestorReturn
from app.utils.security import admin_required, log_audit
from sqlalchemy.orm import selectinload
from sqlalchemy import and_, or_, func , text
from app.routes.payments import recalculate_loan
import json
import secrets
import string

admin_bp = Blueprint('admin', __name__)

# Define allowed origins for CORS (applies to all routes in this blueprint)
allowed_origins = [
    'http://localhost:5173',
    'https://www.nagolie.com',
    'https://nagolie.com'
]

# Apply CORS to the blueprint (handles preflight and adds appropriate headers)
CORS(admin_bp, origins=allowed_origins, supports_credentials=True)

# -------------------------------------------------------------------
# Helper Functions
# -------------------------------------------------------------------
def format_currency(amount):
    return f"KES {float(amount):,.2f}"

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
    
    if count == 1:
        if livestock_type in singular_forms:
            singular = singular_forms[livestock_type]
            return f"{singular.capitalize()} available for purchase"
        elif livestock_type.endswith('s') and not livestock_type.endswith('ss'):
            singular = livestock_type[:-1]
            return f"{singular.capitalize()} available for purchase"
        else:
            return f"{livestock_type.capitalize()} available for purchase"
    else:
        if livestock_type in ['sheep', 'deer', 'fish', 'cattle']:
            return f"{livestock_type.capitalize()} available for purchase"
        elif not livestock_type.endswith('s'):
            return f"{livestock_type.capitalize()}s available for purchase"
        else:
            return f"{livestock_type.capitalize()} available for purchase"

def calculate_investor_lent_amount(investor_id):
    lent_amount = db.session.query(db.func.sum(Loan.principal_amount)).filter(
        Loan.investor_id == investor_id,
        Loan.funding_source == 'investor',
        Loan.status.in_(['active', 'completed'])
    ).scalar() or 0
    return lent_amount

def calculate_investor_return_amount(investor, period_end_date):
    if investor.last_return_date:
        period_start = investor.last_return_date
    else:
        period_start = investor.invested_date
    
    lent_amount_in_period = db.session.query(db.func.sum(Loan.principal_amount)).filter(
        Loan.investor_id == investor.id,
        Loan.funding_source == 'investor',
        Loan.disbursement_date >= period_start,
        Loan.disbursement_date <= period_end_date,
        Loan.status.in_(['active', 'completed'])
    ).scalar() or 0
    
    return_amount = lent_amount_in_period * Decimal('0.10')
    return return_amount

def generate_credentials(investor_id):
    random_chars = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(4))
    temp_password = f"inv{investor_id}_{random_chars}"
    token = secrets.token_urlsafe(32)
    return temp_password, token

def update_notes_with_credentials(notes, temp_password, token):
    lines = notes.split('\n')
    new_lines = []
    for line in lines:
        line = line.strip()
        if not (line.startswith('Temporary Password:') or 
                line.startswith('Registration Token:') or 
                line.startswith('Token Generated:')):
            new_lines.append(line)
    new_lines.append(f'Temporary Password: {temp_password}')
    new_lines.append(f'Registration Token: {token}')
    new_lines.append(f'Token Generated: {datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")}')
    return '\n'.join(new_lines)

# -------------------------------------------------------------------
# Test endpoint
# -------------------------------------------------------------------
@admin_bp.route('/test', methods=['GET'])
@jwt_required()
def test_endpoint():
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

# -------------------------------------------------------------------
# Applications (pending loans)
# -------------------------------------------------------------------
@admin_bp.route('/applications', methods=['GET'])
@jwt_required()
@admin_required
def get_applications():
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

# -------------------------------------------------------------------
# Approve application
# -------------------------------------------------------------------
@admin_bp.route('/applications/<int:loan_id>/approve', methods=['POST'])
@jwt_required()
@admin_required
def approve_application(loan_id):
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

        # Added initialization of new interest tracking fields
        loan.accrued_interest = Decimal('0')
        loan.last_interest_payment_date = datetime.utcnow()

        loan.funding_source = funding_source
        if funding_source == 'investor' and investor:
            loan.investor_id = investor.id
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

# -------------------------------------------------------------------
# Reject application
# -------------------------------------------------------------------
@admin_bp.route('/applications/<int:loan_id>/reject', methods=['POST'])
@jwt_required()
@admin_required
def reject_application(loan_id):
    try:
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan application not found'}), 404
        if loan.status != 'pending':
            return jsonify({'error': 'Loan application already processed'}), 400
        loan.status = 'rejected'
        if loan.livestock:
            loan.livestock.status = 'inactive'
        db.session.commit()
        log_audit('loan_rejected', 'loan', loan.id, {
            'client': loan.client.full_name if loan.client else 'Unknown',
            'amount': float(loan.principal_amount)
        })
        return jsonify({'success': True, 'message': 'Loan application rejected'}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error rejecting application: {str(e)}")
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------------
# Livestock (admin only) - Paginated
# -------------------------------------------------------------------
@admin_bp.route('/livestock', methods=['GET'])
@jwt_required()
@admin_required
def get_all_livestock():
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)

        # Base query with eager loading
        base_query = Livestock.query.options(
            selectinload(Livestock.client),
            selectinload(Livestock.loan),
            selectinload(Livestock.investor)
        ).filter_by(status='active')

        # Paginate
        pagination = base_query.paginate(page=page, per_page=per_page, error_out=False)
        livestock_items = pagination.items

        livestock_data = []
        today = datetime.now().date()

        for item in livestock_items:
            description = item.description or 'Available for purchase'
            actual_location = item.location or 'Isinya, Kajiado'
            ownership_type = item.ownership_type or 'company'
            investor_name = None
            if item.investor:
                investor_name = item.investor.name

            if item.client_id is None:
                available_info = 'Available now'
                days_remaining = 0
                is_admin_added = True
            else:
                client_loan = None
                if hasattr(item, 'loan') and item.loan:
                    if isinstance(item.loan, list):
                        active_loans = [loan for loan in item.loan if loan.status == 'active']
                        client_loan = active_loans[0] if active_loans else None
                    elif hasattr(item.loan, 'status') and item.loan.status == 'active':
                        client_loan = item.loan
                if not client_loan:
                    client_loan = Loan.query.filter_by(livestock_id=item.id, status='active').first()
                if not client_loan:
                    continue  # skip if no active loan (should not happen for client-owned)
                client_name = item.client.full_name if item.client else 'Unknown'
                description = f"Collateral for {client_name}'s loan"
                is_admin_added = False
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

        return jsonify({
            'items': livestock_data,
            'total': pagination.total,
            'pages': pagination.pages,
            'current_page': page,
            'per_page': per_page
        }), 200

    except Exception as e:
        print(f"Livestock error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
# -------------------------------------------------------------------
# Public livestock gallery (allows any origin)
# -------------------------------------------------------------------
@admin_bp.route('/livestock/gallery', methods=['GET'])
@cross_origin(origins="*")
def get_public_livestock_gallery():
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 12, type=int)
        livestock = Livestock.query.filter(Livestock.status == 'active').all()
        livestock_data = []
        today = datetime.now().date()
        for item in livestock:
            description = item.description
            if not description or description == 'NaN' or description == 'None' or str(description).strip() == '':
                description = 'Livestock for purchase'
            description = str(description)
            if 'claimed' in description.lower():
                description = 'Livestock for purchase'
            if '|' in description:
                parts = description.split('|', 1)
                description = parts[0].strip()
            actual_location = item.location
            if not actual_location or actual_location == 'NaN' or actual_location == 'None' or str(actual_location).strip() == '':
                actual_location = 'Isinya, Kajiado'
            actual_location = str(actual_location)
            if '|' in actual_location:
                parts = actual_location.split('|', 1)
                part1 = parts[0].strip()
                part2 = parts[1].strip() if len(parts) > 1 else ''
                location_keywords = ['isinya', 'kajiado', 'town', 'county', 'moonlight', 'kwa', 'timo', 'naresho']
                if any(keyword in part2.lower() for keyword in location_keywords):
                    actual_location = part2
                elif any(keyword in part1.lower() for keyword in location_keywords):
                    actual_location = part1
                else:
                    actual_location = 'Isinya, Kajiado'
            if 'available' in actual_location.lower() or 'claimed' in actual_location.lower():
                actual_location = 'Isinya, Kajiado'
            if not description or description.strip() == '':
                description = 'Livestock for purchase'
            if not actual_location or actual_location.strip() == '':
                actual_location = 'Isinya, Kajiado'
            should_include = False
            available_info = 'Available now'
            days_remaining = 0
            if item.client_id is None:
                should_include = True
            else:
                associated_loan = Loan.query.filter_by(livestock_id=item.id).order_by(Loan.created_at.desc()).first()
                if not associated_loan:
                    continue
                loan_status = associated_loan.status
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
        livestock_data.sort(key=lambda x: (
            0 if 'now' in x['availableInfo'].lower() else 1,
            x['daysRemaining']
        ))
        total = len(livestock_data)
        start = (page - 1) * per_page
        end = start + per_page
        paginated_items = livestock_data[start:end]
        return jsonify({
            'items': paginated_items,
            'total': total,
            'pages': (total + per_page - 1) // per_page,
            'current_page': page,
            'per_page': per_page
        }), 200
    except Exception as e:
        print(f"Livestock gallery error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to load gallery'}), 500

# -------------------------------------------------------------------
# Transactions
# -------------------------------------------------------------------
@admin_bp.route('/transactions', methods=['GET'])
@jwt_required()
@admin_required
def get_all_transactions():
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
                'payment_type': txn.payment_type,
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

# -------------------------------------------------------------------
# Add new livestock with cloudinary
# -------------------------------------------------------------------
@admin_bp.route('/livestock', methods=['POST'])
@jwt_required()
@admin_required
def add_livestock():
    try:
        data = request.json
        description = data.get('description', '').strip()
        if not description:
            livestock_type = data.get('type', '').capitalize()
            count = data.get('count', 1)
            description = generate_livestock_description(livestock_type, count)

        # Upload images to Cloudinary
        image_urls = []
        if data.get('images'):
            from app.utils.cloudinary_upload import upload_base64_image
            for img in data['images']:
                try:
                    url = upload_base64_image(img, folder='livestock')
                    image_urls.append(url)
                except Exception as e:
                    print(f"Failed to upload image: {str(e)}")
                    # Continue with other images, or return error if you prefer
                    continue

        livestock = Livestock(
            client_id=None,
            livestock_type=data['type'],
            count=data['count'],
            estimated_value=Decimal(str(data['price'])),
            description=description,
            location=data.get('location', 'Isinya, Kajiado'),
            photos=image_urls,          # Store URLs, not base64
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

# -------------------------------------------------------------------
# Update livestock with new cloudinary image handling
# -------------------------------------------------------------------
@admin_bp.route('/livestock/<int:livestock_id>', methods=['PUT'])
@jwt_required()
@admin_required
def update_livestock(livestock_id):
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

        # Handle images
        if 'images' in data:
            image_urls = []
            from app.utils.cloudinary_upload import upload_base64_image
            for img in data['images']:
                # If it's already a URL (starts with http), keep it
                if isinstance(img, str) and (img.startswith('http://') or img.startswith('https://')):
                    image_urls.append(img)
                else:
                    # Assume it's a base64 string, upload to Cloudinary
                    try:
                        url = upload_base64_image(img, folder='livestock')
                        image_urls.append(url)
                    except Exception as e:
                        print(f"Failed to upload image during update: {str(e)}")
                        # Optionally skip this image
                        continue
            livestock.photos = image_urls

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

# -------------------------------------------------------------------
# Delete livestock
# -------------------------------------------------------------------
@admin_bp.route('/livestock/<int:livestock_id>', methods=['DELETE'])
@jwt_required()
@admin_required
def delete_livestock(livestock_id):
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
        return jsonify({'success': True, 'message': 'Livestock deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting livestock: {str(e)}")
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------------
# Send reminder (SMS) - placeholder
# -------------------------------------------------------------------
@admin_bp.route('/send-reminder', methods=['POST'])
@jwt_required()
@admin_required
def send_reminder():
    try:
        data = request.json
        client_id = data.get('client_id')
        phone = data.get('phone')
        message = data.get('message')
        print(f"Received SMS request - Client ID: {client_id}, Phone: {phone}")
        if not phone or not message:
            return jsonify({'success': False, 'error': 'Phone number and message are required'}), 400
        return jsonify({'success': False, 'error': 'SMS service is not configured'}), 500
    except Exception as e:
        print(f"Error in send_reminder route: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

# -------------------------------------------------------------------
# Claim ownership
# -------------------------------------------------------------------
@admin_bp.route('/claim-ownership', methods=['POST'])
@jwt_required()
@admin_required
def claim_ownership():
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
        client_location = 'Isinya, Kajiado'
        if livestock.client and livestock.client.location:
            client_location = livestock.client.location
        livestock.description = 'Livestock for purchase'
        livestock.location = client_location
        livestock.status = 'active'
        livestock.client_id = None
        loan.status = 'claimed'
        loan.balance = 0
        loan.amount_paid = loan.total_amount
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

# -------------------------------------------------------------------
# Loan top-up/adjustment
# -------------------------------------------------------------------
@admin_bp.route('/loans/<int:loan_id>/topup', methods=['POST'])
@jwt_required()
@admin_required
def process_topup(loan_id):
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

# -------------------------------------------------------------------
# Approved loans
# -------------------------------------------------------------------
@admin_bp.route('/approved-loans', methods=['GET'])
@jwt_required()
@admin_required
def get_approved_loans():
    try:
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

# -------------------------------------------------------------------
# Dashboard statistics
# -------------------------------------------------------------------
@admin_bp.route('/dashboard', methods=['GET'])
@jwt_required()
@admin_required
def get_dashboard_stats():
    try:
        total_clients = db.session.query(Client).join(Loan).filter(
            Loan.status.in_(['active', 'completed'])
        ).distinct().count()
        total_lent = db.session.query(db.func.sum(Loan.principal_amount)).filter(
            Loan.status.in_(['active', 'completed'])
        ).scalar() or 0
        total_lent_float = float(total_lent) if total_lent else 0.0
        KNOWN_INFLATION_AMOUNT = 30500
        total_lent_adjusted = total_lent_float - KNOWN_INFLATION_AMOUNT if total_lent_float > KNOWN_INFLATION_AMOUNT else total_lent_float
        if total_lent_adjusted < 0:
            total_lent_adjusted = 0
        total_received = db.session.query(db.func.sum(Loan.amount_paid)).filter(
            Loan.status.in_(['active', 'completed'])
        ).scalar() or 0
        total_principal_paid = db.session.query(db.func.sum(Loan.principal_paid)).filter(
            Loan.status.in_(['active', 'completed'])
        ).scalar() or 0
        currently_lent = db.session.query(db.func.sum(Loan.current_principal)).filter(
            Loan.status == 'active'
        ).scalar() or 0
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
            loan = recalculate_loan(loan)
            if loan.due_date:
                due_date_value = loan.due_date
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

# -------------------------------------------------------------------
# Payment statistics
# -------------------------------------------------------------------
@admin_bp.route('/payment-stats', methods=['GET'])
@jwt_required()
@admin_required
def get_payment_stats():
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
        currently_lent = db.session.query(db.func.sum(Loan.current_principal)).filter(
            Loan.status == 'active'
        ).scalar() or 0
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

# -------------------------------------------------------------------
# Clients
# -------------------------------------------------------------------
@admin_bp.route('/clients', methods=['GET'])
@jwt_required()
@admin_required
def get_all_clients():
    try:
        from app.routes.payments import recalculate_loan
        clients_with_loans = db.session.query(Client).join(Loan).filter(
            Loan.status == 'active'
        ).distinct().all()
        clients_data = []
        for client in clients_with_loans:
            active_loan = Loan.query.filter_by(client_id=client.id, status='active').first()
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

# -------------------------------------------------------------------
# Investors - GET, POST
# -------------------------------------------------------------------
@admin_bp.route('/investors', methods=['GET', 'POST'])
@jwt_required()
@admin_required
def manage_investors():
    if request.method == 'GET':
        try:
            investors = Investor.query.all()
            investor_data = []
            for investor in investors:
                total_lent = db.session.query(db.func.sum(Loan.principal_amount)).filter(
                    Loan.investor_id == investor.id,
                    Loan.funding_source == 'investor',
                    Loan.status.in_(['active', 'completed'])
                ).scalar() or Decimal('0')
                available_balance = investor.current_investment - total_lent
                if available_balance < Decimal('0'):
                    available_balance = Decimal('0')
                investor_dict = investor.to_dict()
                investor_dict['total_lent_amount'] = float(total_lent)
                investor_dict['available_balance'] = float(available_balance)
                investor_dict['investment_amount'] = float(investor.current_investment)
                investor_data.append(investor_dict)
            return jsonify(investor_data), 200
        except Exception as e:
            print(f"Error fetching investors: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    if request.method == 'POST':
        try:
            data = request.json
            required_fields = ['name', 'phone', 'id_number', 'investment_amount']
            for field in required_fields:
                if not data.get(field):
                    return jsonify({'error': f'Missing required field: {field}'}), 400
            existing_investor = Investor.query.filter(
                (Investor.phone == data['phone']) |
                (Investor.id_number == data['id_number'])
            ).first()
            if existing_investor:
                return jsonify({'error': 'Investor with this phone or ID number already exists'}), 400
            current_time = datetime.utcnow()
            investor = Investor(
                name=data['name'],
                phone=data['phone'],
                id_number=data['id_number'],
                email=data.get('email', None),
                initial_investment=Decimal(str(data['investment_amount'])),
                current_investment=Decimal(str(data['investment_amount'])),
                invested_date=current_time,
                expected_return_date=current_time + timedelta(days=35),
                next_return_date=current_time + timedelta(days=35),
                account_status='pending',
                notes=data.get('notes', '')
            )
            db.session.add(investor)
            db.session.flush()
            temp_password, token = generate_credentials(investor.id)
            frontend_url = request.headers.get('Origin', 'http://localhost:5173')
            account_creation_link = f"{frontend_url}/investor/complete-registration/{investor.id}?token={token}"
            investor.notes = (
                f"Temporary Password: {temp_password}\n"
                f"Registration Token: {token}\n"
                f"Account Creation Link: {account_creation_link}\n"
                f"Token Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}\n"
                f"{investor.notes or ''}"
            )
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

# -------------------------------------------------------------------
# Single investor operations (GET, PUT, DELETE)
# -------------------------------------------------------------------
@admin_bp.route('/investors/<int:investor_id>', methods=['GET', 'PUT', 'DELETE'])
@jwt_required()
@admin_required
def manage_investor(investor_id):
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
            allowed_fields = ['name', 'phone', 'email', 'account_status', 'notes']
            for field in allowed_fields:
                if field in data:
                    setattr(investor, field, data[field])
            if 'account_status' in data and investor.user:
                investor.user.is_active = (data['account_status'] == 'active')
            db.session.commit()
            log_audit('investor_updated', 'investor', investor.id, {
                'fields_updated': [field for field in allowed_fields if field in data],
                'status': investor.account_status
            })
            return jsonify({'success': True, 'message': 'Investor updated successfully', 'investor': investor.to_dict()}), 200
        except Exception as e:
            db.session.rollback()
            print(f"Error updating investor: {str(e)}")
            return jsonify({'error': str(e)}), 500

    elif request.method == 'DELETE':
        try:
            print(f"DEBUG: Starting delete for investor ID: {investor_id}")
            investor = Investor.query.options(db.joinedload(Investor.user)).get(investor_id)
            if not investor:
                return jsonify({'error': 'Investor not found'}), 404
    
            investor_name = investor.name
            user_id = investor.user.id if investor.user else None
            print(f"DEBUG: Investor: {investor_name}, User ID: {user_id}")
    
            # Delete related investor returns
            InvestorReturn.query.filter_by(investor_id=investor.id).delete()
            print(f"DEBUG: Deleted investor returns")
    
            # Delete the investor
            db.session.delete(investor)
            print(f"DEBUG: Investor marked for deletion")
    
            # Delete the associated user (if any) – no need to update transactions
            if investor.user:
                print(f"DEBUG: Attempting to delete user {user_id}")
                db.session.delete(investor.user)
                print(f"DEBUG: User marked for deletion")
    
            db.session.commit()
            print(f"DEBUG: Transaction committed successfully")
            return jsonify({'success': True, 'message': 'Investor deleted successfully'}), 200
    
        except Exception as e:
            db.session.rollback()
            print(f"DEBUG: Error in transaction: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------------
# Investor return calculation
# -------------------------------------------------------------------
@admin_bp.route('/investors/<int:investor_id>/calculate-return', methods=['GET'])
@jwt_required()
@admin_required
def calculate_investor_return(investor_id):
    try:
        investor = db.session.get(Investor, investor_id)
        if not investor:
            return jsonify({'error': 'Investor not found'}), 404
        return_amount = investor.current_investment * Decimal('0.40')
        is_early_withdrawal = request.args.get('early_withdrawal', 'false').lower() == 'true'
        if is_early_withdrawal:
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
            'can_process_return': datetime.now().date() >= investor.next_return_date.date() if investor.next_return_date else False
        }), 200
    except Exception as e:
        print(f"Error calculating investor return: {str(e)}")
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------------
# Process investor return
# -------------------------------------------------------------------
@admin_bp.route('/investors/<int:investor_id>/process-return', methods=['POST'])
@jwt_required()
@admin_required
def process_investor_return(investor_id):
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
        is_early_withdrawal = data.get('is_early_withdrawal', False)
        current_date = datetime.utcnow()
        return_amount = investor.current_investment * Decimal('0.40')
        if is_early_withdrawal:
            fee_amount = return_amount * Decimal('0.15')
            return_amount = return_amount - fee_amount
            notes = f"Early withdrawal with 15% fee applied. {notes}"
        if return_amount <= 0:
            return jsonify({'success': False, 'message': 'Invalid return amount calculation.'}), 400
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
        investor.total_returns_received += return_amount
        investor.last_return_date = current_date
        if investor.total_returns_received - return_amount <= 0:
            investor.next_return_date = current_date + timedelta(days=28)
        else:
            investor.next_return_date = current_date + timedelta(days=28)
        db.session.add(investor_return)
        db.session.commit()
        log_audit('investor_return_processed', 'investor_return', investor_return.id, {
            'investor': investor.name,
            'return_amount': float(return_amount),
            'is_early_withdrawal': is_early_withdrawal,
            'investment_amount': float(investor.current_investment),
            'payment_method': payment_method
        })
        return jsonify({
            'success': True,
            'message': f'Return of {format_currency(return_amount)} processed successfully',
            'return': investor_return.to_dict(),
            'investor': investor.to_dict(),
            'calculated_based_on': {
                'investment_amount': float(investor.current_investment),
                'return_percentage': '40%',
                'is_early_withdrawal': is_early_withdrawal,
                'next_return_date': investor.next_return_date.isoformat()
            }
        }), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error processing investor return: {str(e)}")
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------------
# Investor stats
# -------------------------------------------------------------------
@admin_bp.route('/investors/stats', methods=['GET'])
@jwt_required()
@admin_required
def get_investor_stats():
    try:
        total_livestock_value = db.session.query(db.func.sum(Livestock.estimated_value)).filter(
            Livestock.status == 'active'
        ).scalar() or 0
        active_investors = Investor.query.filter_by(account_status='active').all()
        pending_investors = Investor.query.filter_by(account_status='pending').all()
        inactive_investors = Investor.query.filter_by(account_status='inactive').all()
        total_investors = len(active_investors) + len(pending_investors) + len(inactive_investors)
        total_investment = sum(float(inv.current_investment) for inv in active_investors)
        total_returns_paid = sum(float(inv.total_returns_received) for inv in active_investors)
        coverage_ratio = float(total_livestock_value) / total_investment if total_investment > 0 else 0
        today = datetime.utcnow().date()
        due_for_returns = []
        for inv in active_investors:
            if inv.next_return_date and inv.next_return_date.date() <= today:
                due_for_returns.append({
                    'id': inv.id,
                    'name': inv.name,
                    'phone': inv.phone,
                    'next_return_date': inv.next_return_date.isoformat(),
                    'expected_return': float(inv.current_investment * Decimal('0.10')),
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

# -------------------------------------------------------------------
# Create investor user account link
# -------------------------------------------------------------------
@admin_bp.route('/investors/<int:investor_id>/create-user-account', methods=['POST'])
@jwt_required()
@admin_required
def create_investor_user_account(investor_id):
    try:
        investor = db.session.get(Investor, investor_id)
        if not investor:
            return jsonify({'error': 'Investor not found'}), 404
        if investor.user:
            return jsonify({'error': 'Investor already has a user account'}), 400
        if investor.account_status != 'pending':
            return jsonify({'error': 'Investor account is already active or inactive'}), 400
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
        if stored_temp_password and stored_token and stored_link and token_generated_time:
            time_diff = datetime.utcnow() - token_generated_time
            if time_diff.total_seconds() < 24 * 60 * 60:
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
        temp_password, token = generate_credentials(investor.id)
        frontend_url = request.headers.get('Origin', 'http://localhost:5173')
        account_creation_link = f"{frontend_url}/investor/complete-registration/{investor_id}?token={token}"
        current_time_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        lines = notes.split('\n')
        new_lines = []
        for line in lines:
            line = line.strip()
            if not (line.startswith('Temporary Password:') or 
                    line.startswith('Registration Token:') or 
                    line.startswith('Account Creation Link:') or
                    line.startswith('Token Generated:')):
                new_lines.append(line)
        new_lines.append(f'Temporary Password: {temp_password}')
        new_lines.append(f'Registration Token: {token}')
        new_lines.append(f'Account Creation Link: {account_creation_link}')
        new_lines.append(f'Token Generated: {current_time_str}')
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

# -------------------------------------------------------------------
# Adjust investor investment
# -------------------------------------------------------------------
@admin_bp.route('/investors/<int:investor_id>/adjust-investment', methods=['POST'])
@jwt_required()
@admin_required
def adjust_investor_investment(investor_id):
    try:
        data = request.json
        adjustment_type = data.get('adjustment_type')
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
            investor_return = InvestorReturn(
                investor_id=investor.id,
                amount=amount,
                return_date=datetime.utcnow(),
                payment_method=payment_method,
                mpesa_receipt=mpesa_reference.upper() if payment_method == 'mpesa' else '',
                notes=f"Investment top-up. {notes}",
                status='completed',
                transaction_type='topup'
            )
            db.session.add(investor_return)
            investor.current_investment += amount
            investor.total_topups += amount
            action = 'topped up'
        else:
            if amount <= 0:
                return jsonify({'error': 'Adjusted amount must be positive'}), 400
            difference = amount - investor.current_investment
            if difference != 0:
                transaction_type = 'adjustment_up' if difference > 0 else 'adjustment_down'
                investor_return = InvestorReturn(
                    investor_id=investor.id,
                    amount=abs(difference),
                    return_date=datetime.utcnow(),
                    payment_method=payment_method,
                    mpesa_receipt=mpesa_reference.upper() if payment_method == 'mpesa' else '',
                    notes=f"Investment adjustment from {old_amount} to {amount}. {notes}",
                    status='completed',
                    transaction_type=transaction_type
                )
                db.session.add(investor_return)
            investor.current_investment = amount
            investor.total_topups = investor.current_investment - investor.initial_investment
            if investor.total_topups < 0:
                investor.total_topups = Decimal('0')
            action = 'adjusted'
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

# -------------------------------------------------------------------
# Investor transactions (returns, topups, adjustments, initial)
# -------------------------------------------------------------------
@admin_bp.route('/investor-transactions', methods=['GET'])
@jwt_required()
@admin_required
def get_investor_transactions():
    try:
        investor_returns = InvestorReturn.query.order_by(InvestorReturn.return_date.desc()).all()
        investor_loans = Loan.query.filter(
            Loan.funding_source == 'investor',
            Loan.investor_id.isnot(None)
        ).order_by(Loan.disbursement_date.desc()).all()
        investors = Investor.query.all()
        transactions_data = []
        for inv_return in investor_returns:
            investor = inv_return.investor
            if not investor:
                continue
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
        transactions_data.sort(key=lambda x: (x['date'] if x['date'] else '0'), reverse=True)
        return jsonify(transactions_data), 200
    except Exception as e:
        print(f"Investor transactions error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------------
# Investor statement
# -------------------------------------------------------------------
@admin_bp.route('/investors/<int:investor_id>/statement', methods=['GET'])
@jwt_required()
@admin_required
def get_investor_statement(investor_id):
    try:
        investor = db.session.get(Investor, investor_id)
        if not investor:
            return jsonify({'error': 'Investor not found'}), 404
        transactions = []
        transactions.append({
            'date': investor.invested_date.isoformat() if investor.invested_date else None,
            'type': 'initial_investment',
            'transaction_type': 'initial_investment',
            'description': 'Initial Investment',
            'amount': float(investor.initial_investment),
            'balance': float(investor.initial_investment)
        })
        current_balance = investor.initial_investment
        investor_returns = InvestorReturn.query.filter_by(investor_id=investor_id).order_by(InvestorReturn.return_date).all()
        for inv_return in investor_returns:
            if inv_return.transaction_type == 'return':
                amount = -float(inv_return.amount)
                transaction_type = 'return'
                description = f'Return payment - {inv_return.notes}' if inv_return.notes else 'Return payment'
            elif inv_return.transaction_type in ['topup', 'adjustment_up']:
                amount = float(inv_return.amount)
                transaction_type = 'topup' if inv_return.transaction_type == 'topup' else 'adjustment'
                description = f'Investment {inv_return.transaction_type} - {inv_return.notes}' if inv_return.notes else f'Investment {inv_return.transaction_type}'
            elif inv_return.transaction_type == 'adjustment_down':
                amount = -float(inv_return.amount)
                transaction_type = 'adjustment'
                description = f'Investment adjustment (decrease) - {inv_return.notes}' if inv_return.notes else 'Investment adjustment (decrease)'
            else:
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
        funded_loans = Loan.query.filter_by(investor_id=investor_id, funding_source='investor').order_by(Loan.disbursement_date).all()
        for loan in funded_loans:
            amount = -float(loan.principal_amount)
            current_balance += amount
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
        investment_txns = Transaction.query.filter(
            Transaction.investor_id == investor_id,
            Transaction.transaction_type.in_(['investor_topup', 'investor_adjustment'])
        ).order_by(Transaction.created_at).all()
        for txn in investment_txns:
            if txn.transaction_type == 'investor_adjustment':
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
        transactions.sort(key=lambda x: x['date'] if x['date'] else '0')
        total_invested = investor.initial_investment
        for inv_return in investor_returns:
            if inv_return.transaction_type in ['topup', 'adjustment_up']:
                total_invested += inv_return.amount
            elif inv_return.transaction_type == 'adjustment_down':
                total_invested -= inv_return.amount
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