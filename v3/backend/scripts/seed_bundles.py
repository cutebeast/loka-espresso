#!/usr/bin/env python3
"""Seed bundle products built from the real Loka Espresso menu.

Bundles (prices are suggestions — confirm with the owner):
1. Loka Pair Set      RM 39 — pick 1 food (gourmet sandwiches) + pick 1 drink (specialty coffee)
2. Main & Treat       RM 45 — pick 1 main + pick 1 treat (drink OR dessert OR pastry)
3. Tea Time for Two   RM 55 — pick 2 drinks + pick 2 pastries (duplicates allowed)
4. Breakfast Duo      RM 39 — Turkish Mixed Bread (fixed) + pick 2 specialty drinks

Idempotent: bundles are matched by title and their groups/components are
rebuilt on each run.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from scripts._db_utils import confirm, get_db, guard_production

IMG = "/uploads/images/menu"

BUNDLES = [
    {
        "title": "Loka Pair Set",
        "description": "Pick any gourmet sandwich and any specialty coffee — the perfect pair, better together.",
        "bundle_price": 39.00,
        "image_url": f"{IMG}/gourmet-sandwiches/pulled-chicken-pesto-shack.jpg",
        "display_order": 1,
        "max_per_order": 3,
        "groups": [
            {"label": "Choose Your Food", "pick": 1, "sort": 1, "items": [
                "GS-PULLED-CHICKEN-PESTO", "GS-EGG-CHICKEN-CHEESE",
                "GS-SMOKED-SALMON-CREAM-CHEESE", "GS-ROAST-BEEF-MUSHROOM",
            ]},
            {"label": "Choose Your Drink", "pick": 1, "sort": 2, "items": [
                "CSC-AMERICANO", "CSC-CAFE-LATTE", "CSC-CAPPUCCINO",
                "CSC-SPANISH-LATTE", "BC-MATCHA-LATTE", "BC-CHOCOLATE",
            ]},
        ],
    },
    {
        "title": "Main & Treat",
        "description": "Pick any main, then treat yourself — a specialty drink, a dessert, or a pastry. Your call.",
        "bundle_price": 45.00,
        "image_url": f"{IMG}/main-courses/turkish-spiced-chicken-baked-rice.jpg",
        "display_order": 2,
        "max_per_order": 3,
        "groups": [
            {"label": "Pick Your Main", "pick": 1, "sort": 1, "items": [
                "MC-ANATOLIAN-CHICKEN", "MC-CHICKEN-BAKED-RICE", "MC-BEEF-BAKED-RICE",
                "PC-PRAWN-AGLIO-OLIO", "PC-PESTO-PORTOBELLO",
                "TP-OTTOMAN-BEEF", "TP-ANATOLIAN-CHICKEN",
            ]},
            {"label": "Pick Your Treat", "pick": 1, "sort": 2, "items": [
                "CSC-CAFE-LATTE", "CSC-CAPPUCCINO", "BC-MATCHA-LATTE",
                "CK-SEMOLINA-LABNEH", "CK-KUNAFA-CHEESECAKE", "CK-TRILECE", "CK-CHOC-PISTACHIO",
                "PA-FRENCH-CROISSANT", "PA-VANILLA-CANELE", "PA-CINNAMON-ROLL",
            ]},
        ],
    },
    {
        "title": "Tea Time for Two",
        "description": "Two drinks and two pastries of your choice — made for sharing (or not, we won't judge).",
        "bundle_price": 55.00,
        "image_url": f"{IMG}/pastry/french-croissant.jpg",
        "display_order": 3,
        "max_per_order": 2,
        "groups": [
            {"label": "Pick 2 Drinks", "pick": 2, "sort": 1, "items": [
                "CSC-CAFE-LATTE", "CSC-CAPPUCCINO", "CSC-SPANISH-LATTE",
                "BC-MATCHA-LATTE", "BC-CHOCOLATE", "CSC-AMERICANO",
            ]},
            {"label": "Pick 2 Pastries", "pick": 2, "sort": 2, "items": [
                "PA-FRENCH-CROISSANT", "PA-VANILLA-CANELE", "PA-SALTED-CARAMEL-CANELE",
                "PA-CINNAMON-ROLL", "PA-VANILLA-EGG-TART", "SC-CRANBERRY", "SC-RAISIN",
            ]},
        ],
    },
    {
        "title": "Breakfast Duo",
        "description": "Our Levantine-style Turkish Mixed Bread plus any two specialty coffees — mornings, sorted.",
        "bundle_price": 39.00,
        "image_url": f"{IMG}/levantine-morning/turkish-mixed-bread.jpg",
        "display_order": 4,
        "max_per_order": 2,
        "groups": [
            {"label": "Turkish Mixed Bread", "pick": 1, "sort": 1, "items": ["LM-TURKISH-MIXED-BREAD"]},
            {"label": "Pick 2 Drinks", "pick": 2, "sort": 2, "items": [
                "CSC-AMERICANO", "CSC-CAFE-LATTE", "CSC-CAPPUCCINO",
                "CSC-SPANISH-LATTE", "BC-MATCHA-LATTE", "BC-CHOCOLATE",
            ]},
        ],
    },
]


async def seed():
    async with get_db() as db:
        # Resolve item codes → ids
        result = await db.execute(text("SELECT id, item_code FROM menu_items WHERE deleted_at IS NULL"))
        item_ids = {row.item_code: row.id for row in result}

        for spec in BUNDLES:
            missing = [c for g in spec["groups"] for c in g["items"] if c not in item_ids]
            if missing:
                print(f"  ERROR: unknown item codes for '{spec['title']}': {missing}")
                continue

            existing = await db.execute(
                text("SELECT id FROM bundle_products WHERE title = :title"),
                {"title": spec["title"]},
            )
            row = existing.scalar_one_or_none()
            if row:
                bundle_id = row
                await db.execute(
                    text("""
                        UPDATE bundle_products SET
                            description = :desc, image_url = :img, bundle_price = :price,
                            bundle_type = 'multi_course',
                            display_order = :order, max_per_order = :maxpo, is_active = true,
                            deleted_at = NULL
                        WHERE id = :id
                    """),
                    {"desc": spec["description"], "img": spec["image_url"], "price": spec["bundle_price"],
                     "order": spec["display_order"], "maxpo": spec["max_per_order"], "id": bundle_id},
                )
                # Rebuild children
                await db.execute(text("DELETE FROM bundle_product_components WHERE bundle_product_id = :id"), {"id": bundle_id})
                await db.execute(text("DELETE FROM bundle_groups WHERE bundle_product_id = :id"), {"id": bundle_id})
            else:
                result = await db.execute(
                    text("""
                        INSERT INTO bundle_products (bundle_type, title, description, image_url, bundle_price,
                                                     is_active, display_order, max_per_order, allow_duplicates)
                        VALUES ('multi_course', :title, :desc, :img, :price, true, :order, :maxpo, true)
                        RETURNING id
                    """),
                    {"title": spec["title"], "desc": spec["description"], "img": spec["image_url"],
                     "price": spec["bundle_price"], "order": spec["display_order"], "maxpo": spec["max_per_order"]},
                )
                bundle_id = result.scalar_one()

            # Groups + their components
            for g in spec["groups"]:
                result = await db.execute(
                    text("""
                        INSERT INTO bundle_groups (bundle_product_id, group_label, pick_count, min_pick, max_pick, sort_order)
                        VALUES (:bid, :label, :pick, :pick, :pick, :sort)
                        RETURNING id
                    """),
                    {"bid": bundle_id, "label": g["label"], "pick": g["pick"], "sort": g["sort"]},
                )
                group_id = result.scalar_one()
                for i, code in enumerate(g["items"], 1):
                    await db.execute(
                        text("""
                            INSERT INTO bundle_product_components (bundle_product_id, bundle_group_id, menu_item_id, default_quantity, sort_order)
                            VALUES (:bid, :gid, :mid, 1, :sort)
                        """),
                        {"bid": bundle_id, "gid": group_id, "mid": item_ids[code], "sort": i},
                    )
            print(f"  Seeded bundle '{spec['title']}' (RM {spec['bundle_price']:.2f}, {len(spec['groups'])} group(s))")


async def main():
    parser = argparse.ArgumentParser(description="Seed bundle products")
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--force-prod", action="store_true")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Seed bundle products from the real menu?", args.yes):
        print("Aborted.")
        return

    await seed()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
