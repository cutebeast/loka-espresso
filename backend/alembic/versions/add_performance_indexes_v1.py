"""
Add performance indexes for frequently queried columns.

This migration adds indexes to improve query performance on:
- Orders (user_id, status, created_at for listing and filtering)
- Inventory (store_id, is_active for store inventory lookups)
- Loyalty transactions (user_id, created_at for history queries)
- Audit log (user_id, created_at for audit trails)
- Wallet transactions (user_id, created_at for transaction history)
- Feedback (user_id, store_id for customer feedback lookups)

Revision ID: add_performance_indexes_v1
Revises: add_paid_out_for_delivery
Create Date: 2026-04-18
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_performance_indexes_v1'
down_revision = 'add_paid_out_for_delivery'
branch_labels = None
depends_on = None


def upgrade():
    # Orders indexes for customer order history and admin filtering
    op.create_index(
        'idx_orders_user_status',
        'orders',
        ['user_id', 'status']
    )
    op.create_index(
        'idx_orders_created_at',
        'orders',
        ['created_at']
    )
    op.create_index(
        'idx_orders_store_status',
        'orders',
        ['store_id', 'status']
    )
    
    # Inventory indexes for store inventory lookups
    op.create_index(
        'idx_inventory_store_active',
        'inventory_items',
        ['store_id', 'is_active']
    )
    op.create_index(
        'idx_inventory_category',
        'inventory_items',
        ['category_id']
    )
    
    # Loyalty transactions for customer history
    op.create_index(
        'idx_loyalty_tx_user_date',
        'loyalty_transactions',
        ['user_id', 'created_at']
    )
    
    # Audit log for user activity trails
    op.create_index(
        'idx_audit_log_user_date',
        'audit_log',
        ['user_id', 'created_at']
    )
    op.create_index(
        'idx_audit_log_store_date',
        'audit_log',
        ['store_id', 'created_at']
    )
    
    # Wallet transactions for transaction history
    op.create_index(
        'idx_wallet_tx_user_date',
        'wallet_transactions',
        ['user_id', 'created_at']
    )
    
    # Feedback for customer feedback lookups
    op.create_index(
        'idx_feedback_user_store',
        'feedback',
        ['user_id', 'store_id']
    )
    op.create_index(
        'idx_feedback_created_at',
        'feedback',
        ['created_at']
    )
    
    # User vouchers for customer wallet lookups
    op.create_index(
        'idx_user_vouchers_user_status',
        'user_vouchers',
        ['user_id', 'status']
    )
    
    # User rewards for customer wallet lookups
    op.create_index(
        'idx_user_rewards_user_status',
        'user_rewards',
        ['user_id', 'status']
    )
    
    # Notifications for unread count
    op.create_index(
        'idx_notifications_user_read',
        'notifications',
        ['user_id', 'is_read']
    )
    
    # Cart items for cart lookups
    op.create_index(
        'idx_cart_items_user',
        'cart_items',
        ['user_id']
    )


def downgrade():
    # Drop all indexes in reverse order
    op.drop_index('idx_cart_items_user', table_name='cart_items')
    op.drop_index('idx_notifications_user_read', table_name='notifications')
    op.drop_index('idx_user_rewards_user_status', table_name='user_rewards')
    op.drop_index('idx_user_vouchers_user_status', table_name='user_vouchers')
    op.drop_index('idx_feedback_created_at', table_name='feedback')
    op.drop_index('idx_feedback_user_store', table_name='feedback')
    op.drop_index('idx_wallet_tx_user_date', table_name='wallet_transactions')
    op.drop_index('idx_audit_log_store_date', table_name='audit_log')
    op.drop_index('idx_audit_log_user_date', table_name='audit_log')
    op.drop_index('idx_loyalty_tx_user_date', table_name='loyalty_transactions')
    op.drop_index('idx_inventory_category', table_name='inventory_items')
    op.drop_index('idx_inventory_store_active', table_name='inventory_items')
    op.drop_index('idx_orders_store_status', table_name='orders')
    op.drop_index('idx_orders_created_at', table_name='orders')
    op.drop_index('idx_orders_user_status', table_name='orders')
