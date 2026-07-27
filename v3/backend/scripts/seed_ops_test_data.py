#!/usr/bin/env python3
"""Seed realistic test data for the Store Operations section (dev/demo).

Covers: suppliers, inventory items + stock + movements, purchase orders,
reservations, shift assignments, staff time events. Also removes leftover
E2E junk in those tables (stock rows of soft-deleted E2E items, E2E shift
templates, "Verified via E2E" clock-ins).

Idempotent — safe to re-run: existing rows (matched by natural keys) are
skipped, not duplicated.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from scripts._db_utils import confirm, get_db, guard_production


SUPPLIERS = [
    ("Beanorigins Coffee Supply", "Aiman Razak", "+60123456701", "sales@beanorigins.my"),
    ("FreshDairy & Co", "Mei Lin Chong", "+60123456702", "orders@freshdairy.my"),
]

# (item_code, name, category_name, uom, unit_cost, supplier_idx, item_type, shelf_life_days)
ITEMS = [
    ("BEANS-ESP-1KG", "Espresso Blend Beans 1kg", "Beverages", "kg", 85.00, 0, "fnb", 180),
    ("BEANS-SO-1KG", "Single Origin Beans 1kg", "Beverages", "kg", 110.00, 0, "fnb", 180),
    ("MILK-FC-1L", "Full Cream Milk 1L", "Food Supplies", "L", 7.50, 1, "fnb", 10),
    ("MILK-OAT-1L", "Oat Milk 1L", "Food Supplies", "L", 12.90, 1, "fnb", 21),
    ("SYRUP-VAN-750", "Vanilla Syrup 750ml", "Food Supplies", "ml", 24.00, 1, "fnb", 365),
    ("CROISSANT-FZ", "Frozen Croissant (pcs)", "Food Supplies", "pcs", 3.20, 1, "fnb", 90),
    ("CUP-12OZ", "Paper Cups 12oz", "Disposables", "pcs", 0.35, None, "non_fnb", None),
    ("LID-12OZ", "Cup Lids 12oz", "Disposables", "pcs", 0.12, None, "non_fnb", None),
    ("CLEAN-SPRAY", "Multi-Surface Spray 500ml", "Cleaning", "pcs", 9.90, None, "non_fnb", 730),
]

# (item_code, store_id, qty, reorder, par, location)
STOCKS = [
    ("BEANS-ESP-1KG", 1, 12, 4, 16, "Dry Store"),
    ("BEANS-ESP-1KG", 2, 8, 3, 12, "Dry Store"),
    ("BEANS-SO-1KG", 1, 6, 2, 8, "Dry Store"),
    ("BEANS-SO-1KG", 2, 4, 2, 6, "Dry Store"),
    ("MILK-FC-1L", 1, 40, 12, 48, "Chiller"),
    ("MILK-FC-1L", 2, 24, 10, 36, "Chiller"),
    ("MILK-OAT-1L", 1, 20, 6, 24, "Chiller"),
    ("MILK-OAT-1L", 2, 12, 5, 18, "Chiller"),
    ("SYRUP-VAN-750", 1, 8, 2, 10, "Dry Store"),
    ("SYRUP-VAN-750", 2, 6, 2, 8, "Dry Store"),
    ("CROISSANT-FZ", 1, 60, 20, 80, "Freezer"),
    ("CROISSANT-FZ", 2, 40, 15, 60, "Freezer"),
    ("CUP-12OZ", 1, 800, 200, 1000, "Dry Store"),
    ("CUP-12OZ", 2, 500, 150, 800, "Dry Store"),
    ("LID-12OZ", 1, 800, 200, 1000, "Dry Store"),
    ("LID-12OZ", 2, 500, 150, 800, "Dry Store"),
    ("CLEAN-SPRAY", 1, 5, 2, 6, "Back Kitchen"),
    ("CLEAN-SPRAY", 2, 3, 1, 4, "Back Kitchen"),
]


async def main(yes: bool, force_prod: bool) -> None:
    guard_production(force_prod)
    if not confirm("Seed Store Operations test data (suppliers/inventory/PO/reservations/shifts/time events)?", yes):
        return

    async with get_db() as db:
        # ── 0. Junk cleanup (E2E leftovers) ──
        await db.execute(text(
            "DELETE FROM inventory_stock WHERE inventory_item_id IN"
            " (SELECT id FROM inventory_items WHERE item_name ILIKE '%e2e%')"
        ))
        await db.execute(text("DELETE FROM inventory_items WHERE item_name ILIKE '%e2e%'"))
        await db.execute(text("DELETE FROM shift_templates WHERE name ILIKE '%e2e%'"))
        await db.execute(text("DELETE FROM staff_time_events WHERE notes ILIKE '%E2E%'"))
        print("  cleaned E2E junk (stock/items/templates/time events)")

        # ── 1. Suppliers ──
        supplier_ids: list[int] = []
        for name, contact, phone, email in SUPPLIERS:
            row = (await db.execute(text("SELECT id FROM suppliers WHERE supplier_name = :n"), {"n": name})).scalar_one_or_none()
            if row is None:
                row = (await db.execute(
                    text("""INSERT INTO suppliers (store_id, supplier_name, contact_person, phone, email, is_active, created_at, updated_at)
                            VALUES (1, :n, :c, :p, :e, true, NOW(), NOW()) RETURNING id"""),
                    {"n": name, "c": contact, "p": phone, "e": email},
                )).scalar_one()
            supplier_ids.append(row)
        print(f"  suppliers: {len(supplier_ids)}")

        # ── 2. Inventory items ──
        item_ids: dict[str, int] = {}
        for code, name, cat, uom, cost, sup_idx, itype, shelf in ITEMS:
            cat_id = (await db.execute(text("SELECT id FROM inventory_categories WHERE category_name = :c"), {"c": cat})).scalar_one()
            row = (await db.execute(text("SELECT id FROM inventory_items WHERE item_code = :c"), {"c": code})).scalar_one_or_none()
            if row is None:
                row = (await db.execute(
                    text("""INSERT INTO inventory_items
                            (category_id, item_code, item_name, unit_of_measure, unit_cost, supplier_id,
                             shelf_life_days, is_active, is_direct_sale, item_type, created_at, updated_at)
                            VALUES (:cat, :code, :name, :uom, :cost, :sup, :shelf, true, false, :itype, NOW(), NOW())
                            RETURNING id"""),
                    {"cat": cat_id, "code": code, "name": name, "uom": uom, "cost": cost,
                     "sup": supplier_ids[sup_idx] if sup_idx is not None else None,
                     "shelf": shelf, "itype": itype},
                )).scalar_one()
            item_ids[code] = row
        print(f"  inventory items: {len(item_ids)}")

        # ── 3. Stock + opening movements ──
        n_stock = 0
        for code, store, qty, reorder, par, loc in STOCKS:
            row = (await db.execute(
                text("SELECT id FROM inventory_stock WHERE inventory_item_id = :i AND store_id = :s"),
                {"i": item_ids[code], "s": store},
            )).scalar_one_or_none()
            if row is None:
                await db.execute(
                    text("""INSERT INTO inventory_stock
                            (inventory_item_id, store_id, current_stock, reserved_stock, reorder_level,
                             reorder_quantity, par_level, storage_location, created_at, updated_at)
                            VALUES (:i, :s, :q, 0, :ro, :roq, :par, :loc, NOW(), NOW())"""),
                    {"i": item_ids[code], "s": store, "q": qty, "ro": reorder, "roq": reorder * 2, "par": par, "loc": loc},
                )
                await db.execute(
                    text("""INSERT INTO inventory_movement_log
                            (store_id, inventory_item_id, movement_type, quantity_delta, stock_after,
                             reason, reference_type, created_at)
                            VALUES (:s, :i, 'in', :q, :q, 'Opening stock', 'seed', NOW())"""),
                    {"s": store, "i": item_ids[code], "q": qty},
                )
                n_stock += 1
        print(f"  stock records created: {n_stock}")

        # ── 4. Purchase orders (one received, one draft) ──
        for po_number, sup_idx, status, lines, delivered in [
            ("PO-2026-0001", 0, "received", [("BEANS-ESP-1KG", 10, 85.00), ("BEANS-SO-1KG", 4, 110.00)], True),
            ("PO-2026-0002", 1, "draft", [("MILK-FC-1L", 30, 7.50), ("MILK-OAT-1L", 12, 12.90)], False),
        ]:
            row = (await db.execute(text("SELECT id FROM purchase_orders WHERE po_number = :p"), {"p": po_number})).scalar_one_or_none()
            if row is None:
                total = sum(q * c for _, q, c in lines)
                # chk_po_actual_after_expected: actual must be >= expected
                expected = (date.today() - timedelta(days=2)) if delivered else (date.today() + timedelta(days=3))
                actual = (datetime.now(timezone.utc) - timedelta(days=1)) if delivered else None
                po_id = (await db.execute(
                    text("""INSERT INTO purchase_orders
                            (store_id, supplier_id, po_number, status, total_amount, expected_delivery,
                             actual_delivery, created_by, created_at, updated_at)
                            VALUES (1, :sup, :po, :st, :tot, :ed, :ad, 1, NOW(), NOW()) RETURNING id"""),
                    {"sup": supplier_ids[sup_idx], "po": po_number, "st": status, "tot": total,
                     "ed": expected, "ad": actual},
                )).scalar_one()
                for code, q, c in lines:
                    await db.execute(
                        text("""INSERT INTO purchase_order_lines
                                (purchase_order_id, inventory_item_id, quantity_ordered, quantity_received,
                                 unit_cost, line_total, created_at)
                                VALUES (:po, :item, :qo, :qr, :c, :lt, NOW())"""),
                        {"po": po_id, "item": item_ids[code], "qo": q, "qr": q if delivered else 0,
                         "c": c, "lt": q * c},
                    )
        print("  purchase orders: 2")

        # ── 5. Reservations ──
        cust_ids = [r[0] for r in (await db.execute(text(
            "SELECT id FROM customers WHERE deleted_at IS NULL AND is_active ORDER BY id LIMIT 5"))).all()]
        table_ids = {r[1]: r[0] for r in (await db.execute(text(
            "SELECT id, table_number FROM dining_tables WHERE store_id = 1 AND deleted_at IS NULL"))).all()}
        n_res = 0
        if cust_ids and table_ids:
            tables = list(table_ids.values())
            today = date.today()
            res_specs = [
                (cust_ids[0], tables[1], today, time(19, 0), 2, "confirmed", "Window seat if possible"),
                (cust_ids[1 % len(cust_ids)], None, today, time(20, 0), 4, "requested", None),
                (cust_ids[2 % len(cust_ids)], tables[0], today + timedelta(days=1), time(12, 30), 2, "confirmed", None),
                (cust_ids[3 % len(cust_ids)], None, today + timedelta(days=1), time(19, 30), 6, "requested", "Birthday dinner"),
                (cust_ids[4 % len(cust_ids)], tables[2], today - timedelta(days=1), time(19, 0), 3, "completed", None),
            ]
            for cust, tbl, day, tm, size, status, note in res_specs:
                exists = (await db.execute(
                    text("""SELECT id FROM reservations
                            WHERE customer_id = :c AND reservation_date = :d AND reservation_time = :t AND status = :s"""),
                    {"c": cust, "d": day, "t": tm, "s": status},
                )).scalar_one_or_none()
                if exists is None:
                    await db.execute(
                        text("""INSERT INTO reservations
                                (store_id, customer_id, dining_table_id, party_size, reservation_date,
                                 reservation_time, duration_minutes, status, special_requests, created_at, updated_at)
                                VALUES (1, :c, :tbl, :sz, :d, :t, 90, :s, :n, NOW(), NOW())"""),
                        {"c": cust, "tbl": tbl, "sz": size, "d": day, "t": tm, "s": status, "n": note},
                    )
                    n_res += 1
        print(f"  reservations created: {n_res}")

        # ── 6. Shift assignments (today + tomorrow) ──
        staff = [r[0] for r in (await db.execute(text(
            "SELECT id FROM staff_profiles WHERE deleted_at IS NULL AND is_active ORDER BY id LIMIT 5"))).all()]
        tmpl = {r[1]: r[0] for r in (await db.execute(text(
            "SELECT id, name FROM shift_templates WHERE store_id = 1"))).all()}
        n_shifts = 0
        if staff and tmpl:
            morning, evening = tmpl.get("Morning"), tmpl.get("Evening")
            for day_off in (0, 1):
                day = date.today() + timedelta(days=day_off)
                for i, sid in enumerate(staff[:4]):
                    use_morning = (i % 2 == 0) if day_off == 0 else (i % 2 == 1)
                    tid = morning if use_morning else evening
                    if tid is None:
                        continue
                    start_t, end_t = (time(6, 0), time(14, 0)) if use_morning else (time(14, 0), time(22, 0))
                    planned_start = datetime.combine(day, start_t, tzinfo=timezone.utc)
                    planned_end = datetime.combine(day, end_t, tzinfo=timezone.utc)
                    exists = (await db.execute(
                        text("SELECT id FROM staff_shifts WHERE staff_id = :s AND shift_date = :d AND shift_template_id = :t"),
                        {"s": sid, "d": day, "t": tid},
                    )).scalar_one_or_none()
                    if exists is None:
                        await db.execute(
                            text("""INSERT INTO staff_shifts
                                    (store_id, staff_id, shift_date, planned_start, planned_end, status,
                                     shift_template_id, created_at, updated_at)
                                    VALUES (1, :s, :d, :ps, :pe, 'scheduled', :t, NOW(), NOW())"""),
                            {"s": sid, "d": day, "ps": planned_start, "pe": planned_end, "t": tid},
                        )
                        n_shifts += 1
        print(f"  shift assignments created: {n_shifts}")

        # ── 7. Time events (clock in/out pairs, yesterday + today) ──
        n_events = 0
        if staff:
            now = datetime.now(timezone.utc)
            specs = []
            y = now - timedelta(days=1)
            specs.append((staff[0], y.replace(hour=8, minute=56, second=0), "clock_in"))
            specs.append((staff[0], y.replace(hour=14, minute=5, second=0), "clock_out"))
            if len(staff) > 1:
                specs.append((staff[1], y.replace(hour=13, minute=55, second=0), "clock_in"))
                specs.append((staff[1], y.replace(hour=22, minute=3, second=0), "clock_out"))
            specs.append((staff[0], now.replace(hour=8, minute=54, second=0), "clock_in"))
            for sid, ts, etype in specs:
                exists = (await db.execute(
                    text("""SELECT id FROM staff_time_events
                            WHERE staff_id = :s AND event_type = :e
                              AND date_trunc('minute', event_timestamp) = date_trunc('minute', CAST(:ts AS timestamptz))"""),
                    {"s": sid, "e": etype, "ts": ts},
                )).scalar_one_or_none()
                if exists is None:
                    await db.execute(
                        text("""INSERT INTO staff_time_events
                                (staff_id, store_id, event_type, event_timestamp, location_verified, created_at)
                                VALUES (:s, 1, :e, :ts, true, NOW())"""),
                        {"s": sid, "e": etype, "ts": ts},
                    )
                    n_events += 1
        print(f"  time events created: {n_events}")

    print("Done — Store Operations test data seeded.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--force-prod", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(args.yes, args.force_prod))
