from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
from decimal import Decimal
from app import db
from app.models import Loan, Client, Transaction, Comment, User
from app.utils.security import director_required, secretary_or_director, any_authenticated, log_audit
from app.routes.payments import recalculate_loan
import csv
import io

recovery_bp = Blueprint('recovery', __name__, url_prefix='/api/recovery')

@recovery_bp.route('/loans', methods=['GET'])
@jwt_required()  # any authenticated user can view
def get_recovery_loans():
    try:
        # Refresh all active loans
        active_loans = Loan.query.filter_by(status='active').all()
        for loan in active_loans:
            recalculate_loan(loan)
        db.session.commit()

        # Group by weekday (0=Monday, 6=Sunday)
        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        grouped = {day: [] for day in days}
        day_totals = {day: {'principal': 0, 'interest_due': 0, 'balance': 0} for day in days}

        for loan in active_loans:
            # Compute weekday from disbursement_date
            if loan.disbursement_date:
                weekday = loan.disbursement_date.weekday()  # 0=Monday
                day_name = days[weekday]
            else:
                # fallback to created_at
                weekday = loan.created_at.weekday()
                day_name = days[weekday]

            # Prepare loan data for frontend
            client = loan.client
            loan_data = {
                'id': loan.id,
                'client_id': client.id if client else None,
                'name': client.full_name if client else 'Unknown',
                'phone': client.phone_number if client else 'N/A',
                'collateral': f"{loan.livestock.livestock_type} {loan.livestock.count}" if loan.livestock else 'None',
                'date_issued': loan.disbursement_date.isoformat() if loan.disbursement_date else None,
                'principal_amount': float(loan.principal_amount),
                'interest_due': float(loan.accrued_interest - loan.interest_paid),
                'period': f"Week {((datetime.utcnow().date() - loan.disbursement_date.date()).days // 7) + 1}" if loan.disbursement_date else 'N/A',
                'balance': float(loan.balance),
                'interest_type': loan.interest_type,
                'current_principal': float(loan.current_principal),
                'principal_paid': float(loan.principal_paid),
                'interest_paid': float(loan.interest_paid),
                'accrued_interest': float(loan.accrued_interest)
            }

            grouped[day_name].append(loan_data)

            # Update day totals
            day_totals[day_name]['principal'] += loan_data['principal_amount']
            day_totals[day_name]['interest_due'] += loan_data['interest_due']
            day_totals[day_name]['balance'] += loan_data['balance']

        # Grand totals
        grand_totals = {
            'principal': sum(t['principal'] for t in day_totals.values()),
            'interest_due': sum(t['interest_due'] for t in day_totals.values()),
            'balance': sum(t['balance'] for t in day_totals.values())
        }

        return jsonify({
            'success': True,
            'grouped_loans': grouped,
            'day_totals': day_totals,
            'grand_totals': grand_totals
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
    
@recovery_bp.route('/clients', methods=['POST'])
@secretary_or_director
def add_client_loan():
    try:
        data = request.json
        # Required fields
        client_name = data.get('name')
        phone = data.get('phone')
        id_number = data.get('id_number')
        principal = Decimal(str(data.get('principal_amount')))
        interest_type = data.get('interest_type', 'compound')
        date_issued = datetime.fromisoformat(data.get('date_issued')) if data.get('date_issued') else datetime.utcnow()
        collateral = data.get('collateral', {})

        # Find or create client
        client = Client.query.filter_by(id_number=id_number).first()
        if not client:
            client = Client(
                full_name=client_name,
                phone_number=phone,
                id_number=id_number,
                location=data.get('location', '')
            )
            db.session.add(client)
            db.session.flush()

        # Check for existing active loan on same weekday
        target_weekday = date_issued.weekday()
        existing_loan = Loan.query.filter(
            Loan.client_id == client.id,
            Loan.status == 'active',
            db.func.extract('dow', Loan.disbursement_date) == target_weekday
        ).first()

        if existing_loan:
            # Merge: add principal to existing loan
            existing_loan.principal_amount += principal
            # Recalculate fields based on new principal and interest type
            if existing_loan.interest_type == 'compound':
                # Recalculate compound debt from scratch? For simplicity, we'll just recalc with recalculate_loan
                pass
            else:
                # For simple, only update principal_amount, accrued_interest will be recalc later
                pass
            existing_loan.current_principal = existing_loan.principal_amount - existing_loan.principal_paid
            # Recalculate loan to update all derived fields
            recalculate_loan(existing_loan)
            db.session.commit()
            return jsonify({'success': True, 'message': 'Loan updated', 'loan_id': existing_loan.id}), 200
        else:
            # Create new loan
            loan = Loan(
                client_id=client.id,
                principal_amount=principal,
                interest_rate=Decimal('30.0'),
                total_amount=principal + principal * Decimal('0.30'),  # initial total (may change after recalculation)
                balance=principal + principal * Decimal('0.30'),
                current_principal=principal,
                principal_paid=Decimal('0'),
                interest_paid=Decimal('0'),
                accrued_interest=Decimal('0'),
                last_interest_payment_date=date_issued,
                disbursement_date=date_issued,
                due_date=date_issued + timedelta(days=7),
                interest_type=interest_type,
                status='active',
                funding_source='company'
            )
            db.session.add(loan)
            db.session.flush()
            # Create livestock collateral if provided
            if collateral and collateral.get('type'):
                from app.models import Livestock
                livestock = Livestock(
                    client_id=client.id,
                    livestock_type=collateral['type'],
                    count=collateral.get('count', 1),
                    estimated_value=collateral.get('value', 0),
                    location=client.location,
                    description=f"Collateral for loan {loan.id}"
                )
                db.session.add(livestock)
                loan.livestock_id = livestock.id
            db.session.commit()
            recalculate_loan(loan)  # Ensure initial calculations are correct
            db.session.commit()
            return jsonify({'success': True, 'message': 'Loan created', 'loan_id': loan.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
    
@recovery_bp.route('/loans/<int:loan_id>/payment', methods=['POST'])
@jwt_required()
def process_payment(loan_id):
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if user.role == 'accountant':
        return jsonify({'error': 'Accountant cannot process payments'}), 403

    # Delegate to existing payment logic (e.g., cash payment)
    from app.routes.payments import process_cash_payment
    # We'll call the internal function after modifying it to accept data from request
    # For now, assume we have a helper function `process_loan_payment(loan, amount, payment_type, method, notes)`
    # Let's implement a helper:
    return process_loan_payment_helper(loan_id, request.json)