#!/usr/bin/env python3
"""Seed IAM master data: roles, permissions, admin account.

Environment variables:
    SEED_ADMIN_EMAIL  (default: admin@loyaltysystem.uk)
    SEED_ADMIN_PASS   (default: admin123)
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from argon2 import PasswordHasher
from sqlalchemy import text

from scripts._db_utils import confirm, get_db, guard_production


ADMIN_EMAIL = os.getenv("SEED_ADMIN_EMAIL", "admin@loyaltysystem.uk")
ADMIN_PASS = os.getenv("SEED_ADMIN_PASS", "admin123")

ph = PasswordHasher()

ROLES = [
    ("system_admin", "System Administrator", "Full platform access", "global"),
    ("regional_manager", "Regional Manager", "Multi-store oversight", "region"),
    ("store_manager", "Store Manager", "Single store management", "store"),
    ("shift_supervisor", "Shift Supervisor", "Supervises staff during shifts", "store"),
    ("cashier", "Cashier", "POS and checkout operations", "store"),
    ("server", "Server", "Table service and order taking", "store"),
    ("kitchen_staff", "Kitchen Staff", "Food preparation and KDS", "store"),
    ("delivery_coordinator", "Delivery Coordinator", "Manages delivery dispatch", "store"),
    ("readonly_analyst", "Read-Only Analyst", "View-only access to reports", "global"),
]

PERMISSIONS = [
    ("order.read", "order", "read", "View orders", False),
    ("order.create", "order", "create", "Create orders", False),
    ("order.update", "order", "update", "Update order status", False),
    ("order.delete", "order", "delete", "Cancel/delete orders", True),
    ("order.export", "order", "export", "Export order data", False),
    ("inventory.read", "inventory", "read", "View inventory", False),
    ("inventory.adjust", "inventory", "update", "Adjust inventory levels", True),
    ("menu.read", "menu", "read", "View menu", False),
    ("menu.update", "menu", "update", "Edit menu items", False),
    ("staff.read", "staff", "read", "View staff", False),
    ("staff.manage", "staff", "update", "Manage staff profiles", True),
    ("customer.read", "customer", "read", "View customers", False),
    ("customer.update", "customer", "update", "Edit customers", True),
    ("report.read", "report", "read", "View reports", False),
    ("report.export", "report", "export", "Export reports", False),
    ("settings.read", "settings", "read", "View settings", False),
    ("settings.update", "settings", "update", "Update settings", True),
    ("payment.read", "payment", "read", "View payments", False),
    ("payment.refund", "payment", "transfer", "Process refunds", True),
    ("campaign.read", "campaign", "read", "View campaigns", False),
    ("campaign.manage", "campaign", "create", "Create/edit campaigns", False),
    ("audit.read", "audit", "read", "View audit logs", False),
]


async def seed():
    async with get_db() as db:
        # Roles
        await db.execute(
            text("""
                INSERT INTO iam_roles (role_key, display_name, description, is_system, scope_level)
                VALUES (:role_key, :display_name, :description, true, :scope_level)
                ON CONFLICT (role_key) DO NOTHING
            """),
            [
                {
                    "role_key": key,
                    "display_name": display,
                    "description": desc,
                    "scope_level": scope,
                }
                for key, display, desc, scope in ROLES
            ],
        )

        # Permissions
        await db.execute(
            text("""
                INSERT INTO iam_permissions (permission_key, resource, action, description, is_dangerous)
                VALUES (:key, :resource, :action, :description, :dangerous)
                ON CONFLICT (permission_key) DO NOTHING
            """),
            [
                {
                    "key": key,
                    "resource": resource,
                    "action": action,
                    "description": desc,
                    "dangerous": dangerous,
                }
                for key, resource, action, desc, dangerous in PERMISSIONS
            ],
        )

        # Grant every permission to system_admin
        await db.execute(
            text("""
                INSERT INTO role_permission (role_id, permission_id)
                SELECT r.id, p.id
                FROM iam_roles r
                CROSS JOIN iam_permissions p
                WHERE r.role_key = 'system_admin'
                ON CONFLICT DO NOTHING
            """)
        )

        # Admin account if missing
        existing = await db.execute(text("SELECT id FROM admin_accounts WHERE email = :email"), {"email": ADMIN_EMAIL})
        if existing.scalar_one_or_none():
            print(f"  Admin '{ADMIN_EMAIL}' already exists")
            return

        principal = await db.execute(
            text("INSERT INTO iam_principals (principal_type, status) VALUES ('human', 'active') RETURNING id")
        )
        principal_id = principal.scalar_one()

        await db.execute(
            text("""
                INSERT INTO admin_accounts (
                    principal_id, email, display_name, password_hash, password_algorithm, is_active
                ) VALUES (
                    :principal_id, :email, :display_name, :password_hash, 'argon2id', true
                )
            """),
            {
                "principal_id": principal_id,
                "email": ADMIN_EMAIL,
                "display_name": "System Administrator",
                "password_hash": ph.hash(ADMIN_PASS),
            },
        )

        await db.execute(
            text("""
                INSERT INTO role_assignments (assignee_id, role_id, effective_from, is_active)
                SELECT :principal_id, id, now(), true
                FROM iam_roles WHERE role_key = 'system_admin'
            """),
            {"principal_id": principal_id},
        )

        print(f"  Created admin '{ADMIN_EMAIL}' (principal_id={principal_id})")


async def main():
    parser = argparse.ArgumentParser(description="Seed IAM master data")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Seed IAM roles, permissions and master admin?", args.yes):
        print("Aborted.")
        return

    await seed()
    print("Done.")


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
