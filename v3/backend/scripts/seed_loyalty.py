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
    # (key, name, min_pts, multiplier, benefits, color, sort, validity_months, renewal_spend, downgrade_key)
    ("bloom", "Bloom", 0, 1.00, '{"birthday_bonus": 0, "priority_support": false, "free_delivery_threshold": null}', "#4CAF50", 1, None, None, None),
    ("origin", "Origin", 500, 1.20, '{"birthday_bonus": 0, "priority_support": false, "free_delivery_threshold": null}', "#FF9800", 2, 12, 500, "bloom"),
    ("reserve", "Reserve", 1500, 1.50, '{"birthday_bonus": 0, "priority_support": true, "free_delivery_threshold": 0}', "#9C27B0", 3, 12, 1500, "origin"),
]

REWARDS = [
    ("free_delivery", "Free Delivery", "Waives the delivery fee", "free_delivery", 100, 0, 0, None),
    ("percentage_discount", "10% Off", "10% discount on order subtotal", "percentage_discount", 200, 10, None, None),
    ("fixed_discount", "RM5 Off", "RM5 discount on order subtotal", "fixed_discount", 150, 5, None, None),
]

# (code, vtype, value, max_amount, min_order, title, description, first_order_only, min_tier_key, validity_days)
VOUCHERS = [
    ("WELCOME-RM5", "fixed_amount_off", 5, None, 0, "Welcome Reward — RM5 Off",
     "Welcome to Loka Espresso! RM5 off your first purchase.", True, None, 30),
    ("BDAY-UPGRADE", "fixed_amount_off", 5, None, 0, "Birthday Drink Upgrade",
     "Happy birthday! Enjoy a complimentary drink upgrade on us, valid all birthday month. (Origin member perk)", False, "origin", 31),
    ("BDAY-GIFT", "fixed_amount_off", 30, None, 0, "Reserve Birthday Gift",
     "Happy birthday! An exclusive gift for our Reserve members — RM30 off specialty beans, merchandise or a dessert box.", False, "reserve", 31),
]


async def seed():
    async with get_db() as db:
        # Tiers
        await db.execute(
            text("""
                INSERT INTO loyalty_tiers
                    (tier_key, display_name, min_lifetime_points, points_multiplier, benefits_config, color_hex, sort_order, is_active,
                     validity_months, renewal_annual_spend, downgrade_to_tier_key)
                VALUES (:key, :name, :min_pts, :multiplier, CAST(:benefits AS jsonb), :color, :sort, true,
                        :validity, :renewal, :downgrade)
                ON CONFLICT (tier_key) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    min_lifetime_points = EXCLUDED.min_lifetime_points,
                    points_multiplier = EXCLUDED.points_multiplier,
                    validity_months = EXCLUDED.validity_months,
                    renewal_annual_spend = EXCLUDED.renewal_annual_spend,
                    downgrade_to_tier_key = EXCLUDED.downgrade_to_tier_key,
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
                    "validity": validity,
                    "renewal": renewal,
                    "downgrade": downgrade,
                }
                for key, name, min_pts, multiplier, benefits, color, sort_order, validity, renewal, downgrade in TIERS
            ],
        )

        # Deactivate legacy tiers that are not part of the current scheme
        # (e.g. bronze/silver/gold/platinum from older seeds) so stale rows on
        # existing DBs don't leak into tier lists or segment resolution.
        await db.execute(
            text("UPDATE loyalty_tiers SET is_active = false WHERE tier_key != ALL(:keys)"),
            {"keys": [t[0] for t in TIERS]},
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
        tier_ids = {
            row.tier_key: row.id
            for row in (await db.execute(text("SELECT id, tier_key FROM loyalty_tiers"))).all()
        }
        for code, vtype, value, max_amount, min_order, title, description, first_order_only, min_tier_key, validity_days in VOUCHERS:
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
                         valid_from, valid_until, max_uses_per_customer, is_active,
                         first_order_only, minimum_tier_id, validity_days)
                    VALUES (:code, :vtype, :title, :description,
                            :value, :max_amount, COALESCE(:min_order, 0),
                            :valid_from, :valid_until, 1, true,
                            :first_order_only, :min_tier_id, :validity_days)
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
                    "first_order_only": first_order_only,
                    "min_tier_id": tier_ids.get(min_tier_key) if min_tier_key else None,
                    "validity_days": validity_days,
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
