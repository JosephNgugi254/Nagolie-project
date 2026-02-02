#!/usr/bin/env python
import os
import click
from flask_migrate import Migrate, upgrade, stamp
from app import create_app, db
from app.models import User, Investor, Loan, Client, PasswordResetToken

app = create_app()
migrate = Migrate(app, db)

@app.cli.command()
def deploy():
    """Run deployment tasks."""
    # Run database migrations
    upgrade()
    
    # Create or update initial data
    seed_admin()
    
    print("✅ Deployment completed successfully.")

@app.cli.command()
def init_db():
    """Initialize the database."""
    with app.app_context():
        # Initialize Flask-Migrate
        from flask_migrate import init as migrate_init
        migrate_init()
        print("Flask-Migrate initialized.")
        
        # Stamp the database as current (if this is an existing database)
        stamp()
        print("Database stamped with current migration.")
        
        click.echo('Database initialized for migrations.')

@app.cli.command()
def seed_admin():
    """Create default admin user."""
    with app.app_context():
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

@app.cli.command()
def health_check():
    """Health check endpoint for Render."""
    try:
        # Test database connection
        db.session.execute('SELECT 1')
        return "OK", 200
    except Exception as e:
        return f"Database error: {str(e)}", 500

@app.route('/api/health')
def health():
    try:
        db.session.execute('SELECT 1')
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except Exception as e:
        return jsonify({"status": "unhealthy", "error": str(e)}), 500

if __name__ == '__main__':
    app.run()