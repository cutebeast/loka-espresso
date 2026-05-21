"""Admin inventory CRUD endpoints."""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.inventory import InventoryCategory, InventoryItem, Supplier
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.inventory import (
    InventoryCategoryCreate,
    InventoryCategoryOut,
    InventoryCategoryUpdate,
    InventoryItemCreate,
    InventoryItemOut,
    InventoryItemUpdate,
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

@router.get("/categories", response_model=APIResponse[list[InventoryCategoryOut]])
async def list_categories(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int = Query(...),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List inventory categories for a store."""
    total_result = await db.execute(
        select(func.count(InventoryCategory.id))
        .where(InventoryCategory.store_id == store_id, InventoryCategory.deleted_at.is_(None))
    )
    total = total_result.scalar() or 0
    result = await db.execute(
        select(InventoryCategory)
        .where(
            InventoryCategory.store_id == store_id,
            InventoryCategory.deleted_at.is_(None),
        )
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
    category_data["slug"] = _slugify(data.name)
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
    store_id: int = Query(...),
    category_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List inventory items for a store (optionally filtered by category)."""
    base_stmt = select(InventoryItem).where(
        InventoryItem.store_id == store_id,
        InventoryItem.deleted_at.is_(None),
    )
    if category_id is not None:
        base_stmt = base_stmt.where(InventoryItem.category_id == category_id)

    count_stmt = select(func.count(InventoryItem.id)).where(
        InventoryItem.store_id == store_id,
        InventoryItem.deleted_at.is_(None),
    )
    if category_id is not None:
        count_stmt = count_stmt.where(InventoryItem.category_id == category_id)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = result.scalars().all()

    return APIResponse(
        data=PaginatedResponse(
            items=[InventoryItemOut.model_validate(i) for i in items],
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
):
    """Get an inventory item by ID."""
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
    return APIResponse(data=InventoryItemOut.model_validate(item))


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
# Suppliers
# ---------------------------------------------------------------------------

@router.get("/suppliers", response_model=APIResponse[list[SupplierOut]])
async def list_suppliers(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
):
    """List suppliers for a store."""
    stmt = (
        select(Supplier)
        .where(Supplier.deleted_at.is_(None))
        .order_by(Supplier.supplier_name)
    )
    if store_id is not None:
        stmt = stmt.where(Supplier.store_id == store_id)
    result = await db.execute(stmt)
    suppliers = result.scalars().all()
    return APIResponse(
        data=[SupplierOut.model_validate(s) for s in suppliers]
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
