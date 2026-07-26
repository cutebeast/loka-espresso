#!/usr/bin/env python3
"""Seed stores, operating hours, dining tables and store configuration."""

from __future__ import annotations

import argparse
import asyncio
import secrets
import sys
from datetime import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from scripts._db_utils import confirm, get_db, guard_production


STORES = [
    {
        "store_code": "PKL-001",
        "store_name": "Loka Espresso (PKL)",
        "slug": "pavilion",
        "brand_name": "LOKA Espresso",
        "address_line_1": "Lot P4.17.00, E4.17.00 & E4.17.01, Pavilion Kuala Lumpur",
        "address_line_2": "168, Jln Bukit Bintang, Bukit Bintang",
        "city": "Kuala Lumpur",
        "state_province": "Wilayah Persekutuan Kuala Lumpur",
        "postal_code": "55100",
        "country_code": "MY",
        "latitude": 3.1490,
        "longitude": 101.7135,
        "phone_number": "+60127889314",
        "email_address": "pavilion@lokaespresso.my",
        "timezone": "Asia/Kuala_Lumpur",
        "currency_code": "MYR",
        "pickup_lead_minutes": 15,
        "delivery_radius_km": 10.00,
    },
    {
        "store_code": "KLIA1-001",
        "store_name": "Loka Cafe (KLIA1)",
        "slug": "klia",
        "brand_name": "LOKA Espresso",
        "address_line_1": "Terminal 1, Domestic Arrival Hall, KLIA",
        "address_line_2": "Kuala Lumpur International Airport",
        "city": "Sepang",
        "state_province": "Selangor",
        "postal_code": "64000",
        "country_code": "MY",
        "latitude": 2.7456,
        "longitude": 101.7099,
        "phone_number": "+60127889314",
        "email_address": "klia@lokaespresso.my",
        "timezone": "Asia/Kuala_Lumpur",
        "currency_code": "MYR",
        "pickup_lead_minutes": 15,
        "delivery_radius_km": 5.00,
    },
]

# (day_of_week, open_time, close_time, last_order_time, is_24_hours)
OPERATING_HOURS = {
    1: [  # Loka Espresso Pavilion — 10:00 AM – 10:00 PM daily (per brand brief)
        (0, "10:00", "22:00", "21:30", False),
        (1, "10:00", "22:00", "21:30", False),
        (2, "10:00", "22:00", "21:30", False),
        (3, "10:00", "22:00", "21:30", False),
        (4, "10:00", "22:00", "21:30", False),
        (5, "10:00", "22:00", "21:30", False),
        (6, "10:00", "22:00", "21:30", False),
    ],
    2: [  # Loka Cafe KLIA — 24 hours
        (0, "00:00", "23:59", "23:30", True),
        (1, "00:00", "23:59", "23:30", True),
        (2, "00:00", "23:59", "23:30", True),
        (3, "00:00", "23:59", "23:30", True),
        (4, "00:00", "23:59", "23:30", True),
        (5, "00:00", "23:59", "23:30", True),
        (6, "00:00", "23:59", "23:30", True),
    ],
}

STORE_CONFIG = [
    ("order.service_charge", 0.00),
    ("order.tax_rate", 0.00),
    ("order.delivery_fee", 5.00),
]

DINING_TABLES = ["T1", "T2", "T3", "T4", "T5", "T6"]


async def seed():
    async with get_db() as db:
        inserted_ids: dict[str, int] = {}
        for store in STORES:
            # display_key is generated once per store on first insert and
            # intentionally NOT updated on conflict, so POS customer displays
            # keep working across re-seeds.
            result = await db.execute(
                text("""
                    INSERT INTO stores (
                        store_code, store_name, slug, brand_name,
                        address_line_1, address_line_2, city, state_province, postal_code, country_code,
                        latitude, longitude, phone_number, email_address,
                        timezone, currency_code,
                        pickup_lead_minutes, delivery_radius_km,
                        is_active, is_accepting_orders, display_key
                    ) VALUES (
                        :store_code, :store_name, :slug, :brand_name,
                        :address_line_1, :address_line_2, :city, :state_province, :postal_code, :country_code,
                        :latitude, :longitude, :phone_number, :email_address,
                        :timezone, :currency_code,
                        :pickup_lead_minutes, :delivery_radius_km,
                        true, true, :display_key
                    )
                    ON CONFLICT (store_code) DO UPDATE SET
                        store_name = EXCLUDED.store_name,
                        is_active = true,
                        is_accepting_orders = true
                    RETURNING id, display_key
                """),
                {**store, "display_key": secrets.token_hex(16)},
            )
            row = result.one()
            store_id = row.id
            inserted_ids[store["store_code"]] = store_id
            # display_key is a shared secret for the public customer display —
            # retrieve it via GET /api/staff/store instead of printing it to logs.
            print(f"  Store '{store['store_name']}' id={store_id}")

            # Operating hours
            hours = OPERATING_HOURS.get(len(inserted_ids), OPERATING_HOURS[1])
            await db.execute(
                text("""
                    INSERT INTO store_operating_hours
                        (store_id, day_of_week, open_time, close_time, is_closed, is_24_hours, last_order_time)
                    VALUES (:store_id, :dow, :open, :close, false, :is_24h, :last_order)
                    ON CONFLICT (store_id, day_of_week) DO UPDATE SET
                        open_time = EXCLUDED.open_time,
                        close_time = EXCLUDED.close_time,
                        is_24_hours = EXCLUDED.is_24_hours,
                        last_order_time = EXCLUDED.last_order_time
                """),
                [
                    {
                        "store_id": store_id,
                        "dow": dow,
                        "open": time.fromisoformat(open_t),
                        "close": time.fromisoformat(close_t),
                        "is_24h": is_24h,
                        "last_order": time.fromisoformat(last_t),
                    }
                    for dow, open_t, close_t, last_t, is_24h in hours
                ],
            )

            # Store configuration (inserted one row at a time to avoid JSONB type ambiguity)
            for key, value in STORE_CONFIG:
                await db.execute(
                    text("""
                        INSERT INTO store_configuration (store_id, config_key, config_value)
                        VALUES (:store_id, :key, to_jsonb(cast(:value as numeric)))
                        ON CONFLICT (store_id, config_key) DO UPDATE SET
                            config_value = EXCLUDED.config_value
                    """),
                    {"store_id": store_id, "key": key, "value": value},
                )

            # Dining tables (idempotent, partial unique index prevents ON CONFLICT)
            existing_rows = await db.execute(
                text("SELECT table_number FROM dining_tables WHERE store_id = :store_id AND deleted_at IS NULL"),
                {"store_id": store_id},
            )
            existing = {row[0] for row in existing_rows}
            for table_name in DINING_TABLES:
                if table_name in existing:
                    continue
                await db.execute(
                    text("""
                        INSERT INTO dining_tables (store_id, table_number, capacity, qr_code_token, is_active)
                        VALUES (:store_id, :table_number, 4, :token, true)
                    """),
                    {
                        "store_id": store_id,
                        "table_number": table_name,
                        "token": f"{store_id}-{table_name}-{store_id}{table_name}",
                    },
                )

        # Deactivate legacy stores that are not part of the current seed set
        # (e.g. HQ-001 / KLCC-01 from older seeds) so stale rows don't leak
        # into bootstrap configs or store pickers on existing DBs.
        await db.execute(
            text("UPDATE stores SET is_active = false WHERE store_code != ALL(:codes)"),
            {"codes": [s["store_code"] for s in STORES]},
        )


async def main():
    parser = argparse.ArgumentParser(description="Seed stores and store config")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Seed stores, operating hours, tables and store config?", args.yes):
        print("Aborted.")
        return

    await seed()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
