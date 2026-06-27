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

ITEMS = [
    {"item_code": "BEV-001", "item_name": "Coffee Beans", "category_slug": "beverages", "unit_of_measure": "kg", "unit_cost": 25.00, "item_type": "fnb"},
    {"item_code": "BEV-002", "item_name": "Fresh Milk", "category_slug": "beverages", "unit_of_measure": "L", "unit_cost": 8.50, "item_type": "fnb"},
    {"item_code": "BEV-003", "item_name": "Tea Bags", "category_slug": "beverages", "unit_of_measure": "pcs", "unit_cost": 0.15, "item_type": "fnb"},
    {"item_code": "BEV-004", "item_name": "Caster Sugar", "category_slug": "beverages", "unit_of_measure": "kg", "unit_cost": 3.50, "item_type": "fnb"},
    {"item_code": "FOD-001", "item_name": "Premium Flour", "category_slug": "food-supplies", "unit_of_measure": "kg", "unit_cost": 4.00, "item_type": "fnb"},
    {"item_code": "FOD-002", "item_name": "Unsalted Butter", "category_slug": "food-supplies", "unit_of_measure": "kg", "unit_cost": 12.00, "item_type": "fnb"},
    {"item_code": "DIS-001", "item_name": "Paper Cups 12oz", "category_slug": "disposables", "unit_of_measure": "pcs", "unit_cost": 0.20, "item_type": "non_fnb"},
    {"item_code": "DIS-002", "item_name": "Plastic Lids", "category_slug": "disposables", "unit_of_measure": "pcs", "unit_cost": 0.10, "item_type": "non_fnb"},
    {"item_code": "CLN-001", "item_name": "Dishwashing Liquid", "category_slug": "cleaning", "unit_of_measure": "L", "unit_cost": 5.00, "item_type": "non_fnb"},
    {"item_code": "CLN-002", "item_name": "Hand Sanitizer", "category_slug": "cleaning", "unit_of_measure": "L", "unit_cost": 8.00, "item_type": "non_fnb"},
]

STOCK_LEVELS = {
    "BEV-001": {"current_stock": 50.0, "reserved_stock": 0, "reorder_level": 10.0, "reorder_quantity": 25.0, "par_level": 40.0, "storage_location": "Store Room A"},
    "BEV-002": {"current_stock": 30.0, "reserved_stock": 0, "reorder_level": 5.0, "reorder_quantity": 15.0, "par_level": 20.0, "storage_location": "Fridge 1"},
    "BEV-003": {"current_stock": 500.0, "reserved_stock": 0, "reorder_level": 100.0, "reorder_quantity": 200.0, "par_level": 300.0, "storage_location": "Store Room A"},
    "BEV-004": {"current_stock": 20.0, "reserved_stock": 0, "reorder_level": 5.0, "reorder_quantity": 10.0, "par_level": 15.0, "storage_location": "Store Room A"},
    "FOD-001": {"current_stock": 40.0, "reserved_stock": 0, "reorder_level": 10.0, "reorder_quantity": 20.0, "par_level": 30.0, "storage_location": "Store Room B"},
    "FOD-002": {"current_stock": 15.0, "reserved_stock": 0, "reorder_level": 5.0, "reorder_quantity": 10.0, "par_level": 12.0, "storage_location": "Fridge 2"},
    "DIS-001": {"current_stock": 1000.0, "reserved_stock": 0, "reorder_level": 200.0, "reorder_quantity": 500.0, "par_level": 800.0, "storage_location": "Store Room C"},
    "DIS-002": {"current_stock": 800.0, "reserved_stock": 0, "reorder_level": 200.0, "reorder_quantity": 400.0, "par_level": 600.0, "storage_location": "Store Room C"},
    "CLN-001": {"current_stock": 10.0, "reserved_stock": 0, "reorder_level": 2.0, "reorder_quantity": 5.0, "par_level": 8.0, "storage_location": "Janitor Closet"},
    "CLN-002": {"current_stock": 8.0, "reserved_stock": 0, "reorder_level": 2.0, "reorder_quantity": 4.0, "par_level": 6.0, "storage_location": "Janitor Closet"},
}


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
