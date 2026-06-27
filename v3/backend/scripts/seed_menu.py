#!/usr/bin/env python3
"""Seed menu categories, items, modifiers, recipes and bundle products."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from scripts._db_utils import confirm, get_db, guard_production


CATEGORIES = [
    {"category_name": "Beverages", "slug": "beverages", "description": "Coffee, tea and drinks", "display_order": 1},
    {"category_name": "Food", "slug": "food", "description": "Pastries and bites", "display_order": 2},
    {"category_name": "Add-ons", "slug": "add-ons", "description": "Extras and sides", "display_order": 3},
]

TAX_CATEGORY = {"name": "SST", "rate": 0.0}

MENU_ITEMS = [
    # (item_code, item_name, category_slug, base_price, prep_time)
    ("ESP", "Espresso", "beverages", 8.00, 3),
    ("LAT", "Caffè Latte", "beverages", 12.00, 5),
    ("CRO", "Butter Croissant", "food", 7.00, 2),
    ("MUF", "Blueberry Muffin", "food", 8.00, 2),
    ("WATER", "Mineral Water", "add-ons", 3.00, 1),
]

MODIFIER_GROUPS = {
    "ESP": [
        {
            "group_name": "Size",
            "selection_type": "single",
            "is_required": True,
            "min_selections": 1,
            "max_selections": 1,
            "options": [
                {"option_name": "Single", "price_adjustment": 0, "is_default": True, "display_order": 1},
                {"option_name": "Double", "price_adjustment": 2.00, "is_default": False, "display_order": 2},
            ],
        },
    ],
    "LAT": [
        {
            "group_name": "Size",
            "selection_type": "single",
            "is_required": True,
            "min_selections": 1,
            "max_selections": 1,
            "options": [
                {"option_name": "Regular", "price_adjustment": 0, "is_default": True, "display_order": 1},
                {"option_name": "Large", "price_adjustment": 2.50, "is_default": False, "display_order": 2},
            ],
        },
        {
            "group_name": "Milk",
            "selection_type": "single",
            "is_required": True,
            "min_selections": 1,
            "max_selections": 1,
            "options": [
                {"option_name": "Regular Milk", "price_adjustment": 0, "is_default": True, "display_order": 1},
                {"option_name": "Oat Milk", "price_adjustment": 2.00, "is_default": False, "display_order": 2},
                {"option_name": "Almond Milk", "price_adjustment": 2.00, "is_default": False, "display_order": 3},
            ],
        },
    ],
}

RECIPES = {
    # item_code: list of (inventory_item_code, qty, uom)
    "ESP": [("BEV-001", 0.02, "kg")],
    "LAT": [("BEV-001", 0.02, "kg"), ("BEV-002", 0.20, "L")],
    "CRO": [("FOD-001", 0.10, "kg"), ("FOD-002", 0.05, "kg")],
    "MUF": [("FOD-001", 0.08, "kg"), ("FOD-002", 0.04, "kg")],
}

BUNDLES = [
    {
        "title": "Coffee & Pastry",
        "slug": "coffee-pastry",
        "bundle_type": "combo",
        "bundle_price": 12.00,
        "max_per_order": 2,
        "components": [
            {"item_code": "ESP", "default_quantity": 1},
            {"item_code": "CRO", "default_quantity": 1},
        ],
    },
]


async def _upsert_tax_category(db, data):
    existing = await db.execute(
        text("SELECT id FROM tax_categories WHERE category_name = :name"),
        {"name": data["name"]},
    )
    tax_id = existing.scalar_one_or_none()
    if tax_id:
        await db.execute(
            text("UPDATE tax_categories SET rate = :rate WHERE id = :id"),
            {"id": tax_id, "rate": data["rate"]},
        )
        return tax_id
    result = await db.execute(
        text("""
            INSERT INTO tax_categories (category_name, rate, is_active)
            VALUES (:name, :rate, true)
            RETURNING id
        """),
        data,
    )
    return result.scalar_one()


async def _upsert_menu_category(db, data):
    existing = await db.execute(
        text("SELECT id FROM menu_categories WHERE slug = :slug"),
        {"slug": data["slug"]},
    )
    cat_id = existing.scalar_one_or_none()
    if cat_id:
        await db.execute(
            text("""
                UPDATE menu_categories
                SET category_name = :category_name,
                    description = :description,
                    display_order = :display_order,
                    is_available = true
                WHERE id = :id
            """),
            {"id": cat_id, **data},
        )
        return cat_id
    result = await db.execute(
        text("""
            INSERT INTO menu_categories (category_name, slug, description, display_order, is_available, category_type)
            VALUES (:category_name, :slug, :description, :display_order, true, 'regular')
            RETURNING id
        """),
        data,
    )
    return result.scalar_one()


async def _upsert_menu_item(db, data):
    result = await db.execute(
        text("""
            INSERT INTO menu_items
                (category_id, item_code, item_name, base_price, prep_time_minutes, tax_category_id, is_available, is_featured)
            VALUES (:category_id, :code, :name, :price, :prep, :tax_id, true, true)
            ON CONFLICT (item_code) DO UPDATE SET
                category_id = EXCLUDED.category_id,
                item_name = EXCLUDED.item_name,
                base_price = EXCLUDED.base_price,
                prep_time_minutes = EXCLUDED.prep_time_minutes,
                tax_category_id = EXCLUDED.tax_category_id,
                is_available = true
            RETURNING id
        """),
        data,
    )
    return result.scalar_one()


async def _load_existing_groups(db):
    rows = await db.execute(text("SELECT id, menu_item_id, group_name FROM menu_modifier_groups"))
    return {(row[1], row[2]): row[0] for row in rows.all()}


async def _load_existing_options(db):
    rows = await db.execute(text("SELECT id, modifier_group_id, option_name FROM menu_modifier_options"))
    return {(row[1], row[2]): row[0] for row in rows.all()}


async def _upsert_modifier_group(db, existing_groups, item_id, group):
    key = (item_id, group["group_name"])
    group_id = existing_groups.get(key)
    if group_id:
        await db.execute(
            text("""
                UPDATE menu_modifier_groups
                SET selection_type = :selection_type,
                    is_required = :is_required,
                    min_selections = :min_selections,
                    max_selections = :max_selections,
                    display_order = :display_order
                WHERE id = :id
            """),
            {
                "id": group_id,
                "selection_type": group["selection_type"],
                "is_required": group["is_required"],
                "min_selections": group["min_selections"],
                "max_selections": group["max_selections"],
                "display_order": 0,
            },
        )
        return group_id
    result = await db.execute(
        text("""
            INSERT INTO menu_modifier_groups
                (menu_item_id, group_name, selection_type, is_required, min_selections, max_selections, display_order)
            VALUES (:item_id, :group_name, :selection_type, :is_required, :min_selections, :max_selections, :display_order)
            RETURNING id
        """),
        {
            "item_id": item_id,
            "group_name": group["group_name"],
            "selection_type": group["selection_type"],
            "is_required": group["is_required"],
            "min_selections": group["min_selections"],
            "max_selections": group["max_selections"],
            "display_order": 0,
        },
    )
    group_id = result.scalar_one()
    existing_groups[key] = group_id
    return group_id


async def _upsert_modifier_option(db, existing_options, group_id, option):
    key = (group_id, option["option_name"])
    opt_id = existing_options.get(key)
    if opt_id:
        await db.execute(
            text("""
                UPDATE menu_modifier_options
                SET price_adjustment = :price_adjustment,
                    is_default = :is_default,
                    is_available = true,
                    display_order = :display_order
                WHERE id = :id
            """),
            {
                "id": opt_id,
                "price_adjustment": option["price_adjustment"],
                "is_default": option["is_default"],
                "display_order": option["display_order"],
            },
        )
        return opt_id
    result = await db.execute(
        text("""
            INSERT INTO menu_modifier_options
                (modifier_group_id, option_name, price_adjustment, is_default, is_available, display_order)
            VALUES (:group_id, :option_name, :price_adjustment, :is_default, true, :display_order)
            RETURNING id
        """),
        {
            "group_id": group_id,
            "option_name": option["option_name"],
            "price_adjustment": option["price_adjustment"],
            "is_default": option["is_default"],
            "display_order": option["display_order"],
        },
    )
    opt_id = result.scalar_one()
    existing_options[key] = opt_id
    return opt_id


async def _upsert_bundle(db, data):
    existing = await db.execute(
        text("SELECT id FROM bundle_products WHERE title = :title AND deleted_at IS NULL"),
        {"title": data["title"]},
    )
    bundle_id = existing.scalar_one_or_none()
    if bundle_id:
        await db.execute(
            text("""
                UPDATE bundle_products
                SET bundle_type = :bundle_type,
                    bundle_price = :bundle_price,
                    is_active = true,
                    max_per_order = :max_per_order
                WHERE id = :id
            """),
            {
                "id": bundle_id,
                "bundle_type": data["bundle_type"],
                "bundle_price": data["bundle_price"],
                "max_per_order": data["max_per_order"],
            },
        )
    else:
        result = await db.execute(
            text("""
                INSERT INTO bundle_products (bundle_type, title, bundle_price, is_active, max_per_order)
                VALUES (:bundle_type, :title, :bundle_price, true, :max_per_order)
                RETURNING id
            """),
            {
                "bundle_type": data["bundle_type"],
                "title": data["title"],
                "bundle_price": data["bundle_price"],
                "max_per_order": data["max_per_order"],
            },
        )
        bundle_id = result.scalar_one()

    # Re-create components for idempotence (no unique constraint on components)
    await db.execute(
        text("DELETE FROM bundle_product_components WHERE bundle_product_id = :bundle_id"),
        {"bundle_id": bundle_id},
    )
    return bundle_id


async def seed():
    async with get_db() as db:
        tax_id = await _upsert_tax_category(db, TAX_CATEGORY)

        cat_map = {}
        for cat in CATEGORIES:
            cat_map[cat["slug"]] = await _upsert_menu_category(db, cat)

        inv_result = await db.execute(text("SELECT id, item_code FROM inventory_items"))
        inv_map = {row[1]: row[0] for row in inv_result.all()}

        item_map = {}
        for code, name, cat_slug, price, prep in MENU_ITEMS:
            category_id = cat_map[cat_slug]
            item_map[code] = await _upsert_menu_item(
                db,
                {
                    "category_id": category_id,
                    "code": code,
                    "name": name,
                    "price": price,
                    "prep": prep,
                    "tax_id": tax_id,
                },
            )

        existing_groups = await _load_existing_groups(db)
        existing_options = await _load_existing_options(db)
        for item_code, groups in MODIFIER_GROUPS.items():
            item_id = item_map[item_code]
            for group in groups:
                group_id = await _upsert_modifier_group(db, existing_groups, item_id, group)
                for option in group["options"]:
                    await _upsert_modifier_option(db, existing_options, group_id, option)

        for item_code, ingredients in RECIPES.items():
            item_id = item_map[item_code]
            for inv_code, qty, uom in ingredients:
                inv_id = inv_map.get(inv_code)
                if not inv_id:
                    print(f"  Warning: inventory item {inv_code} not found, skipping recipe for {item_code}")
                    continue
                await db.execute(
                    text("""
                        INSERT INTO menu_item_recipes
                            (menu_item_id, inventory_item_id, quantity_required, unit_of_measure, is_primary_component, waste_factor)
                        VALUES (:item_id, :inv_id, :qty, :uom, true, 0.05)
                        ON CONFLICT (menu_item_id, menu_variant_id, inventory_item_id) DO UPDATE SET
                            quantity_required = EXCLUDED.quantity_required,
                            unit_of_measure = EXCLUDED.unit_of_measure
                    """),
                    {"item_id": item_id, "inv_id": inv_id, "qty": qty, "uom": uom},
                )

        for bundle in BUNDLES:
            bundle_id = await _upsert_bundle(db, bundle)
            for comp in bundle["components"]:
                menu_item_id = item_map.get(comp["item_code"])
                if not menu_item_id:
                    continue
                await db.execute(
                    text("""
                        INSERT INTO bundle_product_components
                            (bundle_product_id, menu_item_id, default_quantity, sort_order)
                        VALUES (:bundle_id, :menu_item_id, :qty, :sort)
                    """),
                    {
                        "bundle_id": bundle_id,
                        "menu_item_id": menu_item_id,
                        "qty": comp["default_quantity"],
                        "sort": 0,
                    },
                )
            print(f"  Bundle '{bundle['title']}' id={bundle_id}")


async def main():
    parser = argparse.ArgumentParser(description="Seed menu data")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Seed menu categories, items, modifiers, recipes and bundles?", args.yes):
        print("Aborted.")
        return

    await seed()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
