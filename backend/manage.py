#!/usr/bin/env python
import click
from app import create_app, db
from app.models import User
from werkzeug.security import generate_password_hash

app = create_app()

with app.app_context():
    from flask_migrate import upgrade
    print("📦 Applying migrations...")
    upgrade()
    print("✅ Database schema ready.")

# @app.cli.command()
# def init_db():
#     """Initialize the database."""
#     db.create_all()
#     click.echo('Database initialized.')

# @app.cli.command()
# def seed_admin():
#     """Create default admin user."""
#     admin = User.query.filter_by(username='admin').first()
    
#     if admin:
#         click.echo('Admin user already exists.')
#         return
    
#     admin = User(
#         username='admin',
#         email='admin@nagolie.com',
#         role='admin'
#     )
#     admin.set_password('admin123')  # Change this in production!
    
#     db.session.add(admin)
#     db.session.commit()
    
#     click.echo('Admin user created successfully.')
#     click.echo('Username: admin')
#     click.echo('Password: admin123')
#     click.echo('IMPORTANT: Change the password immediately!')



with app.app_context():
    db.create_all()
    admin_email = "nagolie7@gmail.com"
    existing_admin = User.query.filter_by(email=admin_email).first()
    if not existing_admin:
        admin_user = User(
            first_name="Admin",
            last_name="User",
            email=admin_email,
            phone="0721451707",
            role="admin",
            password_hash=generate_password_hash("n@g0l13")
        )
        db.session.add(admin_user)
        db.session.commit()
        print("✅ Admin user created.")
    else:
        print("ℹ️ Admin user already exists.")

if __name__ == '__main__':
    app.run()
