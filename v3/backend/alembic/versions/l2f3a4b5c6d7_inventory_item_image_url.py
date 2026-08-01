"""image_url on inventory_items

Revision ID: l2f3a4b5c6d7
Revises: k1e2f3a4b5c6
Create Date: 2026-08-01

The admin-portal inventory item edit page uploads/reads/sends image_url,
but inventory_items had no such column, so the value was silently dropped.
Adds a nullable image_url column (same shape as menu_items.image_url).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'l2f3a4b5c6d7'
down_revision = 'k1e2f3a4b5c6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "inventory_items",
        sa.Column("image_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("inventory_items", "image_url")
