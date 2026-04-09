#!/usr/bin/env python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app import create_app, db
from app.models import User

def add_head_of_it():
    app = create_app()
    with app.app_context():
        username = 'head_of_it'
        email = 'solitaryjoe069@gmail.com'
        role = 'head_of_it'
        password = 'head123'

        # First check if email already exists
        user_by_email = User.query.filter_by(email=email).first()
        if user_by_email:
            print(f"User with email {email} already exists (username: {user_by_email.username}).")
            if user_by_email.username != username or user_by_email.role != role:
                print(f"Updating existing user to username='{username}', role='{role}'...")
                user_by_email.username = username
                user_by_email.role = role
                user_by_email.set_password(password)  # reset password
                db.session.commit()
                print(f"User '{username}' updated successfully.")
            else:
                print("User already has correct username and role. No changes made.")
            return

        # If email not taken, check by username
        user_by_username = User.query.filter_by(username=username).first()
        if user_by_username:
            print(f"Username '{username}' already exists (email: {user_by_username.email}).")
            # Optionally update the email and role? For now just skip.
            print("Skipping creation. Use a different username or update manually.")
            return

        # Create new user
        user = User(username=username, email=email, role=role)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        print(f"User '{username}' (role: {role}) created successfully.")

if __name__ == '__main__':
    add_head_of_it()