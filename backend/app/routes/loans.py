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
    
    # FIX: Initialize tracking fields if not set
    if loan.current_principal is None:
        loan.current_principal = loan.principal_amount
    if loan.principal_paid is None:
        loan.principal_paid = Decimal('0')
    if loan.interest_paid is None:
        loan.interest_paid = Decimal('0')
    
    # Set interest_rate and interest_type based on repayment_plan
    loan.interest_rate = Decimal('4.5') if loan.repayment_plan == 'daily' else Decimal('30.0')
    loan.interest_type = 'simple' if loan.repayment_plan == 'daily' else 'compound'

    # Create disbursement transaction - FIXED: Ensure status is set to completed
    transaction = Transaction(
        loan_id=loan.id,
        transaction_type='disbursement',
        amount=loan.principal_amount,
        payment_method='cash',
        notes='Loan approved and disbursed',
        status='completed',  # Explicitly set status
        created_at=datetime.utcnow()  # Explicitly set creation time
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
        status='active',
        # FIX: Initialize tracking fields
        current_principal=principal,
        principal_paid=Decimal('0'),
        interest_paid=Decimal('0')
    )
    
    db.session.add(loan)
    db.session.flush()
    
    # Create disbursement transaction
    transaction = Transaction(
        loan_id=loan.id,
        transaction_type='disbursement',
        amount=principal,
        payment_method='cash',
        notes='Loan disbursement',
        status='completed'
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
   
    print("Received loan application data:", data)
   
    # Validate required fields
    required_fields = ['full_name', 'phone_number', 'id_number', 'loan_amount', 'livestock_type']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'Missing required field: {field}'}), 400
   
    try:
        # Upload photos to Cloudinary if provided
        photo_urls = []
        if data.get('photos'):
            from app.utils.cloudinary_upload import upload_base64_image
            
            for img in data['photos']:
                try:
                    url = upload_base64_image(img, folder='loan_applications')
                    photo_urls.append(url)
                except Exception as upload_error:
                    print(f"Failed to upload one loan photo: {str(upload_error)}")
                    continue
        
        # Check if client already exists
        client = Client.query.filter_by(id_number=data['id_number']).first()
        
        # Get location from data or use default
        location = data.get('location', 'Isinya, Kajiado')
       
        if not client:
            client = Client(
                full_name=data['full_name'],
                phone_number=data['phone_number'],
                id_number=data['id_number'],
                email=data.get('email', ''),
                location=location
            )
            db.session.add(client)
            db.session.flush()
        else:
            client.full_name = data['full_name']
            client.phone_number = data['phone_number']
            client.email = data.get('email', client.email)
            client.location = location
            db.session.add(client)
            db.session.flush()
       
        # Create livestock record
        livestock = Livestock(
            client_id=client.id,
            livestock_type=data['livestock_type'],
            count=data.get('count', 1),
            estimated_value=Decimal(str(data.get('estimated_value', 0))),
            location=location,
            photos=photo_urls
        )
        db.session.add(livestock)
        db.session.flush()
       
        # ===== CRITICAL: define principal_amount FIRST =====
        principal_amount = Decimal(str(data['loan_amount']))
        
        # ===== Handle repayment plan =====
        repayment_plan = data.get('repaymentPlan', 'weekly')
        print(f"RAW repayment_plan from request: {repayment_plan}")
        if repayment_plan not in ['weekly', 'daily']:
            repayment_plan = 'weekly'
        
        # Calculate due date and interest based on plan
        if repayment_plan == 'daily':
            due_date = datetime.now() + timedelta(days=14)
            interest_rate = Decimal('4.5')
            total_amount = principal_amount                     # No upfront interest for daily plan
            total_interest = Decimal('0')                       # Interest will accrue daily
        else:  # weekly
            due_date = datetime.now() + timedelta(days=7)
            interest_rate = Decimal('30.0')
            total_interest = principal_amount * (interest_rate / 100)
            total_amount = principal_amount + total_interest
        
        print(f"After validation: {repayment_plan} | Total Amount: {total_amount}")
       
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
            notes=data.get('notes', ''),
            current_principal=principal_amount,
            principal_paid=Decimal('0'),
            interest_paid=Decimal('0'),
            accrued_interest=Decimal('0'),
            last_interest_payment_date=None,
            repayment_plan=repayment_plan
        )
        db.session.add(loan)
        db.session.commit()
       
        print(f"Loan application created: ID {loan.id} | Plan: {repayment_plan} | Due: {due_date}")
       
        return jsonify({
            'success': True,
            'message': 'Loan application submitted successfully',
            'application_id': loan.id,
            'total_amount': float(total_amount),
            'interest_rate': float(interest_rate),
            'repayment_plan': repayment_plan,
            'due_date': due_date.isoformat(),
            'client_name': client.full_name,
            'photos_uploaded': len(photo_urls)
        }), 201
       
    except Exception as e:
        db.session.rollback()
        print(f"Error creating loan application: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Failed to create loan application: {str(e)}'
        }), 500
            
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

