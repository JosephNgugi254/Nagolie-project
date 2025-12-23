from datetime import datetime
from decimal import Decimal
from app import db
from werkzeug.security import generate_password_hash, check_password_hash

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default='admin')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
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
    livestock_type = db.Column(db.String(50), nullable=False)
    count = db.Column(db.Integer, nullable=False)
    estimated_value = db.Column(db.Numeric(10, 2), nullable=False)
    valuation_value = db.Column(db.Numeric(10, 2))
    location = db.Column(db.Text)
    photos = db.Column(db.JSON)
    status = db.Column(db.String(20), default='active')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'client_id': self.client_id,
            'livestock_type': self.livestock_type,
            'count': self.count,
            'estimated_value': float(self.estimated_value),
            'valuation_value': float(self.valuation_value) if self.valuation_value else None,
            'location': self.location,
            'photos': self.photos,
            'status': self.status,
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
    
    # NEW: Track principal and interest separately
    principal_paid = db.Column(db.Numeric(10, 2), default=0)
    interest_paid = db.Column(db.Numeric(10, 2), default=0)
    current_principal = db.Column(db.Numeric(10, 2), nullable=False)  # Remaining principal
    # NEW FIELD: Track interest paid in current 7-day period
    current_period_interest_paid = db.Column(db.Numeric(10, 2),default=Decimal('0'),nullable=False,comment='Interest paid in current 7-day period')
    disbursement_date = db.Column(db.DateTime)
    due_date = db.Column(db.DateTime, nullable=False)
    last_interest_payment_date = db.Column(db.DateTime)  # NEW: Track when last interest was paid
    status = db.Column(db.String(20), default='pending')
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
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
    loan_id = db.Column(db.Integer, db.ForeignKey('loans.id'), nullable=False)
    transaction_type = db.Column(db.String(20), nullable=False)  # disbursement, payment, topup, adjustment
    payment_type = db.Column(db.String(20))  # NEW: principal, interest, or null for non-payments
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
    
    loan = db.relationship('Loan', backref=db.backref('transactions', lazy=True))
    
    def to_dict(self):
        created_at_iso = self.created_at.isoformat() if self.created_at else datetime.utcnow().isoformat()
        
        return {
            'id': self.id,
            'loan_id': self.loan_id,
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
            'date': created_at_iso
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