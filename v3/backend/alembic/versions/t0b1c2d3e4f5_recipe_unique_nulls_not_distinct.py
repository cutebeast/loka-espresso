"""recipe uniqueness treats NULL menu_variant_id as a real key

Plain UNIQUE treats NULLs as distinct, so duplicate generic recipes
(menu_variant_id IS NULL) could accumulate and double-deduct stock on every
sale. PG15+ NULLS NOT DISTINCT closes that.

Revision ID: t0b1c2d3e4f5
Revises: s9a0b1c2d3e4
Create Date: 2026-08-07
"""
from alembic import op

revision = "t0b1c2d3e4f5"
down_revision = "s9a0b1c2d3e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Defensive: collapse any existing duplicate generic/variant recipes first
    op.execute("""
        DELETE FROM menu_item_recipes a
        USING menu_item_recipes b
        WHERE a.menu_item_id = b.menu_item_id
          AND a.inventory_item_id = b.inventory_item_id
          AND a.menu_variant_id IS NOT DISTINCT FROM b.menu_variant_id
          AND a.id > b.id
    """)
    op.drop_constraint(
        "menu_item_recipes_menu_item_id_menu_variant_id_inventory_it_key",
        "menu_item_recipes",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_menu_item_recipes_item_variant_inventory",
        "menu_item_recipes",
        ["menu_item_id", "menu_variant_id", "inventory_item_id"],
        postgresql_nulls_not_distinct=True,
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_menu_item_recipes_item_variant_inventory", "menu_item_recipes", type_="unique"
    )
    op.create_unique_constraint(
        "menu_item_recipes_menu_item_id_menu_variant_id_inventory_it_key",
        "menu_item_recipes",
        ["menu_item_id", "menu_variant_id", "inventory_item_id"],
    )
