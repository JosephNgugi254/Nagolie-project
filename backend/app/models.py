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
    # NEW - to enable fingerprint biometric
    fingerprint_enabled = db.Column(db.Boolean, default=False)
    fingerprint_credential = db.Column(db.Text)  # store credential ID
    webauthn_credential_id = db.Column(db.String(255), nullable=True, unique=True)
    webauthn_public_key = db.Column(db.LargeBinary, nullable=True)
    webauthn_sign_count = db.Column(db.Integer, default=0)
    webauthn_transports = db.Column(db.JSON, nullable=True)  # stores list of strings
    
    # investor role relationship
    investor_profile = db.relationship('Investor',back_populates='user',uselist=False,overlaps="investor,investor_user")    
    investor = db.relationship('Investor',foreign_keys='Investor.user_id',back_populates='user',uselist=False,overlaps="investor_profile,investor_user")
    sent_messages = db.relationship('PrivateMessage', foreign_keys='PrivateMessage.sender_id', back_populates='sender', lazy='dynamic')
    received_messages = db.relationship('PrivateMessage', foreign_keys='PrivateMessage.recipient_id', back_populates='recipient', lazy='dynamic')

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
            'created_at': self.created_at.isoformat(),
            'webauthn_credential_id': self.webauthn_credential_id,
            'webauthn_enabled': bool(self.webauthn_credential_id),
        }
    
class WebauthnChallenge(db.Model):
    __tablename__ = 'webauthn_challenges'
    token = db.Column(db.String(64), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    challenge = db.Column(db.String(256), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)

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
    # NEW: Track total accrued interest over life of loan (simple, no compounding)
    accrued_interest = db.Column(db.Numeric(10, 2), default=0, nullable=False)

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
    status = db.Column(db.String(20), default='pending') # pending, active, completed, rejected, claimed, renewed , waived
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow) 

    interest_type = db.Column(db.String(20), default='compound')  # 'simple' or 'compound'
    collateral_text = db.Column(db.Text)  # manually entered collateral description

    # NEW: Repayment Plan (weekly or daily)
    repayment_plan = db.Column(db.String(20), default='weekly')  # 'weekly' or 'daily'

    # AddED TO ALLOW PRE PROCESSING INTEREST BEFORE DUE DTE
    interest_prepaid_period = db.Column(db.String(20), nullable=True)
    interest_prepaid_amount = db.Column(db.Numeric(10, 2), default=Decimal('0'))

    # relationships
    investor = db.relationship('Investor', backref='loans', lazy=True)   
    livestock = db.relationship('Livestock', backref='loan', lazy='joined')
    payments = db.relationship('Payment', backref='loan', lazy='dynamic', cascade='all, delete-orphan')
    comments = db.relationship('Comment', back_populates='loan', lazy='dynamic', cascade='all, delete-orphan')
    
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
                'accrued_interest': float(self.accrued_interest),
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
                'created_at': self.created_at.isoformat(),
                'interest_type': self.interest_type,
                'collateral_text': self.collateral_text,
                'repayment_plan': self.repayment_plan,   
                'interest_prepaid_period': self.interest_prepaid_period,# Added
                'interest_prepaid_amount': float(self.interest_prepaid_amount or 0)# Added
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
    outstanding_returns = db.Column(db.Numeric(12, 2), default=0)  # NEW
    
    # NEW: prepaid credit for future periods
    credit_balance = db.Column(db.Numeric(12, 2), default=0)
    
    user = db.relationship('User', foreign_keys=[user_id], back_populates='investor_profile', overlaps="investor,investor_user")
    investor_user = db.relationship('User', foreign_keys=[user_id], back_populates='investor', overlaps="investor_profile,user")
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

        # Always ensure these are set
        if self.total_topups is None:
            self.total_topups = Decimal('0')
        if self.outstanding_returns is None:
            self.outstanding_returns = Decimal('0')
        if self.credit_balance is None:
            self.credit_balance = Decimal('0')
    
    def update_outstanding(self):
        """Check if next_return_date has passed and add expected return to outstanding, applying credit first."""
        today = datetime.utcnow().date()
        updated = False
        
        while self.next_return_date and self.next_return_date.date() <= today:
            expected = self.current_investment * Decimal('0.40')
            
            # Apply credit first
            if self.credit_balance >= expected:
                self.credit_balance -= expected
                # No addition to outstanding
            else:
                remaining = expected - self.credit_balance
                self.outstanding_returns += remaining
                self.credit_balance = Decimal('0')
                
            self.next_return_date += timedelta(days=28)
            updated = True
            
        return updated
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'phone': self.phone,
            'email': self.email or 'N/A',
            'id_number': self.id_number,
            'initial_investment': float(self.initial_investment),
            'current_investment': float(self.current_investment),
            'total_topups': float(self.total_topups),
            'investment_amount': float(self.current_investment),  # Keep for backward compatibility
            'invested_date': self.invested_date.isoformat() if self.invested_date else None,
            'expected_return_date': self.expected_return_date.isoformat() if self.expected_return_date else None,
            'total_returns_received': float(self.total_returns_received),
            'outstanding_returns': float(self.outstanding_returns) if self.outstanding_returns is not None else 0.0,
            'last_return_date': self.last_return_date.isoformat() if self.last_return_date else None,
            'next_return_date': self.next_return_date.isoformat() if self.next_return_date else None,
            'agreement_document': self.agreement_document,
            'account_status': self.account_status,
            'notes': self.notes,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'credit_balance': float(self.credit_balance) if self.credit_balance is not None else 0.0,
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
    
class CompanyGalleryImage(db.Model):
    __tablename__ = 'company_gallery_images'
    
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(50), nullable=False)      # e.g. 'event', 'operations', 'services', 'team'
    title = db.Column(db.String(200), nullable=False)        # e.g. 'Grand Opening Ceremony'
    description = db.Column(db.Text, nullable=True)          # optional description
    image_url = db.Column(db.String(500), nullable=False)    # Cloudinary URL
    public_id = db.Column(db.String(200), nullable=True)     # Cloudinary public_id (for deletion)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    date_taken = db.Column(db.Date, nullable=True)           # optional custom date, falls back to created_at

    def to_dict(self):
        return {
            'id': self.id,
            'category': self.category,
            'title': self.title,
            'description': self.description or '',
            'src': self.image_url,
            'thumbnail': self.image_url,
            'date': (self.date_taken or self.created_at.date()).isoformat(),
            'created_at': self.created_at.isoformat()
        }
    
class Comment(db.Model):
    __tablename__ = 'comments'
    
    id = db.Column(db.Integer, primary_key=True)
    loan_id = db.Column(db.Integer, db.ForeignKey('loans.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('comments.id'), nullable=True)
    
    content = db.Column(db.Text, nullable=False)
    edited = db.Column(db.Boolean, default=False)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    loan = db.relationship('Loan', back_populates='comments')
    user = db.relationship('User')
    
    # Self-referential relationship for replies (threaded comments)
    replies = db.relationship(
        'Comment', 
        backref=db.backref('parent', remote_side=[id]),
        cascade='all, delete-orphan',
        lazy='dynamic'
    )

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,           # <-- expose user_id for edit check
            'user': self.user.username,
            'role': self.user.role,
            'content': self.content,
            'created_at': self.created_at.isoformat() + 'Z',        # <-- Z suffix = UTC
            'updated_at': (self.updated_at.isoformat() + 'Z') if self.updated_at else None,
            'edited': self.edited,
            'parent_id': self.parent_id,
            'replies': [reply.to_dict() for reply in self.replies.order_by(Comment.created_at)] if self.replies else []
        }

class UserLoanCommentRead(db.Model):
    __tablename__ = 'user_loan_comment_read'
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)
    loan_id = db.Column(db.Integer, db.ForeignKey('loans.id'), primary_key=True)
    last_read_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    user = db.relationship('User')
    loan = db.relationship('Loan')

class PrivateMessage(db.Model):
    __tablename__ = 'private_messages'
    
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    recipient_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    content = db.Column(db.Text, nullable=False)
    read = db.Column(db.Boolean, default=False)          # keep for backward compatibility
    
    # NEW status fields for fine‑grained tracking
    status = db.Column(db.String(20), default='sent')    # 'sent', 'delivered', 'read'
    delivered_at = db.Column(db.DateTime, nullable=True)
    read_at = db.Column(db.DateTime, nullable=True)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Attachment fields (already present)
    attachment_url = db.Column(db.String(500), nullable=True)
    attachment_type = db.Column(db.String(255), nullable=True)
    attachment_name = db.Column(db.String(255), nullable=True)
    
    # Relationships (unchanged)
    sender = db.relationship('User', foreign_keys=[sender_id], back_populates='sent_messages')
    recipient = db.relationship('User', foreign_keys=[recipient_id], back_populates='received_messages')
    
    def to_dict(self):
        return {
            'id': self.id,
            'sender_id': self.sender_id,
            'sender': self.sender.username if self.sender else None,
            'recipient_id': self.recipient_id,
            'recipient': self.recipient.username if self.recipient else None,
            'content': self.content,
            'read': self.read,
            'status': self.status,                    # <-- added
            'created_at': (self.created_at.isoformat() + 'Z') if self.created_at else None,
            'attachment_url': self.attachment_url,
            'attachment_type': self.attachment_type,
            'attachment_name': self.attachment_name
        }

class Defaulter(db.Model):
    __tablename__ = 'defaulters'
    id = db.Column(db.Integer, primary_key=True)
    loan_id = db.Column(db.Integer, db.ForeignKey('loans.id'), nullable=False, unique=True)
    marked_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    marked_at = db.Column(db.DateTime, default=datetime.utcnow)
    resolved = db.Column(db.Boolean, default=False)
    resolved_at = db.Column(db.DateTime)

    loan = db.relationship('Loan')
    marker = db.relationship('User')