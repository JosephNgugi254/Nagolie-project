import sys
from pathlib import Path

# Add project root to path (in case script is run from another directory)
sys.path.insert(0, str(Path(__file__).parent))

from app import create_app, db
from app.models import User

def create_users():
    """Create the required user roles for the Recovery Module."""
    app = create_app()
    with app.app_context():
        # Define users: (username, email, role, password)
        users_data = [
            ('director', 'kesumetshadrack@gmail.com', 'director', 'director123'),
            ('secretary', 'wacukam123@gmail.com', 'secretary', 'secretary123'),
            ('accountant', 'gmatunta2015@gmail.com', 'accountant', 'accountant123'),
            ('valuer', 'georgemarite@gmail.com', 'valuer', 'valuer123'),
        ]

        for username, email, role, password in users_data:
            user = User.query.filter_by(username=username).first()
            if user:
                print(f"User '{username}' already exists, skipping.")
                continue

            user = User(username=username, email=email, role=role)
            user.set_password(password)
            db.session.add(user)
            print(f"Created user: {username} (role: {role})")

        db.session.commit()
        print("All users processed.")

if __name__ == '__main__':
    create_users()