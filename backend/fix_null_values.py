# fix_null_values.py
from app import create_app, db
from app.models import Investor
from decimal import Decimal

def main():
    app = create_app()
    with app.app_context():
        investors = Investor.query.all()
        for inv in investors:
            if inv.outstanding_returns is None:
                inv.outstanding_returns = Decimal('0')
            if inv.credit_balance is None:
                inv.credit_balance = Decimal('0')
        db.session.commit()
        print("NULL values fixed.")

if __name__ == "__main__":
    main()