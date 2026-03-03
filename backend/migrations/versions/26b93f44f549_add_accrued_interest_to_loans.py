"""add accrued_interest to loans

Revision ID: 26b93f44f549
Revises: f29ba4faf175
Create Date: 2026-03-02 15:54:00.000000  # keep your original date

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '26b93f44f549'
down_revision = 'f29ba4faf175'
branch_labels = None
depends_on = None

def upgrade():
    # Add column as nullable first
    op.add_column('loans', sa.Column('accrued_interest', sa.Numeric(10, 2), nullable=True))
    
    # Set default value for all existing rows
    op.execute("UPDATE loans SET accrued_interest = 0 WHERE accrued_interest IS NULL")
    
    # Now alter column to NOT NULL
    op.alter_column('loans', 'accrued_interest',
                    existing_type=sa.Numeric(10, 2),
                    nullable=False)

def downgrade():
    op.drop_column('loans', 'accrued_interest')