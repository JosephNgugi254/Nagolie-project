from app import create_app, db
from app.models import Loan, Transaction
from datetime import datetime

app = create_app()
with app.app_context():
    # Get all active daily loans
    daily_loans = Loan.query.filter(
        Loan.repayment_plan == 'daily',
        Loan.status == 'active'
    ).all()
    
    updated = 0
    for loan in daily_loans:
        # Check if any interest payment transaction exists
        interest_payment = Transaction.query.filter(
            Transaction.loan_id == loan.id,
            Transaction.transaction_type == 'payment',
            Transaction.payment_type == 'interest'
        ).first()
        
        # If no interest payment ever, reset both dates to disbursement date
        if not interest_payment and loan.disbursement_date:
            loan.last_interest_payment_date = loan.disbursement_date
            loan.last_compounding_date = loan.disbursement_date
            db.session.add(loan)
            updated += 1
    
    db.session.commit()
    print(f"✅ Reset {updated} daily loans.")