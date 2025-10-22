from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from marshmallow import ValidationError
from datetime import datetime, timedelta  
from decimal import Decimal
from app import db
from app.models import Loan, Client, Transaction, Livestock  
from app.schemas.loan_schema import LoanApplicationSchema
from app.utils.security import log_audit, admin_required  

loans_bp = Blueprint('loans', __name__)

@loans_bp.route('', methods=['GET'])
@jwt_required()
def get_loans():
    """Get all loans with optional filters"""
    status = request.args.get('status')
    client_id = request.args.get('client_id')
    
    query = Loan.query
    
    if status:
        query = query.filter_by(status=status)
    if client_id:
        query = query.filter_by(client_id=client_id)
    
    loans = query.order_by(Loan.created_at.desc()).all()
    return jsonify([loan.to_dict() for loan in loans]), 200

@loans_bp.route('/<int:loan_id>', methods=['GET'])
@jwt_required()
def get_loan(loan_id):
    """Get loan details"""
    loan = db.session.get(Loan, loan_id)
    
    if not loan:
        return jsonify({'error': 'Loan not found'}), 404
    
    loan_data = loan.to_dict()
    loan_data['transactions'] = [txn.to_dict() for txn in loan.transactions.all()]
    loan_data['client'] = loan.client.to_dict()
    
    return jsonify(loan_data), 200

@loans_bp.route('', methods=['POST'])
@jwt_required()
def create_loan():
    """Create new loan"""
    schema = LoanApplicationSchema()
    
    try:
        data = schema.load(request.json)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400
    
    # Verify client exists
    client = db.session.get(Client, data['client_id'])
    if not client:
        return jsonify({'error': 'Client not found'}), 404
    
    # Calculate total amount
    principal = Decimal(str(data['principal_amount']))
    interest_rate = Decimal(str(data.get('interest_rate', 30)))
    interest = principal * (interest_rate / 100)
    total_amount = principal + interest
    
    loan = Loan(
        client_id=data['client_id'],
        livestock_id=data.get('livestock_id'),
        principal_amount=principal,
        interest_rate=interest_rate,
        total_amount=total_amount,
        balance=total_amount,
        due_date=data['due_date'],
        notes=data.get('notes'),
        status='active'
    )
    
    db.session.add(loan)
    db.session.flush()
    
    # Create disbursement transaction
    transaction = Transaction(
        loan_id=loan.id,
        transaction_type='disbursement',
        amount=principal,
        payment_method='cash',
        notes='Loan disbursement'
    )
    
    db.session.add(transaction)
    db.session.commit()
    
    log_audit('loan_created', 'loan', loan.id, {
        'client': client.full_name,
        'amount': float(principal)
    })
    
    return jsonify(loan.to_dict()), 201

@loans_bp.route('/<int:loan_id>/status', methods=['PATCH'])
@jwt_required()
def update_loan_status(loan_id):
    """Update loan status"""
    loan = db.session.get(Loan, loan_id)
    
    if not loan:
        return jsonify({'error': 'Loan not found'}), 404
    
    data = request.json
    new_status = data.get('status')
    
    if new_status not in ['active', 'completed', 'defaulted', 'pending', 'rejected']:  
        return jsonify({'error': 'Invalid status'}), 400
    
    loan.status = new_status
    db.session.commit()
    
    log_audit('loan_status_updated', 'loan', loan.id, {'status': new_status})
    
    return jsonify(loan.to_dict()), 200

@loans_bp.route('/apply', methods=['POST'])
def apply_for_loan():
    """Public endpoint for loan applications"""
    data = request.json
    
    print("Received loan application data:", data)  # Debug log
    
    # Validate required fields
    required_fields = ['full_name', 'phone_number', 'id_number', 'loan_amount', 'livestock_type']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    # Check if client already exists
    client = Client.query.filter_by(id_number=data['id_number']).first()
    
    if not client:
        # Create new client
        client = Client(
            full_name=data['full_name'],
            phone_number=data['phone_number'],
            id_number=data['id_number'],
            email=data.get('email', ''),
            location=data.get('location', '')
        )
        db.session.add(client)
        db.session.flush()
    else:
        # FIXED: Update ALL client information, not just location
        client.full_name = data['full_name']  # Update name if different
        client.phone_number = data['phone_number']  # Update phone
        client.email = data.get('email', client.email)  # Update email if provided
        client.location = data.get('location', client.location)  # Update location
        
        print(f"Updated existing client: {client.full_name}, ID: {client.id_number}")
        db.session.add(client)
        db.session.flush()
    
    # Create livestock record
    livestock = Livestock(
        client_id=client.id,
        livestock_type=data['livestock_type'],
        count=data.get('count', 1),
        estimated_value=Decimal(str(data.get('estimated_value', 0))),
        location=data.get('location', ''),
        photos=data.get('photos', [])
    )
    db.session.add(livestock)
    db.session.flush()
    
    # Calculate loan details with 30% interest
    principal_amount = Decimal(str(data['loan_amount']))
    interest_rate = Decimal('30.0')  # 30% interest
    interest_amount = principal_amount * (interest_rate / 100)
    total_amount = principal_amount + interest_amount
    
    # Set due date to 7 days from now
    due_date = datetime.now() + timedelta(days=7)
    
    # Create loan application
    loan = Loan(
        client_id=client.id,
        livestock_id=livestock.id,
        principal_amount=principal_amount,
        interest_rate=interest_rate,
        total_amount=total_amount,
        balance=total_amount,
        due_date=due_date,
        status='pending',
        notes=data.get('notes', '')
    )
    
    db.session.add(loan)
    db.session.commit()
    
    print(f"Loan application created: ID {loan.id}")
    print(f"Client: {client.full_name}, ID: {client.id_number}")
    print(f"Client location: {client.location}")
    print(f"Livestock photos: {livestock.photos}")
    print(f"Loan notes: {loan.notes}")
    
    return jsonify({
        'success': True,
        'message': 'Loan application submitted successfully',
        'application_id': loan.id,
        'total_amount': float(total_amount),
        'interest_rate': float(interest_rate),
        'client_name': client.full_name  # Return client name for confirmation
    }), 201

@loans_bp.route('/<int:loan_id>/approve', methods=['POST'])
@jwt_required()
@admin_required
def approve_loan(loan_id):
    """Approve a loan application"""
    loan = db.session.get(Loan, loan_id)
    
    if not loan:
        return jsonify({'error': 'Loan application not found'}), 404
    
    if loan.status != 'pending':
        return jsonify({'error': 'Loan application already processed'}), 400
    
    # Update loan status to active
    loan.status = 'active'
    loan.disbursement_date = datetime.utcnow()
    
    # Create disbursement transaction - FIXED: Set status to 'completed'
    transaction = Transaction(
        loan_id=loan.id,
        transaction_type='disbursement',
        amount=loan.principal_amount,
        payment_method='cash',
        notes='Loan approved and disbursed',
        status='completed'  # ADD THIS LINE - set status to completed
    )
    
    db.session.add(transaction)
    db.session.commit()
    
    log_audit('loan_approved', 'loan', loan.id, {
        'client': loan.client.full_name,
        'amount': float(loan.principal_amount)
    })
    
    return jsonify({
        'success': True,
        'message': 'Loan approved successfully',
        'loan': loan.to_dict()
    }), 200

@loans_bp.route('/<int:loan_id>/reject', methods=['POST'])
@jwt_required()
@admin_required
def reject_loan(loan_id):
    """Reject a loan application"""
    loan = db.session.get(Loan, loan_id)
    
    if not loan:
        return jsonify({'error': 'Loan application not found'}), 404
    
    if loan.status != 'pending':
        return jsonify({'error': 'Loan application already processed'}), 400
    
    loan.status = 'rejected'
    db.session.commit()
    
    log_audit('loan_rejected', 'loan', loan.id, {
        'client': loan.client.full_name,
        'amount': float(loan.principal_amount)
    })
    
    return jsonify({
        'success': True,
        'message': 'Loan application rejected'
    }), 200

@loans_bp.route('/livestock/gallery', methods=['GET'])
def get_livestock_gallery():
    """Get active livestock for public gallery"""
    try:
        from datetime import datetime
        
        # Get all active livestock
        livestock = Livestock.query.filter_by(status='active').all()
        livestock_data = []
        
        for item in livestock:
            # Admin-added livestock (always available)
            if item.client_id is None:
                available = True
                available_info = 'Available now'
                description = item.location or 'Available for purchase'
            else:
                # Client livestock - only available if loan is overdue
                client_loan = Loan.query.filter_by(
                    livestock_id=item.id, 
                    status='active'
                ).first()
                
                if client_loan and client_loan.due_date:
                    today = datetime.now().date()
                    due_date = client_loan.due_date
                    
                    if isinstance(due_date, str):
                        due_date = datetime.strptime(due_date, '%Y-%m-%d').date()
                    elif hasattr(due_date, 'date'):
                        due_date = due_date.date()
                    
                    # Only show if due date has passed (overdue)
                    days_overdue = (today - due_date).days
                    available = days_overdue > 0
                    available_info = 'Available now' if available else f'Available in {abs(days_overdue)} days'
                    
                    client_name = item.client.full_name if item.client else 'Unknown'
                    description = f"Collateral for {client_name}'s loan"
                else:
                    available = False
                    available_info = 'Not available'
                    description = item.location or 'Not available'
            
            # Only include available livestock in public gallery
            if item.client_id is None or available:
                livestock_data.append({
                    'id': item.id,
                    'title': f"{item.livestock_type.capitalize()} - {item.count} head",
                    'type': item.livestock_type,
                    'count': item.count,
                    'price': float(item.estimated_value) if item.estimated_value else 0,
                    'description': description,
                    'images': item.photos if item.photos else [],
                    'availableInfo': available_info,
                    'isAvailable': available or item.client_id is None
                })
        
        return jsonify(livestock_data), 200
    except Exception as e:
        print(f"Public livestock gallery error: {str(e)}")
        return jsonify({'error': str(e)}), 500    