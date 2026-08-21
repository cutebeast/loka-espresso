"""Close open orders left behind by E2E/test runs.

Targets: non-terminal orders (confirmed/preparing/ready_for_pickup) with no
real-world counterpart — the E2E suite creates hundreds and the dev DB drifts.

- UNPAID orders (no captured/partially_refunded/chargeback payment) are
  cancelled like the staff cancel endpoint: status → cancelled_by_merchant +
  OrderStatusLog + reverse_order_effects + cancel_pending_order_payments.
- PAID orders cannot be cancelled (money attached) — they are completed as
  delivered with an OrderStatusLog so the kitchen/queue clears while the
  books stay intact.

Usage:
    python3 scripts/cleanup_unpaid_open_orders.py --yes --force-prod [--dry-run]
"""
import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, text

from app.core.database import AsyncSessionLocal
from app.models.order import Order, OrderStatusLog
from app.models.payment import Payment
from app.models.staff import StaffProfile
from app.services.order import reverse_order_effects
from app.services.payment import cancel_pending_order_payments

CLEANUP_STATUSES = ("confirmed", "preparing", "ready_for_pickup", "out_for_delivery")


async def cleanup(dry_run: bool) -> int:
    cancelled = 0
    completed = 0
    skipped = 0
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(Order).where(
                    Order.deleted_at.is_(None),
                    Order.status.in_(CLEANUP_STATUSES),
                )
            )
        ).scalars().all()

        staff_id = (
            await db.execute(
                select(StaffProfile.id).where(
                    StaffProfile.display_name == "Test Staff",
                    StaffProfile.deleted_at.is_(None),
                ).limit(1)
            )
        ).scalar_one_or_none()

        for order in rows:
            money = (
                await db.execute(
                    select(Payment.id).where(
                        Payment.order_id == order.id,
                        Payment.status.in_(("captured", "partially_refunded", "chargeback")),
                    ).limit(1)
                )
            ).scalar_one_or_none()

            locked = (
                await db.execute(
                    select(Order).where(Order.id == order.id).with_for_update()
                )
            ).scalar_one_or_none()
            if locked is None or locked.status not in CLEANUP_STATUSES:
                skipped += 1
                continue
            old_status = locked.status
            now = datetime.now(timezone.utc)

            if money is not None:
                # Paid test orders cannot be cancelled (money attached) — close
                # them as delivered so the kitchen/queue clears while the books
                # stay intact.
                if dry_run:
                    print(f"[dry-run] would complete {locked.order_number} (paid)")
                else:
                    locked.status = "delivered"
                    locked.completed_at = now
                    locked.updated_at = now
                    db.add(
                        OrderStatusLog(
                            order_id=locked.id,
                            from_status=old_status,
                            to_status="delivered",
                            reason="E2E residue completion",
                            actor_type="staff",
                            actor_id=staff_id,
                        )
                    )
                    await db.commit()
                completed += 1
                continue

            if dry_run:
                print(f"[dry-run] would cancel {locked.order_number} (unpaid)")
            else:
                locked.status = "cancelled_by_merchant"
                locked.cancellation_reason = "E2E residue cleanup"
                locked.cancelled_by = "merchant"
                locked.cancelled_at = now
                locked.updated_at = now
                db.add(
                    OrderStatusLog(
                        order_id=locked.id,
                        from_status=old_status,
                        to_status="cancelled_by_merchant",
                        reason="E2E residue cleanup",
                        actor_type="staff",
                        actor_id=staff_id,
                    )
                )
                await db.flush()
                await reverse_order_effects(db, locked)
                await cancel_pending_order_payments(db, locked.id)
                await db.commit()
            cancelled += 1
    print(
        f"done: {cancelled} cancelled, {completed} completed (paid), {skipped} skipped"
    )
    return 0


E2E_TITLE_TABLES = (
    # (table, title_column) — only tables that HAVE a deleted_at column
    # (verified via information_schema on 2026-08-16: bundle_products,
    # splash_screens are the E2E-titled content tables with soft delete).
    ("bundle_products", "title"),
    ("splash_screens", "title"),
)

# Sections 2–4 of scripts/clear_transactional_data.sql — null out FKs into
# soft-deleted rows, hard-delete all soft-deleted rows, purge orphaned
# translations. Kept in sync with the SQL file (single source of behavior;
# duplicated here so the E2E sessionfinish hook can run it without psql).
HARD_DELETE_SOFT_DELETED = """
DELETE FROM order_line_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE deleted_at IS NOT NULL);
DELETE FROM order_line_items WHERE bundle_product_id IN (SELECT id FROM bundle_products WHERE deleted_at IS NOT NULL);
DELETE FROM cart_line_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE deleted_at IS NOT NULL);
DELETE FROM cart_line_items WHERE bundle_product_id IN (SELECT id FROM bundle_products WHERE deleted_at IS NOT NULL);
DELETE FROM bundle_product_components WHERE bundle_product_id IN (SELECT id FROM bundle_products WHERE deleted_at IS NOT NULL);
UPDATE reward_catalog SET menu_item_id=NULL WHERE menu_item_id IN (SELECT id FROM menu_items WHERE deleted_at IS NOT NULL);UPDATE voucher_definitions SET menu_item_id=NULL WHERE menu_item_id IN (SELECT id FROM menu_items WHERE deleted_at IS NOT NULL);
UPDATE voucher_definitions SET category_id=NULL WHERE category_id IN (SELECT id FROM menu_categories WHERE deleted_at IS NOT NULL);
UPDATE bundle_products SET category_id=NULL WHERE category_id IN (SELECT id FROM menu_categories WHERE deleted_at IS NOT NULL);
UPDATE bundle_products SET bundle_category_id=NULL WHERE bundle_category_id IN (SELECT id FROM bundle_categories WHERE deleted_at IS NOT NULL);
UPDATE bundle_products SET store_id=NULL WHERE store_id IN (SELECT id FROM stores WHERE deleted_at IS NOT NULL);
UPDATE menu_categories SET parent_category_id=NULL WHERE parent_category_id IN (SELECT id FROM menu_categories WHERE deleted_at IS NOT NULL);
UPDATE menu_items SET tax_category_id=NULL WHERE tax_category_id IN (SELECT id FROM tax_categories WHERE deleted_at IS NOT NULL);
UPDATE menu_items SET event_category_id=NULL WHERE event_category_id IN (SELECT id FROM event_categories WHERE deleted_at IS NOT NULL);
UPDATE inventory_items SET category_id=NULL WHERE category_id IN (SELECT id FROM inventory_categories WHERE deleted_at IS NOT NULL);
UPDATE inventory_items SET supplier_id=NULL WHERE supplier_id IN (SELECT id FROM suppliers WHERE deleted_at IS NOT NULL);
UPDATE inventory_categories SET parent_category_id=NULL WHERE parent_category_id IN (SELECT id FROM inventory_categories WHERE deleted_at IS NOT NULL);
UPDATE customers SET referred_by_customer_id=NULL WHERE referred_by_customer_id IN (SELECT id FROM customers WHERE deleted_at IS NOT NULL);
UPDATE marketing_campaigns SET voucher_definition_id=NULL WHERE voucher_definition_id IN (SELECT id FROM voucher_definitions WHERE deleted_at IS NOT NULL);
UPDATE marketing_campaigns SET reward_catalog_id=NULL WHERE reward_catalog_id IN (SELECT id FROM reward_catalog WHERE deleted_at IS NOT NULL);
UPDATE survey_definitions SET reward_voucher_id=NULL WHERE reward_voucher_id IN (SELECT id FROM voucher_definitions WHERE deleted_at IS NOT NULL);
UPDATE promo_banners SET voucher_id=NULL WHERE voucher_id IN (SELECT id FROM voucher_definitions WHERE deleted_at IS NOT NULL);
UPDATE promo_banners SET survey_id=NULL WHERE survey_id IN (SELECT id FROM survey_definitions WHERE deleted_at IS NOT NULL);
DELETE FROM lucky_draw_segments WHERE voucher_definition_id IN (SELECT id FROM voucher_definitions WHERE deleted_at IS NOT NULL);
DELETE FROM bundle_product_components WHERE menu_item_id IN (SELECT id FROM menu_items WHERE deleted_at IS NOT NULL);
DELETE FROM bundle_products WHERE deleted_at IS NOT NULL;
DELETE FROM menu_items WHERE deleted_at IS NOT NULL;
DELETE FROM menu_categories WHERE deleted_at IS NOT NULL;
DELETE FROM bundle_categories WHERE deleted_at IS NOT NULL;
DELETE FROM bundle_types WHERE deleted_at IS NOT NULL;
DELETE FROM event_categories WHERE deleted_at IS NOT NULL;
DELETE FROM inventory_items WHERE deleted_at IS NOT NULL;
DELETE FROM inventory_categories WHERE deleted_at IS NOT NULL;
DELETE FROM suppliers WHERE deleted_at IS NOT NULL;
DELETE FROM customers WHERE deleted_at IS NOT NULL;
DELETE FROM staff_profiles WHERE deleted_at IS NOT NULL;
DELETE FROM voucher_definitions WHERE deleted_at IS NOT NULL;
DELETE FROM reward_catalog WHERE deleted_at IS NOT NULL;
DELETE FROM allergens WHERE deleted_at IS NOT NULL;
DELETE FROM tax_categories WHERE deleted_at IS NOT NULL;
DELETE FROM survey_definitions WHERE deleted_at IS NOT NULL;
DELETE FROM splash_screens WHERE deleted_at IS NOT NULL;
DELETE FROM dining_tables WHERE deleted_at IS NOT NULL;
DELETE FROM stores WHERE deleted_at IS NOT NULL;
DELETE FROM admin_accounts WHERE deleted_at IS NOT NULL;
"""


async def purge_soft_deleted_residue() -> None:
    """Hard-delete soft-deleted rows — on the dev server soft-delete retention
    has no audit value and the E2E conftest only soft-deletes its resources
    (menu items, staff profiles, suppliers, vouchers, bundle products...).
    Mirrors sections 2–4 of scripts/clear_transactional_data.sql."""
    async with AsyncSessionLocal() as db:
        # Dependency rows with RESTRICT/NO ACTION FKs into customers must go
        # first (all other customer FKs are ON DELETE CASCADE).
        await db.execute(text(
            "DELETE FROM loyalty_points_ledger WHERE customer_id IN ("
            "SELECT id FROM customers WHERE email_address IS NULL AND display_name = phone_number "
            "AND phone_number NOT IN ('+0000000000','+60123456001','+60123456002'))"
        ))
        await db.execute(text(
            "DELETE FROM customer_daily_checkins WHERE customer_id IN ("
            "SELECT id FROM customers WHERE email_address IS NULL AND display_name = phone_number "
            "AND phone_number NOT IN ('+0000000000','+60123456001','+60123456002'))"
        ))
        # Phone-named walk-in profiles (name == phone, no email) are created
        # by POS/PWA test flows every run — purge them live OR soft-deleted.
        # Keep the system walk-in + seeded demo/vip accounts. Skip customers
        # referenced by a NON-TERMINAL order (FK-safe: cancelled/delivered
        # orders still hold rows but those customers are disposable).
        n = (
            await db.execute(
                text(
                    "DELETE FROM customers WHERE "
                    "email_address IS NULL AND display_name = phone_number "
                    "AND phone_number NOT IN ('+0000000000', '+60123456001', '+60123456002') "
                    "AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = customers.id "
                    "AND o.status NOT IN ('delivered','cancelled_by_customer','cancelled_by_merchant','refunded'))"
                )
            )
        ).rowcount
        if n:
            print(f"purged {n} phone-named walk-in/test customer(s)")
        for table, title_col in E2E_TITLE_TABLES:
            try:
                n = (
                    await db.execute(
                        text(
                            f"DELETE FROM {table} WHERE deleted_at IS NOT NULL "
                            f"AND ({title_col} LIKE 'E2E %%' OR {title_col} LIKE 'Freq Test%%')"
                        )
                    )
                ).rowcount
            except Exception as exc:  # table/column drift — never fatal
                print(f"skip {table}: {exc.__class__.__name__}")
                continue
            if n:
                print(f"hard-deleted {n} soft-deleted E2E rows from {table}")
        for stmt in [s.strip() for s in HARD_DELETE_SOFT_DELETED.split(";") if s.strip()]:
            await db.execute(text(stmt))
        # Test-residue menu items (E2E-/Freq-Test/auto-link-probe codes). NOTE:
        # bare 'EX-%' is FORBIDDEN — real workshop items are EX-TURKISH-*
        # (EX = Experience). Line items hold RESTRICT FKs into menu_items, so
        # clear them first; the recipe FK cascades and the auto-link inventory
        # items orphan below.
        test_item_pred = ("item_code LIKE 'E2E-%' OR item_code LIKE 'FREQ-%' OR item_code LIKE 'EX-AUTOLNK-%'")
        # E2E inventory-ops residue (the flaky relationship-fields test)
        await db.execute(text(
            "DELETE FROM inventory_items WHERE item_code LIKE 'E2E-%' OR item_name LIKE 'E2E Inventory Item%'"
        ))
        await db.execute(text(
            "DELETE FROM suppliers WHERE supplier_name LIKE 'E2E Item Supplier%' OR supplier_name LIKE 'Freq Test%'"
        ))
        # Wastage reports hold RESTRICT FKs into menu_items too — clear them
        # before the item purge (proven live: probe waste blocked the delete).
        await db.execute(text(
            f"DELETE FROM wastage_reports WHERE menu_item_id IN (SELECT id FROM menu_items WHERE ({test_item_pred}))"
        ))
        await db.execute(text(
            f"DELETE FROM order_line_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE deleted_at IS NULL AND ({test_item_pred}))"
        ))
        await db.execute(text(
            f"DELETE FROM cart_line_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE deleted_at IS NULL AND ({test_item_pred}))"
        ))
        await db.execute(text(
            f"DELETE FROM menu_items WHERE deleted_at IS NULL AND ({test_item_pred})"
        ))
        # E2E class sessions leak onto the customer workshops page when a test
        # creates sessions on REAL workshop items without deleting them (found
        # 2026-08-20: 22 "E2E merge" rows). Only unbooked rows are removed.
        await db.execute(text(
            "DELETE FROM class_sessions WHERE booked_pax = 0 AND (location LIKE 'E2E%' OR notes LIKE 'E2E%')"
        ))
        # Orphaned auto-link inventory items: menu items deleted above (or by
        # the e2e conftest) cascade-delete their recipes, leaving LNK-* items.
        # Children (stock/movements) cascade via FK — safe to delete directly.
        # (Auto-link on admin save since 2026-08-17 — round 39.)
        await db.execute(text(
            "DELETE FROM inventory_items WHERE item_code LIKE 'LNK-%' "
            "AND NOT EXISTS (SELECT 1 FROM menu_item_recipes r WHERE r.inventory_item_id = inventory_items.id)"
        ))
        await db.commit()


def main() -> int:
    parser = argparse.ArgumentParser(description="Cancel unpaid open-tab POS test orders")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running with ENVIRONMENT=production")
    parser.add_argument("--dry-run", action="store_true", help="List only, change nothing")
    args = parser.parse_args()
    if not args.force_prod:
        print("Refusing to run against production without --force-prod", file=sys.stderr)
        return 2
    if not args.yes and not args.dry_run:
        print("Pass --yes to confirm (or --dry-run to preview)", file=sys.stderr)
        return 2

    async def run_all():
        result = await cleanup(dry_run=args.dry_run)
        if not args.dry_run:
            await purge_soft_deleted_residue()
        return result

    return asyncio.run(run_all())


if __name__ == "__main__":
    sys.exit(main())
