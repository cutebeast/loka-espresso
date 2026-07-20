"""add tier validity, renewal and downgrade fields + annual spend tracking

Revision ID: eb7cc845410d
Revises: 8f2e0b3586f2
Create Date: 2026-07-17 06:36:22.282316

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'eb7cc845410d'
down_revision = '8f2e0b3586f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('loyalty_accounts', sa.Column('annual_spend', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('loyalty_accounts', sa.Column('annual_spend_window_start', sa.DateTime(timezone=True), nullable=True))
    op.add_column('loyalty_tiers', sa.Column('validity_months', sa.Integer(), nullable=True))
    op.add_column('loyalty_tiers', sa.Column('renewal_annual_spend', sa.Integer(), nullable=True))
    op.add_column('loyalty_tiers', sa.Column('downgrade_to_tier_key', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('loyalty_tiers', 'downgrade_to_tier_key')
    op.drop_column('loyalty_tiers', 'renewal_annual_spend')
    op.drop_column('loyalty_tiers', 'validity_months')
    op.drop_column('loyalty_accounts', 'annual_spend_window_start')
    op.drop_column('loyalty_accounts', 'annual_spend')
