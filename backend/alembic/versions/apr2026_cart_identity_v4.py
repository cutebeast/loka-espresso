"""Add customization_hash to cart_items for customization-aware uniqueness.

Revision ID: apr2026_cart_identity_v4
Revises: apr2026_constraints_v3
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from app import migration_utils as au

revision = 'apr2026_cart_identity_v4'
down_revision = 'apr2026_constraints_v3'
branch_labels = None
depends_on = None


def upgrade():
    if not au.column_exists('cart_items', 'customization_hash'):
        op.add_column('cart_items', sa.Column('customization_hash', sa.String(length=64), nullable=True))

    if not au.index_exists('cart_items', 'ix_cart_items_customization_hash'):
        op.create_index('ix_cart_items_customization_hash', 'cart_items', ['customization_hash'], unique=False)

    if not au.constraint_exists('cart_items', 'uq_cart_item_identity'):
        op.create_unique_constraint('uq_cart_item_identity', 'cart_items', ['user_id', 'store_id', 'item_id', 'customization_hash'])


def downgrade():
    if au.constraint_exists('cart_items', 'uq_cart_item_identity'):
        op.drop_constraint('uq_cart_item_identity', 'cart_items', type_='unique')
    if au.index_exists('cart_items', 'ix_cart_items_customization_hash'):
        op.drop_index('ix_cart_items_customization_hash', table_name='cart_items')
    if au.column_exists('cart_items', 'customization_hash'):
        op.drop_column('cart_items', 'customization_hash')
