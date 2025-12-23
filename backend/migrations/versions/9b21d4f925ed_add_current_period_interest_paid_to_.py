"""Add current_period_interest_paid to loans

Revision ID: 9b21d4f925ed
Revises: 47545111c19f
Create Date: 2025-12-23 12:08:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9b21d4f925ed'
down_revision = '47545111c19f'
branch_labels = None
depends_on = None


def upgrade():
    # Add the column with a default value of 0.00 so existing rows are filled
    op.add_column('loans', sa.Column('current_period_interest_paid', sa.Numeric(precision=10, scale=2), server_default='0.00', nullable=False))


def downgrade():
    # Remove the column
    op.drop_column('loans', 'current_period_interest_paid')
