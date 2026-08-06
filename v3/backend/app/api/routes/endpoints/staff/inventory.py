"""Staff inventory endpoints (view stock, update counts, report waste)."""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.routes.deps import CurrentStaff, DBDependency
from app.api.routes.endpoints.staff.equipment import _save_uploaded_images
from app.models.inventory import InventoryItem, InventoryMovementLog, InventoryStock
from app.models.menu import MenuItem
from app.schemas.base import APIResponse

router = APIRouter(tags=["staff — inventory"])


# ── Staff Inventory (view, update stock, report waste) ──
# Both write endpoints are multipart: staff attach photo evidence (like the
# hygiene reports) — what was wasted / the shelf state at count time.


@router.get("/staff/inventory")
async def list_inventory_for_staff(
    db: DBDependency,
    staff: CurrentStaff,
):
    """List inventory items for the staff member's store."""
    store_id = staff.store_id if hasattr(staff, "store_id") else None
    if not store_id:
        raise HTTPException(status_code=400, detail="No store assigned to this staff member")

    result = await db.execute(
        select(InventoryStock)
        .options(
            selectinload(InventoryStock.item).selectinload(InventoryItem.category)
        )
        .where(
            InventoryStock.store_id == store_id,
            InventoryStock.item.has(
                InventoryItem.is_active.is_(True),
            ),
            InventoryStock.item.has(
                InventoryItem.deleted_at.is_(None),
            ),
        )
        .order_by(InventoryStock.inventory_item_id)
    )
    stocks = result.scalars().all()

    return APIResponse(data={
        "items": [
            {
                "id": s.item.id,
                "item_name": s.item.item_name,
                "item_code": s.item.item_code,
                "item_type": s.item.item_type,
                "unit_of_measure": s.item.unit_of_measure,
                "current_stock": s.current_stock,
                "reorder_level": s.reorder_level or 0,
                "par_level": s.par_level or 0,
                "storage_location": s.storage_location,
                "category_name": s.item.category.category_name if s.item.category else None,
            }
            for s in stocks
        ],
        "total": len(stocks),
    })


@router.post("/staff/inventory/update")
async def staff_update_stock(
    db: DBDependency,
    staff: CurrentStaff,
    item_id: int = Form(...),
    current_stock: float = Form(..., ge=0),
    reason: str = Form(""),
    images: list[UploadFile] = File(default=[]),
):
    """Staff updates current stock count (for non-FnB shelf counts)."""
    store_id = staff.store_id if hasattr(staff, "store_id") else None

    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.is_active.is_(True),
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    image_urls = _save_uploaded_images(images, subdir="inventory") if images else []

    # Find or create per-store stock record (lock row to prevent race conditions)
    stock_result = await db.execute(
        select(InventoryStock).where(
            InventoryStock.inventory_item_id == item_id,
            InventoryStock.store_id == store_id,
        ).with_for_update()
    )
    stock = stock_result.scalar_one_or_none()
    if stock is None:
        stock = InventoryStock(
            inventory_item_id=item_id,
            store_id=store_id,
            current_stock=0,
            reserved_stock=0,
            reorder_level=0,
            reorder_quantity=0,
            par_level=0,
        )
        db.add(stock)
        await db.flush()

    old_stock = stock.current_stock
    # DB numerics are Decimal — convert the form float before any arithmetic
    new_count = Decimal(str(round(current_stock, 4)))
    delta = new_count - old_stock

    staff_name = staff.display_name if hasattr(staff, "display_name") else f"Staff #{staff.id}"
    now = datetime.now(timezone.utc)

    stock.current_stock = new_count
    stock.updated_at = now

    if abs(delta) > Decimal("0.0001") or image_urls:
        movement = InventoryMovementLog(
            inventory_item_id=item.id,
            store_id=store_id,
            movement_type="adjustment",
            quantity_delta=delta,
            stock_after=new_count,
            reason=reason or f"Stock count updated by {staff_name}",
            image_urls=image_urls or None,
        )
        db.add(movement)

    await db.commit()
    await db.refresh(stock)

    return APIResponse(data={
        "id": item.id,
        "item_name": item.item_name,
        "current_stock": stock.current_stock,
        "previous_stock": old_stock,
        "delta": delta,
        "image_urls": image_urls,
    })


@router.post("/staff/inventory/waste", status_code=status.HTTP_201_CREATED)
async def staff_report_waste(
    db: DBDependency,
    staff: CurrentStaff,
    quantity: float = Form(..., gt=0),
    reason: str = Form(..., min_length=5, max_length=300),
    menu_item_id: int | None = Form(None),
    inventory_item_id: int | None = Form(None),
    unit_of_measure: str | None = Form(None),
    images: list[UploadFile] = File(default=[]),
):
    """Staff reports wastage for a menu item or inventory item."""
    store_id = staff.store_id if hasattr(staff, "store_id") else None
    staff_name = staff.display_name if hasattr(staff, "display_name") else f"Staff #{staff.id}"
    now = datetime.now(timezone.utc)

    image_urls = _save_uploaded_images(images, subdir="inventory") if images else []

    if inventory_item_id:
        result = await db.execute(
            select(InventoryItem).where(
                InventoryItem.id == inventory_item_id,
                InventoryItem.is_active.is_(True),
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Inventory item not found")

        # Find or create per-store stock record
        stock_result = await db.execute(
            select(InventoryStock).where(
                InventoryStock.inventory_item_id == inventory_item_id,
                InventoryStock.store_id == store_id,
            ).with_for_update()
        )
        stock = stock_result.scalar_one_or_none()
        if stock is None:
            stock = InventoryStock(
                inventory_item_id=inventory_item_id,
                store_id=store_id,
                current_stock=0,
                reserved_stock=0,
                reorder_level=0,
                reorder_quantity=0,
                par_level=0,
            )
            db.add(stock)
            await db.flush()

        delta = Decimal(str(round(-quantity, 4)))
        new_stock = stock.current_stock + delta
        stock.current_stock = max(Decimal(0), new_stock)
        stock.updated_at = now

        movement = InventoryMovementLog(
            inventory_item_id=item.id,
            store_id=store_id,
            movement_type="waste",
            quantity_delta=delta,
            stock_after=stock.current_stock,
            reason=f"[Reported by {staff_name}] {reason}",
            image_urls=image_urls or None,
        )
        db.add(movement)

        await db.commit()
        await db.refresh(stock)

        return APIResponse(data={
            "id": item.id,
            "item_name": item.item_name,
            "wasted_quantity": quantity,
            "current_stock": stock.current_stock,
            "image_urls": image_urls,
            "message": "Waste recorded for inventory item",
        })

    if menu_item_id:
        from sqlalchemy.orm import selectinload
        menu_result = await db.execute(
            select(MenuItem)
            .options(selectinload(MenuItem.recipes))
            .where(
                MenuItem.id == menu_item_id,
                MenuItem.is_available.is_(True),
                MenuItem.deleted_at.is_(None),
            )
        )
        menu_item = menu_result.scalar_one_or_none()
        if not menu_item:
            raise HTTPException(status_code=404, detail="Menu item not found")

        # Deduct recipe components from inventory stock (ORM attributes, not dicts)
        recipes = menu_item.recipes or []
        deducted_items = []
        for recipe in recipes:
            inv_id = recipe.inventory_item_id
            qty_per_unit = recipe.quantity_required or Decimal(0)
            waste_factor = recipe.waste_factor or Decimal(0)
            if not inv_id or qty_per_unit <= 0:
                continue
            total_qty = qty_per_unit * Decimal(str(quantity)) * (Decimal(1) + waste_factor)

            stock_result = await db.execute(
                select(InventoryStock).where(
                    InventoryStock.inventory_item_id == inv_id,
                    InventoryStock.store_id == store_id,
                ).with_for_update()
            )
            stock_row = stock_result.scalar_one_or_none()
            if stock_row:
                new_stock = max(Decimal(0), stock_row.current_stock - total_qty)
                stock_row.current_stock = new_stock
                stock_row.updated_at = now
                movement = InventoryMovementLog(
                    inventory_item_id=inv_id,
                    store_id=store_id,
                    movement_type="waste",
                    quantity_delta=-total_qty,
                    stock_after=new_stock,
                    reason=f"[Menu item waste: {menu_item.item_name}] {reason}",
                    image_urls=image_urls or None,
                )
                db.add(movement)
                deducted_items.append({"item_id": inv_id, "qty": total_qty})

        await db.commit()

        return APIResponse(data={
            "menu_item_id": menu_item_id,
            "menu_item_name": menu_item.item_name,
            "wasted_quantity": quantity,
            "reason": reason,
            "deducted_items": deducted_items,
            "image_urls": image_urls,
            "message": "Waste recorded for menu item",
        })

    raise HTTPException(status_code=400, detail="Either menu_item_id or inventory_item_id is required")
