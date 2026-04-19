"""add status column to notification_broadcasts

Revision ID: add_broadcast_status
Revises: 
Create Date: 2026-04-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'add_broadcast_status'
down_revision = 'rename_min_order_to_min_spend'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column('notification_broadcasts', sa.Column('status', sa.String(20), nullable=True, server_default='draft'))
    op.execute("UPDATE notification_broadcasts SET status = 'sent' WHERE sent_at IS NOT NULL")

def downgrade() -> None:
    op.drop_column('notification_broadcasts', 'status')
