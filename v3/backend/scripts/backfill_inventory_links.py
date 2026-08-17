"""Backfill: link every menu item without recipes to a 1:1 inventory item.

Owner decision (2026-08-17): every menu item ties to inventory by default.
Admin saves auto-link new/edited items; this script covers EXISTING items
(135 of 166 were untied after the recipes re-seed). Idempotent — items that
already have recipes are left untouched.

Usage: python3 scripts/backfill_inventory_links.py --yes --force-prod [--dry-run]
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.menu import MenuItem
from app.services.inventory_link import ensure_auto_inventory_link


async def backfill(dry_run: bool) -> tuple[int, int]:
    linked = skipped = 0
    async with AsyncSessionLocal() as db:
        items = (
            await db.execute(
                select(MenuItem).where(MenuItem.deleted_at.is_(None))
            )
        ).scalars().all()
        for item in items:
            inv_id = await ensure_auto_inventory_link(db, item)
            if inv_id is None:
                skipped += 1
                continue
            linked += 1
            if dry_run:
                print(f"[dry-run] would link {item.item_code} -> LNK-{item.item_code}")
        if not dry_run:
            await db.commit()
    print(f"done: {linked} linked, {skipped} already tied (recipes exist)")
    return linked, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description="Auto-link all menu items to inventory")
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--force-prod", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not args.force_prod:
        print("Refusing to run against production without --force-prod", file=sys.stderr)
        return 2
    if not args.yes and not args.dry_run:
        print("Pass --yes to confirm (or --dry-run to preview)", file=sys.stderr)
        return 2
    asyncio.run(backfill(dry_run=args.dry_run))
    return 0


if __name__ == "__main__":
    sys.exit(main())
