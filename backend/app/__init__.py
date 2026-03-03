# app/__init__.py
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import cloudinary
import cloudinary.uploader
import cloudinary.api
import click
from flask.cli import with_appcontext

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
limiter = Limiter(key_func=get_remote_address)

# Import your Config class or define it here
from app.config import Config  # Adjust the import path as needed

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)

    CORS(app, resources={r"/api/*": {"origins": "*"}})
    
    # Configure CORS 
    import os  
    frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
    CORS(app,
     origins=[
         frontend_url,
         "http://localhost:5173",
         "https://nagolie-frontend.onrender.com"
     ],
     supports_credentials=True,
     allow_headers=["Content-Type", "Authorization", "Accept"],
     methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    
    limiter.init_app(app)


     # Cloudinary configuration
    cloudinary.config(
        cloud_name=app.config['CLOUDINARY_CLOUD_NAME'],
        api_key=app.config['CLOUDINARY_API_KEY'],
        api_secret=app.config['CLOUDINARY_API_SECRET'],
        secure=True
    )

    # Register blueprints
    from app.routes.auth import auth_bp
    from app.routes.loans import loans_bp
    from app.routes.clients import clients_bp
    from app.routes.payments import payments_bp
    from app.routes.admin import admin_bp
    from app.routes.investors import investor_bp
    from app.routes.test_daraja import test_bp
    from app.routes.password_reset import password_reset_bp


    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(loans_bp, url_prefix='/api/loans')
    app.register_blueprint(clients_bp, url_prefix='/api/clients')
    app.register_blueprint(payments_bp, url_prefix='/api/payments')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(investor_bp, url_prefix='/api/investor')
    app.register_blueprint(password_reset_bp, url_prefix='/api/auth')
    app.register_blueprint(test_bp, url_prefix='/api/test')  # Register test routes

    @app.before_request
    def before_request():
        if request.method == "OPTIONS":
            response = jsonify({"status": "success"})
            response.headers.add("Access-Control-Allow-Origin", "*")
            response.headers.add("Access-Control-Allow-Headers", "*")
            response.headers.add("Access-Control-Allow-Methods", "*")
            return response
        
    register_commands(app)

    return app


def register_commands(app):
    @app.cli.command('update-accrued-interest')
    @with_appcontext
    def update_accrued_interest():
        """Set accrued_interest for all active loans."""
        from app import db
        from app.models import Loan
        from datetime import datetime, timedelta
        from decimal import Decimal, ROUND_HALF_UP

        loans = Loan.query.filter(Loan.status == 'active').all()
        print(f"Found {len(loans)} active loans.")

        if not loans:
            print("No active loans to update.")
            return

        today = datetime.now().date()
        updated_count = 0

        for loan in loans:
            if not loan.last_interest_payment_date:
                loan.last_interest_payment_date = loan.disbursement_date or loan.created_at

            last_date = loan.last_interest_payment_date
            if hasattr(last_date, 'date'):
                last_date = last_date.date()

            days_since = (today - last_date).days
            weeks = days_since // 7

            weekly_interest = loan.current_principal * Decimal('0.30')
            weekly_interest = weekly_interest.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

            new_accrued = loan.interest_paid + (weekly_interest * weeks)
            if new_accrued < loan.interest_paid:
                new_accrued = loan.interest_paid

            loan.accrued_interest = new_accrued.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

            if not loan.due_date:
                loan.due_date = loan.last_interest_payment_date + timedelta(days=7)

            updated_count += 1

        db.session.commit()
        print(f"Updated accrued_interest for {updated_count} active loans.")

    @app.cli.command('fix-loan-balances')
    @with_appcontext
    def fix_loan_balances():
        """Recalculate accrued_interest for all active loans using simple interest."""
        from app import db
        from app.models import Loan
        from datetime import datetime, timedelta
        from decimal import Decimal, ROUND_HALF_UP

        loans = Loan.query.filter(Loan.status == 'active').all()
        print(f"Found {len(loans)} active loans.")
        today = datetime.now().date()
        updated_count = 0

        for loan in loans:
            start_date = loan.disbursement_date or loan.created_at
            if hasattr(start_date, 'date'):
                start_date = start_date.date()

            days_since = (today - start_date).days
            weeks = days_since // 7

            weekly_interest = (loan.current_principal * Decimal('0.30')).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )

            new_accrued = (weekly_interest * weeks).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )

            loan.accrued_interest = new_accrued
            loan.last_interest_payment_date = today
            loan.due_date = today + timedelta(days=7)

            updated_count += 1

        db.session.commit()
        print(f"Updated accrued_interest for {updated_count} active loans.")
        print("Now run the standard recalculate function to update balances.")

    @app.cli.command('reset-loan-principals')
    @with_appcontext
    def reset_loan_principals():
        """Reset current_principal to original principal for loans with no principal payments,
        then recalculate accrued_interest and due_date."""
        from app import db
        from app.models import Loan
        from datetime import datetime, timedelta
        from decimal import Decimal, ROUND_HALF_UP

        loans = Loan.query.filter(Loan.status == 'active').all()
        print(f"Found {len(loans)} active loans.")
        today = datetime.now().date()
        updated_count = 0

        for loan in loans:
            # Only reset if no principal payments have been made
            if loan.principal_paid == 0:
                old_principal = loan.current_principal
                loan.current_principal = loan.principal_amount
                print(f"Loan {loan.id}: reset current_principal from {old_principal} to {loan.principal_amount}")

            # Recalculate accrued_interest from disbursement date
            start_date = loan.disbursement_date or loan.created_at
            if hasattr(start_date, 'date'):
                start_date = start_date.date()

            days_since = (today - start_date).days
            weeks = days_since // 7

            weekly_interest = (loan.current_principal * Decimal('0.30')).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
            new_accrued = (weekly_interest * weeks).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )

            # Ensure we don't set accrued less than what's already paid (should be zero for most)
            if new_accrued < loan.interest_paid:
                new_accrued = loan.interest_paid

            loan.accrued_interest = new_accrued
            loan.last_interest_payment_date = today
            loan.due_date = today + timedelta(days=7)

            updated_count += 1

        db.session.commit()
        print(f"Updated {updated_count} loans.")

    @app.cli.command('fix-loan-dates')
    @with_appcontext
    def fix_loan_dates():
        """Recalculate due_date, last_interest_payment_date and accrued_interest for all active loans."""
        from app import db
        from app.models import Loan
        from datetime import datetime, timedelta
        from decimal import Decimal, ROUND_HALF_UP
    
        loans = Loan.query.filter(Loan.status == 'active').all()
        print(f"Found {len(loans)} active loans.")
        today = datetime.now().date()
        updated_count = 0
    
        for loan in loans:
            start_date = loan.disbursement_date or loan.created_at
            if hasattr(start_date, 'date'):
                start_date = start_date.date()
    
            if loan.interest_paid == 0:
                loan.last_interest_payment_date = start_date
            else:
                loan.last_interest_payment_date = today
    
            last_date = loan.last_interest_payment_date
            if hasattr(last_date, 'date'):
                last_date = last_date.date()
    
            weeks = ((today - last_date).days) // 7
    
            weekly_interest = (loan.current_principal * Decimal('0.30')).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
    
            new_accrued = loan.interest_paid + (weekly_interest * weeks)
            if new_accrued < loan.interest_paid:
                new_accrued = loan.interest_paid
            loan.accrued_interest = new_accrued.quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
    
            next_due = last_date + timedelta(days=7 * (weeks + 1))
            loan.due_date = datetime.combine(next_due, datetime.min.time())
    
            unpaid_interest = loan.accrued_interest - loan.interest_paid
            if unpaid_interest < 0:
                unpaid_interest = Decimal('0')
            loan.balance = (loan.current_principal + unpaid_interest).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
    
            updated_count += 1
    
        db.session.commit()
        print(f"Updated {updated_count} loans.")