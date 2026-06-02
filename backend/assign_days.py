from app import create_app, db
from app.models import Loan, ClientAssignment, User
from datetime import datetime

app = create_app()
with app.app_context():
    # Deactivate all existing assignments
    ClientAssignment.query.update({'is_active': False})
    db.session.commit()

    # Get all active loans
    loans = Loan.query.filter_by(status='active').all()
    day_map = {
        'Monday': 'lucie', 'Tuesday': 'lucie',
        'Wednesday': 'secretary', 'Thursday': 'secretary',
        'Friday': 'annie', 'Saturday': 'annie', 'Sunday': 'lucie'
    }
    for loan in loans:
        disb = loan.disbursement_date or loan.created_at
        day = disb.strftime('%A')
        username = day_map[day]
        officer = User.query.filter_by(username=username).first()
        if not officer:
            officer = User.query.filter_by(role='client_relations_officer').first()
        if officer:
            ca = ClientAssignment(
                loan_id=loan.id,
                officer_id=officer.id,
                reason='day_based',
                is_active=True,
                assigned_date=datetime.utcnow()
            )
            db.session.add(ca)
    db.session.commit()
    print("Initial assignments created.")