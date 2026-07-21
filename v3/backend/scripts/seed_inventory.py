#!/usr/bin/env python3
"""Seed inventory categories, items and per-store stock levels."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from scripts._db_utils import confirm, get_db, guard_production


CATEGORIES = [
    {"category_name": "Beverages", "slug": "beverages", "display_order": 1},
    {"category_name": "Food Supplies", "slug": "food-supplies", "display_order": 2},
    {"category_name": "Disposables", "slug": "disposables", "display_order": 3},
    {"category_name": "Cleaning", "slug": "cleaning", "display_order": 4},
]

# Fake demo inventory data cleared on 2026-07-20 (round 32) — real inventory
# will be imported later. Populate the lists below and re-run.
ITEMS: list[dict] = []

STOCK_LEVELS: dict = {}


async def seed():
    async with get_db() as db:
        # Categories (idempotent by slug; no unique constraint on slug in schema)
        existing_result = await db.execute(text("SELECT id, slug FROM inventory_categories"))
        cat_map = {slug: cat_id for cat_id, slug in existing_result.all()}

        for cat in CATEGORIES:
            if cat["slug"] in cat_map:
                await db.execute(
                    text("""
                        UPDATE inventory_categories
                        SET category_name = :category_name,
                            display_order = :display_order
                        WHERE id = :id
                    """),
                    {"id": cat_map[cat["slug"]], **cat},
                )
            else:
                result = await db.execute(
                    text("""
                        INSERT INTO inventory_categories (category_name, slug, display_order)
                        VALUES (:category_name, :slug, :display_order)
                        RETURNING id
                    """),
                    cat,
                )
                cat_map[cat["slug"]] = result.scalar_one()

        # Items
        item_map = {}
        for item_data in ITEMS:
            category_id = cat_map[item_data["category_slug"]]
            result = await db.execute(
                text("""
                    INSERT INTO inventory_items
                        (category_id, item_code, item_name, unit_of_measure, unit_cost, item_type)
                    VALUES (:category_id, :item_code, :item_name, :unit_of_measure, :unit_cost, :item_type)
                    ON CONFLICT (item_code) DO UPDATE SET
                        item_name = EXCLUDED.item_name,
                        category_id = EXCLUDED.category_id
                    RETURNING id
                """),
                {
                    "category_id": category_id,
                    "item_code": item_data["item_code"],
                    "item_name": item_data["item_name"],
                    "unit_of_measure": item_data["unit_of_measure"],
                    "unit_cost": item_data["unit_cost"],
                    "item_type": item_data["item_type"],
                },
            )
            item_map[item_data["item_code"]] = result.scalar_one()

        # Stock per store
        store_result = await db.execute(text("SELECT id FROM stores WHERE deleted_at IS NULL"))
        store_ids = [row[0] for row in store_result.all()]

        created = 0
        for store_id in store_ids:
            for item_code, item_id in item_map.items():
                levels = STOCK_LEVELS.get(item_code, {
                    "current_stock": 0, "reserved_stock": 0, "reorder_level": 0,
                    "reorder_quantity": 0, "par_level": 0, "storage_location": None,
                })
                result = await db.execute(
                    text("""
                        INSERT INTO inventory_stock
                            (inventory_item_id, store_id, current_stock, reserved_stock,
                             reorder_level, reorder_quantity, par_level, storage_location)
                        VALUES (:item_id, :store_id, :current_stock, :reserved_stock,
                                :reorder_level, :reorder_quantity, :par_level, :storage_location)
                        ON CONFLICT (inventory_item_id, store_id) DO UPDATE SET
                            current_stock = EXCLUDED.current_stock,
                            reserved_stock = EXCLUDED.reserved_stock,
                            reorder_level = EXCLUDED.reorder_level,
                            reorder_quantity = EXCLUDED.reorder_quantity,
                            par_level = EXCLUDED.par_level,
                            storage_location = EXCLUDED.storage_location
                    """),
                    {"item_id": item_id, "store_id": store_id, **levels},
                )
                created += 1
        print(f"  Upserted stock for {len(item_map)} item(s) across {len(store_ids)} store(s)")


async def main():
    parser = argparse.ArgumentParser(description="Seed inventory data")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Seed inventory categories, items and stock?", args.yes):
        print("Aborted.")
        return

    await seed()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
