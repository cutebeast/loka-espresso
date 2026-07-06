#!/usr/bin/env python3
"""Purge data older than the configured retention policy.

Run with --dry-run first to see what would be deleted.

Examples:
    python scripts/purge_retention.py --dry-run
    python scripts/purge_retention.py --yes --force-prod
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from scripts._db_utils import confirm, get_db, guard_production


async def purge(dry_run: bool = False) -> dict[str, int]:
    deleted: dict[str, int] = {}
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT table_name, retention_days, purge_strategy
                FROM data_retention_policies
                WHERE retention_days IS NOT NULL
            """)
        )
        policies = result.all()

        for table_name, retention_days, strategy in policies:
            cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
            # Only delete strategy is implemented here; anonymize/archive require custom logic.
            if strategy != "delete":
                print(f"[{table_name}] strategy '{strategy}' not implemented by this script — skipped")
                continue

            count_result = await db.execute(
                text(f"""
                    SELECT COUNT(*) FROM "{table_name}"
                    WHERE created_at < :cutoff
                """),
                {"cutoff": cutoff},
            )
            count = count_result.scalar() or 0

            if count == 0:
                print(f"[{table_name}] no rows older than {cutoff.isoformat()}")
                continue

            print(f"[{table_name}] would delete {count} row(s) older than {cutoff.isoformat()}")

            if not dry_run:
                await db.execute(
                    text(f"""
                        DELETE FROM "{table_name}"
                        WHERE created_at < :cutoff
                    """),
                    {"cutoff": cutoff},
                )
                deleted[table_name] = count

    return deleted


async def main():
    parser = argparse.ArgumentParser(description="Purge data according to retention policies")
    parser.add_argument("--dry-run", action="store_true", help="Print rows that would be deleted")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)

    if not args.dry_run and not confirm("Purge data according to retention policies?", args.yes):
        print("Aborted.")
        return

    deleted = await purge(dry_run=args.dry_run)
    if args.dry_run:
        print("\nDry run complete — no rows deleted.")
    else:
        total = sum(deleted.values())
        print(f"\nPurge complete: {total} row(s) deleted across {len(deleted)} table(s).")


if __name__ == "__main__":
    asyncio.run(main())
