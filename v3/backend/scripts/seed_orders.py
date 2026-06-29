#!/usr/bin/env python3
"""Seed sample orders for demo / admin order history.

Creates a handful of realistic orders across active stores and customers
using existing menu items. Safe to re-run: it skips seeding if the
sample order set already exists for a store.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select

from scripts._db_utils import confirm, get_db, guard_production


ORDER_SEED = [
    # (customer_email, order_type, fulfillment_type, status, payment_status, items)
    {
        "customer_email": "demo@lokaespresso.my",
        "order_type": "dine_in",
        "fulfillment_type": "dine_in_service",
        "status": "delivered",
        "payment_status": "captured",
        "items": [("ESP", 2), ("CRO", 1)],
    },
    {
        "customer_email": "vip@lokaespresso.my",
        "order_type": "takeaway",
        "fulfillment_type": "counter_pickup",
        "status": "delivered",
        "payment_status": "captured",
        "items": [("LAT", 1), ("MUF", 2)],
    },
    {
        "customer_email": "demo@lokaespresso.my",
        "order_type": "delivery",
        "fulfillment_type": "standard_delivery",
        "status": "out_for_delivery",
        "payment_status": "captured",
        "items": [("LAT", 2), ("CRO", 1), ("MUF", 1)],
    },
    {
        "customer_email": "vip@lokaespresso.my",
        "order_type": "dine_in",
        "fulfillment_type": "dine_in_service",
        "status": "cancelled_by_customer",
        "payment_status": "refunded",
        "items": [("ESP", 1)],
    },
    {
        "customer_email": "demo@lokaespresso.my",
        "order_type": "takeaway",
        "fulfillment_type": "curbside_pickup",
        "status": "ready_for_pickup",
        "payment_status": "captured",
        "items": [("LAT", 1), ("CRO", 1)],
    },
    {
        "customer_email": "vip@lokaespresso.my",
        "order_type": "delivery",
        "fulfillment_type": "express_delivery",
        "status": "preparing",
        "payment_status": "captured",
        "items": [("ESP", 1), ("LAT", 1), ("MUF", 1)],
    },
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def seed():
    from app.models.customer import Customer
    from app.models.menu import MenuItem
    from app.models.order import Order, OrderLineItem, OrderStatusLog
    from app.models.store import Store

    async with get_db() as db:
        stores = (await db.execute(select(Store).where(Store.deleted_at.is_(None), Store.is_active.is_(True)))).scalars().all()
        if not stores:
            print("  No active stores found — skipping order seeding")
            return

        customers_result = await db.execute(
            select(Customer).where(Customer.email_address.in_(["demo@lokaespresso.my", "vip@lokaespresso.my"]))
        )
        customers = {c.email_address: c for c in customers_result.scalars().all()}
        if len(customers) < 2:
            print("  Demo customers not found — run seed_customers.py first")
            return

        menu_items_result = await db.execute(
            select(MenuItem).where(MenuItem.item_code.in_(["ESP", "LAT", "CRO", "MUF"]), MenuItem.deleted_at.is_(None))
        )
        menu_items = {mi.item_code: mi for mi in menu_items_result.scalars().all()}
        if not menu_items:
            print("  No menu items found — run seed_menu.py first")
            return

        created_total = 0
        for store in stores:
            existing = (
                await db.execute(
                    select(func.count(Order.id)).where(
                        Order.store_id == store.id,
                        Order.order_number.like("SEED-%"),
                    )
                )
            ).scalar() or 0
            if existing >= len(ORDER_SEED):
                print(f"  Store {store.id} already has seed orders — skipping")
                continue

            for idx, spec in enumerate(ORDER_SEED, start=existing + 1):
                customer = customers.get(spec["customer_email"])
                order_number = f"SEED-{store.id}-{idx:03d}"

                # Compute line totals
                item_count = 0
                items_subtotal = Decimal("0")
                line_items = []
                for item_code, qty in spec["items"]:
                    menu_item = menu_items.get(item_code)
                    if not menu_item:
                        continue
                    unit_price = Decimal(str(menu_item.base_price or 0))
                    line_total = unit_price * qty
                    item_count += qty
                    items_subtotal += line_total
                    line_items.append(
                        OrderLineItem(
                            menu_item_id=menu_item.id,
                            item_snapshot={
                                "item_name": menu_item.item_name,
                                "item_code": menu_item.item_code,
                                "base_price": float(unit_price),
                            },
                            quantity=qty,
                            unit_price=float(unit_price),
                            line_total=float(line_total),
                            selected_modifiers={},
                        )
                    )

                total_amount = items_subtotal
                now = _now()
                created_at = now - timedelta(days=idx, hours=idx)

                order = Order(
                    customer_id=customer.id,
                    store_id=store.id,
                    order_number=order_number,
                    order_type=spec["order_type"],
                    order_channel="mobile_app",
                    status=spec["status"],
                    payment_status=spec["payment_status"],
                    fulfillment_type=spec["fulfillment_type"],
                    item_count=item_count,
                    items_subtotal=float(items_subtotal),
                    modifier_subtotal=0.0,
                    delivery_fee=0.0,
                    service_charge=0.0,
                    tax_amount=0.0,
                    discount_amount=0.0,
                    voucher_discount=0.0,
                    reward_discount=0.0,
                    addon_discount=0.0,
                    tip_amount=0.0,
                    total_amount=float(total_amount),
                    total_amount_currency="MYR",
                    loyalty_points_earned=0,
                    loyalty_points_redeemed=0,
                    line_items=line_items,
                    created_at=created_at,
                    updated_at=created_at,
                )

                # Audit timestamps for terminal statuses
                if spec["status"] == "delivered":
                    order.confirmed_at = created_at + timedelta(minutes=5)
                    order.prepared_at = created_at + timedelta(minutes=15)
                    order.completed_at = created_at + timedelta(minutes=30)
                elif spec["status"] in ("preparing", "ready_for_pickup", "out_for_delivery"):
                    order.confirmed_at = created_at + timedelta(minutes=5)
                    if spec["status"] in ("ready_for_pickup", "out_for_delivery"):
                        order.prepared_at = created_at + timedelta(minutes=15)
                elif spec["status"] == "cancelled_by_customer":
                    order.cancelled_at = created_at + timedelta(minutes=10)
                    order.cancellation_reason = "Customer changed mind"
                    order.cancelled_by = "customer"

                order.status_logs.append(
                    OrderStatusLog(
                        from_status="pending",
                        to_status=spec["status"],
                        reason="Auto-seeded order",
                        actor_type="system",
                        created_at=created_at,
                    )
                )

                db.add(order)
                created_total += 1

            print(f"  Created {len(ORDER_SEED) - existing} seed order(s) for store {store.id}")

        if created_total:
            print(f"  Created {created_total} seed order(s) total")


async def main():
    parser = argparse.ArgumentParser(description="Seed sample orders")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Seed sample orders?", args.yes):
        print("Aborted.")
        return

    await seed()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
