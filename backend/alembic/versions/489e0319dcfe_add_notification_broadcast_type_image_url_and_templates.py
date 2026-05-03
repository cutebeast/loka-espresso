"""add_notification_broadcast_type_image_url_and_templates

Revision ID: 489e0319dcfe
Revises: a0b1c2d3e4f5
Create Date: 2026-05-03 21:26:16.730770
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '489e0319dcfe'
down_revision: Union[str, None] = 'a0b1c2d3e4f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add type + image_url to notification_broadcasts
    op.add_column('notification_broadcasts', sa.Column('type', sa.String(length=50), nullable=True))
    op.add_column('notification_broadcasts', sa.Column('image_url', sa.String(length=500), nullable=True))

    # Create notification_templates table
    op.create_table('notification_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('type', sa.String(length=50), nullable=False, server_default='broadcast'),
        sa.Column('audience', sa.String(length=50), nullable=False, server_default='all'),
        sa.Column('store_id', sa.Integer(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by'], ['admin_users.id'], ondelete='SET NULL'),
    )
    op.create_index(op.f('ix_notification_templates_id'), 'notification_templates', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_notification_templates_id'), table_name='notification_templates')
    op.drop_table('notification_templates')
    op.drop_column('notification_broadcasts', 'image_url')
    op.drop_column('notification_broadcasts', 'type')
