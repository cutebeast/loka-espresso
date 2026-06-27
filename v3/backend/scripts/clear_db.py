#!/usr/bin/env python3
"""Modular database clear script.

Examples:
    python scripts/clear_db.py --module orders --yes
    python scripts/clear_db.py --module customers --yes      # also clears orders
    python scripts/clear_db.py --all --yes
    python scripts/clear_db.py --module menu --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import Base
from app.models import *  # noqa: F401,F403 — registers all tables on Base.metadata
from scripts._db_utils import SETTINGS, confirm, guard_production, truncate_tables


# ---------------------------------------------------------------------------
# Module definitions
# ---------------------------------------------------------------------------

MODULE_TABLES: dict[str, list[str]] = {
    "orders": [
        "order_modification_logs",
        "order_status_log",
        "order_adjustments",
        "order_fulfillment",
        "order_line_items",
        "orders",
        "payment_events",
        "payments",
        "refunds",
        "tip_allocations",
    ],
    "customers": [
        "cart_line_items",
        "customer_addresses",
        "customer_carts",
        "customer_consents",
        "customer_daily_checkins",
        "customer_devices",
        "customer_rewards",
        "customer_vouchers",
        "loyalty_accounts",
        "payment_methods",
        "loyalty_points_ledger",
        "wallet_ledger_entries",
        "wallets",
        "customers",
    ],
    "loyalty": [
        "reward_catalog",
        "voucher_definitions",
        "loyalty_tiers",
    ],
    "marketing": [
        "campaign_analytics",
        "content_sections",
        "event_rsvps",
        "event_cards",
        "information_cards",
        "marketing_campaigns",
        "notification_delivery_log",
        "notification_messages",
        "notification_preferences",
        "notification_templates",
        "product_cards",
        "promo_banners",
        "referral_events",
        "scheduled_jobs",
        "splash_screens",
        "system_health_metrics",
        "system_pages",
    ],
    "feedback": [
        "survey_answers",
        "survey_responses",
        "survey_questions",
        "survey_definitions",
        "feedback_entries",
    ],
    "reservations": [
        "reservations",
    ],
    "staff": [
        "pos_sessions",
        "pos_terminals",
        "shift_templates",
        "staff_shifts",
        "staff_time_events",
        "staff_profiles",
    ],
    "stores": [
        "dining_tables",
        "equipment_maintenance_logs",
        "equipment",
        "hygiene_reports",
        "store_assignments",
        "store_configuration",
        "store_operating_hours",
        "store_special_hours",
        "table_status_snapshot",
        "stores",
    ],
    "inventory": [
        "inventory_movement_log",
        "inventory_stock",
        "purchase_order_lines",
        "purchase_orders",
        "inventory_items",
        "inventory_categories",
        "suppliers",
    ],
    "menu": [
        "bundle_component_modifiers",
        "bundle_product_components",
        "bundle_groups",
        "bundle_products",
        "menu_item_allergens",
        "menu_item_dietary_tags",
        "menu_item_recipes",
        "menu_modifier_options",
        "menu_modifier_groups",
        "menu_variants",
        "menu_items",
        "menu_categories",
        "allergens",
        "dietary_tags",
        "tax_categories",
    ],
    "iam": [
        "admin_accounts",
        "admin_notifications",
        "api_credentials",
        "role_assignments",
        "role_permission",
        "iam_permissions",
        "iam_roles",
        "token_blacklist",
        "iam_principals",
    ],
    "platform": [
        "audit_log",
        "data_retention_policies",
        "platform_config",
        "translation_cache",
        "translations",
    ],
}

# When clearing a module, these other modules must be cleared first because of FK references.
MODULE_DEPS: dict[str, set[str]] = {
    "orders": set(),
    "customers": {"orders"},
    "loyalty": {"customers"},
    "marketing": {"customers", "stores"},
    "feedback": {"customers", "orders"},
    "reservations": {"customers", "stores"},
    "staff": {"orders", "stores"},
    "stores": {"orders", "reservations", "inventory", "staff"},
    "inventory": {"orders", "menu"},
    "menu": {"orders"},
    "iam": {"orders", "staff", "stores"},
    "platform": {"orders", "customers"},
}


def _resolve_modules(selected: list[str]) -> list[str]:
    """Expand selected modules to include dependencies and return a safe clear order."""
    if "all" in selected:
        return ["all"]

    needed: set[str] = set()
    stack = list(selected)
    while stack:
        mod = stack.pop()
        if mod not in MODULE_TABLES:
            raise ValueError(f"Unknown module: {mod}. Choose from: {', '.join(MODULE_TABLES)} or 'all'")
        if mod in needed:
            continue
        needed.add(mod)
        for dep in MODULE_DEPS.get(mod, set()):
            stack.append(dep)

    # Return modules in an order that respects dependencies (deps first).
    # A simple topological sort using the dependency graph.
    ordered: list[str] = []
    remaining = dict(MODULE_DEPS)
    # For topo sort, only consider modules we actually need.
    incoming = {mod: set() for mod in needed}
    for mod in needed:
        for dep in remaining.get(mod, set()) & needed:
            incoming[mod].add(dep)

    while incoming:
        ready = [mod for mod, deps in incoming.items() if not deps]
        if not ready:
            raise RuntimeError(f"Circular dependency among modules: {list(incoming)}")
        ready.sort()
        for mod in ready:
            ordered.append(mod)
            del incoming[mod]
        for mod, deps in incoming.items():
            incoming[mod] = deps - set(ready)

    return ordered


def _tables_for_modules(modules: list[str]) -> list[str]:
    """Return table names for the given modules in dependency-first order.

    Because dependencies were already resolved, concatenating module table lists
    in that order is safe: child modules are cleared before parent modules.
    """
    return [name for mod in modules for name in MODULE_TABLES[mod]]


def _all_tables_in_clear_order() -> list[str]:
    """Use SQLAlchemy's topological table order reversed (children before parents)."""
    # sorted_tables is create order (parents before children); reverse for truncate.
    return [
        t.name
        for t in reversed(Base.metadata.sorted_tables)
        if t.name != "alembic_version"
    ]


def _validate_coverage() -> None:
    """Ensure every registered table is assigned to a module."""
    assigned: set[str] = set()
    for names in MODULE_TABLES.values():
        assigned.update(names)

    missing = []
    for table in Base.metadata.tables.values():
        if table.name == "alembic_version":
            continue
        if table.name not in assigned:
            missing.append(table.name)

    if missing:
        print("ERROR: The following tables are not assigned to any clear module:")
        for name in sorted(missing):
            print(f"  - {name}")
        sys.exit(1)


async def main():
    parser = argparse.ArgumentParser(description="Clear FNB v3 database modules")
    parser.add_argument(
        "--module",
        action="append",
        help="Module to clear (can be used multiple times). Use 'all' for everything.",
    )
    parser.add_argument("--all", action="store_true", help="Clear every table except alembic_version")
    parser.add_argument("--yes", action="store_true", help="Skip interactive confirmation")
    parser.add_argument("--dry-run", action="store_true", help="Print tables that would be truncated")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)
    _validate_coverage()

    if args.all:
        selected = ["all"]
    elif args.module:
        selected = args.module
    else:
        parser.print_help()
        sys.exit(1)

    if "all" in selected:
        table_names = _all_tables_in_clear_order()
        label = "all data"
    else:
        modules = _resolve_modules(selected)
        table_names = _tables_for_modules(modules)
        label = ", ".join(modules)

    print(f"Module(s) to clear: {label}")
    print(f"Table(s) to truncate: {len(table_names)}")
    if args.dry_run:
        print("Order (child → parent):")
        for name in table_names:
            print(f"  - {name}")
        await truncate_tables([], dry_run=True)
        return

    if not confirm(f"Truncate {len(table_names)} table(s) for module(s): {label}?", args.yes):
        print("Aborted.")
        return

    await truncate_tables(table_names)
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
