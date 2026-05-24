"""Seed baseline data for v3 FnB Super App.

Creates default admin, stores, loyalty tiers, menu categories, menu items,
reward catalog entries, voucher definitions, dining tables, and platform config.

Usage:
    cd v3/backend
    python3 scripts/seed_v3.py

Environment variables:
    SEED_ADMIN_EMAIL  — admin login email (default: admin@lokaespresso.my)
    SEED_ADMIN_PASS   — admin login password (default: admin123)
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, time, timezone, timedelta
from decimal import Decimal
from typing import List

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from sqlalchemy import select, text

from app.core.database import AsyncSessionLocal
from app.models.iam import IAMPrincipal, AdminAccount, IAMRole, RoleAssignment
from app.models.store import Store, StoreOperatingHours, DiningTable
from app.models.loyalty import LoyaltyTier
from app.models.menu import MenuCategory, MenuItem
from app.models.reward import RewardCatalog
from app.models.voucher import VoucherDefinition
from app.models.platform import PlatformConfig

ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)

ADMIN_EMAIL = os.getenv("SEED_ADMIN_EMAIL", "admin@lokaespresso.my")
ADMIN_PASSWORD = os.getenv("SEED_ADMIN_PASS", "admin123")

# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _count(db, model) -> int:
    result = await db.execute(select(text("count(*)")).select_from(model.__table__))
    return result.scalar() or 0


# ──────────────────────────────────────────────
# Platform Config
# ──────────────────────────────────────────────

PLATFORM_DEFAULTS = [
    ("brand_name", "LOKA Espresso", "App brand name"),
    ("default_currency", "MYR", "Default currency code"),
    ("otp.bypass_enabled", "false", "Bypass OTP in dev (true/false)"),
    ("otp.bypass_code", "000000", "Default OTP code for dev bypass"),
    ("service_charge_percent", "10.00", "Default service charge percentage"),
    ("tax_name", "SST", "Tax label displayed on receipts"),
    ("tax_percent", "6.00", "Default tax percentage"),
    ("delivery_fee_default", "5.00", "Default delivery fee"),
    ("min_delivery_order", "15.00", "Minimum order amount for delivery"),
    ("max_delivery_radius_km", "10.00", "Default maximum delivery radius"),
    ("points_per_currency_unit", "1.00", "Base points earned per RM 1 spent"),
    ("referral_bonus_points", "50", "Points awarded to referrer on signup"),
    ("referred_user_bonus_points", "25", "Points awarded to referred user"),
    ("wallet_min_topup", "5.00", "Minimum wallet top-up amount"),
    ("reservation_min_notice_hours", "2", "Hours of notice needed for reservation"),
    ("reservation_max_future_days", "30", "Max days in advance for reservations"),
    ("default_timezone", "Asia/Kuala_Lumpur", "Default timezone for new stores"),
    ("pwa_title", "LOKA Espresso", "PWA manifest app name"),
    ("pwa_short_name", "LOKA", "PWA manifest short name"),
    ("pwa_theme_color", "#3B4A1A", "PWA theme color hex"),
    ("pwa_background_color", "#F5F0E6", "PWA background color hex"),
]

# ──────────────────────────────────────────────
# Loyalty Tiers
# ──────────────────────────────────────────────

LOYALTY_TIERS = [
    {
        "tier_key": "bronze",
        "display_name": "Bronze",
        "description": "Entry level — earn 1 pt per RM 1",
        "minimum_points": 0,
        "point_multiplier": Decimal("1.00"),
        "sort_order": 1,
    },
    {
        "tier_key": "silver",
        "display_name": "Silver",
        "description": "Earn 1.25 pts per RM 1 + early access to promos",
        "minimum_points": 500,
        "point_multiplier": Decimal("1.25"),
        "sort_order": 2,
    },
    {
        "tier_key": "gold",
        "display_name": "Gold",
        "description": "Earn 1.5 pts per RM 1 + birthday reward + priority support",
        "minimum_points": 2000,
        "point_multiplier": Decimal("1.50"),
        "sort_order": 3,
    },
    {
        "tier_key": "platinum",
        "display_name": "Platinum",
        "description": "Earn 2 pts per RM 1 + exclusive events + free delivery",
        "minimum_points": 5000,
        "point_multiplier": Decimal("2.00"),
        "sort_order": 4,
    },
]

# ──────────────────────────────────────────────
# Menu Categories
# ──────────────────────────────────────────────

MENU_CATEGORIES = [
    ("coffee", "Coffee", "coffee", 1),
    ("tea", "Tea", "tea", 2),
    ("pastries", "Pastries", "baking", 3),
    ("sandwiches", "Sandwiches", "sandwich", 4),
    ("cold_beverages", "Cold Beverages", "ice", 5),
    ("desserts", "Desserts", "cake", 6),
]

# ──────────────────────────────────────────────
# Rewards
# ──────────────────────────────────────────────

DEFAULT_REWARDS = [
    {
        "reward_key": "free_coffee",
        "reward_name": "Free Coffee",
        "reward_type": "free_item",
        "description": "Any coffee, any size, on us.",
        "points_cost": 200,
        "max_redemptions_per_user": None,
        "maximum_redemptions": None,
        "is_active": True,
    },
    {
        "reward_key": "free_pastry",
        "reward_name": "Free Pastry",
        "reward_type": "free_item",
        "description": "Choose any pastry from our counter.",
        "points_cost": 100,
        "max_redemptions_per_user": None,
        "maximum_redemptions": None,
        "is_active": True,
    },
    {
        "reward_key": "discount_5rm",
        "reward_name": "RM 5 Discount",
        "reward_type": "fixed_discount",
        "description": "RM 5 off your next order.",
        "points_cost": 150,
        "max_redemptions_per_user": 3,
        "maximum_redemptions": 500,
        "is_active": True,
    },
]

# ──────────────────────────────────────────────
# Vouchers
# ──────────────────────────────────────────────

DEFAULT_VOUCHERS = [
    {
        "voucher_code": "WELCOME10",
        "display_title": "Welcome 10% Off",
        "voucher_type": "percentage_off",
        "discount_value": Decimal("0.10"),
        "description": "Welcome voucher for new customers — 10% off first order.",
        "minimum_order_value": Decimal("10.00"),
        "max_global_uses": 1000,
        "max_uses_per_customer": 1,
        "valid_for_days": 30,
    },
    {
        "voucher_code": "FREEDELIVERY",
        "display_title": "Free Delivery",
        "voucher_type": "free_shipping",
        "discount_value": Decimal("0.00"),
        "description": "Free delivery on your order.",
        "minimum_order_value": Decimal("20.00"),
        "max_global_uses": 500,
        "max_uses_per_customer": 3,
        "valid_for_days": 60,
    },
]

# ──────────────────────────────────────────────
# Admin roles
# ──────────────────────────────────────────────

ADMIN_ROLES = [
    ("system_admin", "System Administrator", "Full system access"),
    ("regional_manager", "Regional Manager", "Manage stores and staff in region"),
    ("store_manager", "Store Manager", "Manage single store operations"),
    ("readonly_analyst", "Read-only Analyst", "View reports and analytics"),
]

# ──────────────────────────────────────────────
# Seed functions
# ──────────────────────────────────────────────


async def seed_platform_config(db) -> int:
    count = 0
    for key, value, description in PLATFORM_DEFAULTS:
        existing = await db.execute(
            select(PlatformConfig).where(PlatformConfig.config_key == key)
        )
        if existing.scalar_one_or_none():
            continue
        db.add(PlatformConfig(
            config_key=key,
            config_value=value,
            description=description,
            data_type="string",
            is_public=True,
        ))
        count += 1
    if count:
        await db.commit()
        print(f"  Platform config: {count} entries inserted")
    else:
        print("  Platform config: already seeded (skipped)")
    return count


async def seed_admin_roles(db) -> dict[str, int]:
    role_map = {}
    for key, name, description in ADMIN_ROLES:
        existing = await db.execute(
            select(IAMRole).where(IAMRole.role_key == key)
        )
        row = existing.scalar_one_or_none()
        if row:
            role_map[key] = row.id
            continue
        role = IAMRole(
            role_key=key,
            role_name=name,
            description=description,
            is_system_role=True,
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(role)
        await db.flush()
        role_map[key] = role.id
    await db.commit()
    print(f"  Admin roles: {len(role_map)} roles (inserted or existing)")
    return role_map


async def seed_admin_account(db, role_map: dict[str, int]) -> IAMPrincipal:
    # Check if admin already exists
    existing = await db.execute(
        select(AdminAccount).where(AdminAccount.email == ADMIN_EMAIL)
    )
    admin = existing.scalar_one_or_none()
    if admin:
        print(f"  Admin account: {ADMIN_EMAIL} already exists (skipped)")
        principal = await db.get(IAMPrincipal, admin.principal_id)
        return principal  # type: ignore[return-value]

    # Create IAM principal
    principal = IAMPrincipal(
        principal_type="human",
        status="active",
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(principal)
    await db.flush()

    password_hash = ph.hash(ADMIN_PASSWORD)

    admin = AdminAccount(
        principal_id=principal.id,
        email=ADMIN_EMAIL,
        display_name="Super Admin",
        password_hash=password_hash,
        is_active=True,
        is_super_admin=True,
        is_email_verified=True,
        failed_login_count=0,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(admin)
    await db.flush()

    # Assign system_admin role
    if "system_admin" in role_map:
        assignment = RoleAssignment(
            role_id=role_map["system_admin"],
            assignee_id=principal.id,
            assignee_type="admin",
            assigned_by=None,
            assigned_at=_now(),
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(assignment)

    await db.commit()
    print(f"  Admin account: {ADMIN_EMAIL} created with system_admin role")
    return principal


async def seed_stores(db) -> List[Store]:
    existing_count = await _count(db, Store)
    if existing_count > 0:
        print(f"  Stores: {existing_count} already exist (skipped)")
        result = await db.execute(select(Store))
        return list(result.scalars().all())

    stores = []
    for i, (code, name, city, slug) in enumerate([
        ("LK-001", "LOKA Espresso KLCC", "Kuala Lumpur", "loka-klcc"),
        ("LK-002", "LOKA Espresso Bangsar", "Kuala Lumpur", "loka-bangsar"),
        ("LK-003", "LOKA Espresso TTDI", "Kuala Lumpur", "loka-ttdi"),
    ]):
        store = Store(
            store_code=code,
            store_name=name,
            slug=slug,
            address_line_1=f"{100 + i} Jalan Example",
            city=city,
            state_province="Wilayah Persekutuan",
            postal_code=f"{50000 + i * 100}",
            country_code="MY",
            phone_number=f"+6012345678{i}",
            timezone="Asia/Kuala_Lumpur",
            currency_code="MYR",
            is_active=True,
            position=i,
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(store)
        await db.flush()
        stores.append(store)

        # Operating hours (8am-10pm weekdays, 8am-11pm weekends)
        weekday_close = time(22, 0)
        weekend_close = time(23, 0)
        open_time = time(8, 0)
        last_order = time(21, 30)

        for dow in range(7):  # 0=Mon .. 6=Sun
            is_weekend = dow >= 5
            db.add(StoreOperatingHours(
                store_id=store.id,
                day_of_week=dow,
                open_time=open_time,
                close_time=weekend_close if is_weekend else weekday_close,
                last_order_time=last_order,
                is_closed=False,
                is_24_hours=False,
                created_at=_now(),
                updated_at=_now(),
            ))

        # Dining tables
        sections = ["A", "B"]
        table_num = 1
        for section in sections:
            for cap in [2, 2, 4, 4, 6]:
                db.add(DiningTable(
                    store_id=store.id,
                    table_number=f"{section}{table_num}",
                    display_name=f"Table {section}{table_num}",
                    capacity=cap,
                    section=section,
                    current_status="available",
                    is_active=True,
                    created_at=_now(),
                    updated_at=_now(),
                ))
                table_num += 1

    await db.commit()
    print(f"  Stores: {len(stores)} created with hours & tables")
    return stores


async def seed_loyalty_tiers(db):
    count = await _count(db, LoyaltyTier)
    if count > 0:
        print(f"  Loyalty tiers: {count} already exist (skipped)")
        return

    for tier in LOYALTY_TIERS:
        db.add(LoyaltyTier(
            tier_key=tier["tier_key"],
            display_name=tier["display_name"],
            description=tier["description"],
            minimum_points=tier["minimum_points"],
            point_multiplier=tier["point_multiplier"],
            sort_order=tier["sort_order"],
            is_active=True,
            created_at=_now(),
            updated_at=_now(),
        ))
    await db.commit()
    print(f"  Loyalty tiers: {len(LOYALTY_TIERS)} created")


async def seed_menu(db, stores: List[Store]):
    cat_count = await _count(db, MenuCategory)
    if cat_count > 0:
        print(f"  Menu categories: {cat_count} already exist (skipped)")
        return

    categories = {}
    for key, name, icon, sort in MENU_CATEGORIES:
        cat = MenuCategory(
            category_key=key,
            category_name=name,
            icon_name=icon,
            sort_order=sort,
            is_active=True,
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(cat)
        await db.flush()
        categories[key] = cat

    # Sample menu items
    items = [
        ("espresso", "Espresso", "coffee", Decimal("8.00"), "Single shot espresso"),
        ("americano", "Americano", "coffee", Decimal("9.00"), "Espresso with hot water"),
        ("latte", "Cafe Latte", "coffee", Decimal("12.00"), "Espresso with steamed milk"),
        ("cappuccino", "Cappuccino", "coffee", Decimal("12.00"), "Espresso with frothy milk"),
        ("mocha", "Mocha", "coffee", Decimal("13.00"), "Chocolate + espresso + milk"),
        ("turkish", "Turkish Coffee", "coffee", Decimal("15.00"), "Traditional Turkish coffee"),
        ("earl_grey", "Earl Grey Tea", "tea", Decimal("9.00"), "Premium Earl Grey"),
        ("matcha_latte", "Matcha Latte", "tea", Decimal("13.00"), "Ceremonial matcha + milk"),
        ("chamomile", "Chamomile Tea", "tea", Decimal("8.00"), "Calming herbal infusion"),
        ("croissant", "Butter Croissant", "pastries", Decimal("7.00"), "Flaky French croissant"),
        ("banana_bread", "Banana Bread", "pastries", Decimal("9.00"), "Freshly baked banana bread"),
        ("blueberry_muffin", "Blueberry Muffin", "pastries", Decimal("8.00"), "With real blueberries"),
        ("chicken_sandwich", "Chicken Sandwich", "sandwiches", Decimal("16.00"), "Grilled chicken on sourdough"),
        ("club_sandwich", "Club Sandwich", "sandwiches", Decimal("18.00"), "Triple-decker classic"),
        ("iced_latte", "Iced Latte", "cold_beverages", Decimal("13.00"), "Cold milk + espresso"),
        ("iced_matcha", "Iced Matcha", "cold_beverages", Decimal("14.00"), "Cold matcha latte"),
        ("cold_brew", "Cold Brew", "cold_beverages", Decimal("11.00"), "12-hour steeped cold brew"),
        ("choc_cake", "Chocolate Cake", "desserts", Decimal("15.00"), "Rich chocolate layer cake"),
        ("cheesecake", "New York Cheesecake", "desserts", Decimal("14.00"), "Classic NY cheesecake"),
        ("tiramisu", "Tiramisu", "desserts", Decimal("16.00"), "Italian coffee dessert"),
    ]

    for key, name, cat_key, price, desc in items:
        db.add(MenuItem(
            item_key=key,
            item_name=name,
            description=desc,
            base_price=price,
            category_id=categories[cat_key].id,
            is_available=True,
            is_featured=key in ("latte", "turkish", "croissant"),
            position=0,
            created_at=_now(),
            updated_at=_now(),
        ))

    await db.commit()
    print(f"  Menu: {len(categories)} categories, {len(items)} items created")


async def seed_rewards(db):
    count = await _count(db, RewardCatalog)
    if count > 0:
        print(f"  Rewards: {count} already exist (skipped)")
        return

    for r in DEFAULT_REWARDS:
        db.add(RewardCatalog(
            reward_key=r["reward_key"],
            reward_name=r["reward_name"],
            reward_type=r["reward_type"],
            description=r["description"],
            points_cost=r["points_cost"],
            max_redemptions_per_user=r["max_redemptions_per_user"],
            maximum_redemptions=r["maximum_redemptions"],
            is_active=r["is_active"],
            created_at=_now(),
            updated_at=_now(),
        ))
    await db.commit()
    print(f"  Rewards: {len(DEFAULT_REWARDS)} created")


async def seed_vouchers(db):
    count = await _count(db, VoucherDefinition)
    if count > 0:
        print(f"  Vouchers: {count} already exist (skipped)")
        return

    for v in DEFAULT_VOUCHERS:
        db.add(VoucherDefinition(
            voucher_code=v["voucher_code"],
            display_title=v["display_title"],
            voucher_type=v["voucher_type"],
            discount_value=v["discount_value"],
            description=v["description"],
            minimum_order_value=v["minimum_order_value"],
            max_global_uses=v["max_global_uses"],
            max_uses_per_customer=v["max_uses_per_customer"],
            valid_from=_now(),
            valid_until=_now() + timedelta(days=v["valid_for_days"]),
            is_active=True,
            created_at=_now(),
            updated_at=_now(),
        ))
    await db.commit()
    print(f"  Vouchers: {len(DEFAULT_VOUCHERS)} created")


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────

async def main():
    print("=" * 60)
    print("  FNB Super App v3 — Baseline Seed")
    print("=" * 60)
    print()

    async with AsyncSessionLocal() as db:
        print("[1/8] Platform config ...")
        await seed_platform_config(db)

        print("[2/8] Admin roles ...")
        role_map = await seed_admin_roles(db)

        print("[3/8] Admin account ...")
        await seed_admin_account(db, role_map)

        print("[4/8] Stores (with hours & tables) ...")
        stores = await seed_stores(db)

        print("[5/8] Loyalty tiers ...")
        await seed_loyalty_tiers(db)

        print("[6/8] Menu categories & items ...")
        await seed_menu(db, stores)

        print("[7/8] Reward catalog ...")
        await seed_rewards(db)

        print("[8/8] Voucher definitions ...")
        await seed_vouchers(db)

    print()
    print("=" * 60)
    print("  Seed complete!")
    print(f"  Admin login: {ADMIN_EMAIL}")
    print(f"  Admin password: {ADMIN_PASSWORD}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
