"""report comments: unique identity + finalized flag + client_name/phone

Revision ID: 525db03122d8
Revises: 134bc90d4361
Create Date: 2026-10-01 10:32:06.606863

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '525db03122d8'
down_revision = '134bc90d4361'
branch_labels = None
depends_on = None


def upgrade():
    # ── 1. Add new columns (nullable first so existing rows are accepted) ──
    op.add_column('report_comments', sa.Column('client_name', sa.String(length=120), nullable=True))
    op.add_column('report_comments', sa.Column('phone', sa.String(length=20), nullable=True))
    op.add_column('report_comments', sa.Column('finalized', sa.Boolean(), nullable=True))
    op.add_column('report_comments', sa.Column('finalized_at', sa.DateTime(), nullable=True))

    # ── 2. Backfill existing rows BEFORE adding NOT NULL ──
    op.execute("UPDATE report_comments SET finalized = false WHERE finalized IS NULL")

    # ── 3. Now apply NOT NULL + server default ──
    op.alter_column(
        'report_comments', 'finalized',
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.text('false'),
    )

    # ── 4. Index + unique constraint ──
    op.create_index(
        op.f('ix_report_comments_finalized'),
        'report_comments', ['finalized'],
        unique=False,
    )
    op.create_unique_constraint(
        'uq_report_comment_identity',
        'report_comments',
        ['loan_id', 'officer_id', 'report_date'],
    )


def downgrade():
    op.drop_constraint('uq_report_comment_identity', 'report_comments', type_='unique')
    op.drop_index(op.f('ix_report_comments_finalized'), table_name='report_comments')
    op.drop_column('report_comments', 'finalized_at')
    op.drop_column('report_comments', 'finalized')
    op.drop_column('report_comments', 'phone')
    op.drop_column('report_comments', 'client_name')
