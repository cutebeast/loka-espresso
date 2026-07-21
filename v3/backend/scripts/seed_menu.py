#!/usr/bin/env python3
"""Seed the real Loka Espresso menu (boss-confirmed, 2026-07-20).

Data lives in scripts/seed_menu_data.py. This script is idempotent: items are
upserted by item_code; per-item children (variants, modifier groups/options,
allergen links, dietary tag links, recipes) are rebuilt on each run. Item
images are copied from backend/seed-assets/menu-images into the uploads dir.
"""

from __future__ import annotations

import argparse
import asyncio
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from scripts._db_utils import SETTINGS, confirm, get_db, guard_production
from scripts.seed_menu_data import (
    ALLERGENS,
    ASSETS,
    BAKLAVA_VARIANTS,
    CATEGORIES,
    INGREDIENTS,
    ITEMS,
    MOD_DRINK,
    MOD_PULLED_CHICKEN,
    RECIPES,
    STARTER_STOCK,
    TAX_CATEGORY,
)

MOD_TEMPLATES = {"drink": MOD_DRINK, "chicken": MOD_PULLED_CHICKEN}
IMG_URL_PREFIX = "/uploads/images/menu"


async def _upsert_tax_category(db, data):
    existing = await db.execute(
        text("SELECT id FROM tax_categories WHERE category_name = :name"),
        {"name": data["name"]},
    )
    tax_id = existing.scalar_one_or_none()
    if tax_id:
        return tax_id
    result = await db.execute(
        text("INSERT INTO tax_categories (category_name, rate, is_active) VALUES (:name, :rate, true) RETURNING id"),
        data,
    )
    return result.scalar_one()


async def _upsert_allergens(db):
    for a in ALLERGENS:
        await db.execute(
            text("""
                INSERT INTO allergens (allergen_key, display_name, description, severity, is_active)
                VALUES (:key, :name, :desc, 'high', true)
                ON CONFLICT (allergen_key) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    description = EXCLUDED.description,
                    is_active = true
            """),
            {"key": a["key"], "name": a["name"], "desc": a["description"]},
        )


async def _upsert_categories(db):
    # menu_categories.slug has no unique constraint — manual lookup-then-write.
    cat_ids = {}
    for c in CATEGORIES:
        existing = await db.execute(
            text("SELECT id FROM menu_categories WHERE slug = :slug"),
            {"slug": c["slug"]},
        )
        row = existing.scalar_one_or_none()
        if row:
            await db.execute(
                text("""
                    UPDATE menu_categories SET
                        category_name = :name, description = :desc,
                        display_order = :order, is_available = true, deleted_at = NULL
                    WHERE id = :id
                """),
                {"name": c["name"], "slug": c["slug"], "desc": c["description"], "order": c["order"], "id": row},
            )
            cat_ids[c["slug"]] = row
        else:
            result = await db.execute(
                text("""
                    INSERT INTO menu_categories (category_name, slug, description, display_order, is_available)
                    VALUES (:name, :slug, :desc, :order, true)
                    RETURNING id
                """),
                {"name": c["name"], "slug": c["slug"], "desc": c["description"], "order": c["order"]},
            )
            cat_ids[c["slug"]] = result.scalar_one()
    return cat_ids


def _copy_image(cat_slug: str, filename: str | None) -> str | None:
    if not filename:
        return None
    src = ASSETS / cat_slug / filename
    if not src.exists():
        print(f"  WARNING: missing image {src}")
        return None
    dest_dir = Path(SETTINGS.upload_dir) / "images" / "menu" / cat_slug
    dest_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest_dir / filename)
    return f"{IMG_URL_PREFIX}/{cat_slug}/{filename}"


async def _clear_item_children(db, item_id):
    await db.execute(
        text("DELETE FROM menu_modifier_options WHERE modifier_group_id IN (SELECT id FROM menu_modifier_groups WHERE menu_item_id = :id)"),
        {"id": item_id},
    )
    await db.execute(text("DELETE FROM menu_modifier_groups WHERE menu_item_id = :id"), {"id": item_id})
    await db.execute(text("DELETE FROM menu_variants WHERE parent_item_id = :id"), {"id": item_id})
    await db.execute(text("DELETE FROM menu_item_allergens WHERE menu_item_id = :id"), {"id": item_id})
    await db.execute(text("DELETE FROM menu_item_dietary_tags WHERE menu_item_id = :id"), {"id": item_id})
    await db.execute(text("DELETE FROM menu_item_recipes WHERE menu_item_id = :id"), {"id": item_id})


async def _upsert_item(db, item, cat_id, tax_id, image_url):
    result = await db.execute(
        text("""
            INSERT INTO menu_items (
                category_id, item_code, item_name, description, base_price,
                image_url, is_available, is_featured, is_popular, display_order,
                prep_time_minutes, tax_category_id
            ) VALUES (
                :cat_id, :code, :name, :desc, :price,
                :img, true, :featured, :featured, :order,
                :prep, :tax_id
            )
            ON CONFLICT (item_code) DO UPDATE SET
                category_id = EXCLUDED.category_id,
                item_name = EXCLUDED.item_name,
                description = EXCLUDED.description,
                base_price = EXCLUDED.base_price,
                image_url = EXCLUDED.image_url,
                is_available = true,
                is_featured = EXCLUDED.is_featured,
                is_popular = EXCLUDED.is_popular,
                prep_time_minutes = EXCLUDED.prep_time_minutes,
                tax_category_id = EXCLUDED.tax_category_id,
                deleted_at = NULL
            RETURNING id
        """),
        {
            "cat_id": cat_id,
            "code": item["code"],
            "name": item["name"],
            "desc": item.get("desc"),
            "price": item["price"],
            "img": image_url,
            "featured": bool(item.get("featured")),
            "order": item.get("order", 0),
            "prep": item.get("prep", 10),
            "tax_id": tax_id,
        },
    )
    return result.scalar_one()


async def _seed_variants(db, item_id, item):
    for v in item.get("variants", []):
        sku = f"{item['code']}-{v['variant_name'].upper().replace(' ', '-')}"
        await db.execute(
            text("""
                INSERT INTO menu_variants (parent_item_id, variant_name, variant_sku, price_adjustment, is_default, is_available)
                VALUES (:id, :name, :sku, :adj, :default, true)
            """),
            {"id": item_id, "name": v["variant_name"], "sku": sku, "adj": v["price_adjustment"], "default": v["is_default"]},
        )


async def _seed_modifiers(db, item_id, item):
    for mod_key in item.get("mods", []):
        tpl = MOD_TEMPLATES[mod_key]
        result = await db.execute(
            text("""
                INSERT INTO menu_modifier_groups (menu_item_id, group_name, selection_type, is_required, min_selections, max_selections, display_order)
                VALUES (:id, :name, :sel, :req, :min, :max, 1)
                RETURNING id
            """),
            {"id": item_id, "name": tpl["group_name"], "sel": tpl["selection_type"], "req": tpl["is_required"], "min": tpl["min_selections"], "max": tpl["max_selections"]},
        )
        group_id = result.scalar_one()
        for o in tpl["options"]:
            await db.execute(
                text("""
                    INSERT INTO menu_modifier_options (modifier_group_id, option_name, price_adjustment, is_default, is_available, display_order)
                    VALUES (:gid, :name, :adj, :default, true, :order)
                """),
                {"gid": group_id, "name": o["option_name"], "adj": o["price_adjustment"], "default": o["is_default"], "order": o["display_order"]},
            )


async def _seed_allergens(db, item_id, item):
    keys = set(item.get("allergens", []))
    # Halal applies menu-wide; allergen rows are upserted by ALLERGENS above.
    for key in sorted(keys):
        await db.execute(
            text("""
                INSERT INTO menu_item_allergens (menu_item_id, allergen_id)
                SELECT :id, id FROM allergens WHERE allergen_key = :key
                ON CONFLICT DO NOTHING
            """),
            {"id": item_id, "key": key},
        )


async def _seed_dietary(db, item_id, item):
    # Everything on the menu is halal; item-level tags add on top.
    for key in sorted(set(item.get("dietary", [])) | {"halal"}):
        await db.execute(
            text("""
                INSERT INTO menu_item_dietary_tags (menu_item_id, dietary_tag_id)
                SELECT :id, id FROM dietary_tags WHERE tag_key = :key
                ON CONFLICT DO NOTHING
            """),
            {"id": item_id, "key": key},
        )


async def _seed_ingredients(db):
    ing_ids = {}
    for code, name, uom in INGREDIENTS:
        result = await db.execute(
            text("""
                INSERT INTO inventory_items (item_code, item_name, unit_of_measure, unit_cost, item_type, is_active)
                VALUES (:code, :name, :uom, 0, 'fnb', true)
                ON CONFLICT (item_code) DO UPDATE SET
                    item_name = EXCLUDED.item_name,
                    unit_of_measure = EXCLUDED.unit_of_measure,
                    is_active = true,
                    deleted_at = NULL
                RETURNING id
            """),
            {"code": code, "name": name, "uom": uom},
        )
        ing_ids[code] = result.scalar_one()
    return ing_ids


async def _seed_starter_stock(db, ing_ids):
    stores = await db.execute(text("SELECT id FROM stores WHERE deleted_at IS NULL AND is_active = true"))
    store_ids = [r[0] for r in stores.all()]
    for inv_id in ing_ids.values():
        for store_id in store_ids:
            await db.execute(
                text("""
                    INSERT INTO inventory_stock (inventory_item_id, store_id, current_stock, reserved_stock, reorder_level)
                    VALUES (:inv, :store, :qty, 0, 50)
                    ON CONFLICT (inventory_item_id, store_id) DO NOTHING
                """),
                {"inv": inv_id, "store": store_id, "qty": STARTER_STOCK},
            )


async def _seed_recipes(db, item_ids, ing_ids):
    uom_by_code = {code: uom for code, _, uom in INGREDIENTS}
    count = 0
    for item_code, lines in RECIPES.items():
        item_id = item_ids.get(item_code)
        if not item_id:
            print(f"  WARNING: recipe references unknown item {item_code}")
            continue
        for ing_code, qty in lines:
            inv_id = ing_ids.get(ing_code)
            if not inv_id:
                print(f"  WARNING: recipe references unknown ingredient {ing_code}")
                continue
            await db.execute(
                text("""
                    INSERT INTO menu_item_recipes (menu_item_id, menu_variant_id, inventory_item_id, quantity_required, unit_of_measure)
                    VALUES (:item, NULL, :inv, :qty, :uom)
                """),
                {"item": item_id, "inv": inv_id, "qty": qty, "uom": uom_by_code[ing_code]},
            )
            count += 1
    return count


async def seed(with_recipes: bool = False):
    async with get_db() as db:
        tax_id = await _upsert_tax_category(db, TAX_CATEGORY)
        await _upsert_allergens(db)
        cat_ids = await _upsert_categories(db)
        print(f"  Upserted {len(cat_ids)} categories")

        item_ids = {}
        for item in ITEMS:
            image_url = _copy_image(item["cat"], item.get("img"))
            item_id = await _upsert_item(db, item, cat_ids[item["cat"]], tax_id, image_url)
            await _clear_item_children(db, item_id)
            await _seed_variants(db, item_id, item)
            await _seed_modifiers(db, item_id, item)
            await _seed_allergens(db, item_id, item)
            await _seed_dietary(db, item_id, item)
            item_ids[item["code"]] = item_id
        print(f"  Upserted {len(item_ids)} menu items")

        if with_recipes:
            # Opt-in: recipes tie menu items to inventory stock, and ordering a
            # recipe item without stock fails. Only seed these when the team is
            # ready to manage inventory (python3 scripts/seed_menu.py --with-recipes).
            ing_ids = await _seed_ingredients(db)
            await _seed_starter_stock(db, ing_ids)
            print(f"  Upserted {len(ing_ids)} ingredients + starter stock")

            recipe_count = await _seed_recipes(db, item_ids, ing_ids)
            print(f"  Seeded {recipe_count} recipe lines across {len(RECIPES)} items")
        else:
            print("  Skipped ingredients/stock/recipes (use --with-recipes to include)")


async def main():
    parser = argparse.ArgumentParser(description="Seed the real Loka Espresso menu")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    parser.add_argument("--with-recipes", action="store_true",
                        help="Also seed inventory ingredients, starter stock and recipes (menu works without them)")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Seed the real Loka Espresso menu (categories, items, images)?", args.yes):
        print("Aborted.")
        return

    await seed(with_recipes=args.with_recipes)
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
