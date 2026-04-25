"""Add composite indexes, remove deprecated loyalty_discount, clean cart_items

Revision ID: apr2026_optimizations_v2
Revises: apr2026_fixes_v1
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'apr2026_optimizations_v2'
down_revision = 'apr2026_fixes_v1'
branch_labels = None
depends_on = None

def upgrade():
    # Add composite indexes
    op.create_index('ix_order_items_order_menu', 'order_items', ['order_id', 'menu_item_id'])
    op.create_index('ix_payments_order_status', 'payments', ['order_id', 'status'])
    op.create_index('ix_wallet_tx_wallet_type', 'wallet_transactions', ['wallet_id', 'type'])
    op.create_index('ix_staff_store_active', 'staff', ['store_id', 'is_active'])

    # Remove deprecated column
    op.drop_column('orders', 'loyalty_discount')

    # Remove legacy customizations column from cart_items
    op.drop_column('cart_items', 'customizations')

def downgrade():
    op.add_column('orders', sa.Column('loyalty_discount', sa.Numeric(10, 2), server_default='0', nullable=True))
    op.add_column('cart_items', sa.Column('customizations', sa.JSON(), nullable=True))
    op.drop_index('ix_staff_store_active', table_name='staff')
    op.drop_index('ix_wallet_tx_wallet_type', table_name='wallet_transactions')
    op.drop_index('ix_payments_order_status', table_name='payments')
    op.drop_index('ix_order_items_order_menu', table_name='order_items')
