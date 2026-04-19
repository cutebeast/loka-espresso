"""add sort_order to loyalty_tiers

Revision ID: add_tier_sort_order
Revises: 
Create Date: 2026-04-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'add_tier_sort_order'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column('loyalty_tiers', sa.Column('sort_order', sa.Integer(), nullable=True, server_default='0'))
    op.execute("UPDATE loyalty_tiers SET sort_order = 0 WHERE name = 'Bronze'")
    op.execute("UPDATE loyalty_tiers SET sort_order = 1 WHERE name = 'Silver'")
    op.execute("UPDATE loyalty_tiers SET sort_order = 2 WHERE name = 'Gold'")
    op.execute("UPDATE loyalty_tiers SET sort_order = 3 WHERE name = 'Platinum'")

def downgrade() -> None:
    op.drop_column('loyalty_tiers', 'sort_order')
