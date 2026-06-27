#!/usr/bin/env python3
"""Seed stores, operating hours, dining tables and store configuration."""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from scripts._db_utils import confirm, get_db, guard_production


STORES = [
    {
        "store_code": "HQ-001",
        "store_name": "Brand Headquarters",
        "slug": "hq",
        "brand_name": "LOKA Espresso",
        "address_line_1": "123 Admin Street",
        "city": "Kuala Lumpur",
        "state_province": "Wilayah Persekutuan",
        "postal_code": "50000",
        "country_code": "MY",
        "latitude": 3.1390,
        "longitude": 101.6869,
        "phone_number": "+60123456789",
        "email_address": "hq@lokaespresso.my",
        "timezone": "Asia/Kuala_Lumpur",
        "currency_code": "MYR",
        "pickup_lead_minutes": 15,
        "delivery_radius_km": 10.00,
    },
    {
        "store_code": "KLCC-01",
        "store_name": "LOKA Espresso KLCC",
        "slug": "klcc",
        "brand_name": "LOKA Espresso",
        "address_line_1": "Suria KLCC, Lot G-12",
        "city": "Kuala Lumpur",
        "state_province": "Wilayah Persekutuan",
        "postal_code": "50088",
        "country_code": "MY",
        "latitude": 3.1588,
        "longitude": 101.7116,
        "phone_number": "+60321631234",
        "email_address": "klcc@lokaespresso.my",
        "timezone": "Asia/Kuala_Lumpur",
        "currency_code": "MYR",
        "pickup_lead_minutes": 15,
        "delivery_radius_km": 8.00,
    },
]

# (day_of_week, open_time, close_time, last_order_time, is_24_hours)
OPERATING_HOURS = {
    1: [  # HQ
        (0, "08:00", "22:00", "21:30", False),
        (1, "08:00", "22:00", "21:30", False),
        (2, "08:00", "22:00", "21:30", False),
        (3, "08:00", "22:00", "21:30", False),
        (4, "08:00", "22:00", "21:30", False),
        (5, "08:00", "23:00", "22:30", False),
        (6, "00:00", "23:59", "23:30", True),
    ],
    2: [  # KLCC
        (0, "07:00", "22:00", "21:30", False),
        (1, "07:00", "22:00", "21:30", False),
        (2, "07:00", "22:00", "21:30", False),
        (3, "07:00", "22:00", "21:30", False),
        (4, "07:00", "23:00", "22:30", False),
        (5, "08:00", "23:00", "22:30", False),
        (6, "08:00", "22:00", "21:30", False),
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
            result = await db.execute(
                text("""
                    INSERT INTO stores (
                        store_code, store_name, slug, brand_name,
                        address_line_1, city, state_province, postal_code, country_code,
                        latitude, longitude, phone_number, email_address,
                        timezone, currency_code,
                        pickup_lead_minutes, delivery_radius_km,
                        is_active, is_accepting_orders
                    ) VALUES (
                        :store_code, :store_name, :slug, :brand_name,
                        :address_line_1, :city, :state_province, :postal_code, :country_code,
                        :latitude, :longitude, :phone_number, :email_address,
                        :timezone, :currency_code,
                        :pickup_lead_minutes, :delivery_radius_km,
                        true, true
                    )
                    ON CONFLICT (store_code) DO UPDATE SET
                        store_name = EXCLUDED.store_name,
                        is_active = true,
                        is_accepting_orders = true
                    RETURNING id
                """),
                store,
            )
            store_id = result.scalar_one()
            inserted_ids[store["store_code"]] = store_id
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
