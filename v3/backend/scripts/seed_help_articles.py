#!/usr/bin/env python3
"""Seed help center / internal wiki articles from v3/guide markdown files."""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from scripts._db_utils import confirm, get_db, guard_production


GUIDE_DIR = Path(__file__).resolve().parent.parent.parent / "guide"

# (slug, audience, category, relative_path)
ARTICLES = [
    # Shared
    ("guide-overview", "admin", "Help Center", "index.md"),
    ("faq", "admin", "FAQ", "faq.md"),
    # Admin portal
    ("admin-index", "admin", "Admin Portal", "admin/index.md"),
    ("admin-role-access", "admin", "Admin Portal", "admin/role-access-matrix.md"),
    ("admin-dashboard", "admin", "Admin Portal", "admin/dashboard.md"),
    ("admin-stores", "admin", "Admin Portal", "admin/stores.md"),
    ("admin-menu", "admin", "Admin Portal", "admin/menu.md"),
    ("admin-inventory", "admin", "Admin Portal", "admin/inventory.md"),
    ("admin-staff", "admin", "Admin Portal", "admin/staff.md"),
    ("admin-customers", "admin", "Admin Portal", "admin/customers.md"),
    ("admin-orders-refunds", "admin", "Admin Portal", "admin/orders-and-refunds.md"),
    ("admin-marketing", "admin", "Admin Portal", "admin/marketing.md"),
    ("admin-loyalty", "admin", "Admin Portal", "admin/loyalty.md"),
    ("admin-content", "admin", "Admin Portal", "admin/content.md"),
    ("admin-reports-audit", "admin", "Admin Portal", "admin/reports-and-audit.md"),
    ("admin-settings", "admin", "Admin Portal", "admin/settings.md"),
    ("admin-translations", "admin", "Admin Portal", "admin/translations.md"),
    # Staff portal
    ("staff-index", "staff", "Staff Portal", "staff/index.md"),
    ("staff-role-access", "staff", "Staff Portal", "staff/role-access-matrix.md"),
    ("staff-getting-started", "staff", "Staff Portal", "staff/getting-started.md"),
    ("staff-pos-checkout", "staff", "Staff Portal", "staff/pos-checkout.md"),
    ("staff-kitchen-display", "staff", "Staff Portal", "staff/kitchen-display.md"),
    ("staff-orders-tables", "staff", "Staff Portal", "staff/orders-and-tables.md"),
    ("staff-reservations", "staff", "Staff Portal", "staff/reservations.md"),
    ("staff-time-clock-shifts", "staff", "Staff Portal", "staff/time-clock-and-shifts.md"),
    ("staff-tasks", "staff", "Staff Portal", "staff/tasks.md"),
    ("staff-wallet", "staff", "Staff Portal", "staff/wallet.md"),
    ("staff-operations", "staff", "Staff Portal", "staff/operations.md"),
    ("staff-hardware", "staff", "Staff Portal", "staff/hardware-peripherals.md"),
    # Customer PWA
    ("customer-index", "customer", "Customer PWA", "customer/index.md"),
    ("customer-getting-started", "customer", "Customer PWA", "customer/getting-started.md"),
    ("customer-menu-ordering", "customer", "Customer PWA", "customer/menu-and-ordering.md"),
    ("customer-checkout-payment", "customer", "Customer PWA", "customer/checkout-and-payment.md"),
    ("customer-orders-detail", "customer", "Customer PWA", "customer/orders-and-order-detail.md"),
    ("customer-promotions-rewards", "customer", "Customer PWA", "customer/promotions-and-rewards.md"),
    ("customer-wallet-loyalty", "customer", "Customer PWA", "customer/wallet-and-loyalty.md"),
    ("customer-profile-settings", "customer", "Customer PWA", "customer/profile-and-settings.md"),
    ("customer-reservations-events", "customer", "Customer PWA", "customer/reservations-and-events.md"),
    ("customer-checkin-referral", "customer", "Customer PWA", "customer/checkin-and-referral.md"),
    ("customer-information", "customer", "Customer PWA", "customer/information-and-events.md"),
    ("customer-help-support", "customer", "Customer PWA", "customer/help-and-support.md"),
]


def _extract_title(body: str) -> str:
    match = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
    return match.group(1).strip() if match else "Untitled"


async def _upsert_help_article(db, slug: str, audience: str, category: str, body: str, position: int):
    title = _extract_title(body)
    existing = await db.execute(
        text("SELECT id FROM help_articles WHERE slug = :slug"),
        {"slug": slug},
    )
    if existing.scalar_one_or_none():
        await db.execute(
            text("""
                UPDATE help_articles
                SET title = :title,
                    audience = :audience,
                    category = :category,
                    body_text = :body_text,
                    position = :position,
                    is_active = true,
                    updated_at = NOW()
                WHERE slug = :slug
            """),
            {
                "slug": slug,
                "title": title,
                "audience": audience,
                "category": category,
                "body_text": body,
                "position": position,
            },
        )
        return
    await db.execute(
        text("""
            INSERT INTO help_articles (slug, title, audience, category, body_text, position, is_active, created_at, updated_at)
            VALUES (:slug, :title, :audience, :category, :body_text, :position, true, NOW(), NOW())
        """),
        {
            "slug": slug,
            "title": title,
            "audience": audience,
            "category": category,
            "body_text": body,
            "position": position,
        },
    )


async def seed():
    async with get_db() as db:
        seeded = 0
        for position, (slug, audience, category, rel_path) in enumerate(ARTICLES):
            file_path = GUIDE_DIR / rel_path
            if not file_path.exists():
                print(f"  [warn] Guide file not found: {file_path}")
                continue
            body = file_path.read_text(encoding="utf-8")
            await _upsert_help_article(db, slug, audience, category, body, position)
            seeded += 1

        # Remove articles whose slugs are no longer in the source list.
        valid_slugs = {a[0] for a in ARTICLES}
        result = await db.execute(text("SELECT slug FROM help_articles"))
        existing_slugs = {row[0] for row in result.all()}
        orphaned = existing_slugs - valid_slugs
        if orphaned:
            placeholders = ", ".join(f":s{i}" for i in range(len(orphaned)))
            params = {f"s{i}": s for i, s in enumerate(orphaned)}
            await db.execute(
                text(f"DELETE FROM help_articles WHERE slug IN ({placeholders})"),
                params,
            )
            print(f"  Removed {len(orphaned)} orphaned help articles")

        print(f"  Seeded {seeded} help articles from {GUIDE_DIR}")


async def main():
    parser = argparse.ArgumentParser(description="Seed help center articles")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)

    if not confirm("Seed help center articles?", args.yes):
        print("Aborted.")
        return

    await seed()


if __name__ == "__main__":
    asyncio.run(main())
