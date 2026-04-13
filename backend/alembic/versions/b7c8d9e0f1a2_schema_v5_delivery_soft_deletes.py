"""schema v5 — delivery provider, soft deletes, occupancy, marketing, customizations

Revision ID: b7c8d9e0f1a2
Revises: 6546b42e617a
Create Date: 2026-04-13 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, None] = '6546b42e617a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # =========================================================================
    # 1. Column additions
    # =========================================================================

    # orders.delivery_provider — track delivery partner
    op.add_column('orders', sa.Column('delivery_provider', sa.String(50), nullable=True))

    # loyalty_transactions.created_by — who issued the points
    op.add_column('loyalty_transactions', sa.Column('created_by', sa.Integer, nullable=True))
    op.create_foreign_key('fk_loyalty_tx_created_by', 'loyalty_transactions', 'users', ['created_by'], ['id'])

    # store_tables.is_occupied — real-time occupancy flag
    op.add_column('store_tables', sa.Column('is_occupied', sa.Boolean(), nullable=False, server_default='false'))

    # users.phone_verified — OTP verification status
    op.add_column('users', sa.Column('phone_verified', sa.Boolean(), nullable=False, server_default='false'))

    # =========================================================================
    # 2. Soft delete columns (deleted_at)
    # =========================================================================

    op.add_column('menu_items', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('vouchers', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('rewards', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))

    # =========================================================================
    # 3. Missing index on orders.table_id
    # =========================================================================

    op.create_index('ix_orders_table_id', 'orders', ['table_id'])

    # =========================================================================
    # 4. FK fix: order_items.menu_item_id ON DELETE SET NULL
    # =========================================================================

    # Drop existing FK, recreate with ON DELETE SET NULL
    op.drop_constraint('order_items_menu_item_id_fkey', 'order_items', type_='foreignkey')
    op.create_foreign_key(
        'order_items_menu_item_id_fkey', 'order_items', 'menu_items',
        ['menu_item_id'], ['id'],
        ondelete='SET NULL',
    )

    # =========================================================================
    # 5. New table: customization_options
    # =========================================================================

    op.create_table(
        'customization_options',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('menu_item_id', sa.Integer, sa.ForeignKey('menu_items.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('price_adjustment', sa.DECIMAL(10, 2), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('display_order', sa.Integer, nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # =========================================================================
    # 6. New table: marketing_campaigns
    # =========================================================================

    op.create_table(
        'marketing_campaigns',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('channel', sa.String(30), nullable=False, server_default='push'),
        sa.Column('subject', sa.String(500), nullable=True),
        sa.Column('body', sa.Text, nullable=True),
        sa.Column('image_url', sa.String(500), nullable=True),
        sa.Column('cta_url', sa.String(500), nullable=True),
        sa.Column('audience', sa.String(50), nullable=False, server_default='all'),
        sa.Column('store_id', sa.Integer, sa.ForeignKey('stores.id'), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='draft'),
        sa.Column('provider', sa.String(50), nullable=True),
        sa.Column('provider_campaign_id', sa.String(255), nullable=True),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('total_recipients', sa.Integer, nullable=False, server_default='0'),
        sa.Column('sent_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('delivered_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('opened_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('clicked_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('failed_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('cost', sa.DECIMAL(10, 2), nullable=True),
        sa.Column('created_by', sa.Integer, sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # =========================================================================
    # 7. New table: table_occupancy_snapshot
    # =========================================================================

    op.create_table(
        'table_occupancy_snapshot',
        sa.Column('table_id', sa.Integer, sa.ForeignKey('store_tables.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('store_id', sa.Integer, sa.ForeignKey('stores.id'), nullable=False),
        sa.Column('is_occupied', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('current_order_id', sa.Integer, sa.ForeignKey('orders.id', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_table_occupancy_store_occupied', 'table_occupancy_snapshot', ['store_id', 'is_occupied'])

    # =========================================================================
    # 8. Trigger: auto-update table_occupancy_snapshot on order status change
    # =========================================================================

    op.execute("""
    CREATE OR REPLACE FUNCTION fn_update_table_occupancy()
    RETURNS TRIGGER AS $$
    BEGIN
        IF NEW.table_id IS NOT NULL AND NEW.status IN ('confirmed', 'preparing') THEN
            INSERT INTO table_occupancy_snapshot (table_id, store_id, is_occupied, current_order_id, updated_at)
            VALUES (NEW.table_id, NEW.store_id, TRUE, NEW.id, NOW())
            ON CONFLICT (table_id) DO UPDATE
            SET is_occupied = TRUE, current_order_id = NEW.id, updated_at = NOW();
        END IF;
        IF NEW.status IN ('completed', 'cancelled') AND NEW.table_id IS NOT NULL THEN
            UPDATE table_occupancy_snapshot
            SET is_occupied = FALSE, current_order_id = NULL, updated_at = NOW()
            WHERE table_id = NEW.table_id;
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
    """)

    op.execute("""
    CREATE TRIGGER trg_order_status_occupancy
    AFTER INSERT OR UPDATE OF status ON orders
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_table_occupancy()
    """)


def downgrade() -> None:
    # Drop trigger and function
    op.execute("DROP TRIGGER IF EXISTS trg_order_status_occupancy ON orders")
    op.execute("DROP FUNCTION IF EXISTS fn_update_table_occupancy()")

    # Drop new tables
    op.drop_table('table_occupancy_snapshot')
    op.drop_table('marketing_campaigns')
    op.drop_table('customization_options')

    # Revert FK on order_items
    op.drop_constraint('order_items_menu_item_id_fkey', 'order_items', type_='foreignkey')
    op.create_foreign_key(
        'order_items_menu_item_id_fkey', 'order_items', 'menu_items',
        ['menu_item_id'], ['id'],
    )

    # Drop index
    op.drop_index('ix_orders_table_id', table_name='orders')

    # Drop soft delete columns
    op.drop_column('rewards', 'deleted_at')
    op.drop_column('vouchers', 'deleted_at')
    op.drop_column('menu_items', 'deleted_at')

    # Drop column additions
    op.drop_column('users', 'phone_verified')
    op.drop_column('store_tables', 'is_occupied')
    op.drop_constraint('fk_loyalty_tx_created_by', 'loyalty_transactions', type_='foreignkey')
    op.drop_column('loyalty_transactions', 'created_by')
    op.drop_column('orders', 'delivery_provider')
