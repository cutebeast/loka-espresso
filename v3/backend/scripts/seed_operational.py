#!/usr/bin/env python3
"""Seed operational demo data for inventory and workforce modules.

Populates:
  - suppliers (per active store)
  - purchase orders + lines
  - shift templates (per active store)
  - staff shifts for existing staff

This script is idempotent: it only creates records that do not already exist.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, text

from scripts._db_utils import confirm, get_db, guard_production

# ---------------------------------------------------------------------------
# Demo data
# ---------------------------------------------------------------------------

SUPPLIERS = [
    {
        "supplier_name": "Global Coffee Roasters",
        "contact_person": "Ahmad bin Ismail",
        "phone": "+60123456780",
        "email": "orders@globalcoffee.my",
        "address": "Lot 12, Jalan Industri 5, Shah Alam",
        "payment_terms": "Net 30",
        "lead_time_days": 7,
    },
    {
        "supplier_name": "Dairy Fresh Sdn Bhd",
        "contact_person": "Siti Nurhaliza",
        "phone": "+60187654321",
        "email": "sales@dairyfresh.my",
        "address": "No 8, Persiaran Selangor, Kuala Lumpur",
        "payment_terms": "Net 14",
        "lead_time_days": 3,
    },
    {
        "supplier_name": "Packaging World",
        "contact_person": "Rajesh Kumar",
        "phone": "+60192233445",
        "email": "hello@packworld.my",
        "address": "22 Jalan Tandang, Petaling Jaya",
        "payment_terms": "Net 7",
        "lead_time_days": 2,
    },
]

PURCHASE_ORDERS = [
    {
        "po_ref": "COFFEE-MONTHLY",
        "supplier_index": 0,
        "status": "sent",
        "lines": [
            {"item_code": "BEV-001", "quantity_ordered": 20.0, "unit_cost": 24.50},
            {"item_code": "BEV-003", "quantity_ordered": 1000.0, "unit_cost": 0.12},
        ],
    },
    {
        "po_ref": "DAIRY-WEEKLY",
        "supplier_index": 1,
        "status": "draft",
        "lines": [
            {"item_code": "BEV-002", "quantity_ordered": 40.0, "unit_cost": 8.20},
            {"item_code": "FOD-002", "quantity_ordered": 10.0, "unit_cost": 11.80},
        ],
    },
    {
        "po_ref": "PACKAGING-BULK",
        "supplier_index": 2,
        "status": "received",
        "lines": [
            {"item_code": "DIS-001", "quantity_ordered": 2000.0, "unit_cost": 0.18},
            {"item_code": "DIS-002", "quantity_ordered": 1500.0, "unit_cost": 0.09},
        ],
    },
]

SHIFT_TEMPLATES = [
    {"name": "Morning", "start_time": "06:00", "end_time": "14:00"},
    {"name": "Evening", "start_time": "14:00", "end_time": "22:00"},
    {"name": "Night", "start_time": "22:00", "end_time": "06:00"},
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _admin_email() -> str:
    return os.getenv("SEED_ADMIN_EMAIL", "admin@loyaltysystem.uk")


async def _resolve_admin_id(db) -> int | None:
    result = await db.execute(
        text("SELECT id FROM admin_accounts WHERE email = :email LIMIT 1"),
        {"email": _admin_email()},
    )
    row = result.first()
    if row:
        return row[0]
    # Fallback to the first admin account
    result = await db.execute(text("SELECT id FROM admin_accounts ORDER BY id LIMIT 1"))
    row = result.first()
    return row[0] if row else None


async def _seed_suppliers(db, store_id: int) -> list[int]:
    from app.models.inventory import Supplier

    supplier_ids: list[int] = []
    for data in SUPPLIERS:
        existing = await db.execute(
            select(Supplier).where(
                Supplier.store_id == store_id,
                Supplier.supplier_name == data["supplier_name"],
                Supplier.deleted_at.is_(None),
            )
        )
        if existing.scalar_one_or_none():
            continue
        supplier = Supplier(store_id=store_id, **data)
        db.add(supplier)
        await db.flush()
        supplier_ids.append(supplier.id)
        print(f"  Created supplier '{data['supplier_name']}' for store {store_id}")
    return supplier_ids


async def _item_id_by_code(db, item_code: str) -> int | None:
    from app.models.inventory import InventoryItem

    result = await db.execute(
        select(InventoryItem.id).where(InventoryItem.item_code == item_code)
    )
    row = result.first()
    return row[0] if row else None


async def _seed_purchase_orders(db, store_id: int, supplier_ids: list[int], admin_id: int):
    from app.models.inventory import PurchaseOrder, PurchaseOrderLine

    for po_data in PURCHASE_ORDERS:
        supplier_index = po_data["supplier_index"]
        if supplier_index >= len(supplier_ids):
            continue
        supplier_id = supplier_ids[supplier_index]
        po_number = f"SEED-{store_id}-{po_data['po_ref']}"

        existing = await db.execute(
            select(PurchaseOrder.id).where(PurchaseOrder.po_number == po_number)
        )
        if existing.scalar_one_or_none():
            continue

        expected_delivery = datetime.now(timezone.utc) + timedelta(days=7)
        po = PurchaseOrder(
            store_id=store_id,
            supplier_id=supplier_id,
            po_number=po_number,
            status=po_data["status"],
            total_amount=0,
            expected_delivery=expected_delivery,
            notes=f"Auto-seeded {po_data['po_ref']}",
            created_by=admin_id,
        )
        db.add(po)
        await db.flush()

        total = 0.0
        for line in po_data["lines"]:
            item_id = await _item_id_by_code(db, line["item_code"])
            if item_id is None:
                print(f"    Inventory item {line['item_code']} not found — skipping line")
                continue
            line_total = round(line["quantity_ordered"] * line["unit_cost"], 4)
            total += line_total
            db.add(
                PurchaseOrderLine(
                    purchase_order_id=po.id,
                    inventory_item_id=item_id,
                    quantity_ordered=line["quantity_ordered"],
                    quantity_received=line["quantity_ordered"] if po_data["status"] == "received" else 0.0,
                    unit_cost=line["unit_cost"],
                    line_total=line_total,
                )
            )
        po.total_amount = total
        print(f"  Created PO {po_number} for store {store_id} (total={total:.2f})")


async def _seed_shift_templates(db, store_id: int) -> list[int]:
    from app.models.staff import ShiftTemplate

    template_ids: list[int] = []
    for data in SHIFT_TEMPLATES:
        existing = await db.execute(
            select(ShiftTemplate).where(
                ShiftTemplate.store_id == store_id,
                ShiftTemplate.name == data["name"],
            )
        )
        if existing.scalar_one_or_none():
            continue
        from datetime import time as dt_time

        template = ShiftTemplate(
            store_id=store_id,
            name=data["name"],
            start_time=dt_time.fromisoformat(data["start_time"]),
            end_time=dt_time.fromisoformat(data["end_time"]),
        )
        db.add(template)
        await db.flush()
        template_ids.append(template.id)
        print(f"  Created shift template '{data['name']}' for store {store_id}")
    return template_ids


async def _seed_shifts(db, store_id: int, template_ids: list[int]):
    from app.models.staff import StaffProfile, StaffShift, ShiftTemplate

    staff_result = await db.execute(
        select(StaffProfile).where(
            StaffProfile.store_id == store_id,
            StaffProfile.deleted_at.is_(None),
            StaffProfile.is_active.is_(True),
        )
    )
    staff_list = staff_result.scalars().all()
    if not staff_list:
        print(f"  No active staff for store {store_id} — skipping shifts")
        return

    templates = []
    for tid in template_ids:
        t = await db.get(ShiftTemplate, tid)
        if t:
            templates.append(t)
    if not templates:
        return

    today = date.today()
    created = 0
    for offset in range(7):
        shift_date = today + timedelta(days=offset)
        for idx, staff in enumerate(staff_list):
            template = templates[idx % len(templates)]
            existing = await db.execute(
                select(StaffShift).where(
                    StaffShift.store_id == store_id,
                    StaffShift.staff_id == staff.id,
                    StaffShift.shift_date == shift_date,
                    StaffShift.shift_template_id == template.id,
                )
            )
            if existing.scalar_one_or_none():
                continue

            start_dt = datetime.combine(shift_date, template.start_time, tzinfo=timezone.utc)
            end_dt = datetime.combine(shift_date, template.end_time, tzinfo=timezone.utc)
            if end_dt <= start_dt:
                end_dt += timedelta(days=1)

            status = "scheduled"
            if offset < 2:
                status = "completed"
            elif offset == 2:
                status = "confirmed"

            db.add(
                StaffShift(
                    store_id=store_id,
                    staff_id=staff.id,
                    shift_template_id=template.id,
                    shift_date=shift_date,
                    planned_start=start_dt,
                    planned_end=end_dt,
                    status=status,
                    notes="Auto-seeded shift",
                )
            )
            created += 1
    if created:
        print(f"  Created {created} staff shifts for store {store_id}")


async def seed():
    from app.models.store import Store

    async with get_db() as db:
        admin_id = await _resolve_admin_id(db)
        if admin_id is None:
            print("ERROR: No admin account found. Run seed_v3.py first.")
            return

        result = await db.execute(
            select(Store).where(Store.deleted_at.is_(None), Store.is_active.is_(True))
        )
        stores = result.scalars().all()
        if not stores:
            print("  No active stores found — skipping operational seeding")
            return

        for store in stores:
            print(f"[store {store.id} - {store.store_name}]")
            supplier_ids = await _seed_suppliers(db, store.id)
            await _seed_purchase_orders(db, store.id, supplier_ids, admin_id)
            template_ids = await _seed_shift_templates(db, store.id)
            await _seed_shifts(db, store.id, template_ids)


async def main():
    parser = argparse.ArgumentParser(description="Seed operational demo data")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Seed suppliers, purchase orders, shift templates and shifts?", args.yes):
        print("Aborted.")
        return

    await seed()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
