#!/usr/bin/env python3
"""Purge soft-deleted rows older than 30 days (dev: all) — the "janitor".

Soft-deleted rows are a legacy-data trap: they hold unique keys hostage
(partially fixed via uq_*_active partial indexes), orphan translations, and
surprise future schema changes. This script hard-deletes them table-by-table
in FK-safe order, skipping rows still referenced by live history (e.g. a
menu item on an old order can never be hard-deleted — RESTRICT — and that's
correct; it's skipped, not errored).

Cron (weekly Sunday 03:41):
    41 3 * * 0 cd /root/fnb-super-app/v3/backend && .venv/bin/python3 scripts/purge_soft_deleted.py --yes --force-prod >> logs/purge_soft_deleted_cron.log 2>&1

Options:
    --dry-run   report counts only
    --all       ignore the 30-day grace period (purge everything soft-deleted)
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from scripts._db_utils import confirm, get_db, guard_production

# FK-safe order (children/preference-nulling handled by earlier cleanup pass
# in clear_transactional_data.sql; here we null the known live→dead refs first)
NULL_REFS = [
    "UPDATE reward_catalog SET menu_item_id=NULL WHERE menu_item_id IN (SELECT id FROM menu_items WHERE deleted_at IS NOT NULL)",
    "UPDATE voucher_definitions SET menu_item_id=NULL WHERE menu_item_id IN (SELECT id FROM menu_items WHERE deleted_at IS NOT NULL)",
    "UPDATE voucher_definitions SET category_id=NULL WHERE category_id IN (SELECT id FROM menu_categories WHERE deleted_at IS NOT NULL)",
    "UPDATE bundle_products SET category_id=NULL WHERE category_id IN (SELECT id FROM menu_categories WHERE deleted_at IS NOT NULL)",
    "UPDATE bundle_products SET bundle_category_id=NULL WHERE bundle_category_id IN (SELECT id FROM bundle_categories WHERE deleted_at IS NOT NULL)",
    "UPDATE bundle_products SET store_id=NULL WHERE store_id IN (SELECT id FROM stores WHERE deleted_at IS NOT NULL)",
    "UPDATE menu_categories SET parent_category_id=NULL WHERE parent_category_id IN (SELECT id FROM menu_categories WHERE deleted_at IS NOT NULL)",
    "UPDATE menu_items SET tax_category_id=NULL WHERE tax_category_id IN (SELECT id FROM tax_categories WHERE deleted_at IS NOT NULL)",
    "UPDATE menu_items SET event_category_id=NULL WHERE event_category_id IN (SELECT id FROM event_categories WHERE deleted_at IS NOT NULL)",
    "UPDATE inventory_items SET category_id=NULL WHERE category_id IN (SELECT id FROM inventory_categories WHERE deleted_at IS NOT NULL)",
    "UPDATE inventory_items SET supplier_id=NULL WHERE supplier_id IN (SELECT id FROM suppliers WHERE deleted_at IS NOT NULL)",
    "UPDATE inventory_categories SET parent_category_id=NULL WHERE parent_category_id IN (SELECT id FROM inventory_categories WHERE deleted_at IS NOT NULL)",
    "UPDATE customers SET referred_by_customer_id=NULL WHERE referred_by_customer_id IN (SELECT id FROM customers WHERE deleted_at IS NOT NULL)",
    "UPDATE marketing_campaigns SET voucher_definition_id=NULL WHERE voucher_definition_id IN (SELECT id FROM voucher_definitions WHERE deleted_at IS NOT NULL)",
    "UPDATE marketing_campaigns SET reward_catalog_id=NULL WHERE reward_catalog_id IN (SELECT id FROM reward_catalog WHERE deleted_at IS NOT NULL)",
    "UPDATE survey_definitions SET reward_voucher_id=NULL WHERE reward_voucher_id IN (SELECT id FROM voucher_definitions WHERE deleted_at IS NOT NULL)",
    "UPDATE promo_banners SET voucher_id=NULL WHERE voucher_id IN (SELECT id FROM voucher_definitions WHERE deleted_at IS NOT NULL)",
    "UPDATE promo_banners SET survey_id=NULL WHERE survey_id IN (SELECT id FROM survey_definitions WHERE deleted_at IS NOT NULL)",
    "UPDATE platform_config SET modified_by=NULL WHERE modified_by IN (SELECT id FROM admin_accounts WHERE deleted_at IS NOT NULL)",
    "UPDATE voucher_definitions SET created_by=NULL WHERE created_by IN (SELECT id FROM admin_accounts WHERE deleted_at IS NOT NULL)",
    "UPDATE marketing_campaigns SET created_by=NULL WHERE created_by IN (SELECT id FROM admin_accounts WHERE deleted_at IS NOT NULL)",
    "UPDATE survey_definitions SET created_by=NULL WHERE created_by IN (SELECT id FROM admin_accounts WHERE deleted_at IS NOT NULL)",
    "UPDATE role_permission SET granted_by=NULL WHERE granted_by IN (SELECT id FROM admin_accounts WHERE deleted_at IS NOT NULL)",
    "UPDATE role_assignments SET assigned_by=NULL WHERE assigned_by IN (SELECT id FROM admin_accounts WHERE deleted_at IS NOT NULL)",
    "DELETE FROM lucky_draw_segments WHERE voucher_definition_id IN (SELECT id FROM voucher_definitions WHERE deleted_at IS NOT NULL)",
    "DELETE FROM bundle_product_components WHERE menu_item_id IN (SELECT id FROM menu_items WHERE deleted_at IS NOT NULL)",
]

# delete order: leaf/config first, identity tables last
PURGE_TABLES = [
    "bundle_products", "menu_items", "menu_categories", "bundle_categories",
    "bundle_types", "event_categories", "inventory_items", "inventory_categories",
    "suppliers", "customers", "staff_profiles", "voucher_definitions",
    "reward_catalog", "allergens", "tax_categories", "survey_definitions",
    "splash_screens", "dining_tables", "stores", "admin_accounts",
    "customer_addresses", "customer_devices", "payment_methods",
    "api_credentials", "iam_principals", "orders",
]

# translations orphan cleanup per content table
TRANSLATION_TABLES = [
    "menu_items", "menu_categories", "menu_modifier_options", "menu_modifier_groups",
    "bundle_products", "bundle_categories", "inventory_items", "inventory_categories",
    "allergens", "dietary_tags", "tax_categories", "voucher_definitions",
    "reward_catalog", "splash_screens", "survey_definitions", "survey_questions",
    "stores", "event_categories", "loyalty_tiers", "marketing_campaigns",
]


async def run(dry_run: bool, purge_all: bool) -> None:
    grace = "" if purge_all else "AND deleted_at < now() - interval '30 days'"
    async with get_db() as db:
        for stmt in NULL_REFS:
            if grace:
                stmt = stmt.replace("deleted_at IS NOT NULL", f"deleted_at IS NOT NULL {grace}")
            if not dry_run:
                await db.execute(text(stmt))

        for table in PURGE_TABLES:
            count = (await db.execute(text(
                f"SELECT count(*) FROM {table} WHERE deleted_at IS NOT NULL {grace}"
            ))).scalar() or 0
            if count == 0:
                continue
            if dry_run:
                print(f"{table}: {count} row(s) would be purged")
                continue
            # per-table savepoint: FK-blocked rows (referenced by live history)
            # are skipped without aborting the rest
            await db.execute(text("SAVEPOINT purge_sp"))
            try:
                await db.execute(text(f"DELETE FROM {table} WHERE deleted_at IS NOT NULL {grace}"))
                await db.execute(text("RELEASE SAVEPOINT purge_sp"))
                print(f"{table}: purged {count}")
            except Exception as e:
                await db.execute(text("ROLLBACK TO SAVEPOINT purge_sp"))
                print(f"{table}: SKIPPED ({type(e).__name__} — referenced by live rows)")

        for t in TRANSLATION_TABLES:
            if dry_run:
                continue
            await db.execute(text(
                f"DELETE FROM translations t WHERE t.table_name='{t}' AND t.record_id NOT IN (SELECT id FROM {t})"
            ))


async def main() -> None:
    parser = argparse.ArgumentParser(description="Purge soft-deleted rows")
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--force-prod", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--all", action="store_true", help="Ignore the 30-day grace period")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Purge soft-deleted rows?", args.yes or args.dry_run):
        print("Aborted.")
        return
    await run(args.dry_run, args.all)
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
