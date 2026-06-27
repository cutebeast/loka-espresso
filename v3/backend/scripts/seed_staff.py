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
        "pin": os.getenv("SEED_STAFF_PIN", "1234"),
        "role_key": "cashier",
    },
]

ph = PasswordHasher()


async def seed():
    async with get_db() as db:
        store_result = await db.execute(text("SELECT id FROM stores WHERE deleted_at IS NULL ORDER BY id LIMIT 1"))
        store_row = store_result.first()
        if not store_row:
            print("  No active store found. Run seed_stores.py first.")
            return
        store_id = store_row[0]

        for staff in STAFF:
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
