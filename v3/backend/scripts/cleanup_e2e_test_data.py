#!/usr/bin/env python3
"""Clean up E2E test data before promoting the DB to production.

This script identifies records created by the E2E test suite (those tagged with
``e2e``/``E2E`` or using known test email domains) and removes them while
preserving baseline/seed data and respecting foreign-key references.

Hard-delete is used for records with no live references; soft-delete
(``deleted_at``) is used as a safe fallback for referenced records.

Examples:
    python scripts/cleanup_e2e_test_data.py --dry-run
    python scripts/cleanup_e2e_test_data.py --yes
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import psycopg2
from psycopg2.extensions import connection

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts._db_utils import SETTINGS, confirm, guard_production


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Tables that have a deleted_at column and can be soft-deleted.
SOFT_DELETE_TABLES: list[tuple[str, str, str]] = [
    # (table, title/name column, slug/code column or None)
    ("menu_items", "item_name", "description"),
    ("menu_categories", "category_name", "slug"),
    ("bundle_products", "title", None),
    ("voucher_definitions", "display_title", "voucher_code"),
    ("splash_screens", "screen_name", None),
    ("marketing_campaigns", "campaign_name", "campaign_key"),
    ("survey_definitions", "survey_name", None),
    ("stores", "store_name", "slug"),
    ("staff_profiles", "display_name", "email_address"),
    ("reward_catalog", "reward_name", None),
]

# Tables without deleted_at that can be hard-deleted if unreferenced.
HARD_DELETE_TABLES: list[tuple[str, str, str | None]] = [
    ("information_cards", "title", "slug"),
    ("product_cards", "title", "slug"),
    ("event_cards", "title", "slug"),
    ("promo_banners", "title", None),
    ("content_sections", "section_title", None),
    ("campaign_analytics", None, None),  # cleaned by campaign_id
]

# Reference checks for hard-delete safety.
# Each entry: (table, referencing_table, referencing_column)
REFERENCE_CHECKS: dict[str, list[tuple[str, str]]] = {
    "menu_items": [
        ("order_line_items", "menu_item_id"),
        ("cart_line_items", "menu_item_id"),
        ("reward_catalog", "menu_item_id"),
        ("voucher_definitions", "menu_item_id"),
    ],
    "bundle_products": [
        ("order_line_items", "bundle_product_id"),
        ("cart_line_items", "bundle_product_id"),
    ],
    "voucher_definitions": [
        ("customer_vouchers", "voucher_definition_id"),
        ("marketing_campaigns", "voucher_definition_id"),
        ("promo_banners", "voucher_id"),
        ("survey_definitions", "reward_voucher_id"),
    ],
    "event_cards": [
        ("event_rsvps", "event_id"),
    ],
    "marketing_campaigns": [
        ("campaign_analytics", "campaign_id"),
    ],
}

# Child tables that can be cascade-deleted when their parent E2E record is removed.
CASCADE_CHILDREN: dict[str, list[tuple[str, str]]] = {
    "marketing_campaigns": [
        ("campaign_analytics", "campaign_id"),
    ],
}

E2E_PATTERNS = ["%e2e%", "%E2E%"]
TEST_EMAIL_DOMAINS = ("%@example.com", "%@test.com")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@dataclass
class CleanupResult:
    table: str
    hard_deleted: int = 0
    soft_deleted: int = 0
    skipped: int = 0

    @property
    def total(self) -> int:
        return self.hard_deleted + self.soft_deleted + self.skipped


def _get_conn() -> connection:
    db_url = SETTINGS.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(db_url)


def _table_has_column(cur: Any, table: str, column: str) -> bool:
    cur.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s AND column_name = %s
        """,
        (table, column),
    )
    return cur.fetchone() is not None


def _count_e2e(
    cur: Any,
    table: str,
    name_col: str | None,
    slug_col: str | None,
    extra_where: str | None = None,
) -> int:
    conditions = []
    if name_col and _table_has_column(cur, table, name_col):
        conditions.append(" OR ".join([f"{name_col} ILIKE %s"] * len(E2E_PATTERNS)))
    if slug_col and _table_has_column(cur, table, slug_col):
        conditions.append(" OR ".join([f"{slug_col} ILIKE %s"] * len(E2E_PATTERNS)))
    if not conditions:
        return 0
    where = " OR ".join(f"({c})" for c in conditions)
    if extra_where:
        where = f"({where}) AND {extra_where}"
    params = []
    for _ in conditions:
        params.extend(E2E_PATTERNS)
    cur.execute(f"SELECT COUNT(*) FROM {table} WHERE {where}", params)  # noqa: S608
    return cur.fetchone()[0]


def _delete_or_soft_delete_table(
    cur: Any,
    table: str,
    name_col: str | None,
    slug_col: str | None,
    dry_run: bool,
    extra_where: str | None = None,
) -> CleanupResult:
    result = CleanupResult(table=table)

    # Build the set of E2E candidate IDs.
    conditions = []
    if name_col and _table_has_column(cur, table, name_col):
        conditions.append(" OR ".join([f"{name_col} ILIKE %s"] * len(E2E_PATTERNS)))
    if slug_col and _table_has_column(cur, table, slug_col):
        conditions.append(" OR ".join([f"{slug_col} ILIKE %s"] * len(E2E_PATTERNS)))
    if not conditions:
        return result

    where = " OR ".join(f"({c})" for c in conditions)
    if extra_where:
        where = f"({where}) AND {extra_where}"
    params = []
    for _ in conditions:
        params.extend(E2E_PATTERNS)

    cur.execute(f"SELECT id FROM {table} WHERE {where}", params)  # noqa: S608
    candidate_ids = [row[0] for row in cur.fetchall()]
    if not candidate_ids:
        return result

    has_deleted_at = _table_has_column(cur, table, "deleted_at")
    ref_checks = REFERENCE_CHECKS.get(table, [])

    ids_sql = ",".join(str(i) for i in candidate_ids)

    for cid in candidate_ids:
        # First, remove safe child records so the parent can be hard-deleted.
        children_removed = False
        for child_table, child_col in CASCADE_CHILDREN.get(table, []):
            if not _table_has_column(cur, child_table, child_col):
                continue
            if not dry_run:
                cur.execute(
                    f"DELETE FROM {child_table} WHERE {child_col} = %s",  # noqa: S608
                    (cid,),
                )
            children_removed = True

        referenced = False
        for ref_table, ref_col in ref_checks:
            if not _table_has_column(cur, ref_table, ref_col):
                continue
            cur.execute(
                f"SELECT 1 FROM {ref_table} WHERE {ref_col} = %s LIMIT 1",  # noqa: S608
                (cid,),
            )
            if cur.fetchone() is not None:
                referenced = True
                break

        if referenced:
            result.skipped += 1
            if has_deleted_at and not dry_run:
                cur.execute(
                    f"UPDATE {table} SET deleted_at = NOW() WHERE id = %s",  # noqa: S608
                    (cid,),
                )
                result.soft_deleted += 1
                result.skipped -= 1
        else:
            if not dry_run:
                cur.execute(f"DELETE FROM {table} WHERE id = %s", (cid,))  # noqa: S608
            result.hard_deleted += 1

    return result


def _purge_customers(cur: Any, dry_run: bool) -> CleanupResult:
    result = CleanupResult(table="customers")
    domains_where = " OR ".join(["email_address ILIKE %s"] * len(TEST_EMAIL_DOMAINS))
    cur.execute(
        f"SELECT id FROM customers WHERE email_address ILIKE 'e2e_%%' OR {domains_where}",  # noqa: S608
        TEST_EMAIL_DOMAINS,
    )
    customer_ids = [row[0] for row in cur.fetchall()]
    if not customer_ids:
        return result

    result.hard_deleted = len(customer_ids)
    if dry_run:
        return result

    ids_sql = ",".join(str(i) for i in customer_ids)

    # Delete dependent rows in an order that respects FKs.
    dependent_deletes = [
        "DELETE FROM cart_line_items WHERE cart_id IN (SELECT id FROM customer_carts WHERE customer_id IN ({}))",
        "DELETE FROM customer_carts WHERE customer_id IN ({})",
        "DELETE FROM payment_events WHERE payment_id IN (SELECT id FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_id IN ({})))",
        "DELETE FROM refunds WHERE order_id IN (SELECT id FROM orders WHERE customer_id IN ({})) OR payment_id IN (SELECT id FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_id IN ({})))",
        "DELETE FROM tip_allocations WHERE order_id IN (SELECT id FROM orders WHERE customer_id IN ({}))",
        "DELETE FROM order_status_log WHERE order_id IN (SELECT id FROM orders WHERE customer_id IN ({}))",
        "DELETE FROM order_modification_logs WHERE order_id IN (SELECT id FROM orders WHERE customer_id IN ({}))",
        "DELETE FROM order_adjustments WHERE order_id IN (SELECT id FROM orders WHERE customer_id IN ({}))",
        "DELETE FROM order_fulfillment WHERE order_id IN (SELECT id FROM orders WHERE customer_id IN ({}))",
        "DELETE FROM order_line_items WHERE order_id IN (SELECT id FROM orders WHERE customer_id IN ({}))",
        "DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_id IN ({}))",
        "DELETE FROM orders WHERE customer_id IN ({})",
        "DELETE FROM wallet_ledger_entries WHERE wallet_id IN (SELECT id FROM wallets WHERE customer_id IN ({}))",
        "DELETE FROM wallets WHERE customer_id IN ({})",
        "DELETE FROM wallet_topup_sessions WHERE customer_id IN ({})",
        "DELETE FROM loyalty_points_ledger WHERE customer_id IN ({})",
        "DELETE FROM loyalty_accounts WHERE customer_id IN ({})",
        "DELETE FROM customer_vouchers WHERE customer_id IN ({})",
        "DELETE FROM customer_rewards WHERE customer_id IN ({})",
        "DELETE FROM customer_consents WHERE customer_id IN ({})",
        "DELETE FROM notification_delivery_log WHERE message_id IN (SELECT id FROM notification_messages WHERE customer_id IN ({}))",
        "DELETE FROM notification_messages WHERE customer_id IN ({})",
        "DELETE FROM notification_preferences WHERE customer_id IN ({})",
        "DELETE FROM customer_devices WHERE customer_id IN ({})",
        "DELETE FROM customer_addresses WHERE customer_id IN ({})",
        "DELETE FROM feedback_entries WHERE customer_id IN ({})",
        "DELETE FROM reservations WHERE customer_id IN ({})",
        "DELETE FROM referral_events WHERE referrer_customer_id IN ({}) OR invitee_customer_id IN ({})",
        "DELETE FROM event_rsvps WHERE customer_id IN ({})",
        "DELETE FROM survey_responses WHERE customer_id IN ({})",
        "DELETE FROM customers WHERE id IN ({})",
    ]
    for stmt_template in dependent_deletes:
        stmt = stmt_template.format(ids_sql)
        cur.execute(stmt)

    return result


def _cleanup_table(
    cur: Any, table: str, name_col: str | None, slug_col: str | None, dry_run: bool
) -> CleanupResult:
    # Only touch active records; already-soft-deleted rows are left alone.
    extra = "deleted_at IS NULL" if _table_has_column(cur, table, "deleted_at") else None
    return _delete_or_soft_delete_table(cur, table, name_col, slug_col, dry_run, extra)


def _print_summary(results: list[CleanupResult], dry_run: bool) -> None:
    print("\n" + "=" * 60)
    print("E2E cleanup summary" + (" (DRY RUN)" if dry_run else ""))
    print("=" * 60)
    total_hard = sum(r.hard_deleted for r in results)
    total_soft = sum(r.soft_deleted for r in results)
    total_skipped = sum(r.skipped for r in results)
    print(f"{'Table':<30} {'Hard':>8} {'Soft':>8} {'Skip':>8}")
    print("-" * 60)
    for r in results:
        if r.total:
            print(f"{r.table:<30} {r.hard_deleted:>8} {r.soft_deleted:>8} {r.skipped:>8}")
    print("-" * 60)
    print(f"{'Total':<30} {total_hard:>8} {total_soft:>8} {total_skipped:>8}")
    print("=" * 60)


def main() -> int:
    parser = argparse.ArgumentParser(description="Clean up E2E test data")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be deleted")
    parser.add_argument("--force-prod", action="store_true", help="Run even in production")
    args = parser.parse_args()

    if not args.dry_run:
        guard_production(force_flag=args.force_prod)
        if not confirm(
            "This will delete/soft-delete E2E test data. Continue?", yes_flag=args.yes
        ):
            print("Aborted.")
            return 1

    conn = _get_conn()
    results: list[CleanupResult] = []

    try:
        with conn.cursor() as cur:
            # 1. Customers and all their dependencies.
            results.append(_purge_customers(cur, args.dry_run))

            # 2. Soft-delete capable tables.
            for table, name_col, slug_col in SOFT_DELETE_TABLES:
                results.append(_cleanup_table(cur, table, name_col, slug_col, args.dry_run))

            # 3. Hard-delete only tables.
            for table, name_col, slug_col in HARD_DELETE_TABLES:
                results.append(
                    _delete_or_soft_delete_table(cur, table, name_col, slug_col, args.dry_run)
                )

            if args.dry_run:
                conn.rollback()
                print("Dry run complete; no changes committed.")
            else:
                conn.commit()
                print("Cleanup committed.")
    except Exception as exc:
        conn.rollback()
        print(f"Cleanup failed: {exc}", file=sys.stderr)
        return 1
    finally:
        conn.close()

    _print_summary(results, args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
