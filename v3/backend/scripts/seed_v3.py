"""Bootstrap a blank v3 database with the first master admin account.

This is the ONLY script that writes directly to the database.
Everything else — stores, loyalty tiers, menu, staff, config — is
created via API endpoints. The e2e test suite uses this admin account
to populate test data.

Usage:
    cd v3/backend
    python3 scripts/seed_v3.py

Environment variables:
    SEED_ADMIN_EMAIL  — admin login email (default: admin@lokaespresso.my)
    SEED_ADMIN_PASS   — admin login password (default: admin123)
    DATABASE_URL      — async DB connection string
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from argon2 import PasswordHasher
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.iam import IAMPrincipal, AdminAccount, IAMRole, RoleAssignment

ADMIN_EMAIL = os.getenv("SEED_ADMIN_EMAIL", "admin@lokaespresso.my")
ADMIN_PASS  = os.getenv("SEED_ADMIN_PASS", "admin123")

ph = PasswordHasher()


async def seed_admin_roles(db):
    """Create the four default IAM roles if they don't exist."""
    roles = {
        "system_admin":     "Full system access with store scoping override",
        "regional_manager": "Multi-store management with cross-store reporting",
        "store_manager":    "Single-store operations with full store-scoped access",
        "readonly_analyst": "Read-only analytics, reports, and audit log access",
    }
    role_map: dict[str, int] = {}
    for key, desc in roles.items():
        result = await db.execute(select(IAMRole).where(IAMRole.role_key == key))
        existing = result.scalar_one_or_none()
        if existing:
            role_map[key] = existing.id
            print(f"  Role '{key}' already exists (id={existing.id})")
            continue
        role = IAMRole(role_key=key, display_name=key.replace("_", " ").title(), description=desc)
        db.add(role)
        await db.flush()
        role_map[key] = role.id
        print(f"  Created role '{key}' (id={role.id})")
    return role_map


async def seed_admin(db, role_map: dict[str, int]):
    """Create the master admin account if it doesn't exist."""
    result = await db.execute(select(AdminAccount).where(AdminAccount.email == ADMIN_EMAIL))
    if result.scalar_one_or_none():
        print(f"  Admin '{ADMIN_EMAIL}' already exists")
        return

    principal = IAMPrincipal(principal_type="admin")
    db.add(principal)
    await db.flush()

    admin = AdminAccount(
        principal_id=principal.id,
        email=ADMIN_EMAIL,
        display_name="System Administrator",
        password_hash=ph.hash(ADMIN_PASS),
        password_algorithm="argon2id",
        mfa_enabled=False,
    )
    db.add(admin)
    await db.flush()

    # Assign system_admin role
    sys_admin_role = role_map.get("system_admin")
    if sys_admin_role:
        db.add(RoleAssignment(principal_id=principal.id, role_id=sys_admin_role))

    await db.commit()
    print(f"  Created admin '{ADMIN_EMAIL}' (principal_id={principal.id})")


async def main():
    print("=== FNB v3 Bootstrap ===")
    print(f"Admin email: {ADMIN_EMAIL}")

    async with AsyncSessionLocal() as db:
        print("\n[1/2] Roles...")
        role_map = await seed_admin_roles(db)
        print("[2/2] Admin account...")
        await seed_admin(db, role_map)

    print("\nBootstrap complete. Use the admin account to create everything else via the API.")


if __name__ == "__main__":
    asyncio.run(main())
