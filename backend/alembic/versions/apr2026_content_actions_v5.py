"""Add action fields to information_cards for promotion popup CTA support.

Revision ID: apr2026_content_actions_v5
Revises: apr2026_cart_identity_v4
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from app import migration_utils as au

revision = 'apr2026_content_actions_v5'
down_revision = 'apr2026_cart_identity_v4'
branch_labels = None
depends_on = None


def upgrade():
    if not au.column_exists('information_cards', 'action_url'):
        op.add_column('information_cards', sa.Column('action_url', sa.String(length=500), nullable=True))
    if not au.column_exists('information_cards', 'action_type'):
        op.add_column('information_cards', sa.Column('action_type', sa.String(length=20), nullable=True))
    if not au.column_exists('information_cards', 'action_label'):
        op.add_column('information_cards', sa.Column('action_label', sa.String(length=100), nullable=True))


def downgrade():
    if au.column_exists('information_cards', 'action_label'):
        op.drop_column('information_cards', 'action_label')
    if au.column_exists('information_cards', 'action_type'):
        op.drop_column('information_cards', 'action_type')
    if au.column_exists('information_cards', 'action_url'):
        op.drop_column('information_cards', 'action_url')
