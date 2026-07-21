#!/usr/bin/env python3
"""Bulk-translate menu content into all supported locales via DeepSeek.

Covers menu_categories, menu_items, menu_modifier_groups and
menu_modifier_options. Idempotent — the translation cache and existing
translation rows are reused, so re-runs only translate what's missing.

Usage:
    cd v3/backend && python3 scripts/translate_menu.py --yes --force-prod
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.menu import MenuCategory, MenuItem, MenuModifierGroup, MenuModifierOption
from app.services.translation import auto_translate_record
from scripts._db_utils import confirm, guard_production


async def _translate_table(db, model, fields_fn, label):
    rows = (await db.execute(select(model))).scalars().all()
    total = 0
    for i, row in enumerate(rows, 1):
        fields = fields_fn(row)
        fields = {k: v for k, v in fields.items() if v}
        if not fields:
            continue
        total += await auto_translate_record(db, model.__tablename__, row.id, fields)
        if i % 20 == 0:
            print(f"  [{label}] {i}/{len(rows)} records...")
    print(f"  [{label}] done — {len(rows)} records, {total} translations written")


async def main():
    parser = argparse.ArgumentParser(description="Bulk-translate menu content via DeepSeek")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Translate all menu content (categories, items, modifiers) into ms/zh/ta/tr via DeepSeek?", args.yes):
        print("Aborted.")
        return

    async with AsyncSessionLocal() as db:
        await _translate_table(
            db, MenuCategory,
            lambda r: {"category_name": r.category_name, "description": r.description},
            "categories",
        )
        await _translate_table(
            db, MenuItem,
            lambda r: {"item_name": r.item_name, "description": r.description},
            "items",
        )
        await _translate_table(
            db, MenuModifierGroup,
            lambda r: {"group_name": r.group_name},
            "modifier groups",
        )
        await _translate_table(
            db, MenuModifierOption,
            lambda r: {"option_name": r.option_name},
            "modifier options",
        )
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
