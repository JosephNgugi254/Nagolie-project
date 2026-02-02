from datetime import datetime, timedelta
from decimal import Decimal
from app import db
from werkzeug.security import generate_password_hash, check_password_hash

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default='admin') # admin, investor, staff
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # investor role relationship
    investor_profile = db.relationship('Investor',back_populates='user',uselist=False,overlaps="investor,investor_user")    
    investor = db.relationship('Investor',foreign_keys='Investor.user_id',back_populates='user',uselist=False,overlaps="investor_profile,investor_user")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def update_username(self, new_username):
        """Safely update username with validation"""
        if new_username and new_username != self.username:
            # Check if username already exists
            existing_user = User.query.filter_by(username=new_username).first()
            if existing_user and existing_user.id != self.id:
                raise ValueError("Username already exists")
            self.username = new_username
    
    def update_password(self, current_password, new_password):
        """Update password with current password verification"""
        if not self.check_password(current_password):
            raise ValueError("Current password is incorrect")
        self.set_password(new_password)
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'created_at': self.created_at.isoformat()
        }

class Client(db.Model):
    __tablename__ = 'clients'
    
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    phone_number = db.Column(db.String(20), nullable=False, index=True)
    id_number = db.Column(db.String(20), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120))
    location = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    loans = db.relationship('Loan', backref='client', lazy='dynamic', cascade='all, delete-orphan')
    livestock = db.relationship('Livestock', backref='client', lazy='dynamic', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'full_name': self.full_name,
            'phone_number': self.phone_number,
            'id_number': self.id_number,
            'email': self.email,
            'location': self.location,
            'created_at': self.created_at.isoformat()
        }

class Livestock(db.Model):
    __tablename__ = 'livestock'
    
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=True)
    investor_id = db.Column(db.Integer, db.ForeignKey('investors.id'), nullable=True)
    livestock_type = db.Column(db.String(50), nullable=False)
    count = db.Column(db.Integer, nullable=False)
    estimated_value = db.Column(db.Numeric(10, 2), nullable=False)
    valuation_value = db.Column(db.Numeric(10, 2))
    # SEPARATE FIELDS for description and location
    description = db.Column(db.Text, default='Available for purchase')
    location = db.Column(db.Text, default='Isinya, Kajiado')
    photos = db.Column(db.JSON)
    status = db.Column(db.String(20), default='active')
    ownership_type = db.Column(db.String(20), default='company')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    investor = db.relationship('Investor', backref='livestock', lazy=True)
    
    
    def to_dict(self):
        return {
            'id': self.id,
            'client_id': self.client_id,
            'investor_id': self.investor_id,
            'livestock_type': self.livestock_type,
            'count': self.count,
            'estimated_value': float(self.estimated_value),
            'description': self.description,
            'location': self.location,
            'photos': self.photos,
            'status': self.status,
            'ownership_type': self.ownership_type,
            'investor_name': self.investor.name if self.investor else None,
            'created_at': self.created_at.isoformat()
        }

class Loan(db.Model):
    __tablename__ = 'loans'
    
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=False)
    livestock_id = db.Column(db.Integer, db.ForeignKey('livestock.id'))
    principal_amount = db.Column(db.Numeric(10, 2), nullable=False)
    interest_rate = db.Column(db.Numeric(5, 2), default=30.0)
    total_amount = db.Column(db.Numeric(10, 2), nullable=False)
    amount_paid = db.Column(db.Numeric(10, 2), default=0)
    balance = db.Column(db.Numeric(10, 2), nullable=False)

    # NEW: Track funding source
    funding_source = db.Column(db.String(20), default='company')  # 'company' or 'investor'
    investor_id = db.Column(db.Integer, db.ForeignKey('investors.id'), nullable=True)
    
    # NEW: Track principal and interest separately
    principal_paid = db.Column(db.Numeric(10, 2), default=0)
    interest_paid = db.Column(db.Numeric(10, 2), default=0)
    current_principal = db.Column(db.Numeric(10, 2), nullable=False)  # Remaining principal
    # NEW FIELD: Track interest paid in current 7-day period
    disbursement_date = db.Column(db.DateTime)
    due_date = db.Column(db.DateTime, nullable=False)
    last_interest_payment_date = db.Column(db.DateTime)  # NEW: Track when last interest was paid
    status = db.Column(db.String(20), default='pending')
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow) 

    # relationships
    investor = db.relationship('Investor', backref='loans', lazy=True)   
    livestock = db.relationship('Livestock', backref='loan', lazy='joined')
    payments = db.relationship('Payment', backref='loan', lazy='dynamic', cascade='all, delete-orphan')
    
    def to_dict(self):
            return {
                'id': self.id,
                'client_id': self.client_id,
                'client_name': self.client.full_name if self.client else None,
                'livestock_id': self.livestock_id,
                'principal_amount': float(self.principal_amount),
                'interest_rate': float(self.interest_rate),
                'total_amount': float(self.total_amount),
                'amount_paid': float(self.amount_paid),
                'balance': float(self.balance),
                'funding_source': self.funding_source,
                'investor_id': self.investor_id,
                'investor_name': self.investor.name if self.investor else None,
                'principal_paid': float(self.principal_paid),
                'interest_paid': float(self.interest_paid),
                'current_principal': float(self.current_principal),
                'disbursement_date': self.disbursement_date.isoformat() if self.disbursement_date else None,
                'due_date': self.due_date.isoformat() if self.due_date else None,
                'last_interest_payment_date': self.last_interest_payment_date.isoformat() if self.last_interest_payment_date else None,
                'status': self.status,
                'notes': self.notes,
                'created_at': self.created_at.isoformat()
            }

class Transaction(db.Model):
    __tablename__ = 'transactions'
    
    id = db.Column(db.Integer, primary_key=True)
    loan_id = db.Column(db.Integer, db.ForeignKey('loans.id'), nullable=True)  # Made nullable for non-loan transactions
    investor_id = db.Column(db.Integer, db.ForeignKey('investors.id'), nullable=True)  # NEW: For investor transactions
    transaction_type = db.Column(db.String(20), nullable=False)  # disbursement, payment, topup, adjustment, investor_topup, investor_adjustment, investor_return
    payment_type = db.Column(db.String(20))  # principal, interest, investment, return
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    payment_method = db.Column(db.String(20))
    mpesa_receipt = db.Column(db.String(50))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    status = db.Column(db.String(20), default='completed')
    mpesa_reference = db.Column(db.String(50))
    merchant_request_id = db.Column(db.String(50))
    checkout_request_id = db.Column(db.String(50))
    phone_number = db.Column(db.String(20))
    
    # Relationships
    loan = db.relationship('Loan', backref=db.backref('transactions', lazy=True))
    investor = db.relationship('Investor', backref=db.backref('transactions', lazy=True))  # NEW
    
    def to_dict(self):
        created_at_iso = self.created_at.isoformat() if self.created_at else datetime.utcnow().isoformat()
        
        return {
            'id': self.id,
            'loan_id': self.loan_id,
            'investor_id': self.investor_id,
            'transaction_type': self.transaction_type,
            'payment_type': self.payment_type,
            'amount': float(self.amount),
            'payment_method': self.payment_method,
            'mpesa_receipt': self.mpesa_receipt,
            'notes': self.notes,
            'created_at': created_at_iso,
            'created_by': self.created_by,
            'status': self.status,
            'mpesa_reference': self.mpesa_reference,
            'merchant_request_id': self.merchant_request_id,
            'checkout_request_id': self.checkout_request_id,
            'phone_number': self.phone_number,
            'date': created_at_iso,
            'investor_name': self.investor.name if self.investor else None
        }

class Payment(db.Model):
    __tablename__ = 'payments'
    
    id = db.Column(db.Integer, primary_key=True)
    loan_id = db.Column(db.Integer, db.ForeignKey('loans.id'), nullable=False)
    phone_number = db.Column(db.String(20), nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    payment_type = db.Column(db.String(20))  # NEW: principal or interest
    merchant_request_id = db.Column(db.String(100))
    checkout_request_id = db.Column(db.String(100), unique=True, index=True)
    mpesa_receipt_number = db.Column(db.String(50))
    transaction_date = db.Column(db.DateTime)
    status = db.Column(db.String(20), default='pending')
    result_code = db.Column(db.String(10))
    result_desc = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'loan_id': self.loan_id,
            'phone_number': self.phone_number,
            'amount': float(self.amount),
            'payment_type': self.payment_type,
            'merchant_request_id': self.merchant_request_id,
            'checkout_request_id': self.checkout_request_id,
            'mpesa_receipt_number': self.mpesa_receipt_number,
            'transaction_date': self.transaction_date.isoformat() if self.transaction_date else None,
            'status': self.status,
            'result_desc': self.result_desc,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    action = db.Column(db.String(100), nullable=False)
    entity_type = db.Column(db.String(50))
    entity_id = db.Column(db.Integer)
    details = db.Column(db.JSON)
    ip_address = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'action': self.action,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'details': self.details,
            'ip_address': self.ip_address,
            'created_at': self.created_at.isoformat()
        }  

class Investor(db.Model):
    __tablename__ = 'investors'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20), nullable=False, unique=True, index=True)
    email = db.Column(db.String(100), nullable=True)  
    id_number = db.Column(db.String(20), unique=True, nullable=False, index=True)
    
    # CHANGED: Store original investment separately
    initial_investment = db.Column(db.Numeric(12, 2), nullable=False)  # NEW: Original amount
    current_investment = db.Column(db.Numeric(12, 2), nullable=False)  # NEW: Current total (initial + topups)
    total_topups = db.Column(db.Numeric(12, 2), default=0)  # NEW: Track total topups
    
    invested_date = db.Column(db.DateTime, default=datetime.utcnow)
    expected_return_date = db.Column(db.DateTime)
    total_returns_received = db.Column(db.Numeric(12, 2), default=0)
    last_return_date = db.Column(db.DateTime)
    next_return_date = db.Column(db.DateTime)
    agreement_document = db.Column(db.Text)
    account_status = db.Column(db.String(20), default='pending')
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = db.relationship('User',foreign_keys=[user_id],back_populates='investor_profile',overlaps="investor,investor_user")
    investor_user = db.relationship('User',foreign_keys=[user_id],back_populates='investor',overlaps="investor_profile,user")
    returns = db.relationship('InvestorReturn', backref='investor', lazy='dynamic', cascade='all, delete-orphan')
    
    def __init__(self, **kwargs):
        # Extract investment_amount if provided
        investment_amount = kwargs.pop('investment_amount', None)
        
        # Call parent constructor
        super(Investor, self).__init__(**kwargs)
        
        # Set default dates if not provided
        if not self.invested_date:
            self.invested_date = datetime.utcnow()
        if not self.next_return_date:
            # FIRST RETURN: After 5 weeks (35 days) from investment
            self.next_return_date = self.invested_date + timedelta(days=35)
        if not self.expected_return_date:
            # FIRST RETURN: After 5 weeks (35 days) from investment
            self.expected_return_date = self.invested_date + timedelta(days=35)
        
        # Initialize investment tracking - FIXED LOGIC
        if investment_amount is not None:
            # If investment_amount is provided in kwargs
            self.initial_investment = Decimal(str(investment_amount))
            self.current_investment = Decimal(str(investment_amount))
        elif self.initial_investment is None:
            # If initial_investment is not set, set defaults
            self.initial_investment = Decimal('0')
            self.current_investment = Decimal('0')
        
        # Always ensure total_topups is set
        if self.total_topups is None:
            self.total_topups = Decimal('0')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'phone': self.phone,
            'email': self.email or 'N/A',
            'id_number': self.id_number,
            'initial_investment': float(self.initial_investment),  # NEW
            'current_investment': float(self.current_investment),  # NEW
            'total_topups': float(self.total_topups),  # NEW
            'investment_amount': float(self.current_investment),  # Keep for backward compatibility
            'invested_date': self.invested_date.isoformat() if self.invested_date else None,
            'expected_return_date': self.expected_return_date.isoformat() if self.expected_return_date else None,
            'total_returns_received': float(self.total_returns_received),
            'last_return_date': self.last_return_date.isoformat() if self.last_return_date else None,
            'next_return_date': self.next_return_date.isoformat() if self.next_return_date else None,
            'agreement_document': self.agreement_document,
            'account_status': self.account_status,
            'notes': self.notes,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

class InvestorReturn(db.Model):
    __tablename__ = 'investor_returns'
    
    id = db.Column(db.Integer, primary_key=True)
    investor_id = db.Column(db.Integer, db.ForeignKey('investors.id'), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)  # 40% of investment
    return_date = db.Column(db.DateTime, nullable=False)
    payment_method = db.Column(db.String(20), default='mpesa')  # mpesa, bank, cash
    mpesa_receipt = db.Column(db.String(50))
    notes = db.Column(db.Text)
    status = db.Column(db.String(20), default='completed')  # completed, pending, failed
    is_early_withdrawal = db.Column(db.Boolean, default=False)  # NEW: Track early withdrawals
    early_withdrawal_fee = db.Column(db.Numeric(12, 2), default=0)  # NEW: Fee amount
    transaction_type = db.Column(db.String(50), default='return')  # 'return', 'topup', 'adjustment_up', 'adjustment_down'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'investor_id': self.investor_id,
            'amount': float(self.amount),
            'return_date': self.return_date.isoformat() if self.return_date else None,
            'payment_method': self.payment_method,
            'mpesa_receipt': self.mpesa_receipt,
            'notes': self.notes,
            'status': self.status,
            'is_early_withdrawal': self.is_early_withdrawal,
            'early_withdrawal_fee': float(self.early_withdrawal_fee),
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
class PasswordResetToken(db.Model):
    __tablename__ = 'password_reset_tokens'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    token = db.Column(db.String(255), unique=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False)
    
    # Relationship
    user = db.relationship('User', backref=db.backref('reset_tokens', lazy=True))
    
    def is_valid(self):
        """Check if token is valid and not expired"""
        return (not self.used and 
                datetime.utcnow() < self.expires_at)
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'token': self.token,
            'created_at': self.created_at.isoformat(),
            'expires_at': self.expires_at.isoformat(),
            'used': self.used,
            'is_valid': self.is_valid()
        }