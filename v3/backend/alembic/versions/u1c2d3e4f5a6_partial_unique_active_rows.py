"""partial unique indexes on soft-deletable config tables

Plain UNIQUE constraints held deleted rows hostage: a soft-deleted "Coke"
kept its item_code forever, so recreating it failed with a duplicate-key
error. Uniqueness now applies only to live rows (deleted_at IS NULL).

Revision ID: u1c2d3e4f5a6
Revises: t0b1c2d3e4f5
Create Date: 2026-08-07
"""
from alembic import op

revision = "u1c2d3e4f5a6"
down_revision = "t0b1c2d3e4f5"
branch_labels = None
depends_on = None

# (table, column, old constraint name, new partial index name)
TARGETS = [
    ("menu_items", "item_code", "menu_items_item_code_key", "uq_menu_items_item_code_active"),
    ("menu_categories", "slug", "menu_categories_slug_key", "uq_menu_categories_slug_active"),
    ("allergens", "allergen_key", "allergens_allergen_key_key", "uq_allergens_allergen_key_active"),
    ("inventory_items", "item_code", "inventory_items_item_code_key", "uq_inventory_items_item_code_active"),
    ("bundle_categories", "slug", "bundle_categories_slug_key", "uq_bundle_categories_slug_active"),
    ("bundle_types", "type_key", "bundle_types_type_key_key", "uq_bundle_types_type_key_active"),
    ("event_categories", "slug", "event_categories_slug_key", "uq_event_categories_slug_active"),
    ("stores", "store_code", "stores_store_code_key", "uq_stores_store_code_active"),
    ("stores", "slug", "stores_slug_key", "uq_stores_slug_active"),
    ("voucher_definitions", "voucher_code", "voucher_definitions_voucher_code_key", "uq_voucher_definitions_voucher_code_active"),
    ("reward_catalog", "reward_key", "reward_catalog_reward_key_key", "uq_reward_catalog_reward_key_active"),
    ("survey_definitions", "survey_key", "survey_definitions_survey_key_key", "uq_survey_definitions_survey_key_active"),
]


def upgrade() -> None:
    for table, col, constraint, index in TARGETS:
        # IF EXISTS: baseline drift means some constraints never existed live
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}")
        op.execute(f"DROP INDEX IF EXISTS {index}")
        op.execute(
            f"CREATE UNIQUE INDEX {index} ON {table} ({col}) WHERE deleted_at IS NULL"
        )


def downgrade() -> None:
    for table, col, constraint, index in TARGETS:
        op.execute(f"DROP INDEX IF EXISTS {index}")
        op.execute(
            f"ALTER TABLE {table} ADD CONSTRAINT {constraint} UNIQUE ({col})"
        )
