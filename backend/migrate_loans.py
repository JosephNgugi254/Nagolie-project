# migrate_loans.py
import sys
from app import create_app, db
from app.models import Loan
from app.routes.payments import recalculate_loan
from decimal import Decimal
from datetime import datetime, timedelta

app = create_app()
with app.app_context():
    print("Starting loan migration...")
    active_loans = Loan.query.filter_by(status='active').all()
    count = 0
    for loan in active_loans:
        # Skip zero-interest loans (waived) – they are already correct
        if loan.interest_rate == 0:
            print(f"Skipping loan {loan.id} (zero interest)")
            continue

        # Ensure required dates exist
        if not loan.disbursement_date:
            loan.disbursement_date = datetime.utcnow()
        if not loan.last_interest_payment_date:
            loan.last_interest_payment_date = loan.disbursement_date
        if loan.repayment_plan == 'daily' and not loan.last_compounding_date:
            loan.last_compounding_date = loan.disbursement_date

        # Recalculate using the new engine
        try:
            updated_loan = recalculate_loan(loan, save=True)
            db.session.add(updated_loan)
            db.session.commit()
            count += 1
            print(f"Updated loan {loan.id} – principal: {loan.current_principal}, accrued: {loan.accrued_interest}")
        except Exception as e:
            db.session.rollback()
            print(f"ERROR on loan {loan.id}: {e}")

    print(f"Migration complete. Updated {count} active loans.")