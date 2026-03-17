# fix_next_return_date.py
from app import create_app, db
from app.models import Investor
from datetime import datetime, timedelta
from decimal import Decimal

def recalc_investor(investor):
    today = datetime.utcnow().date()
    invested = investor.invested_date.date()

    # First due date (35 days after investment)
    due = invested + timedelta(days=35)
    expected_total = Decimal('0')
    periods_passed = 0

    while due <= today:
        expected_total += investor.current_investment * Decimal('0.40')
        due += timedelta(days=28)
        periods_passed += 1

    # After the loop, 'due' is the next due date (beyond today)
    next_due = due

    outstanding = expected_total - investor.total_returns_received
    if outstanding < 0:
        outstanding = Decimal('0')

    # Update the investor
    investor.outstanding_returns = outstanding
    investor.next_return_date = datetime.combine(next_due, datetime.min.time())

    return expected_total, outstanding, next_due

def main():
    app = create_app()
    with app.app_context():
        investors = Investor.query.all()
        for inv in investors:
            expected, outstanding, next_due = recalc_investor(inv)
            print(f"{inv.name}: expected total {expected}, received {inv.total_returns_received}, "
                  f"outstanding = {outstanding}, next_due = {next_due}")
        db.session.commit()
        print("Migration complete. Outstanding and next_return_date updated.")

if __name__ == "__main__":
    main()