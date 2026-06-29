#!/usr/bin/env python3
"""Run all or selected seed scripts in dependency order."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from scripts._db_utils import confirm, guard_production
from seed_iam import seed as seed_iam
from seed_platform import seed as seed_platform
from seed_stores import seed as seed_stores
from seed_inventory import seed as seed_inventory
from seed_menu import seed as seed_menu
from seed_loyalty import seed as seed_loyalty
from seed_content import seed as seed_content
from seed_staff import seed as seed_staff
from seed_customers import seed as seed_customers
from seed_operational import seed as seed_operational
from seed_orders import seed as seed_orders


PARTS = {
    "iam": seed_iam,
    "platform": seed_platform,
    "stores": seed_stores,
    "inventory": seed_inventory,
    "menu": seed_menu,
    "loyalty": seed_loyalty,
    "content": seed_content,
    "staff": seed_staff,
    "customers": seed_customers,
    "operational": seed_operational,
    "orders": seed_orders,
}

# Dependency order for the default --all run
ORDER = ["iam", "platform", "stores", "inventory", "menu", "loyalty", "content", "staff", "customers", "operational", "orders"]


def _expand_parts(parts_arg: str) -> list[str]:
    requested = [p.strip() for p in parts_arg.split(",") if p.strip()]
    for p in requested:
        if p not in PARTS:
            raise ValueError(f"Unknown seed part: {p}. Available: {', '.join(PARTS)}")
    return requested


async def main():
    parser = argparse.ArgumentParser(description="Seed FNB v3 database")
    parser.add_argument(
        "--parts",
        default=",".join(ORDER),
        help=f"Comma-separated list of parts to seed. Available: {', '.join(PARTS)}",
    )
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)

    parts = _expand_parts(args.parts)
    if not confirm(f"Seed database parts: {', '.join(parts)}?", args.yes):
        print("Aborted.")
        return

    for part in parts:
        print(f"\n[{part}] Seeding...")
        await PARTS[part]()

    print("\nAll selected seed parts complete.")


if __name__ == "__main__":
    asyncio.run(main())
