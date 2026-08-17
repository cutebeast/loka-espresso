"""Auto inventory link — every menu item ties to inventory by default.

Owner decision (2026-08-17): when a menu item has no recipe rows, a 1:1
inventory item (code LNK-<item_code>, unit "nos", cost 0) is created and
linked as the sole recipe ingredient, plus 0-stock rows for all active
stores. Used by:
- admin menu item create/update (on save)
- scripts/backfill_inventory_links.py (existing items)
- seed_menu.py --with-recipes (fresh reseeds stay consistent)
"""

import hashlib
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.menu import MenuItem, MenuItemRecipe


async def ensure_auto_inventory_link(db: AsyncSession, menu_item: MenuItem) -> int | None:
    """Link the item to a 1:1 inventory item when it has no recipe rows.

    Idempotent: returns None when the item already has recipes. Returns the
    created/linked inventory item id otherwise.
    """
    existing = await db.execute(
        select(MenuItemRecipe.id)
        .where(MenuItemRecipe.menu_item_id == menu_item.id)
        .limit(1)
    )
    if existing.scalar_one_or_none() is not None:
        return None

    code = f"LNK-{menu_item.item_code}"
    if len(code) > 50:
        suffix = hashlib.sha1(menu_item.item_code.encode()).hexdigest()[:8].upper()
        code = f"LNK-{menu_item.item_code[:38]}-{suffix}"

    inv_result = await db.execute(
        text(
            """
            INSERT INTO inventory_items (item_code, item_name, unit_of_measure, unit_cost, item_type, is_active)
            VALUES (:code, :name, 'nos', 0, 'fnb', true)
            ON CONFLICT (item_code) WHERE deleted_at IS NULL DO UPDATE SET
                item_name = EXCLUDED.item_name,
                unit_of_measure = EXCLUDED.unit_of_measure,
                is_active = true,
                deleted_at = NULL
            RETURNING id
            """
        ),
        {"code": code, "name": menu_item.item_name},
    )
    inv_id = inv_result.scalar_one()

    await db.execute(
        text(
            """
            INSERT INTO menu_item_recipes (menu_item_id, menu_variant_id, inventory_item_id, quantity_required, unit_of_measure, is_primary_component, waste_factor)
            VALUES (:item, NULL, :inv, 1, 'nos', true, 0)
            ON CONFLICT (menu_item_id, menu_variant_id, inventory_item_id) DO NOTHING
            """
        ),
        {"item": menu_item.id, "inv": inv_id},
    )

    store_ids = (
        await db.execute(
            text("SELECT id FROM stores WHERE deleted_at IS NULL AND is_active = true")
        )
    ).scalars().all()
    for store_id in store_ids:
        await db.execute(
            text(
                """
                INSERT INTO inventory_stock (inventory_item_id, store_id, current_stock, reserved_stock, reorder_level)
                VALUES (:inv, :store, 0, 0, 0)
                ON CONFLICT (inventory_item_id, store_id) DO NOTHING
                """
            ),
            {"inv": inv_id, "store": store_id},
        )
    await db.flush()
    return inv_id
