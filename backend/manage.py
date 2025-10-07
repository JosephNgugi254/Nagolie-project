#!/usr/bin/env python
import click
from app import create_app, db
from app.models import User

app = create_app()

@app.cli.command()
def init_db():
    """Initialize the database."""
    db.create_all()
    click.echo('Database initialized.')

@app.cli.command()
def seed_admin():
    """Create default admin user."""
    admin = User.query.filter_by(username='admin').first()
    
    if admin:
        click.echo('Admin user already exists.')
        return
    
    admin = User(
        username='admin',
        email='admin@nagolie.com',
        role='admin'
    )
    admin.set_password('admin123')  # Change this in production!
    
    db.session.add(admin)
    db.session.commit()
    
    click.echo('Admin user created successfully.')
    click.echo('Username: admin')
    click.echo('Password: admin123')
    click.echo('IMPORTANT: Change the password immediately!')

if __name__ == '__main__':
    app.run()
