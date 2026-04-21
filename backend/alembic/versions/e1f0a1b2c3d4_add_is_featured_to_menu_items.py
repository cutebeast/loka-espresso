"""add is_featured to menu_items

Revision ID: e1f0a1b2c3d4
Revises: c1c045a7bbab
Create Date: 2026-04-20 17:50:00.000000

Adds a boolean column to mark admin-curated featured menu items
that should appear in the PWA home page's "Today's recommendations".
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e1f0a1b2c3d4"
down_revision = "c1c045a7bbab"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "menu_items",
        sa.Column(
            "is_featured",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index(
        "ix_menu_items_is_featured",
        "menu_items",
        ["is_featured"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_menu_items_is_featured", table_name="menu_items")
    op.drop_column("menu_items", "is_featured")
