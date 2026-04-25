"""Add composite indexes, remove deprecated loyalty_discount, clean cart_items

Revision ID: apr2026_optimizations_v2
Revises: apr2026_fixes_v1
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from app import migration_utils as au

revision = 'apr2026_optimizations_v2'
down_revision = 'apr2026_fixes_v1'
branch_labels = None
depends_on = None


def upgrade():
    if not au.index_exists('order_items', 'ix_order_items_order_menu'):
        op.create_index('ix_order_items_order_menu', 'order_items', ['order_id', 'menu_item_id'])
    if not au.index_exists('payments', 'ix_payments_order_status'):
        op.create_index('ix_payments_order_status', 'payments', ['order_id', 'status'])
    if not au.index_exists('wallet_transactions', 'ix_wallet_tx_wallet_type'):
        op.create_index('ix_wallet_tx_wallet_type', 'wallet_transactions', ['wallet_id', 'type'])
    if not au.index_exists('staff', 'ix_staff_store_active'):
        op.create_index('ix_staff_store_active', 'staff', ['store_id', 'is_active'])

    if au.column_exists('orders', 'loyalty_discount'):
        op.drop_column('orders', 'loyalty_discount')

    if au.column_exists('cart_items', 'customizations'):
        op.drop_column('cart_items', 'customizations')


def downgrade():
    if not au.column_exists('orders', 'loyalty_discount'):
        op.add_column('orders', sa.Column('loyalty_discount', sa.Numeric(10, 2), server_default='0', nullable=True))
    if not au.column_exists('cart_items', 'customizations'):
        op.add_column('cart_items', sa.Column('customizations', sa.JSON(), nullable=True))
    if au.index_exists('staff', 'ix_staff_store_active'):
        op.drop_index('ix_staff_store_active', table_name='staff')
    if au.index_exists('wallet_transactions', 'ix_wallet_tx_wallet_type'):
        op.drop_index('ix_wallet_tx_wallet_type', table_name='wallet_transactions')
    if au.index_exists('payments', 'ix_payments_order_status'):
        op.drop_index('ix_payments_order_status', table_name='payments')
    if au.index_exists('order_items', 'ix_order_items_order_menu'):
        op.drop_index('ix_order_items_order_menu', table_name='order_items')
