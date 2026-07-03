"""Bootstrap a blank v3 database with the first master admin account.

This is the ONLY script that writes directly to the database.
Everything else — stores, loyalty tiers, menu, staff, config — is
created via API endpoints. The e2e test suite uses this admin account
to populate test data.

Usage:
    cd v3/backend
    python3 scripts/seed_v3.py

Environment variables:
    SEED_ADMIN_EMAIL  — admin login email (default: admin@loyaltysystem.uk)
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
from app.models.inventory import InventoryCategory, InventoryItem, InventoryStock
from app.models.store import Store

ADMIN_EMAIL = os.getenv("SEED_ADMIN_EMAIL", "admin@loyaltysystem.uk")
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


async def seed_inventory_categories(db):
    """Create global inventory categories if they don't exist."""
    categories = [
        {"category_name": "Beverages",        "slug": "beverages",       "display_order": 1},
        {"category_name": "Food Supplies",    "slug": "food-supplies",   "display_order": 2},
        {"category_name": "Disposables",      "slug": "disposables",     "display_order": 3},
        {"category_name": "Cleaning",         "slug": "cleaning",        "display_order": 4},
    ]
    cat_map: dict[str, int] = {}
    for cat_data in categories:
        result = await db.execute(
            select(InventoryCategory).where(InventoryCategory.slug == cat_data["slug"])
        )
        existing = result.scalar_one_or_none()
        if existing:
            cat_map[cat_data["slug"]] = existing.id
            print(f"  Category '{cat_data['category_name']}' already exists (id={existing.id})")
            continue
        cat = InventoryCategory(**cat_data)
        db.add(cat)
        await db.flush()
        cat_map[cat_data["slug"]] = cat.id
        print(f"  Created category '{cat_data['category_name']}' (id={cat.id})")
    return cat_map


async def seed_inventory_items(db, cat_map: dict[str, int]):
    """Create global inventory items if they don't exist."""
    items = [
        {"item_code": "BEV-001", "item_name": "Coffee Beans",          "category_slug": "beverages",     "unit_of_measure": "kg",  "unit_cost": 25.00, "item_type": "fnb"},
        {"item_code": "BEV-002", "item_name": "Fresh Milk",            "category_slug": "beverages",     "unit_of_measure": "L",   "unit_cost": 8.50,  "item_type": "fnb"},
        {"item_code": "BEV-003", "item_name": "Tea Bags",              "category_slug": "beverages",     "unit_of_measure": "pcs", "unit_cost": 0.15,  "item_type": "fnb"},
        {"item_code": "BEV-004", "item_name": "Caster Sugar",          "category_slug": "beverages",     "unit_of_measure": "kg",  "unit_cost": 3.50,  "item_type": "fnb"},
        {"item_code": "FOD-001", "item_name": "Premium Flour",         "category_slug": "food-supplies", "unit_of_measure": "kg",  "unit_cost": 4.00,  "item_type": "fnb"},
        {"item_code": "FOD-002", "item_name": "Unsalted Butter",       "category_slug": "food-supplies", "unit_of_measure": "kg",  "unit_cost": 12.00, "item_type": "fnb"},
        {"item_code": "DIS-001", "item_name": "Paper Cups 12oz",       "category_slug": "disposables",   "unit_of_measure": "pcs", "unit_cost": 0.20,  "item_type": "non_fnb"},
        {"item_code": "DIS-002", "item_name": "Plastic Lids",          "category_slug": "disposables",   "unit_of_measure": "pcs", "unit_cost": 0.10,  "item_type": "non_fnb"},
        {"item_code": "CLN-001", "item_name": "Dishwashing Liquid",    "category_slug": "cleaning",      "unit_of_measure": "L",   "unit_cost": 5.00,  "item_type": "non_fnb"},
        {"item_code": "CLN-002", "item_name": "Hand Sanitizer",        "category_slug": "cleaning",      "unit_of_measure": "L",   "unit_cost": 8.00,  "item_type": "non_fnb"},
    ]
    item_map: dict[str, int] = {}
    for item_data in items:
        result = await db.execute(
            select(InventoryItem).where(InventoryItem.item_code == item_data["item_code"])
        )
        existing = result.scalar_one_or_none()
        if existing:
            item_map[item_data["item_code"]] = existing.id
            print(f"  Item '{item_data['item_name']}' already exists (id={existing.id})")
            continue
        category_id = cat_map.get(item_data["category_slug"])
        item = InventoryItem(
            category_id=category_id,
            item_code=item_data["item_code"],
            item_name=item_data["item_name"],
            unit_of_measure=item_data["unit_of_measure"],
            unit_cost=item_data["unit_cost"],
            item_type=item_data["item_type"],
        )
        db.add(item)
        await db.flush()
        item_map[item_data["item_code"]] = item.id
        print(f"  Created item '{item_data['item_name']}' (id={item.id})")
    return item_map


async def seed_inventory_stock(db, item_map: dict[str, int]):
    """Create InventoryStock rows for each (item, store) pair with sample stock levels."""
    result = await db.execute(
        select(Store).where(Store.deleted_at.is_(None))
    )
    stores = result.scalars().all()
    if not stores:
        print("  No stores found — skipping inventory stock seeding")
        return

    stock_levels: dict[str, dict] = {
        "BEV-001": {"current_stock": 50.0,  "reserved_stock": 0, "reorder_level": 10.0, "reorder_quantity": 25.0, "par_level": 40.0,  "storage_location": "Store Room A"},
        "BEV-002": {"current_stock": 30.0,  "reserved_stock": 0, "reorder_level": 5.0,  "reorder_quantity": 15.0, "par_level": 20.0,  "storage_location": "Fridge 1"},
        "BEV-003": {"current_stock": 500.0, "reserved_stock": 0, "reorder_level": 100.0,"reorder_quantity": 200.0,"par_level": 300.0, "storage_location": "Store Room A"},
        "BEV-004": {"current_stock": 20.0,  "reserved_stock": 0, "reorder_level": 5.0,  "reorder_quantity": 10.0, "par_level": 15.0,  "storage_location": "Store Room A"},
        "FOD-001": {"current_stock": 40.0,  "reserved_stock": 0, "reorder_level": 10.0, "reorder_quantity": 20.0, "par_level": 30.0,  "storage_location": "Store Room B"},
        "FOD-002": {"current_stock": 15.0,  "reserved_stock": 0, "reorder_level": 5.0,  "reorder_quantity": 10.0, "par_level": 12.0,  "storage_location": "Fridge 2"},
        "DIS-001": {"current_stock": 1000.0,"reserved_stock": 0, "reorder_level": 200.0,"reorder_quantity": 500.0,"par_level": 800.0, "storage_location": "Store Room C"},
        "DIS-002": {"current_stock": 800.0, "reserved_stock": 0, "reorder_level": 200.0,"reorder_quantity": 400.0,"par_level": 600.0, "storage_location": "Store Room C"},
        "CLN-001": {"current_stock": 10.0,  "reserved_stock": 0, "reorder_level": 2.0,  "reorder_quantity": 5.0,  "par_level": 8.0,   "storage_location": "Janitor Closet"},
        "CLN-002": {"current_stock": 8.0,   "reserved_stock": 0, "reorder_level": 2.0,  "reorder_quantity": 4.0,  "par_level": 6.0,   "storage_location": "Janitor Closet"},
    }

    created = 0
    for store in stores:
        for item_code, item_id in item_map.items():
            result = await db.execute(
                select(InventoryStock).where(
                    InventoryStock.inventory_item_id == item_id,
                    InventoryStock.store_id == store.id,
                )
            )
            if result.scalar_one_or_none():
                continue
            levels = stock_levels.get(item_code, {"current_stock": 0, "reserved_stock": 0, "reorder_level": 0, "reorder_quantity": 0, "par_level": 0, "storage_location": None})
            stock = InventoryStock(
                inventory_item_id=item_id,
                store_id=store.id,
                **levels,
            )
            db.add(stock)
            created += 1
    if created:
        print(f"  Created {created} inventory stock records across {len(stores)} stores")


async def main():
    print("=== FNB v3 Bootstrap ===")
    print(f"Admin email: {ADMIN_EMAIL}")

    async with AsyncSessionLocal() as db:
        print("\n[1/5] Roles...")
        role_map = await seed_admin_roles(db)
        print("[2/5] Admin account...")
        await seed_admin(db, role_map)
        print("[3/5] Inventory categories...")
        cat_map = await seed_inventory_categories(db)
        print("[4/5] Inventory items...")
        item_map = await seed_inventory_items(db, cat_map)
        print("[5/5] Inventory stock...")
        await seed_inventory_stock(db, item_map)
        await db.commit()

    print("\nBootstrap complete. Use the admin account to create everything else via the API.")


if __name__ == "__main__":
    asyncio.run(main())
