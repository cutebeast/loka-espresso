"""Admin inventory CRUD endpoints."""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.inventory import InventoryCategory, InventoryItem, InventoryStock, Supplier
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.inventory import (
    InventoryCategoryCreate,
    InventoryCategoryOut,
    InventoryCategoryUpdate,
    InventoryItemCreate,
    InventoryItemOut,
    InventoryItemUpdate,
    InventoryStockCreate,
    InventoryStockOut,
    InventoryStockUpdate,
    SupplierCreate,
    SupplierOut,
    SupplierUpdate,
)
from app.services.translation import auto_translate_record, delete_translations

router = APIRouter(prefix="/admin/inventory", tags=["admin — inventory"])


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


# ---------------------------------------------------------------------------
# Inventory Categories
# ---------------------------------------------------------------------------

@router.get("/categories", response_model=APIResponse[PaginatedResponse[InventoryCategoryOut]])
async def list_categories(
    db: DBDependency,
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List global inventory categories."""
    total_result = await db.execute(
        select(func.count(InventoryCategory.id))
        .where(InventoryCategory.deleted_at.is_(None))
    )
    total = total_result.scalar() or 0
    result = await db.execute(
        select(InventoryCategory)
        .where(InventoryCategory.deleted_at.is_(None))
        .order_by(InventoryCategory.display_order)
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    categories = result.scalars().all()
    return APIResponse(
        data=PaginatedResponse(
            items=[InventoryCategoryOut.model_validate(c) for c in categories],
            total=total, page=page, per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.post(
    "/categories",
    response_model=APIResponse[InventoryCategoryOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_category(
    db: DBDependency,
    admin: CurrentAdmin,
    data: InventoryCategoryCreate,
):
    """Create a new inventory category."""
    category_data = data.model_dump(by_alias=True)
    category_data["slug"] = _slugify(data.category_name)
    category = InventoryCategory(**category_data)
    db.add(category)
    await db.commit()
    await auto_translate_record(db, "inventory_categories", category.id, {"category_name": category.category_name or "", "description": category.description or ""})
    await db.refresh(category)
    return APIResponse(data=InventoryCategoryOut.model_validate(category))


@router.get("/categories/{id}", response_model=APIResponse[InventoryCategoryOut])
async def get_category(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(InventoryCategory).where(InventoryCategory.id == id, InventoryCategory.deleted_at.is_(None)))
    category = result.scalar_one_or_none()
    if not category: raise HTTPException(404, "Category not found")
    return APIResponse(data=InventoryCategoryOut.model_validate(category))


@router.patch("/categories/{id}", response_model=APIResponse[InventoryCategoryOut])
async def update_category(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: InventoryCategoryUpdate,
):
    """Update an inventory category."""
    result = await db.execute(
        select(InventoryCategory).where(
            InventoryCategory.id == id,
            InventoryCategory.deleted_at.is_(None),
        )
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
        )

    update_data = data.model_dump(
        by_alias=True, exclude_unset=True
    )
    if "category_name" in update_data:
        update_data["slug"] = _slugify(update_data["category_name"])
    for key, value in update_data.items():
        setattr(category, key, value)

    await db.commit()
    await auto_translate_record(db, "inventory_categories", category.id, {"category_name": category.category_name or "", "description": category.description or ""})
    await db.refresh(category)
    return APIResponse(data=InventoryCategoryOut.model_validate(category))


@router.delete("/categories/{id}", response_model=APIResponse[dict])
async def delete_category(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Soft-delete an inventory category."""
    result = await db.execute(
        select(InventoryCategory).where(
            InventoryCategory.id == id,
            InventoryCategory.deleted_at.is_(None),
        )
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
        )

    category.is_active = False
    category.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    await delete_translations(db, "inventory_categories", id)
    return APIResponse(data={"id": category.id, "deleted": True})


# ---------------------------------------------------------------------------
# Inventory Items
# ---------------------------------------------------------------------------

@router.get("/items", response_model=APIResponse[PaginatedResponse[InventoryItemOut]])
async def list_items(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    category_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List global inventory items (optionally filtered by category, with stock for a store)."""
    base_stmt = select(InventoryItem).where(
        InventoryItem.deleted_at.is_(None),
    )
    if category_id is not None:
        base_stmt = base_stmt.where(InventoryItem.category_id == category_id)

    count_stmt = select(func.count(InventoryItem.id)).where(
        InventoryItem.deleted_at.is_(None),
    )
    if category_id is not None:
        count_stmt = count_stmt.where(InventoryItem.category_id == category_id)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = result.scalars().all()

    item_ids = [i.id for i in items]
    stock_by_item: dict[int, InventoryStock | None] = {}
    if store_id is not None and item_ids:
        stock_result = await db.execute(
            select(InventoryStock).where(
                InventoryStock.inventory_item_id.in_(item_ids),
                InventoryStock.store_id == store_id,
            )
        )
        for s in stock_result.scalars().all():
            stock_by_item[s.inventory_item_id] = s

    return APIResponse(
        data=PaginatedResponse(
            items=[
                InventoryItemOut.model_validate(i).model_copy(
                    update={"stock": InventoryStockOut.model_validate(stock_by_item[i.id]) if i.id in stock_by_item else None}
                )
                for i in items
            ],
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.post(
    "/items",
    response_model=APIResponse[InventoryItemOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_item(
    db: DBDependency,
    admin: CurrentAdmin,
    data: InventoryItemCreate,
):
    """Create a new inventory item."""
    item = InventoryItem(**data.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    await auto_translate_record(db, "inventory_items", item.id, {"item_name": item.item_name, "description": item.description or ""})
    return APIResponse(data=InventoryItemOut.model_validate(item))


@router.get("/items/{id}", response_model=APIResponse[InventoryItemOut])
async def get_item(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    store_id: int | None = Query(None),
):
    """Get an inventory item by ID (optionally with stock for a store)."""
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == id,
            InventoryItem.deleted_at.is_(None),
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found"
        )

    stock_out = None
    if store_id is not None:
        stock_result = await db.execute(
            select(InventoryStock).where(
                InventoryStock.inventory_item_id == id,
                InventoryStock.store_id == store_id,
            )
        )
        stock = stock_result.scalar_one_or_none()
        if stock:
            stock_out = InventoryStockOut.model_validate(stock)

    item_out = InventoryItemOut.model_validate(item)
    if stock_out:
        item_out = item_out.model_copy(update={"stock": stock_out})

    return APIResponse(data=item_out)


@router.patch("/items/{id}", response_model=APIResponse[InventoryItemOut])
async def update_item(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: InventoryItemUpdate,
):
    """Update an inventory item."""
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == id,
            InventoryItem.deleted_at.is_(None),
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found"
        )

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)

    await db.commit()
    await db.refresh(item)
    await auto_translate_record(db, "inventory_items", item.id, {"item_name": item.item_name, "description": item.description or ""})
    return APIResponse(data=InventoryItemOut.model_validate(item))


@router.delete("/items/{id}", response_model=APIResponse[dict])
async def delete_item(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Soft-delete an inventory item."""
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == id,
            InventoryItem.deleted_at.is_(None),
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found"
        )

    item.is_active = False
    item.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    await delete_translations(db, "inventory_items", id)
    return APIResponse(data={"id": item.id, "deleted": True})


# ---------------------------------------------------------------------------
# Inventory Stock (per-store stock levels for global items)
# ---------------------------------------------------------------------------

@router.get("/stocks", response_model=APIResponse[PaginatedResponse[InventoryStockOut]])
async def list_stocks(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int = Query(...),
    inventory_item_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List per-store stock levels, filterable by store and item."""
    base_stmt = select(InventoryStock).where(
        InventoryStock.store_id == store_id,
    )
    if inventory_item_id is not None:
        base_stmt = base_stmt.where(InventoryStock.inventory_item_id == inventory_item_id)

    total_result = await db.execute(
        select(func.count(InventoryStock.id)).where(
            InventoryStock.store_id == store_id,
        ).where(
            InventoryStock.inventory_item_id == inventory_item_id
        ) if inventory_item_id is not None else
        select(func.count(InventoryStock.id)).where(
            InventoryStock.store_id == store_id,
        )
    )
    total = total_result.scalar() or 0

    result = await db.execute(
        base_stmt.offset((page - 1) * per_page).limit(per_page)
    )
    stocks = result.scalars().all()

    return APIResponse(
        data=PaginatedResponse(
            items=[InventoryStockOut.model_validate(s) for s in stocks],
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.post(
    "/stocks",
    response_model=APIResponse[InventoryStockOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_stock(
    db: DBDependency,
    admin: CurrentAdmin,
    data: InventoryStockCreate,
):
    """Create per-store stock levels for a global inventory item."""
    existing = await db.execute(
        select(InventoryStock).where(
            InventoryStock.inventory_item_id == data.inventory_item_id,
            InventoryStock.store_id == data.store_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stock record already exists for this item and store",
        )

    stock = InventoryStock(**data.model_dump())
    db.add(stock)
    await db.commit()
    await db.refresh(stock)
    return APIResponse(data=InventoryStockOut.model_validate(stock))


@router.get("/stocks/{id}", response_model=APIResponse[InventoryStockOut])
async def get_stock(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(InventoryStock).where(InventoryStock.id == id))
    stock = result.scalar_one_or_none()
    if not stock:
        raise HTTPException(404, "Stock record not found")
    return APIResponse(data=InventoryStockOut.model_validate(stock))


@router.patch("/stocks/{id}", response_model=APIResponse[InventoryStockOut])
async def update_stock(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: InventoryStockUpdate,
):
    """Update per-store stock levels (current_stock, reorder_level, etc)."""
    result = await db.execute(select(InventoryStock).where(InventoryStock.id == id))
    stock = result.scalar_one_or_none()
    if stock is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Stock record not found"
        )

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(stock, key, value)

    await db.commit()
    await db.refresh(stock)
    return APIResponse(data=InventoryStockOut.model_validate(stock))


@router.delete("/stocks/{id}", response_model=APIResponse[dict])
async def delete_stock(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Hard-delete a stock record (removes per-store stock for an item)."""
    result = await db.execute(select(InventoryStock).where(InventoryStock.id == id))
    stock = result.scalar_one_or_none()
    if stock is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Stock record not found"
        )

    await db.delete(stock)
    await db.commit()
    return APIResponse(data={"id": id, "deleted": True})


# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------

@router.get("/suppliers", response_model=APIResponse[PaginatedResponse[SupplierOut]])
async def list_suppliers(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List suppliers for a store."""
    count_stmt = select(func.count(Supplier.id)).where(Supplier.deleted_at.is_(None))
    stmt = (
        select(Supplier)
        .where(Supplier.deleted_at.is_(None))
        .order_by(Supplier.supplier_name)
    )
    if store_id is not None:
        count_stmt = count_stmt.where(Supplier.store_id == store_id)
        stmt = stmt.where(Supplier.store_id == store_id)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    result = await db.execute(stmt.offset((page - 1) * per_page).limit(per_page))
    suppliers = result.scalars().all()
    return APIResponse(
        data=PaginatedResponse(
            items=[SupplierOut.model_validate(s) for s in suppliers],
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.post(
    "/suppliers",
    response_model=APIResponse[SupplierOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_supplier(
    db: DBDependency,
    admin: CurrentAdmin,
    data: SupplierCreate,
):
    """Create a new supplier."""
    supplier_data = data.model_dump()
    field_map = {"phone_number": "phone", "email_address": "email"}
    mapped = {field_map.get(k, k): v for k, v in supplier_data.items()}
    supplier = Supplier(**mapped)
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return APIResponse(data=SupplierOut.model_validate(supplier))


@router.get("/suppliers/{id}", response_model=APIResponse[SupplierOut])
async def get_supplier(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(Supplier).where(Supplier.id == id, Supplier.deleted_at.is_(None)))
    supplier = result.scalar_one_or_none()
    if not supplier: raise HTTPException(404, "Supplier not found")
    return APIResponse(data=SupplierOut.model_validate(supplier))


@router.patch("/suppliers/{id}", response_model=APIResponse[SupplierOut])
async def update_supplier(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: SupplierUpdate,
):
    """Update a supplier."""
    result = await db.execute(
        select(Supplier).where(
            Supplier.id == id,
            Supplier.deleted_at.is_(None),
        )
    )
    supplier = result.scalar_one_or_none()
    if supplier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found"
        )

    update_data = data.model_dump(exclude_unset=True)
    field_map = {"phone_number": "phone", "email_address": "email"}
    mapped = {field_map.get(k, k): v for k, v in update_data.items()}
    for key, value in mapped.items():
        setattr(supplier, key, value)

    await db.commit()
    await db.refresh(supplier)
    return APIResponse(data=SupplierOut.model_validate(supplier))


@router.delete("/suppliers/{id}", response_model=APIResponse[dict])
async def delete_supplier(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Soft-delete a supplier."""
    result = await db.execute(
        select(Supplier).where(
            Supplier.id == id,
            Supplier.deleted_at.is_(None),
        )
    )
    supplier = result.scalar_one_or_none()
    if supplier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found"
        )

    supplier.is_active = False
    supplier.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse(data={"id": supplier.id, "deleted": True})
