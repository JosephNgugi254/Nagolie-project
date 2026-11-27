from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from marshmallow import ValidationError
from datetime import datetime, timedelta  
from decimal import Decimal
from app import db
from app.models import Loan, Client, Transaction, Livestock  
from app.schemas.loan_schema import LoanApplicationSchema
from app.utils.security import log_audit, admin_required  
from app.utils.decorators import role_required

loans_bp = Blueprint('loans', __name__)

from flask import current_app   # Add this at the top if not already imported
from app.models import DayAssignment, ClientAssignment   # Ensure these are imported

@loans_bp.route('/<int:loan_id>/approve', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer', 'hr_manager'])
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
    
    # Initialize tracking fields if not set
    if loan.current_principal is None:
        loan.current_principal = loan.principal_amount
    if loan.principal_paid is None:
        loan.principal_paid = Decimal('0')
    if loan.interest_paid is None:
        loan.interest_paid = Decimal('0')
    
    # Set interest_rate and interest_type based on repayment_plan
    loan.interest_rate = Decimal('4.5') if loan.repayment_plan == 'daily' else Decimal('30.0')
    loan.interest_type = 'simple' if loan.repayment_plan == 'daily' else 'compound'

    # Create disbursement transaction
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

    # ========== NEW: Auto-assign to officer for the disbursement day ==========
    from app.models import DayAssignment, ClientAssignment   # already imported at top

    weekday = loan.disbursement_date.weekday()  # Monday=0, Sunday=6
    day_assignment = DayAssignment.query.filter_by(day_of_week=weekday).first()

    if day_assignment:
        # Check if an active assignment already exists (should not happen for a new loan)
        existing = ClientAssignment.query.filter_by(loan_id=loan.id, is_active=True).first()
        if not existing:
            new_assignment = ClientAssignment(
                loan_id=loan.id,
                officer_id=day_assignment.user_id,
                assignment_type='day_based',
                assigned_by=None,        # system generated
                is_active=True
            )
            db.session.add(new_assignment)
            db.session.commit()
    else:
        # Optional: log a warning – no officer assigned to this weekday
        current_app.logger.warning(
            f"No officer assigned to weekday {weekday} for loan {loan.id}"
        )
    
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

    # ------------------------------------------------------------
    # 🔥 UPDATED: If marked as completed, DELETE livestock permanently
    # ------------------------------------------------------------
    if new_status == 'completed' and loan.livestock:
        livestock = loan.livestock
        loan.livestock_id = None       # Remove foreign key reference
        db.session.delete(livestock)   # Delete the record

    db.session.commit()
    
    log_audit('loan_status_updated', 'loan', loan.id, {'status': new_status})
    
    return jsonify(loan.to_dict()), 200



@loans_bp.route('/apply', methods=['POST'])
def apply_for_loan():
    """Public endpoint for loan applications with ID and phone verification."""

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            'success': False,
            'error': 'Invalid application data.'
        }), 400

    # Validate required fields
    required_fields = [
        'full_name',
        'phone_number',
        'id_number',
        'loan_amount',
        'livestock_type'
    ]

    for field in required_fields:
        if data.get(field) is None or str(data[field]).strip() == '':
            return jsonify({
                'success': False,
                'error': f'Missing required field: {field}'
            }), 400

    # Normalize submitted identity details
    submitted_full_name = ' '.join(str(data['full_name']).split())
    submitted_id_number = str(data['id_number']).strip()
    submitted_phone = str(data['phone_number']).strip()

    if not submitted_full_name or not submitted_id_number:
        return jsonify({
            'success': False,
            'error': 'Full name and ID number are required.'
        }), 400

    # Normalize Kenyan phone numbers for comparison.
    # 0712345678, 254712345678 and +254712345678
    # will all produce the same normalized number.
    def normalize_phone(phone):
        digits = ''.join(
            character for character in str(phone or '')
            if character.isdigit()
        )

        if digits.startswith('00'):
            digits = digits[2:]

        if len(digits) == 10 and digits.startswith('0'):
            digits = '254' + digits[1:]

        elif len(digits) == 9 and digits[0] in ('7', '1'):
            digits = '254' + digits

        return digits

    normalized_submitted_phone = normalize_phone(submitted_phone)

    if not normalized_submitted_phone:
        return jsonify({
            'success': False,
            'error': 'Please provide a valid phone number.'
        }), 400

    # Validate Next of Kin details
    nok = data.get('nextOfKin') or {}

    if not isinstance(nok, dict):
        return jsonify({
            'success': False,
            'error': 'Invalid Next of Kin details.'
        }), 400

    nok_name = (nok.get('fullName') or '').strip()
    nok_id = (nok.get('idNumber') or '').strip()
    nok_relationship = (nok.get('relationship') or '').strip()
    nok_phone = (nok.get('phoneNumber') or '').strip()

    if not all([nok_name, nok_id, nok_relationship, nok_phone]):
        return jsonify({
            'success': False,
            'error': (
                'Next of Kin details (Full Name, ID Number, '
                'Relationship, Phone Number) are all required.'
            )
        }), 400

    try:
        # ---------------------------------------------------------
        # CLIENT IDENTITY VERIFICATION
        # ---------------------------------------------------------

        client = Client.query.filter_by(
            id_number=submitted_id_number
        ).first()

        returning_client = False

        if client:
            # ID exists. Now verify that the phone also matches.
            registered_phone = normalize_phone(client.phone_number)

            if registered_phone != normalized_submitted_phone:

                current_app.logger.warning(
                    "[IDENTITY VERIFICATION] ID matched but phone "
                    "did not match. Client ID: %s",
                    client.id
                )

                return jsonify({
                    'success': False,
                    'error': (
                        'This ID number is already registered, but '
                        'the submitted phone number does not match '
                        'the registered client record. Please contact '
                        'the office for verification.'
                    ),
                    'code': 'CLIENT_PHONE_MISMATCH'
                }), 409

            # Both ID and phone match.
            # The submitted name may be different, reversed,
            # shortened or missing a middle name.
            returning_client = True

            current_app.logger.info(
                "Returning client recognised. Client ID: %s",
                client.id
            )

        else:
            # ID was not found. Check whether this phone number
            # already belongs to another registered client.
            #
            # This prevents creating a duplicate client using
            # an existing client's phone number with another ID.

            existing_phone_client = None

            for existing_client in Client.query.all():
                if normalize_phone(
                    existing_client.phone_number
                ) == normalized_submitted_phone:

                    existing_phone_client = existing_client
                    break

            if existing_phone_client:
                current_app.logger.warning(
                    "[IDENTITY VERIFICATION] Phone matched an "
                    "existing client but ID differed. Client ID: %s",
                    existing_phone_client.id
                )

                return jsonify({
                    'success': False,
                    'error': (
                        'This phone number is already registered '
                        'under a different ID number. Please contact '
                        'the office for verification.'
                    ),
                    'code': 'CLIENT_ID_MISMATCH'
                }), 409

        # ---------------------------------------------------------
        # GET APPLICATION LOCATION
        # ---------------------------------------------------------

        location = (
            data.get('location') or 'Isinya, Kajiado'
        ).strip()

        # ---------------------------------------------------------
        # UPLOAD PHOTOS TO CLOUDINARY
        # ---------------------------------------------------------

        photo_urls = []

        if data.get('photos'):
            if not isinstance(data['photos'], list):
                return jsonify({
                    'success': False,
                    'error': 'Invalid photos format.'
                }), 400

            from app.utils.cloudinary_upload import upload_base64_image

            for idx, img in enumerate(data['photos']):
                if not img:
                    continue

                try:
                    url = upload_base64_image(
                        img,
                        folder='loan_applications'
                    )

                    if not url:
                        return jsonify({
                            'success': False,
                            'error': (
                                f'Photo #{idx + 1} upload returned no URL '
                                '— application not created.'
                            )
                        }), 502

                    photo_urls.append(url)

                except Exception:
                    current_app.logger.exception(
                        "[apply_for_loan] Photo #%s upload failed",
                        idx + 1
                    )

                    return jsonify({
                        'success': False,
                        'error': (
                            f'Photo #{idx + 1} could not be uploaded. '
                            'Please retry.'
                        )
                    }), 502

        # ---------------------------------------------------------
        # CREATE CLIENT ONLY IF THEY ARE NEW
        # ---------------------------------------------------------

        if not client:
            client = Client(
                full_name=submitted_full_name,
                phone_number=submitted_phone,
                id_number=submitted_id_number,
                email=data.get('email', ''),
                location=location,
                next_of_kin_name=nok_name,
                next_of_kin_id=nok_id,
                next_of_kin_relationship=nok_relationship,
                next_of_kin_phone=nok_phone
            )

            db.session.add(client)
            db.session.flush()

        # IMPORTANT:
        # Returning clients retain their original registered
        # name, phone number, ID, location and Next of Kin details.
        #
        # Each new application still creates its own livestock
        # record and its own loan record.

        # ---------------------------------------------------------
        # CREATE LIVESTOCK RECORD
        # ---------------------------------------------------------

        livestock = Livestock(
            client_id=client.id,
            livestock_type=data['livestock_type'],
            count=data.get('count', 1),
            estimated_value=Decimal(
                str(data.get('estimated_value', 0))
            ),
            location=location,
            photos=photo_urls,
            production_classification=(
                data.get('productionClassification')
                or data.get('production_classification', '')
            )
        )

        db.session.add(livestock)
        db.session.flush()

        # ---------------------------------------------------------
        # DEFINE PRINCIPAL AMOUNT
        # ---------------------------------------------------------

        principal_amount = Decimal(str(data['loan_amount']))

        # ---------------------------------------------------------
        # HANDLE REPAYMENT PLAN
        # ---------------------------------------------------------

        repayment_plan = data.get('repaymentPlan', 'weekly')

        if repayment_plan not in ['weekly', 'daily']:
            repayment_plan = 'weekly'

        if repayment_plan == 'daily':
            due_date = datetime.now() + timedelta(days=14)
            interest_rate = Decimal('4.5')
            total_amount = principal_amount
            total_interest = Decimal('0')

        else:
            # Weekly repayment plan
            due_date = datetime.now() + timedelta(days=7)
            interest_rate = Decimal('30.0')

            total_interest = principal_amount * (
                interest_rate / 100
            )

            total_amount = principal_amount + total_interest

        current_app.logger.info(
            "Loan application calculation completed. "
            "Plan: %s | Total amount: %s",
            repayment_plan,
            total_amount
        )

        # ---------------------------------------------------------
        # CREATE INDEPENDENT LOAN APPLICATION
        # ---------------------------------------------------------

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

        current_app.logger.info(
            "Loan application created successfully. "
            "Loan ID: %s | Client ID: %s | Returning client: %s",
            loan.id,
            client.id,
            returning_client
        )

        return jsonify({
            'success': True,
            'message': (
                'Returning client recognised. New loan application '
                'submitted successfully.'
                if returning_client
                else 'Loan application submitted successfully'
            ),
            'returning_client': returning_client,
            'application_id': loan.id,
            'total_amount': float(total_amount),
            'interest_rate': float(interest_rate),
            'repayment_plan': repayment_plan,
            'due_date': due_date.isoformat(),
            'client_name': client.full_name,
            'photos_uploaded': len(photo_urls)
        }), 201

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "[apply_for_loan] Failed to create loan application"
        )

        return jsonify({
            'success': False,
            'error': 'Failed to create loan application. Please try again.'
        }), 500
                
@loans_bp.route('/<int:loan_id>/reject', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer', 'hr_manager'])
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

