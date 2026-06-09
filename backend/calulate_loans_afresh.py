from app import create_app, db
from app.models import Loan
from app.routes.payments import recalculate_loan

app = create_app()
with app.app_context():
    active_loans = Loan.query.filter_by(status='active').all()
    for loan in active_loans:
        recalculate_loan(loan)
    db.session.commit()
    print(f"Recalculated {len(active_loans)} loans.")