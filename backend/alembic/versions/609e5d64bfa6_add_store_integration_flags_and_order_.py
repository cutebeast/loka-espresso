"""add_store_integration_flags_and_order_manual_sync_tracking

Revision ID: 609e5d64bfa6
Revises: add_qr_generated_at
Create Date: 2026-04-22 11:21:48.316040

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '609e5d64bfa6'
down_revision: Union[str, None] = 'add_qr_generated_at'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add store integration flags (default False for existing stores)
    op.add_column('stores', sa.Column('pos_integration_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('stores', sa.Column('delivery_integration_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    # Remove server_default after column is populated so future inserts must be explicit
    op.alter_column('stores', 'pos_integration_enabled', server_default=None)
    op.alter_column('stores', 'delivery_integration_enabled', server_default=None)

    # Add order manual sync tracking fields
    op.add_column('orders', sa.Column('pos_synced_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('orders', sa.Column('pos_synced_by', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('delivery_dispatched_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('orders', sa.Column('delivery_dispatched_by', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('staff_notes', sa.Text(), nullable=True))

    # Add foreign keys for audit tracking
    op.create_foreign_key('fk_orders_pos_synced_by_users', 'orders', 'users', ['pos_synced_by'], ['id'])
    op.create_foreign_key('fk_orders_delivery_dispatched_by_users', 'orders', 'users', ['delivery_dispatched_by'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_orders_delivery_dispatched_by_users', 'orders', type_='foreignkey')
    op.drop_constraint('fk_orders_pos_synced_by_users', 'orders', type_='foreignkey')
    op.drop_column('orders', 'staff_notes')
    op.drop_column('orders', 'delivery_dispatched_by')
    op.drop_column('orders', 'delivery_dispatched_at')
    op.drop_column('orders', 'pos_synced_by')
    op.drop_column('orders', 'pos_synced_at')
    op.drop_column('stores', 'delivery_integration_enabled')
    op.drop_column('stores', 'pos_integration_enabled')
