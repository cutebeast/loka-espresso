#!/usr/bin/env python3
"""Seed loyalty tiers, reward catalog and voucher definitions."""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from scripts._db_utils import confirm, get_db, guard_production


TIERS = [
    ("bronze", "Bronze", 0, 1.00, '{"free_delivery_threshold": null, "birthday_bonus": 0, "priority_support": false}', "#CD7F32", 1),
    ("silver", "Silver", 500, 1.25, '{"free_delivery_threshold": 50.00, "birthday_bonus": 50, "priority_support": false}', "#C0C0C0", 2),
    ("gold", "Gold", 1500, 1.50, '{"free_delivery_threshold": 30.00, "birthday_bonus": 100, "priority_support": true}', "#FFD700", 3),
    ("platinum", "Platinum", 5000, 2.00, '{"free_delivery_threshold": 0, "birthday_bonus": 200, "priority_support": true}', "#E5E4E2", 4),
]

REWARDS = [
    ("free_delivery", "Free Delivery", "Waives the delivery fee", "free_delivery", 100, 0, 0, None),
    ("percentage_discount", "10% Off", "10% discount on order subtotal", "percentage_discount", 200, 10, None, None),
    ("fixed_discount", "RM5 Off", "RM5 discount on order subtotal", "fixed_discount", 150, 5, None, None),
]

VOUCHERS = [
    ("WELCOME10", "percentage_off", 10, None, 0, "Welcome 10% Off", "10% off your first order"),
    ("FLAT5", "fixed_amount_off", 5, None, 0, "RM5 Off", "RM5 off your order"),
]


async def seed():
    async with get_db() as db:
        # Tiers
        await db.execute(
            text("""
                INSERT INTO loyalty_tiers
                    (tier_key, display_name, min_lifetime_points, points_multiplier, benefits_config, color_hex, sort_order, is_active)
                VALUES (:key, :name, :min_pts, :multiplier, CAST(:benefits AS jsonb), :color, :sort, true)
                ON CONFLICT (tier_key) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    min_lifetime_points = EXCLUDED.min_lifetime_points,
                    points_multiplier = EXCLUDED.points_multiplier,
                    is_active = true
            """),
            [
                {
                    "key": key,
                    "name": name,
                    "min_pts": min_pts,
                    "multiplier": multiplier,
                    "benefits": benefits,
                    "color": color,
                    "sort": sort_order,
                }
                for key, name, min_pts, multiplier, benefits, color, sort_order in TIERS
            ],
        )

        # Rewards
        await db.execute(
            text("""
                INSERT INTO reward_catalog
                    (reward_key, reward_name, description, reward_type, points_cost,
                     discount_value, discount_max_amount, minimum_order_value, is_active)
                VALUES (:key, :name, :desc, :rtype, :points_cost,
                        :value, :max_amount, COALESCE(:min_order, 0), true)
                ON CONFLICT (reward_key) DO UPDATE SET
                    reward_name = EXCLUDED.reward_name,
                    description = EXCLUDED.description,
                    reward_type = EXCLUDED.reward_type,
                    points_cost = EXCLUDED.points_cost,
                    discount_value = EXCLUDED.discount_value,
                    discount_max_amount = EXCLUDED.discount_max_amount,
                    minimum_order_value = EXCLUDED.minimum_order_value,
                    is_active = true
            """),
            [
                {
                    "key": key,
                    "name": name,
                    "desc": desc,
                    "rtype": rtype,
                    "points_cost": points_cost,
                    "value": value,
                    "max_amount": max_amount,
                    "min_order": min_order,
                }
                for key, name, desc, rtype, points_cost, value, max_amount, min_order in REWARDS
            ],
        )

        # Voucher definitions
        valid_from = datetime.now(timezone.utc)
        valid_until = valid_from + timedelta(days=365)
        for code, vtype, value, max_amount, min_order, title, description in VOUCHERS:
            result = await db.execute(
                text("SELECT id FROM voucher_definitions WHERE voucher_code = :code"),
                {"code": code},
            )
            if result.scalar_one_or_none():
                print(f"  Voucher definition '{code}' already exists")
                continue
            await db.execute(
                text("""
                    INSERT INTO voucher_definitions
                        (voucher_code, voucher_type, display_title, description,
                         discount_value, discount_max_amount, minimum_order_value,
                         valid_from, valid_until, max_uses_per_customer, is_active)
                    VALUES (:code, :vtype, :title, :description,
                            :value, :max_amount, COALESCE(:min_order, 0),
                            :valid_from, :valid_until, 1, true)
                """),
                {
                    "code": code,
                    "vtype": vtype,
                    "title": title,
                    "description": description,
                    "value": value,
                    "max_amount": max_amount,
                    "min_order": min_order,
                    "valid_from": valid_from,
                    "valid_until": valid_until,
                },
            )
            print(f"  Created voucher definition '{code}'")


async def main():
    parser = argparse.ArgumentParser(description="Seed loyalty data")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Seed loyalty tiers, rewards and vouchers?", args.yes):
        print("Aborted.")
        return

    await seed()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
