"""Migrate customization_options JSON → normalized table, then drop JSON column.

This moves any existing JSON data from menu_items.customization_options
into the customization_options normalized table, then removes the column.

The JSON column stores data as a dict mapping option names to price_adjustments,
e.g. {"Extra Shot": 0.50, "Oat Milk": 0.75}.

Revision ID: 6b92efcd789d
Revises: 5a81abc564c3
Create Date: 2026-04-26 12:00:00.000000
"""

from alembic import op
from sqlalchemy import text

revision = "6b92efcd789d"
down_revision = "5a81abc564c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Migrate JSON data and drop the column."""
    conn = op.get_bind()

    # 1. Insert rows into customization_options from the JSON column
    rows = conn.execute(
        text("SELECT id, customization_options FROM menu_items WHERE customization_options IS NOT NULL")
    ).fetchall()

    insert_count = 0
    for item_id, json_data in rows:
        if not json_data:
            continue
        # json_data is a dict like {"name": price_adjustment, ...}
        if isinstance(json_data, dict):
            for idx, (name, price_adj) in enumerate(json_data.items()):
                try:
                    price = float(price_adj) if price_adj is not None else 0.0
                except (ValueError, TypeError):
                    price = 0.0
                conn.execute(
                    text(
                        "INSERT INTO customization_options (menu_item_id, name, price_adjustment, is_active, display_order, created_at) "
                        "VALUES (:mid, :name, :price, true, :display_order, now())"
                    ),
                    {"mid": item_id, "name": str(name), "price": price, "display_order": idx},
                )
                insert_count += 1

    # 2. Drop the JSON column
    op.execute(text("ALTER TABLE menu_items DROP COLUMN IF EXISTS customization_options"))


def downgrade() -> None:
    """Restore the JSON column (data cannot be recovered from normalized table)."""
    op.execute(text("ALTER TABLE menu_items ADD COLUMN customization_options JSON"))
