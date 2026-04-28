"""Drop redundant legacy index ix_menu_cat_avail.

The 2-column index ix_menu_cat_avail(category_id, is_available) is superseded by
the 3-column ix_menu_items_category_available(category_id, is_available, display_order)
added in migration 8d56ef9012ab.

Revision ID: a1b2c3d4e5f6
Revises: 8d56ef9012ab
Create Date: 2026-04-26 16:20:00.000000
"""

from alembic import op
from sqlalchemy import text

revision = "a1b2c3d4e5f6"
down_revision = "8d56ef9012ab"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(text("DROP INDEX IF EXISTS ix_menu_cat_avail;"))


def downgrade() -> None:
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_menu_cat_avail ON menu_items (category_id, is_available);"))
