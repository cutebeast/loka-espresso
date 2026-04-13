"""schema_v4_consolidate_promos_add_indexes_fix_fks

Revision ID: a1b2c3d4e5f6
Revises: 5c4afbe8e02b
Create Date: 2026-04-13 16:00:00.000000

- Drop promos table (consolidated into vouchers + promo_banners)
- Add marketing columns to vouchers table (title, body, image_url, promo_type, store_id)
- Add ForeignKey to rewards.item_id -> menu_items.id
- Add unique constraint on favorites(user_id, item_id)
- Add composite indexes for 100k+ user scale
- Add unique constraint on staff(store_id, email)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '5c4afbe8e02b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add marketing columns to vouchers
    op.add_column('vouchers', sa.Column('title', sa.String(255), nullable=True))
    op.add_column('vouchers', sa.Column('body', sa.Text(), nullable=True))
    op.add_column('vouchers', sa.Column('image_url', sa.String(500), nullable=True))
    op.add_column('vouchers', sa.Column('promo_type', sa.String(50), nullable=True))
    op.add_column('vouchers', sa.Column('store_id', sa.Integer, nullable=True))

    # FK from vouchers.store_id -> stores.id
    op.create_foreign_key('vouchers_store_id_fkey', 'vouchers', 'stores', ['store_id'], ['id'])

    # 2. Migrate promos data into vouchers
    op.execute("""
        UPDATE vouchers v SET
            title = p.title,
            body = p.body,
            image_url = p.image_url,
            promo_type = p.promo_type
        FROM promos p
        WHERE v.code = p.promo_code
    """)

    # 3. Add ForeignKey to rewards.item_id
    op.execute("""
        ALTER TABLE rewards
        DROP CONSTRAINT IF EXISTS rewards_item_id_fkey,
        ADD CONSTRAINT rewards_item_id_fkey
            FOREIGN KEY (item_id) REFERENCES menu_items(id)
    """)

    # 4. Add unique constraint on favorites(user_id, item_id)
    op.create_unique_constraint('uq_favorites_user_item', 'favorites', ['user_id', 'item_id'])

    # 5. Add unique constraint on staff(store_id, email) where email is not null
    op.create_unique_constraint('uq_staff_store_email', 'staff', ['store_id', 'email'])

    # 6. Drop promos table
    op.drop_index('ix_promos_id', table_name='promos')
    op.drop_table('promos')

    # 7. Add composite indexes for scalability at 100k+ users
    # Orders - most queried table
    op.create_index('ix_orders_status', 'orders', ['status'])
    op.create_index('ix_orders_created_at', 'orders', ['created_at'])
    op.create_index('ix_orders_store_status', 'orders', ['store_id', 'status'])
    op.create_index('ix_orders_user_created', 'orders', ['user_id', 'created_at'])

    # Loyalty transactions
    op.create_index('ix_loyalty_tx_user_type', 'loyalty_transactions', ['user_id', 'type'])

    # Wallet transactions
    op.create_index('ix_wallet_tx_wallet_type', 'wallet_transactions', ['wallet_id', 'type'])

    # Notifications
    op.create_index('ix_notifications_user_read', 'notifications', ['user_id', 'is_read'])

    # Staff shifts
    op.create_index('ix_staff_shifts_staff_clockout', 'staff_shifts', ['staff_id', 'clock_out'])

    # Menu items
    op.create_index('ix_menu_items_store_category', 'menu_items', ['store_id', 'category_id'])

    # Feedback
    op.create_index('ix_feedback_store_created', 'feedback', ['store_id', 'created_at'])

    # Order items - for analytics
    op.create_index('ix_order_items_menu_item', 'order_items', ['menu_item_id'])

    # Loyalty transactions - for analytics
    op.create_index('ix_loyalty_tx_created', 'loyalty_transactions', ['created_at'])

    # Audit log - for pagination
    op.create_index('ix_audit_log_entity', 'audit_log', ['entity_type', 'entity_id'])

    # Wallet transactions - for analytics
    op.create_index('ix_wallet_tx_created', 'wallet_transactions', ['created_at'])

    # Stores - for nearby search
    op.create_index('ix_stores_active', 'stores', ['is_active'])

    # Device tokens - for push dedup
    op.create_index('ix_device_tokens_token', 'device_tokens', ['token'], unique=True)


def downgrade() -> None:
    # Recreate promos table
    op.create_table('promos',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('image_url', sa.String(500), nullable=True),
        sa.Column('promo_type', sa.String(50), nullable=True),
        sa.Column('promo_code', sa.String(50), nullable=True),
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('end_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_promos_id', 'promos', ['id'])

    # Drop composite indexes
    op.drop_index('ix_orders_status', table_name='orders')
    op.drop_index('ix_orders_created_at', table_name='orders')
    op.drop_index('ix_orders_store_status', table_name='orders')
    op.drop_index('ix_orders_user_created', table_name='orders')
    op.drop_index('ix_loyalty_tx_user_type', table_name='loyalty_transactions')
    op.drop_index('ix_wallet_tx_wallet_type', table_name='wallet_transactions')
    op.drop_index('ix_notifications_user_read', table_name='notifications')
    op.drop_index('ix_staff_shifts_staff_clockout', table_name='staff_shifts')
    op.drop_index('ix_menu_items_store_category', table_name='menu_items')
    op.drop_index('ix_feedback_store_created', table_name='feedback')
    op.drop_index('ix_order_items_menu_item', table_name='order_items')
    op.drop_index('ix_loyalty_tx_created', table_name='loyalty_transactions')
    op.drop_index('ix_audit_log_entity', table_name='audit_log')
    op.drop_index('ix_wallet_tx_created', table_name='wallet_transactions')
    op.drop_index('ix_stores_active', table_name='stores')
    op.drop_index('ix_device_tokens_token', table_name='device_tokens')

    # Drop unique constraints
    op.drop_constraint('uq_favorites_user_item', 'favorites', type_='unique')
    op.drop_constraint('uq_staff_store_email', 'staff', type_='unique')

    # Drop rewards FK
    op.execute("ALTER TABLE rewards DROP CONSTRAINT IF EXISTS rewards_item_id_fkey")

    # Drop vouchers marketing columns
    op.drop_constraint('vouchers_store_id_fkey', 'vouchers', type_='foreignkey')
    op.drop_column('vouchers', 'store_id')
    op.drop_column('vouchers', 'promo_type')
    op.drop_column('vouchers', 'image_url')
    op.drop_column('vouchers', 'body')
    op.drop_column('vouchers', 'title')
