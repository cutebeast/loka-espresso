#!/usr/bin/env python3
"""Daily "Morning Boost" habit push (ZUS-style, with anti-spam discipline).

Sends a morning nudge to members with recent order activity:
- Segment: active members with at least one order in the last 60 days
- Skips: marketing-opted-out members, inactive/deleted accounts
- Hard cap: max 3 morning pushes per member per ISO week
- Channel: PWA inbox (NotificationMessage) + web push for subscribed devices

Run daily ~07:23 local via cron. Safe to re-run — capped members are skipped.

Usage: cd v3/backend && python3 ../scripts/morning_boost_push.py [--force-prod] [--quiet]
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.models.customer import Customer, CustomerDevice
from app.models.notification import NotificationMessage
from app.models.order import Order

MAX_PER_WEEK = 3
RECENT_ORDER_DAYS = 60
CAMPAIGN_TAG = "morning_boost"

TITLE = "Good morning ☕"
BODY_TEMPLATE = "Good morning{name} — your usual is waiting. Order ahead and skip the queue."


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force-prod", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    order_since = now - timedelta(days=RECENT_ORDER_DAYS)

    async with AsyncSessionLocal() as db:
        # Members with recent order activity, not opted out
        member_ids_result = await db.execute(
            select(Order.customer_id)
            .where(Order.created_at >= order_since)
            .group_by(Order.customer_id)
        )
        member_ids = [row[0] for row in member_ids_result.all() if row[0]]

        customers_result = await db.execute(
            select(Customer).where(
                Customer.id.in_(member_ids),
                Customer.is_active.is_(True),
                Customer.deleted_at.is_(None),
                Customer.marketing_opt_out.is_(False),
            )
        )
        customers = customers_result.scalars().all()

        # This week's habit-push counts per customer (for the 3/week cap)
        counts_result = await db.execute(
            select(NotificationMessage.customer_id, func.count(NotificationMessage.id))
            .where(
                NotificationMessage.created_at >= week_start,
                NotificationMessage.action_payload["campaign"].astext == CAMPAIGN_TAG,
            )
            .group_by(NotificationMessage.customer_id)
        )
        sent_this_week = {row[0]: row[1] for row in counts_result.all()}

        from app.services.web_push import send_web_push

        sent = 0
        for customer in customers:
            if sent_this_week.get(customer.id, 0) >= MAX_PER_WEEK:
                continue
            first = (customer.display_name or "").split(" ")[0]
            name = f", {first}" if first else ""
            msg = NotificationMessage(
                customer_id=customer.id,
                message_type="promotion",
                title=TITLE,
                body=BODY_TEMPLATE.format(name=name),
                action_url="#menu",
                action_payload={"campaign": CAMPAIGN_TAG},
            )
            db.add(msg)
            await db.flush()

            devices_result = await db.execute(
                select(CustomerDevice).where(
                    CustomerDevice.customer_id == customer.id,
                    CustomerDevice.is_active.is_(True),
                    CustomerDevice.deleted_at.is_(None),
                    CustomerDevice.web_push_subscription.isnot(None),
                )
            )
            for device in devices_result.scalars().all():
                send_web_push(device.web_push_subscription, {
                    "title": TITLE,
                    "body": BODY_TEMPLATE.format(name=name),
                    "url": "/#menu",
                    "tag": CAMPAIGN_TAG,
                })
            sent += 1

        await db.commit()

    if not args.quiet:
        print(f"Morning Boost: sent to {sent} members ({len(sent_this_week)} capped this week)")


if __name__ == "__main__":
    asyncio.run(main())
