"""add_addon_discount_to_orders

Revision ID: c005_order_addon_discount
Revises: c004_addon_deal
Create Date: 2026-06-18 07:45:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'c005_order_addon_discount'
down_revision = 'c004_addon_deal'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('orders',
        sa.Column('addon_discount', sa.Numeric(12, 4), nullable=False, server_default='0')
    )
    op.create_check_constraint(
        'ck_orders_addon_discount',
        'orders',
        'addon_discount >= 0'
    )


def downgrade() -> None:
    op.drop_constraint('ck_orders_addon_discount', 'orders', type_='check')
    op.drop_column('orders', 'addon_discount')
