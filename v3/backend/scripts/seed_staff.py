#!/usr/bin/env python3
"""Seed staff profiles and store assignments."""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from argon2 import PasswordHasher
from sqlalchemy import text

from scripts._db_utils import confirm, get_db, guard_production


STAFF = [
    {
        "display_name": "Test Staff",
        "email": "teststaff@lokaespresso.my",
        "employee_id": "EMP001",
        "role": "cashier",
        "password": os.getenv("SEED_STAFF_PASS", "TestStaff123!"),
        "pin": os.getenv("SEED_STAFF_PIN", "123456"),
        "role_key": "cashier",
        "store_code": "PKL-001",
    },
    {
        "display_name": "Staff One",
        "email": "staff1@loyaltysystem.uk",
        "employee_id": "EMP002",
        "role": "server",
        "password": os.getenv("SEED_STAFF1_PASS", "staff123"),
        "pin": os.getenv("SEED_STAFF_PIN", "123456"),
        "role_key": "server",
        "store_code": "PKL-001",
    },
    {
        "display_name": "Staff Two",
        "email": "staff2@loyaltysystem.uk",
        "employee_id": "EMP003",
        "role": "server",
        "password": os.getenv("SEED_STAFF2_PASS", "staff123"),
        "pin": os.getenv("SEED_STAFF_PIN", "123456"),
        "role_key": "server",
        "store_code": "KLIA1-001",
    },
    {
        # Kitchen display / wastage / inventory / hygiene pages test account
        "display_name": "Kitchen Staff",
        "email": "kitchen@loyaltysystem.uk",
        "employee_id": "EMP004",
        "role": "kitchen_staff",
        "password": os.getenv("SEED_KITCHEN_PASS", "kitchen123"),
        "pin": os.getenv("SEED_STAFF_PIN", "123456"),
        "role_key": "kitchen_staff",
        "store_code": "PKL-001",
    },
    {
        # Manager-level pages test account (ops + staff management)
        "display_name": "Store Manager",
        "email": "manager@loyaltysystem.uk",
        "employee_id": "EMP005",
        "role": "store_manager",
        "password": os.getenv("SEED_MANAGER_PASS", "manager123"),
        "pin": os.getenv("SEED_STAFF_PIN", "123456"),
        "role_key": "store_manager",
        "store_code": "PKL-001",
    },
]

ph = PasswordHasher()


async def seed():
    async with get_db() as db:
        store_result = await db.execute(text("SELECT id, store_code FROM stores WHERE deleted_at IS NULL"))
        store_ids = {row.store_code: row.id for row in store_result}
        if not store_ids:
            print("  No active store found. Run seed_stores.py first.")
            return

        for staff in STAFF:
            store_id = store_ids.get(staff.get("store_code")) or next(iter(store_ids.values()))
            existing = await db.execute(
                text("SELECT id FROM staff_profiles WHERE email_address = :email"),
                {"email": staff["email"]},
            )
            if existing.all():
                print(f"  Staff '{staff['display_name']}' already exists")
                continue

            principal = await db.execute(
                text("INSERT INTO iam_principals (principal_type, status) VALUES ('human', 'active') RETURNING id")
            )
            principal_id = principal.scalar_one()

            await db.execute(
                text("""
                    INSERT INTO staff_profiles
                        (principal_id, store_id, employee_id, display_name, email_address, role,
                         password_hash, pin_hash, is_active)
                    VALUES (:principal_id, :store_id, :employee_id, :display_name, :email, :role,
                            :password_hash, :pin_hash, true)
                """),
                {
                    "principal_id": principal_id,
                    "store_id": store_id,
                    "display_name": staff["display_name"],
                    "email": staff["email"],
                    "employee_id": staff["employee_id"],
                    "role": staff["role"],
                    "password_hash": ph.hash(staff["password"]),
                    "pin_hash": ph.hash(staff["pin"]),
                },
            )

            # Staff roles are stored on staff_profiles.role; role_assignments is for admin accounts.

            # Link admin principal (id=1) to first store if not already assigned
            await db.execute(
                text("""
                    INSERT INTO store_assignments (assignee_id, store_id, is_primary, can_approve_refunds, can_adjust_inventory, can_manage_staff)
                    VALUES (1, :store_id, true, true, true, true)
                    ON CONFLICT DO NOTHING
                """),
                {"store_id": store_id},
            )

            print(f"  Created staff '{staff['display_name']}' for store {store_id}")


async def main():
    parser = argparse.ArgumentParser(description="Seed staff profiles")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Seed staff profiles?", args.yes):
        print("Aborted.")
        return

    await seed()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
