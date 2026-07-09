"""add missing indexes r28

Revision ID: b484c48f7e63
Revises: 293244c66886
Create Date: 2026-07-09 04:50:05.124730

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b484c48f7e63'
down_revision = '293244c66886'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(op.f('ix_cart_line_items_cart_id'), 'cart_line_items', ['cart_id'], unique=False)
    op.create_index(op.f('ix_notification_messages_customer_id'), 'notification_messages', ['customer_id'], unique=False)
    op.create_index(op.f('ix_order_adjustments_order_id'), 'order_adjustments', ['order_id'], unique=False)
    op.create_index(op.f('ix_order_line_items_order_id'), 'order_line_items', ['order_id'], unique=False)
    op.create_index(op.f('ix_order_status_log_order_id'), 'order_status_log', ['order_id'], unique=False)
    op.create_index(op.f('ix_payment_events_payment_id'), 'payment_events', ['payment_id'], unique=False)
    op.create_index(op.f('ix_payments_order_id'), 'payments', ['order_id'], unique=False)
    op.create_index(op.f('ix_refunds_order_id'), 'refunds', ['order_id'], unique=False)
    op.create_index(op.f('ix_refunds_payment_id'), 'refunds', ['payment_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_refunds_payment_id'), table_name='refunds')
    op.drop_index(op.f('ix_refunds_order_id'), table_name='refunds')
    op.drop_index(op.f('ix_payments_order_id'), table_name='payments')
    op.drop_index(op.f('ix_payment_events_payment_id'), table_name='payment_events')
    op.drop_index(op.f('ix_order_status_log_order_id'), table_name='order_status_log')
    op.drop_index(op.f('ix_order_line_items_order_id'), table_name='order_line_items')
    op.drop_index(op.f('ix_order_adjustments_order_id'), table_name='order_adjustments')
    op.drop_index(op.f('ix_notification_messages_customer_id'), table_name='notification_messages')
    op.drop_index(op.f('ix_cart_line_items_cart_id'), table_name='cart_line_items')
