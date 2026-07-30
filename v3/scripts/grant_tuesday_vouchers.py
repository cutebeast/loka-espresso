#!/usr/bin/env python3
"""Weekly LOKA Tuesday voucher grant.

Grants every active, non-opted-out member a fresh 1-use "LOKA Tuesday" voucher
valid for the upcoming Tuesday, and creates/updates the LOKA-TUESDAY
definition. Run weekly (Monday early morning) via cron; safe to re-run —
already-granted members for the same Tuesday are skipped.

Usage: cd v3/backend && python3 ../scripts/grant_tuesday_vouchers.py [--force-prod] [--quiet]
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.customer import Customer
from app.models.voucher import CustomerVoucher, VoucherDefinition
from app.services.commerce import grant_voucher_to_customer

VOUCHER_CODE = "LOKA-TUESDAY"
DISCOUNT_PCT = 15.0


def next_tuesday(now: datetime) -> datetime:
    """The upcoming Tuesday (today if it IS Tuesday)."""
    days_ahead = (1 - now.weekday()) % 7  # Monday=0 … Tuesday=1
    return (now + timedelta(days=days_ahead)).replace(hour=0, minute=0, second=0, microsecond=0)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force-prod", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    parser.parse_args()

    now = datetime.now(timezone.utc)
    tue_start = next_tuesday(now)
    tue_end = tue_start + timedelta(days=1)

    async with AsyncSessionLocal() as db:
        # Upsert the definition
        result = await db.execute(
            select(VoucherDefinition).where(VoucherDefinition.voucher_code == VOUCHER_CODE)
        )
        vd = result.scalar_one_or_none()
        if vd is None:
            vd = VoucherDefinition(
                voucher_code=VOUCHER_CODE,
                voucher_type="percentage_off",
                scope="global",
                display_title=f"LOKA Tuesday — {DISCOUNT_PCT:.0f}% Off",
                description="Members-only treat: 15% off your order, every Tuesday. One use per week.",
                discount_value=DISCOUNT_PCT,
                minimum_order_value=0,
                max_uses_per_customer=52,  # yearly cap per definition; the 1-use-per-week cap lives on each grant row
                max_global_uses=None,
                validity_days=1,
                is_active=True,
                valid_from=tue_start,
                valid_until=tue_end,
            )
            db.add(vd)
            await db.flush()
        else:
            # Keep it active and aligned with this week's window
            vd.is_active = True
            vd.valid_from = tue_start
            vd.valid_until = tue_end
            vd.validity_days = 1

        # Members: active, not deleted, not marketing-opted-out
        members_result = await db.execute(
            select(Customer).where(
                Customer.is_active.is_(True),
                Customer.deleted_at.is_(None),
            )
        )
        members = members_result.scalars().all()

        # Skip members who already hold an unused LOKA Tuesday voucher for this window
        held_result = await db.execute(
            select(CustomerVoucher.customer_id).where(
                CustomerVoucher.source == "loka_tuesday",
                CustomerVoucher.expires_at >= now,
                CustomerVoucher.use_count == 0,
            )
        )
        already_held = {row[0] for row in held_result.all()}

        granted = 0
        for member in members:
            if member.id in already_held:
                continue
            if getattr(member, "marketing_opt_out", False):
                continue
            cv = await grant_voucher_to_customer(
                db, member.id, VOUCHER_CODE, source="loka_tuesday", expires_at=tue_end
            )
            if cv is not None:
                granted += 1

        await db.commit()

    print(f"LOKA Tuesday: granted {granted} vouchers (window {tue_start.date()} → {tue_end.date()}); skipped {len(already_held)} already-held")


if __name__ == "__main__":
    asyncio.run(main())
