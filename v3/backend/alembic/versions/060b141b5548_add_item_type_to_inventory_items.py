"""add_item_type_to_inventory_items

Revision ID: 060b141b5548
Revises: 18e8ade63ebb
Create Date: 2026-05-25 05:59:24.004932
"""
from alembic import op
import sqlalchemy as sa


revision = '060b141b5548'
down_revision = '18e8ade63ebb'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('inventory_items', sa.Column('item_type', sa.String(length=10), nullable=False, server_default='fnb'))


def downgrade() -> None:
    op.drop_column('inventory_items', 'item_type')
