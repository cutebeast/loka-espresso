"""universal_menu_v7

Remove store_id from MenuCategory and MenuItem to reflect the universal
HQ-managed menu model. The menu is the same across all stores; only the
order fulfillment store varies (recorded on CartItem and Order).

Revision ID: daa03ba00ba7
Revises: apr2026_audit_metadata_v6
Create Date: 2026-04-25 14:53:38.064079

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'daa03ba00ba7'
down_revision: Union[str, None] = 'apr2026_audit_metadata_v6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── menu_categories ──
    op.drop_constraint('menu_categories_store_id_fkey', 'menu_categories', type_='foreignkey')
    op.drop_index('ix_menu_categories_store_id', table_name='menu_categories')
    op.drop_column('menu_categories', 'store_id')

    # ── menu_items ──
    op.drop_constraint('menu_items_store_id_fkey', 'menu_items', type_='foreignkey')
    op.drop_index('ix_menu_items_store_id', table_name='menu_items')
    op.drop_column('menu_items', 'store_id')

    # Create a useful index for the PWA menu queries that filter by category + availability
    op.create_index('ix_menu_cat_avail', 'menu_items', ['category_id', 'is_available'])


def downgrade() -> None:
    # ── menu_items ──
    op.drop_index('ix_menu_cat_avail', table_name='menu_items')
    op.add_column('menu_items', sa.Column('store_id', sa.INTEGER(), autoincrement=False, nullable=False, server_default='0'))
    op.create_index('ix_menu_items_store_id', 'menu_items', ['store_id'])
    op.create_foreign_key('menu_items_store_id_fkey', 'menu_items', 'stores', ['store_id'], ['id'])
    op.alter_column('menu_items', 'store_id', server_default=None)

    # ── menu_categories ──
    op.add_column('menu_categories', sa.Column('store_id', sa.INTEGER(), autoincrement=False, nullable=False, server_default='0'))
    op.create_index('ix_menu_categories_store_id', 'menu_categories', ['store_id'])
    op.create_foreign_key('menu_categories_store_id_fkey', 'menu_categories', 'stores', ['store_id'], ['id'])
    op.alter_column('menu_categories', 'store_id', server_default=None)
