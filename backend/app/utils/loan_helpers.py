def assign_loan_to_day_officer(loan):
    """Create an active ClientAssignment for the loan based on its disbursement day.
       Sunday loans are assigned to 'lucie' initially (balancing will later adjust).
    """
    from app.models import ClientAssignment, User
    disb = loan.disbursement_date or loan.created_at
    day = disb.strftime('%A') if disb else 'Monday'
    
    # Map day to officer username
    day_officer_map = {
        'Monday': 'lucie',
        'Tuesday': 'lucie',
        'Wednesday': 'secretary',
        'Thursday': 'secretary',
        'Friday': 'annie',
        'Saturday': 'annie',
        'Sunday': 'lucie'   # default to Lucie, but balancing will reassign
    }
    officer_username = day_officer_map.get(day, 'lucie')
    officer = User.query.filter_by(username=officer_username, role='client_relations_officer').first()
    if not officer and officer_username == 'secretary':
        officer = User.query.filter_by(username='secretary', role='secretary').first()
    
    if not officer:
        # fallback: any client_relations_officer
        officer = User.query.filter_by(role='client_relations_officer').first()
    
    if not officer:
        return  # no officers defined
    
    # Deactivate any existing assignment for this loan
    ClientAssignment.query.filter_by(loan_id=loan.id, is_active=True).update({'is_active': False})
    
    assignment = ClientAssignment(
        loan_id=loan.id,
        officer_id=officer.id,
        reason='day_based',
        is_active=True,
        assigned_date=datetime.utcnow()
    )
    db.session.add(assignment)
    db.session.commit()