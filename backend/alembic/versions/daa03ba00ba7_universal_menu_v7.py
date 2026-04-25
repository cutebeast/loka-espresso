"""Universal menu v7 — remove store_id from menu_categories and menu_items.

Revision ID: daa03ba00ba7
Revises: apr2026_audit_metadata_v6
Create Date: 2026-04-25 16:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from app import migration_utils as au

revision = 'daa03ba00ba7'
down_revision = 'apr2026_audit_metadata_v6'
branch_labels = None
depends_on = None


def upgrade():
    # menu_categories
    if au.constraint_exists('menu_categories', 'menu_categories_store_id_fkey'):
        op.drop_constraint('menu_categories_store_id_fkey', 'menu_categories', type_='foreignkey')
    if au.index_exists('menu_categories', 'ix_menu_categories_store_id'):
        op.drop_index('ix_menu_categories_store_id', table_name='menu_categories')
    if au.column_exists('menu_categories', 'store_id'):
        op.drop_column('menu_categories', 'store_id')

    # menu_items
    if au.constraint_exists('menu_items', 'menu_items_store_id_fkey'):
        op.drop_constraint('menu_items_store_id_fkey', 'menu_items', type_='foreignkey')
    if au.index_exists('menu_items', 'ix_menu_items_store_id'):
        op.drop_index('ix_menu_items_store_id', table_name='menu_items')
    if au.column_exists('menu_items', 'store_id'):
        op.drop_column('menu_items', 'store_id')

    if not au.index_exists('menu_items', 'ix_menu_cat_avail'):
        op.create_index('ix_menu_cat_avail', 'menu_items', ['category_id', 'is_available'])


def downgrade():
    if au.index_exists('menu_items', 'ix_menu_cat_avail'):
        op.drop_index('ix_menu_cat_avail', table_name='menu_items')

    if not au.column_exists('menu_items', 'store_id'):
        op.add_column('menu_items', sa.Column('store_id', sa.INTEGER(), autoincrement=False, nullable=False, server_default='0'))
    if not au.index_exists('menu_items', 'ix_menu_items_store_id'):
        op.create_index('ix_menu_items_store_id', 'menu_items', ['store_id'])
    op.execute("ALTER TABLE menu_items ALTER COLUMN store_id DROP DEFAULT")

    if not au.column_exists('menu_categories', 'store_id'):
        op.add_column('menu_categories', sa.Column('store_id', sa.INTEGER(), autoincrement=False, nullable=False, server_default='0'))
    if not au.index_exists('menu_categories', 'ix_menu_categories_store_id'):
        op.create_index('ix_menu_categories_store_id', 'menu_categories', ['store_id'])
    op.execute("ALTER TABLE menu_categories ALTER COLUMN store_id DROP DEFAULT")
