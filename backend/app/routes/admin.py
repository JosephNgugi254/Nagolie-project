from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
from decimal import Decimal
from app import db
from app.models import Client, Loan, Livestock, Transaction, User
from app.utils.security import admin_required, log_audit
from sqlalchemy.orm import joinedload

# from app.services.sms_service import sms_service

admin_bp = Blueprint('admin', __name__)

# Add this to handle OPTIONS requests for all admin routes
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
        # FIX: Test JWT identity retrieval
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
            # Safely get client and livestock data
            client_name = app.client.full_name if app.client else 'Unknown'
            phone_number = app.client.phone_number if app.client else 'N/A'
            id_number = app.client.id_number if app.client else 'N/A'
            
            # FIXED: Better location handling
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
            
            # FIXED: Better notes handling
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
                'location': location,  # FIXED: Now uses proper location
                'additionalInfo': additional_info,  # FIXED: Better notes display
                'photos': photos,  # FIXED: Should now show uploaded photos
                'status': app.status
            })
        
        return jsonify(applications_data), 200
    except Exception as e:
        print(f"Error fetching applications: {str(e)}")
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/approved-loans', methods=['GET', 'OPTIONS'])
@jwt_required()
@admin_required
def get_approved_loans():
    """Get all approved loans - ADMIN ONLY - OPTIMIZED"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200

    try:
        approved_loans = Loan.query.options(
            joinedload(Loan.client),
            joinedload(Loan.livestock)
        ).filter_by(status='active').order_by(Loan.disbursement_date.desc()).all()

        loans_data = []
        for loan in approved_loans:
            client_name = loan.client.full_name if loan.client else 'Unknown'
            livestock_type = loan.livestock.livestock_type if loan.livestock else 'N/A'
            livestock_count = loan.livestock.count if loan.livestock else 0
            livestock_value = float(loan.livestock.estimated_value) if loan.livestock and loan.livestock.estimated_value else 0

            loans_data.append({
                'id': loan.id,
                'clientName': client_name,
                'loanAmount': float(loan.principal_amount),
                'totalAmount': float(loan.total_amount),
                'amountPaid': float(loan.amount_paid),
                'balance': float(loan.balance),
                'livestockType': livestock_type,
                'livestockCount': livestock_count,
                'livestockValue': livestock_value,
                'disbursementDate': loan.disbursement_date.isoformat() if loan.disbursement_date else None,
                'dueDate': loan.due_date.isoformat() if loan.due_date else None,
                'status': loan.status
            })

        return jsonify(loans_data), 200

    except Exception as e:
        print(f"Approved loans error: {str(e)}")
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
        
        # ENFORCE 30% INTEREST RATE
        loan.interest_rate = Decimal('30.0')
        interest_amount = loan.principal_amount * (loan.interest_rate / 100)
        loan.total_amount = loan.principal_amount + interest_amount
        loan.balance = loan.total_amount
        
        # Update loan status and set due date to 7 days from now
        loan.status = 'active'
        loan.disbursement_date = datetime.utcnow()
        loan.due_date = datetime.utcnow() + timedelta(days=7)
        
        # Create disbursement transaction - FIXED: Explicitly set all fields
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
            'client': loan.client.full_name if loan.client else 'Unknown',
            'amount': float(loan.principal_amount),
            'interest_rate': float(loan.interest_rate),
            'total_amount': float(loan.total_amount)
        })
        
        return jsonify({
            'success': True,
            'message': 'Loan approved successfully',
            'loan': loan.to_dict(),
            'transaction': transaction.to_dict()  # Return transaction data
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
        
        loan.status = 'rejected'
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

@admin_bp.route('/dashboard', methods=['GET', 'OPTIONS'])
@jwt_required()
@admin_required
def get_dashboard_stats():
    """Get dashboard statistics - ADMIN ONLY"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        # Count only approved clients (clients with active/completed loans)
        total_clients = db.session.query(Client).join(Loan).filter(
            Loan.status.in_(['active', 'completed'])
        ).distinct().count()
        
        # Total amount lent (sum of all active and completed loans)
        total_lent = (
            db.session.query(db.func.sum(Loan.principal_amount))
            .filter(Loan.status.in_(['active', 'completed']))
            .scalar() or 0
        )
        
        # Convert to float and handle the adjustment
        total_lent_float = float(total_lent) if total_lent else 0.0
        
        # Configurable adjustment for known data issue
        KNOWN_INFLATION_AMOUNT = 30500
        total_lent_adjusted = total_lent_float - KNOWN_INFLATION_AMOUNT if total_lent_float > KNOWN_INFLATION_AMOUNT else total_lent_float
        
        # Ensure it doesn't go negative
        if total_lent_adjusted < 0:
            total_lent_adjusted = 0
        
        # Total amount received (sum of all payments)
        total_received = (
            db.session.query(db.func.sum(Loan.amount_paid))
            .scalar() or 0
        )
        
        # Total revenue (interest earned)
        total_revenue = (
            db.session.query(db.func.sum(Loan.total_amount - Loan.principal_amount))
            .filter(Loan.status == 'completed')
            .scalar() or 0
        )
        
        # Loans due today
        today = datetime.now().date()
        due_today = Loan.query.filter(
            Loan.status == 'active',
            db.func.date(Loan.due_date) == today
        ).all()
        
        due_today_data = [{
            'id': loan.id,
            'client_id': loan.client_id,
            'loan_id': loan.id,
            'client_name': loan.client.full_name if loan.client else 'Unknown',
            'balance': float(loan.balance),
            'phone': loan.client.phone_number if loan.client else 'N/A'
        } for loan in due_today]
        
        # Overdue loans
        overdue = Loan.query.filter(
            Loan.status == 'active',
            Loan.due_date < datetime.now()
        ).all()
        
        overdue_data = [{
            'id': loan.id,
            'client_id': loan.client_id,
            'loan_id': loan.id,
            'client_name': loan.client.full_name if loan.client else 'Unknown',
            'balance': float(loan.balance),
            'days_overdue': (datetime.now().date() - loan.due_date.date()).days,
            'phone': loan.client.phone_number if loan.client else 'N/A'
        } for loan in overdue]
        
        return jsonify({
            'total_clients': total_clients,
            'total_lent': total_lent_adjusted,  # Now properly defined
            'total_received': float(total_received),
            'total_revenue': float(total_revenue),
            'due_today': due_today_data,
            'overdue': overdue_data
        }), 200
        
    except Exception as e:
        print(f"Dashboard error: {str(e)}")
        return jsonify({'error': str(e)}), 500

    
@admin_bp.route('/clients', methods=['GET', 'OPTIONS'])
@jwt_required()
@admin_required
def get_all_clients():
    """Get all clients with their loan details - ADMIN ONLY"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
        
    try:
        # FIX: Only show clients with active loans (exclude claimed loans)
        clients_with_loans = db.session.query(Client).join(Loan).filter(
            Loan.status == 'active'  # Only active loans, not claimed ones
        ).distinct().all()
        
        clients_data = []
        
        for client in clients_with_loans:
            # Get active loan for this client
            active_loan = Loan.query.filter_by(
                client_id=client.id,
                status='active'
            ).first()
            
            if active_loan:
                 # Calculate days left (7 days from disbursement)
                if active_loan.disbursement_date:
                    due_date = active_loan.disbursement_date + timedelta(days=7)
                    days_left = (due_date.date() - datetime.now().date()).days
                else:
                    days_left = 7  # Default if no disbursement date
                
                clients_data.append({
                    'id': client.id,
                    'loan_id': active_loan.id,  # Add loan_id for payments
                    'name': client.full_name,
                    'phone': client.phone_number,
                    'idNumber': client.id_number,
                    'borrowedDate': active_loan.disbursement_date.isoformat() if active_loan.disbursement_date else None,
                    'borrowedAmount': float(active_loan.principal_amount),
                    'expectedReturnDate': active_loan.due_date.isoformat(),
                    'amountPaid': float(active_loan.amount_paid),
                    'balance': float(active_loan.balance),
                    'daysLeft': days_left
                })
        
        return jsonify(clients_data), 200
    except Exception as e:
        print(f"Clients error: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
@admin_bp.route('/livestock', methods=['GET', 'OPTIONS'])
@jwt_required()
@admin_required
def get_all_livestock():
    """Get all livestock for gallery - ADMIN ONLY - OPTIMIZED"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200

    try:
        livestock = Livestock.query.options(
            joinedload(Livestock.client),
            joinedload(Livestock.loans)
        ).filter_by(status='active').all()

        livestock_data = []

        for item in livestock:
            if item.client_id is None:
                description = item.location or 'Available for purchase'
                available_info = 'Available now'
                livestock_type = item.livestock_type or 'Unknown'
                days_remaining = 0
                is_admin_added = True
            else:
                active_loan = next((loan for loan in item.loans if loan.status == 'active'), None)
                if active_loan:
                    client_name = item.client.full_name if item.client else 'Unknown'
                    description = f"Collateral for {client_name}'s loan"
                    livestock_type = item.livestock_type or 'Unknown'
                    is_admin_added = False

                    if active_loan.due_date:
                        today = datetime.now().date()
                        due_date = active_loan.due_date.date() if hasattr(active_loan.due_date, 'date') else active_loan.due_date
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
                else:
                    continue

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
                'status': item.status,
                'isAdminAdded': is_admin_added
            })

        return jsonify(livestock_data), 200

    except Exception as e:
        print(f"Livestock error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# In admin.py - Update the get_all_transactions function
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
            
            # Format receipt number for M-Pesa transactions
            receipt = 'N/A'
            if txn.payment_method == 'mpesa' and txn.mpesa_receipt:
                receipt = txn.mpesa_receipt
            elif txn.payment_method == 'cash':
                receipt = 'Cash'
            
            # FIXED: Better status handling with specific logic for disbursements
            status = txn.status
            if not status:
                # If status is null, determine based on transaction type
                if txn.transaction_type == 'disbursement':
                    status = 'completed'  # Disbursements should always be completed
                else:
                    status = 'completed'  # Default for other transactions
            
            # Additional safety: Force disbursements to show as completed
            if txn.transaction_type == 'disbursement':
                status = 'completed'
            
            transactions_data.append({
                'id': txn.id,
                'date': txn.created_at.isoformat() if txn.created_at else None,
                'clientName': client_name,
                'type': txn.transaction_type,
                'amount': float(txn.amount),
                'method': txn.payment_method or 'cash',
                'status': status,
                'receipt': receipt,
                'notes': txn.notes or '',
                'mpesa_receipt': txn.mpesa_receipt,
                'loan_id': txn.loan_id  # ADD THIS LINE - crucial for filtering
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
        
        # Create livestock record (admin-added livestock has no client_id)
        livestock = Livestock(
            client_id=None,  # Admin-added livestock don't belong to specific clients
            livestock_type=data['type'],
            count=data['count'],
            estimated_value=Decimal(str(data['price'])),
            location=data.get('description', ''),
            photos=data.get('images', []),
            status='active'
        )
        
        db.session.add(livestock)
        db.session.commit()
        
        log_audit('livestock_added', 'livestock', livestock.id, {
            'type': livestock.livestock_type,
            'count': livestock.count
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
        
        # Update fields
        if 'type' in data:
            livestock.livestock_type = data['type']
        if 'count' in data:
            livestock.count = data['count']
        if 'price' in data:
            livestock.estimated_value = Decimal(str(data['price']))
        if 'description' in data:
            livestock.location = data['description']
        if 'images' in data:
            livestock.photos = data['images']
        
        db.session.commit()
        
        log_audit('livestock_updated', 'livestock', livestock.id, {
            'type': livestock.livestock_type,
            'count': livestock.count
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
  
@admin_bp.route('/livestock/gallery', methods=['GET'])
def get_public_livestock_gallery():
    """Get all livestock for public gallery - NO AUTH REQUIRED"""
    try:
        from datetime import datetime
        
        # Only show active livestock (both admin-added and client livestock with active loans)
        livestock = Livestock.query.filter_by(status='active').all()
        livestock_data = []
        
        for item in livestock:
            # Determine if it's admin-added or client livestock
            if item.client_id is None:
                # Admin-added livestock - check if it's claimed livestock
                if item.location and item.location.startswith("Available (claimed from"):
                    # For claimed livestock in public gallery, show generic message
                    description = "Livestock for purchase"
                else:
                    # For regular admin-added livestock, use the actual description
                    description = item.location or 'Available for purchase'
                available_info = 'Available now'
                livestock_type = item.livestock_type or 'Unknown'
                days_remaining = 0
            else:
                # Client livestock - only show if loan is active
                client_loan = Loan.query.filter_by(
                    livestock_id=item.id, 
                    status='active'
                ).first()
                
                if client_loan:
                    description = "Livestock available for purchase"  # Generic for client collateral
                    livestock_type = item.livestock_type or 'Unknown'
                    
                    # Calculate days remaining until repayment
                    if client_loan.due_date:
                        today = datetime.now().date()
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
                else:
                    continue
            
            livestock_data.append({
                'id': item.id,
                'title': f"{livestock_type.capitalize()} - {item.count} head",
                'type': livestock_type,
                'count': item.count,
                'price': float(item.estimated_value) if item.estimated_value else 0,
                'description': description,  # This will show generic message for claimed livestock
                'images': item.photos if item.photos else [],
                'availableInfo': available_info,
                'daysRemaining': days_remaining
            })
        
        return jsonify(livestock_data), 200
    except Exception as e:
        print(f"Public livestock gallery error: {str(e)}")
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
        
        # Check if SMS service is available
        if sms_service is None:
            return jsonify({
                'success': False,
                'error': 'SMS service is not configured'
            }), 500
        
        # Send SMS using Africa's Talking
        result = sms_service.send_sms(phone, message)
        
        if result['success']:
            log_audit('reminder_sent', 'client', client_id, {
                'phone': phone,
                'message': message,
                'formatted_phone': result.get('recipient'),
                'sms_response': result.get('response', {})
            })
            
            return jsonify({
                'success': True,
                'message': 'SMS reminder sent successfully',
                'data': result
            }), 200
        else:
            # Log the failure
            log_audit('reminder_failed', 'client', client_id, {
                'phone': phone,
                'message': message,
                'error': result.get('error', 'Unknown error')
            })
            
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to send SMS'),
                'message': 'Failed to send SMS reminder'
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
        
        # Get the loan and client
        loan = Loan.query.filter_by(id=loan_id, client_id=client_id, status='active').first()
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
        
        # Check if loan is overdue - FIXED: Proper date comparison
        if loan.due_date:
            # Ensure both are date objects for comparison
            due_date = loan.due_date.date() if hasattr(loan.due_date, 'date') else loan.due_date
            if due_date >= datetime.now().date():
                return jsonify({'error': 'Loan is not overdue and cannot be claimed'}), 400
        
        # Get the livestock associated with the loan
        livestock = Livestock.query.filter_by(id=loan.livestock_id).first()
        if not livestock:
            return jsonify({'error': 'Livestock not found'}), 404
        
        print(f"Found livestock: {livestock.livestock_type}, Client ID: {livestock.client_id}")
        
        client_name = loan.client.full_name if loan.client else 'Unknown'
        
        # FIX: Keep status as 'active' so it appears in gallery
        livestock.status = 'active'  # Changed from 'available'
        livestock.client_id = None  # Remove client association
        livestock.location = f"Available (claimed from {client_name})"
        
        # Close the loan and mark as claimed
        loan.status = 'claimed'
        loan.balance = 0
        loan.amount_paid = loan.total_amount  # Mark as fully "paid" through claim
        
        # Create a transaction record for the claim
        transaction = Transaction(
            loan_id=loan.id,
            transaction_type='claim',
            amount=0,  # No monetary transaction
            payment_method='claim',
            notes=f'Livestock claimed due to overdue loan. Original livestock: {livestock.livestock_type} (ID: {livestock.id})'
        )
        db.session.add(transaction)
        
        db.session.commit()
        
        log_audit('livestock_claimed', 'loan', loan.id, {
            'client_id': client_id,
            'livestock_id': livestock.id,
            'livestock_type': livestock.livestock_type
        })
        
        return jsonify({
            'success': True,
            'message': f'Successfully claimed ownership of {livestock.livestock_type}. The livestock is now available in the gallery.',
            'livestock': {
                'id': livestock.id,
                'type': livestock.livestock_type,
                'status': 'active'  # Updated to reflect the change
            }
        })
        
    except Exception as e:
        db.session.rollback()
        print(f"Error claiming ownership: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to claim ownership: {str(e)}'}), 500
    

# Add this to admin.py after the existing routes
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
        
        # Get the loan
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
        
        if loan.status != 'active':
            return jsonify({'error': 'Loan is not active'}), 400
        
        # Calculate new amounts
        old_principal = loan.principal_amount
        old_total = loan.total_amount
        old_balance = loan.balance
        
        if topup_amount > 0:
            # Top-up: Add to principal and recalculate everything
            loan.principal_amount += topup_amount
            interest_amount = loan.principal_amount * (loan.interest_rate / 100)
            loan.total_amount = loan.principal_amount + interest_amount
            loan.balance = loan.total_amount - loan.amount_paid
            
            transaction_type = 'topup'
            transaction_amount = topup_amount
            transaction_notes = f'Loan top-up of {format_currency(topup_amount)}'
            
        else:
            # Adjustment: Set new principal amount
            new_principal = adjustment_amount
            if new_principal <= 0:
                return jsonify({'error': 'Adjustment amount must be positive'}), 400
                
            loan.principal_amount = new_principal
            interest_amount = loan.principal_amount * (loan.interest_rate / 100)
            loan.total_amount = loan.principal_amount + interest_amount
            loan.balance = loan.total_amount - loan.amount_paid
            
            transaction_type = 'adjustment'
            transaction_amount = new_principal - old_principal  # This could be positive or negative
            transaction_notes = f'Loan adjustment from {format_currency(old_principal)} to {format_currency(new_principal)}'
        
        if notes:
            transaction_notes += f'. {notes}'
        
        # Create transaction record
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

# Helper function for currency formatting
def format_currency(amount):
    return f"KES {float(amount):,.2f}"


