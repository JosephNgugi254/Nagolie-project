from app import db
from app.models import Loan
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

def main():
    print("Checking loans for accrued_interest update...")
    loans = Loan.query.filter(Loan.status == 'active').all()
    print(f"Found {len(loans)} active loans.")

    if not loans:
        print("No active loans to update.")
        return

    today = datetime.now().date()
    updated_count = 0

    for loan in loans:
        print(f"\nProcessing loan ID {loan.id}:")
        if not loan.last_interest_payment_date:
            loan.last_interest_payment_date = loan.disbursement_date or loan.created_at
            print(f"  Set last_interest_payment_date to {loan.last_interest_payment_date}")

        last_date = loan.last_interest_payment_date
        if hasattr(last_date, 'date'):
            last_date = last_date.date()

        days_since = (today - last_date).days
        weeks = days_since // 7
        print(f"  Days since last interest: {days_since}, full weeks: {weeks}")

        weekly_interest = loan.current_principal * Decimal('0.30')
        weekly_interest = weekly_interest.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        print(f"  Weekly interest on current principal: {weekly_interest}")

        new_accrued = loan.interest_paid + (weekly_interest * weeks)
        if new_accrued < loan.interest_paid:
            new_accrued = loan.interest_paid

        loan.accrued_interest = new_accrued.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        print(f"  New accrued_interest: {loan.accrued_interest}")

        if not loan.due_date:
            loan.due_date = loan.last_interest_payment_date + timedelta(days=7)
            print(f"  Set due_date to {loan.due_date}")

        updated_count += 1

    db.session.commit()
    print(f"\nUpdated accrued_interest for {updated_count} active loans.")

if __name__ == "__main__":
    main()