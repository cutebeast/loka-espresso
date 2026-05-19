#!/usr/bin/env python3
"""
Seed comprehensive test orders for all order types and flows.
Creates dine-in, takeaway, and delivery orders in various statuses.
"""
import sys, os
sys.path.insert(0, "/root/fnb-super-app/v3/backend")

import asyncio
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from datetime import datetime, timezone, timedelta

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+asyncpg://fnb_user:fnb_pass@localhost:13334/fnb_enterprise_v3")
engine = create_async_engine(DATABASE_URL)
Session = async_sessionmaker(engine)

STORE_ID = 2
CUSTOMERS = [1, 2, 3, 4, 5, 40, 41, 42]  # Mix of existing and seeded test customers
TABLES = [43, 44, 45]  # T21, T22, T23
MENU_ITEMS = list(range(1, 16))  # Items 1-15
DELIVERY_FEE = 5.00
SERVICE_CHARGE = 0.0
TAX_RATE = 0.0


async def seed():
    from app.models.order import Order, OrderLineItem, OrderFulfillment, OrderStatusLog
    from app.models.payment import Payment
    from app.models.customer import CustomerAddress
    from app.models.menu import MenuItem

    async with Session() as db:
        now = datetime.now(timezone.utc)

        # ── 0. Clean up old seeded orders (optional: keep if you want) ──
        # We'll keep existing orders and add new ones

        # ── 1. Ensure customer addresses exist for delivery ──
        addr_result = await db.execute(select(CustomerAddress).where(CustomerAddress.deleted_at.is_(None)))
        existing_addrs = addr_result.scalars().all()
        addr_by_customer = {}
        for a in existing_addrs:
            addr_by_customer[a.customer_id] = a

        # Create addresses for customers who don't have one
        address_data = [
            (1, "Ahmad Ibrahim", "+60123456780", "Lot 10, Bukit Bintang", "Kuala Lumpur", "55100"),
            (2, "Test User", "+60123456789", "Pavilion KL, 168 Jalan Bukit Bintang", "Kuala Lumpur", "55100"),
            (3, "Raj Kumar", "+60129876543", "KLCC Suria, 50088", "Kuala Lumpur", "50088"),
            (4, "Mei Wong", "+60123459876", "Mid Valley Megamall, Lingkaran Syed Putra", "Kuala Lumpur", "59200"),
            (5, "Aida Rahman", "+60127654321", "One Utama, 1 Lebuh Bandar Utama", "Petaling Jaya", "47800"),
            (40, "Test Customer 1", "+60120000001", "Pavilion Residences, Jalan Bukit Bintang", "Kuala Lumpur", "55100"),
            (41, "Test Customer 2", "+60120000002", "The Westin KL, 199 Jalan Bukit Bintang", "Kuala Lumpur", "55100"),
            (42, "Test Customer 3", "+60120000003", "Grand Hyatt KL, 12 Jalan Pinang", "Kuala Lumpur", "50450"),
        ]

        for cust_id, name, phone, line1, city, postcode in address_data:
            if cust_id not in addr_by_customer:
                addr = CustomerAddress(
                    customer_id=cust_id,
                    label="Home",
                    is_default=True,
                    recipient_name=name,
                    recipient_phone=phone,
                    address_line_1=line1,
                    address_line_2="",
                    city=city,
                    state_province="Wilayah Persekutuan" if city == "Kuala Lumpur" else "Selangor",
                    postal_code=postcode,
                    country_code="MY",
                    latitude=3.1390,
                    longitude=101.6869,
                    delivery_instructions="Call upon arrival",
                )
                db.add(addr)
                await db.flush()
                addr_by_customer[cust_id] = addr
                print(f"  Created address for customer {cust_id}")

        # ── 2. Get menu items for realistic seeding ──
        menu_result = await db.execute(
            select(MenuItem).where(MenuItem.deleted_at.is_(None), MenuItem.is_available.is_(True))
        )
        menu_items = menu_result.scalars().all()
        if not menu_items:
            print("ERROR: No available menu items found")
            return 1
        menu_map = {m.id: m for m in menu_items}

        def pick_items(count=2):
            """Pick random menu items for an order."""
            import random
            picks = random.sample(menu_items, min(count, len(menu_items)))
            return picks

        def make_order_number(prefix, idx):
            return f"{prefix}-{now.strftime('%m%d')}-{idx:03d}"

        def calc_totals(line_items_data):
            """Calculate subtotal, tax, service charge, total."""
            subtotal = sum(li["unit_price"] * li["quantity"] for li in line_items_data)
            tax = round(subtotal * TAX_RATE, 2)
            sc = SERVICE_CHARGE
            total = round(subtotal + tax + sc, 2)
            return subtotal, tax, sc, total

        orders_created = []

        # ═══════════════════════════════════════════════════════════════
        # DINE-IN ORDERS
        # ═══════════════════════════════════════════════════════════════
        dine_in_configs = [
            # (status, payment_status, table_idx, customer_idx, item_count)
            ("confirmed", "initiated", 0, 0, 2),
            ("confirmed", "captured", 1, 1, 3),
            ("confirmed", "initiated", 2, 2, 2),
            ("preparing", "captured", 0, 3, 3),
            ("preparing", "initiated", 1, 4, 2),
            ("ready_for_pickup", "captured", 2, 5, 3),
        ]

        for i, (status, pay_status, tidx, cidx, icount) in enumerate(dine_in_configs, 1):
            items = pick_items(icount)
            line_data = []
            for mi in items:
                line_data.append({
                    "menu_item_id": mi.id,
                    "quantity": 1,
                    "unit_price": float(mi.base_price or 0),
                    "item_snapshot": {"item_name": mi.item_name, "image_url": mi.image_url},
                })
            subtotal, tax, sc, total = calc_totals(line_data)

            order = Order(
                customer_id=CUSTOMERS[cidx],
                store_id=STORE_ID,
                dining_table_id=TABLES[tidx],
                order_number=make_order_number("DINE", i),
                order_type="dine_in",
                order_channel="pos",
                status=status,
                payment_status=pay_status,
                fulfillment_type="dine_in_service",
                item_count=len(line_data),
                items_subtotal=subtotal,
                service_charge=sc,
                tax_amount=tax,
                total_amount=total,
                total_amount_currency="MYR",
                confirmed_at=now if status in ("confirmed", "preparing", "ready_for_pickup") else None,
                prepared_at=now if status in ("preparing", "ready_for_pickup") else None,
            )
            db.add(order)
            await db.flush()

            for li in line_data:
                db.add(OrderLineItem(
                    order_id=order.id,
                    menu_item_id=li["menu_item_id"],
                    item_snapshot=li["item_snapshot"],
                    quantity=li["quantity"],
                    unit_price=li["unit_price"],
                    line_total=round(li["unit_price"] * li["quantity"], 2),
                    selected_modifiers={"modifier_ids": []},
                ))

            if pay_status == "captured":
                db.add(Payment(
                    order_id=order.id,
                    amount=total,
                    currency_code="MYR",
                    payment_method_type="cash",
                    provider="cash",
                    status="settled",
                    idempotency_key=f"seed-dine-{order.id}-{now.timestamp()}",
                ))

            db.add(OrderStatusLog(
                order_id=order.id,
                from_status="pending",
                to_status=status,
                actor_type="system",
                reason="Seeded test order",
            ))

            orders_created.append(("dine_in", order.id, status))
            print(f"  Dine-in order #{order.order_number} — {status} — RM {total}")

        # ═══════════════════════════════════════════════════════════════
        # TAKEAWAY ORDERS
        # ═══════════════════════════════════════════════════════════════
        takeaway_configs = [
            ("confirmed", "initiated", 0, 2),
            ("confirmed", "captured", 1, 3),
            ("confirmed", "initiated", 2, 2),
            ("preparing", "captured", 3, 3),
            ("preparing", "initiated", 4, 2),
            ("ready_for_pickup", "captured", 5, 3),
        ]

        for i, (status, pay_status, cidx, icount) in enumerate(takeaway_configs, 1):
            items = pick_items(icount)
            line_data = []
            for mi in items:
                line_data.append({
                    "menu_item_id": mi.id,
                    "quantity": 1,
                    "unit_price": float(mi.base_price or 0),
                    "item_snapshot": {"item_name": mi.item_name, "image_url": mi.image_url},
                })
            subtotal, tax, sc, total = calc_totals(line_data)

            order = Order(
                customer_id=CUSTOMERS[cidx],
                store_id=STORE_ID,
                dining_table_id=None,
                order_number=make_order_number("TAKE", i),
                order_type="takeaway",
                order_channel="pos",
                status=status,
                payment_status=pay_status,
                fulfillment_type="counter_pickup",
                item_count=len(line_data),
                items_subtotal=subtotal,
                service_charge=sc,
                tax_amount=tax,
                total_amount=total,
                total_amount_currency="MYR",
                confirmed_at=now if status in ("confirmed", "preparing", "ready_for_pickup") else None,
                prepared_at=now if status in ("preparing", "ready_for_pickup") else None,
            )
            db.add(order)
            await db.flush()

            for li in line_data:
                db.add(OrderLineItem(
                    order_id=order.id,
                    menu_item_id=li["menu_item_id"],
                    item_snapshot=li["item_snapshot"],
                    quantity=li["quantity"],
                    unit_price=li["unit_price"],
                    line_total=round(li["unit_price"] * li["quantity"], 2),
                    selected_modifiers={"modifier_ids": []},
                ))

            if pay_status == "captured":
                db.add(Payment(
                    order_id=order.id,
                    amount=total,
                    currency_code="MYR",
                    payment_method_type="cash",
                    provider="cash",
                    status="settled",
                    idempotency_key=f"seed-take-{order.id}-{now.timestamp()}",
                ))

            db.add(OrderStatusLog(
                order_id=order.id,
                from_status="pending",
                to_status=status,
                actor_type="system",
                reason="Seeded test order",
            ))

            orders_created.append(("takeaway", order.id, status))
            print(f"  Takeaway order #{order.order_number} — {status} — RM {total}")

        # ═══════════════════════════════════════════════════════════════
        # DELIVERY ORDERS
        # ═══════════════════════════════════════════════════════════════
        delivery_configs = [
            # (status, payment_status, fulfillment_status, cidx, icount, has_driver)
            ("confirmed", "initiated", "pending_assignment", 0, 2, False),
            ("confirmed", "captured", "pending_assignment", 1, 3, False),
            ("preparing", "captured", "pending_assignment", 2, 2, False),
            ("preparing", "initiated", "assigned", 3, 3, True),
            ("ready_for_pickup", "captured", "ready_for_handoff", 4, 2, True),
            ("out_for_delivery", "captured", "in_transit", 5, 3, True),
            ("delivered", "captured", "completed", 6, 2, True),
        ]

        for i, (status, pay_status, fstatus, cidx, icount, has_driver) in enumerate(delivery_configs, 1):
            items = pick_items(icount)
            line_data = []
            for mi in items:
                line_data.append({
                    "menu_item_id": mi.id,
                    "quantity": 1,
                    "unit_price": float(mi.base_price or 0),
                    "item_snapshot": {"item_name": mi.item_name, "image_url": mi.image_url},
                })
            subtotal, tax, sc, total = calc_totals(line_data)
            total_with_delivery = round(total + DELIVERY_FEE, 2)

            addr = addr_by_customer[CUSTOMERS[cidx]]

            order = Order(
                customer_id=CUSTOMERS[cidx],
                store_id=STORE_ID,
                dining_table_id=None,
                order_number=make_order_number("DELV", i),
                order_type="delivery",
                order_channel="mobile_app",
                status=status,
                payment_status=pay_status,
                fulfillment_type="standard_delivery",
                item_count=len(line_data),
                items_subtotal=subtotal,
                delivery_fee=DELIVERY_FEE,
                service_charge=sc,
                tax_amount=tax,
                total_amount=total_with_delivery,
                total_amount_currency="MYR",
                confirmed_at=now if status in ("confirmed", "preparing", "ready_for_pickup", "out_for_delivery", "delivered") else None,
                prepared_at=now if status in ("preparing", "ready_for_pickup", "out_for_delivery", "delivered") else None,
                completed_at=now if status == "delivered" else None,
            )
            db.add(order)
            await db.flush()

            for li in line_data:
                db.add(OrderLineItem(
                    order_id=order.id,
                    menu_item_id=li["menu_item_id"],
                    item_snapshot=li["item_snapshot"],
                    quantity=li["quantity"],
                    unit_price=li["unit_price"],
                    line_total=round(li["unit_price"] * li["quantity"], 2),
                    selected_modifiers={"modifier_ids": []},
                ))

            if pay_status == "captured":
                db.add(Payment(
                    order_id=order.id,
                    amount=total_with_delivery,
                    currency_code="MYR",
                    payment_method_type="bank_transfer",
                    provider="cash",
                    status="settled",
                    idempotency_key=f"seed-delv-{order.id}-{now.timestamp()}",
                ))

            # Create OrderFulfillment for delivery
            fulfillment = OrderFulfillment(
                order_id=order.id,
                status=fstatus,
                customer_address_id=addr.id,
                delivery_address_snapshot={
                    "recipient_name": addr.recipient_name,
                    "recipient_phone": addr.recipient_phone,
                    "address_line_1": addr.address_line_1,
                    "city": addr.city,
                    "postal_code": addr.postal_code,
                    "state": addr.state_province,
                },
                recipient_name=addr.recipient_name,
                recipient_phone=addr.recipient_phone,
                estimated_ready_at=now + timedelta(minutes=30),
                estimated_delivery_at=now + timedelta(minutes=60),
                delivery_provider="in_house" if has_driver else None,
                delivery_fee_snapshot=DELIVERY_FEE,
                delivery_distance_km=2.5,
                pickup_code=f"PU{order.id:04d}" if has_driver else None,
            )
            if has_driver:
                fulfillment.driver_name = "Abdul Rahman"
                fulfillment.driver_phone = "+60123456789"
                fulfillment.driver_vehicle_type = "Motorcycle"
                fulfillment.assigned_at = now
                if fstatus in ("in_transit", "completed"):
                    fulfillment.started_at = now
                if fstatus == "completed":
                    fulfillment.completed_at = now
                    fulfillment.actual_delivery_at = now

            db.add(fulfillment)

            db.add(OrderStatusLog(
                order_id=order.id,
                from_status="pending",
                to_status=status,
                actor_type="system",
                reason="Seeded delivery order",
            ))

            orders_created.append(("delivery", order.id, status))
            print(f"  Delivery order #{order.order_number} — {status} / {fstatus} — RM {total_with_delivery}")

        await db.commit()

        # ── Summary ──
        print("\n=== Seeding Complete ===")
        counts = {}
        for ot, oid, st in orders_created:
            counts.setdefault(ot, {}).setdefault(st, 0)
            counts[ot][st] += 1
        for ot in sorted(counts):
            print(f"\n  {ot}:")
            for st, c in sorted(counts[ot].items()):
                print(f"    {st}: {c}")
        print(f"\n  Total orders created: {len(orders_created)}")

        # Verify totals in DB
        result = await db.execute(select(func.count(Order.id)).where(Order.store_id == STORE_ID, Order.deleted_at.is_(None)))
        total_in_db = result.scalar()
        print(f"  Total orders in DB for store {STORE_ID}: {total_in_db}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(seed()))
