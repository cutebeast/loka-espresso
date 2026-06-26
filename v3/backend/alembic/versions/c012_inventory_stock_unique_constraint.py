"""add unique constraint on inventory_stock(item, store)

Revision ID: c012_inventory_stock_unique
Revises: c011_category_availability
Create Date: 2026-06-26 07:20:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c012_inventory_stock_unique'
down_revision = 'c011_category_availability'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint(
        'uq_inventory_stock_item_store',
        'inventory_stock',
        ['inventory_item_id', 'store_id']
    )


def downgrade() -> None:
    op.drop_constraint(
        'uq_inventory_stock_item_store',
        'inventory_stock',
        type_='unique'
    )
