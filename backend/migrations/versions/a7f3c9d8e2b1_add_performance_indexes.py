"""Add performance indexes

Revision ID: a7f3c9d8e2b1
Revises: 90e8929eaaa7
Create Date: 2024-12-03 08:15:23.456789

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a7f3c9d8e2b1'
down_revision = '90e8929eaaa7'
branch_labels = None
depends_on = None


def upgrade():
    # Add indexes for frequently queried fields
    
    # Livestock table indexes (SINGULAR!)
    op.create_index('idx_livestock_status', 'livestock', ['status'], unique=False)
    op.create_index('idx_livestock_client_id', 'livestock', ['client_id'], unique=False)
    
    # Loan table indexes (PLURAL!)
    op.create_index('idx_loan_status', 'loans', ['status'], unique=False)
    op.create_index('idx_loan_client_id', 'loans', ['client_id'], unique=False)
    op.create_index('idx_loan_livestock_id', 'loans', ['livestock_id'], unique=False)
    op.create_index('idx_loan_due_date', 'loans', ['due_date'], unique=False)
    op.create_index('idx_loan_disbursement_date', 'loans', ['disbursement_date'], unique=False)
    
    # Client table indexes (PLURAL!)
    op.create_index('idx_client_phone', 'clients', ['phone_number'], unique=False)
    op.create_index('idx_client_id_number', 'clients', ['id_number'], unique=False)
    
    # Transaction table indexes (PLURAL!)
    op.create_index('idx_transaction_loan_id', 'transactions', ['loan_id'], unique=False)
    op.create_index('idx_transaction_created_at', 'transactions', ['created_at'], unique=False)
    op.create_index('idx_transaction_type', 'transactions', ['transaction_type'], unique=False)


def downgrade():
    # Remove indexes if needed
    op.drop_index('idx_transaction_type', table_name='transactions')
    op.drop_index('idx_transaction_created_at', table_name='transactions')
    op.drop_index('idx_transaction_loan_id', table_name='transactions')
    op.drop_index('idx_client_id_number', table_name='clients')
    op.drop_index('idx_client_phone', table_name='clients')
    op.drop_index('idx_loan_disbursement_date', table_name='loans')
    op.drop_index('idx_loan_due_date', table_name='loans')
    op.drop_index('idx_loan_livestock_id', table_name='loans')
    op.drop_index('idx_loan_client_id', table_name='loans')
    op.drop_index('idx_loan_status', table_name='loans')
    op.drop_index('idx_livestock_client_id', table_name='livestock')
    op.drop_index('idx_livestock_status', table_name='livestock')
