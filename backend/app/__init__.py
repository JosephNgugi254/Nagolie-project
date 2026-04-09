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
import pytz
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
    from app.routes.company_gallery import company_gallery_bp
    from app.routes.recovery import recovery_bp


    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(loans_bp, url_prefix='/api/loans')
    app.register_blueprint(clients_bp, url_prefix='/api/clients')
    app.register_blueprint(payments_bp, url_prefix='/api/payments')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(investor_bp, url_prefix='/api/investor')
    app.register_blueprint(password_reset_bp, url_prefix='/api/auth')    
    app.register_blueprint(company_gallery_bp, url_prefix='/api/company-gallery')
    app.register_blueprint(recovery_bp, url_prefix='/api/recovery')

    app.register_blueprint(test_bp, url_prefix='/api/test')


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
    @app.cli.command('fix-all')
    @with_appcontext
    def fix_all():
        """
        Resets all active loans to REDUCING BALANCE simple interest.
        Replays transaction history week by week so that accrued interest
        reflects 30% of the remaining principal at each week — not the original.
        After replay, sets last_interest_payment_date to the start of the current week
        to prevent double‑accrual on subsequent recalculations.
        """
        from app import db
        from app.models import Loan, Transaction
        from datetime import datetime, timedelta
        from decimal import Decimal, ROUND_HALF_UP
        import pytz
    
        RATE = Decimal('0.30')
        local_tz = pytz.timezone('Africa/Nairobi')
        now_local = datetime.now(local_tz)
        today = now_local.date()
    
        loans = Loan.query.filter(Loan.status == 'active').all()
        print(f"Found {len(loans)} active loans.\n")
        updated_count = 0
    
        for loan in loans:
            client_name = loan.client.full_name if loan.client else 'Unknown'
            print(f"Processing Loan ID {loan.id} - {client_name}")
    
            disburse = loan.disbursement_date or loan.created_at
            if hasattr(disburse, 'date'):
                disburse_date = disburse.date()
            else:
                disburse_date = disburse
            print(f"   Disbursed: {disburse_date}")
    
            transactions = Transaction.query.filter(
                Transaction.loan_id == loan.id,
                Transaction.transaction_type == 'payment',
                Transaction.status == 'completed'
            ).order_by(Transaction.created_at.asc()).all()
    
            principal_payments = []
            interest_payments  = []
    
            for txn in transactions:
                ptype = (txn.payment_type or '').lower()
                txn_date = txn.created_at
                if hasattr(txn_date, 'date'):
                    txn_date = txn_date.date()
                if ptype == 'principal':
                    principal_payments.append((txn_date, txn.amount))
                elif ptype == 'interest':
                    interest_payments.append((txn_date, txn.amount))
    
            total_principal_paid = sum(a for _, a in principal_payments) if principal_payments else Decimal('0')
            total_interest_paid  = sum(a for _, a in interest_payments)  if interest_payments  else Decimal('0')
    
            print(f"   Principal paid: {total_principal_paid}")
            print(f"   Interest paid:  {total_interest_paid}")
    
            original_principal = loan.principal_amount
            days_since_disbursement = (today - disburse_date).days
            total_weeks = days_since_disbursement // 7
    
            # Replay week by week with reducing balance
            running_principal = original_principal
            total_accrued = Decimal('0')
    
            for week_num in range(1, total_weeks + 1):
                week_start = disburse_date + timedelta(days=(week_num - 1) * 7)
                week_end   = disburse_date + timedelta(days=week_num * 7)
    
                # Apply principal payments that fell in this week window
                for pay_date, pay_amount in principal_payments:
                    if week_start <= pay_date < week_end:
                        running_principal -= pay_amount
                        if running_principal < Decimal('0'):
                            running_principal = Decimal('0')
    
                weekly_interest = (running_principal * RATE).quantize(
                    Decimal('0.01'), rounding=ROUND_HALF_UP
                )
                total_accrued += weekly_interest
    
            print(f"   Weeks replayed: {total_weeks}")
            print(f"   Total accrued (reducing balance): {total_accrued}")
    
            current_principal = original_principal - total_principal_paid
            if current_principal < Decimal('0'):
                current_principal = Decimal('0')
    
            unpaid_interest = total_accrued - total_interest_paid
            if unpaid_interest < Decimal('0'):
                unpaid_interest = Decimal('0')
    
            balance = (current_principal + unpaid_interest).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
    
            # ---- Set last_interest_payment_date to the start of the current week ----
            current_week_start = today - timedelta(days=days_since_disbursement % 7)
            loan.last_interest_payment_date = datetime.combine(current_week_start, datetime.min.time())
    
            # Update financial fields
            loan.current_principal = current_principal
            loan.principal_paid    = total_principal_paid
            loan.interest_paid     = total_interest_paid
            loan.accrued_interest  = total_accrued
            loan.balance           = balance
            loan.amount_paid       = total_principal_paid + total_interest_paid
    
            print(f"   current_principal:          {loan.current_principal}")
            print(f"   accrued_interest:           {loan.accrued_interest}")
            print(f"   unpaid_interest:            {unpaid_interest}")
            print(f"   balance:                    {loan.balance}")
            print(f"   last_interest_payment_date: {loan.last_interest_payment_date.date()}")
            print(f"   due_date (unchanged):       {loan.due_date.date()}")
            print("   ---")
    
            updated_count += 1
    
        db.session.commit()
        print(f"\nDone. Updated {updated_count} active loans.")
        print("Future interest will accrue on current_principal (reducing balance).")
    
    @app.cli.command('fix-due-dates')
    @with_appcontext
    def fix_due_dates():
        """
        Corrects due_date for active loans based on interest payment history.
        For loans with no interest paid: due_date = disbursement_date + 7 days.
        For loans with interest paid: due_date = last interest payment date + 7 days.
        This restores the correct "days left" countdown.
        """
        from app import db
        from app.models import Loan, Transaction
        from datetime import datetime, timedelta
        import pytz

        local_tz = pytz.timezone('Africa/Nairobi')
        now_local = datetime.now(local_tz)
        today = now_local.date()

        loans = Loan.query.filter(Loan.status == 'active').all()
        updated = 0

        for loan in loans:
            # Find the most recent interest payment
            last_interest = Transaction.query.filter(
                Transaction.loan_id == loan.id,
                Transaction.transaction_type == 'payment',
                Transaction.payment_type == 'interest',
                Transaction.status == 'completed'
            ).order_by(Transaction.created_at.desc()).first()

            if last_interest:
                # Interest paid – due date is 7 days after that payment
                last_date = last_interest.created_at
                if hasattr(last_date, 'date'):
                    last_date = last_date.date()
                due_date = last_date + timedelta(days=7)
            else:
                # No interest paid – due date is 7 days after disbursement
                disburse = loan.disbursement_date or loan.created_at
                if hasattr(disburse, 'date'):
                    disburse = disburse.date()
                due_date = disburse + timedelta(days=7)

            # Update the loan's due_date if it's different
            current_due = loan.due_date
            if hasattr(current_due, 'date'):
                current_due = current_due.date()
            if due_date != current_due:
                print(f"Loan {loan.id}: due_date changed from {current_due} to {due_date}")
                loan.due_date = datetime.combine(due_date, datetime.min.time())
                updated += 1

        db.session.commit()
        print(f"\nUpdated due_date for {updated} active loans.")

    @app.cli.command('fix-due-dates-original')
    @with_appcontext
    def fix_due_dates_original():
        """
        Reset due_date for active loans to the original due date:
        disbursement_date + 7 days.
        """
        from app import db
        from app.models import Loan
        from datetime import datetime, timedelta

        loans = Loan.query.filter(Loan.status == 'active').all()
        updated = 0

        for loan in loans:
            if loan.disbursement_date:
                # Calculate original due date (7 days after disbursement)
                original_due = loan.disbursement_date + timedelta(days=7)
                # Only update if different (avoid unnecessary commits)
                if loan.due_date != original_due:
                    print(f"Loan {loan.id}: due_date changed from {loan.due_date} to {original_due}")
                    loan.due_date = original_due
                    updated += 1

        db.session.commit()
        print(f"Updated due_date for {updated} active loans.")

    @app.cli.command('fix-due-dates-next')
    @with_appcontext
    def fix_due_dates_next():
        """
        For all active loans, set due_date to the next upcoming due date
        based on the original disbursement weekday.
        """
        from app import db
        from app.models import Loan
        from datetime import datetime, timedelta

        loans = Loan.query.filter(Loan.status == 'active').all()
        updated = 0
        today = datetime.now().date()

        for loan in loans:
            if loan.disbursement_date:
                disburse = loan.disbursement_date.date() if hasattr(loan.disbursement_date, 'date') else loan.disbursement_date
                original_due = disburse + timedelta(days=7)
                days_since = (today - original_due).days
                if days_since < 0:
                    next_due = original_due
                else:
                    weeks = days_since // 7
                    remainder = days_since % 7
                    if remainder == 0:
                        next_due = original_due + timedelta(days=weeks * 7)
                    else:
                        next_due = original_due + timedelta(days=(weeks + 1) * 7)
                next_due_dt = datetime.combine(next_due, datetime.min.time())
                if loan.due_date != next_due_dt:
                    print(f"Loan {loan.id}: due_date changed from {loan.due_date} to {next_due_dt}")
                    loan.due_date = next_due_dt
                    updated += 1

        db.session.commit()
        print(f"Updated due_date for {updated} active loans to the next due date.")