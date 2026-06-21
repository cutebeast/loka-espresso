"""add_menu_items_category_id_index

Revision ID: c009_menu_category_index
Revises: c008_bundle_groups
Create Date: 2026-06-20 09:25:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'c009_menu_category_index'
down_revision = 'c008_bundle_groups'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index('ix_menu_items_category_id', 'menu_items', ['category_id'], if_not_exists=True)


def downgrade() -> None:
    op.drop_index('ix_menu_items_category_id', table_name='menu_items', if_exists=True)
