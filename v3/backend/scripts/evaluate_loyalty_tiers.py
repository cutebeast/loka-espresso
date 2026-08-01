#!/usr/bin/env python3
"""Daily loyalty tier renewal/downgrade evaluation.

Iterates all active loyalty accounts whose current tier has a validity window
(Bloom has no expiry) and whose spend window has elapsed. Runs _evaluate_tier_renewal
for each — renewing or downgrading the tier as appropriate.

Intended to run daily via cron. Safe to run more frequently — the function
checks the window and exits early when not yet elapsed.
"""

import asyncio
import sys
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import delete, select, update
from app.core.database import AsyncSessionLocal
from app.models.iam import TokenBlacklist
from app.models.loyalty import LoyaltyAccount, LoyaltyTier
from app.services.commerce import _evaluate_tier_renewal


async def purge_expired_blacklist_tokens() -> int:
    """Delete expired rows from token_blacklist (they can never validate again)."""
    from datetime import datetime, timezone

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            delete(TokenBlacklist).where(TokenBlacklist.expires_at < datetime.now(timezone.utc))
        )
        await db.commit()
        return result.rowcount or 0


async def evaluate_all() -> tuple[int, int]:
    """Run tier renewal evaluation for all eligible accounts.

    Returns (evaluated, changed) counts.
    """
    evaluated = 0
    changed = 0

    await purge_expired_blacklist_tokens()

    async with AsyncSessionLocal() as db:
        from sqlalchemy.orm import selectinload

        result = await db.execute(
            select(LoyaltyAccount)
            .options(selectinload(LoyaltyAccount.current_tier))
            .where(
                LoyaltyAccount.current_tier_id.is_not(None),
                LoyaltyAccount.annual_spend_window_start.is_not(None),
            )
        )
        accounts = result.scalars().all()

        for account in accounts:
            tier_before = account.current_tier_id
            await _evaluate_tier_renewal(db, account)
            evaluated += 1
            if account.current_tier_id != tier_before:
                changed += 1

        if accounts:
            await db.commit()

    return evaluated, changed


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Daily loyalty tier evaluation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production environment")
    parser.add_argument("--quiet", action="store_true", help="Suppress output except errors")
    parser.add_argument("--dry-run", action="store_true", help="Evaluate without committing changes")
    args = parser.parse_args()

    env = os.getenv("ENVIRONMENT", "development")
    if env == "production" and not args.force_prod:
        print("[ERROR] ENVIRONMENT=production. Use --force-prod to run this script in production.", file=sys.stderr)
        sys.exit(1)

    evaluated, changed = asyncio.run(evaluate_all())

    if not args.quiet:
        print(f"Tier evaluation complete: {evaluated} accounts checked, {changed} tier changes applied")
