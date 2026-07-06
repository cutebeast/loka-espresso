"""add customer marketing opt out

Revision ID: 293244c66886
Revises: 8034b1e6bb34
Create Date: 2026-07-06 17:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '293244c66886'
down_revision = '8034b1e6bb34'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add marketing opt-out flags to customers."""
    op.add_column('customers', sa.Column('marketing_opt_out', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('customers', sa.Column('marketing_opt_out_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Remove marketing opt-out flags."""
    op.drop_column('customers', 'marketing_opt_out_at')
    op.drop_column('customers', 'marketing_opt_out')
