"""Admin and public voucher endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.routes.deps import ActiveCustomer, CurrentAdmin, DBDependency, OptionalLocale
from app.services.translation import merge_translations, translate_single
from app.models.voucher import CustomerVoucher, VoucherDefinition
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.voucher import (
    CustomerVoucherOut,
    VoucherApplyRequest,
    VoucherDefinitionCreate,
    VoucherDefinitionOut,
    VoucherDefinitionUpdate,
)
from app.services.translation import auto_translate_record, delete_translations

admin_router = APIRouter(prefix="/admin/vouchers", tags=["admin — vouchers"])
public_router = APIRouter(prefix="/vouchers", tags=["vouchers"])


async def _get_voucher_or_404(db, voucher_id: int) -> VoucherDefinition:
    result = await db.execute(
        select(VoucherDefinition).where(
            VoucherDefinition.id == voucher_id,
            VoucherDefinition.deleted_at.is_(None),
        )
    )
    voucher = result.scalar_one_or_none()
    if voucher is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    return voucher


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@admin_router.get("", response_model=APIResponse[PaginatedResponse[VoucherDefinitionOut]])
async def list_vouchers(
    db: DBDependency,
    admin: CurrentAdmin,
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List voucher definitions with filters."""
    base_stmt = select(VoucherDefinition).where(VoucherDefinition.deleted_at.is_(None))
    count_stmt = select(func.count(VoucherDefinition.id)).where(VoucherDefinition.deleted_at.is_(None))

    if is_active is not None:
        base_stmt = base_stmt.where(VoucherDefinition.is_active.is_(is_active))
        count_stmt = count_stmt.where(VoucherDefinition.is_active.is_(is_active))

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(VoucherDefinition.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = [VoucherDefinitionOut.model_validate(v) for v in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@admin_router.post("", response_model=APIResponse[VoucherDefinitionOut], status_code=status.HTTP_201_CREATED)
async def create_voucher(
    db: DBDependency,
    admin: CurrentAdmin,
    data: VoucherDefinitionCreate,
):
    """Create a new voucher definition."""
    voucher = VoucherDefinition(**data.model_dump(), created_by=admin.id)
    db.add(voucher)
    await db.commit()
    await db.refresh(voucher)
    await auto_translate_record(db, "voucher_definitions", voucher.id, {
        "display_title": voucher.display_title,
        "description": voucher.description or "",
        "short_description": voucher.short_description or "",
        "long_description": voucher.long_description or "",
    })
    return APIResponse(data=VoucherDefinitionOut.model_validate(voucher))


@admin_router.get("/{voucher_id}", response_model=APIResponse[VoucherDefinitionOut])
async def get_voucher(
    db: DBDependency,
    admin: CurrentAdmin,
    voucher_id: int,
):
    """Get voucher definition detail."""
    voucher = await _get_voucher_or_404(db, voucher_id)
    return APIResponse(data=VoucherDefinitionOut.model_validate(voucher))


@admin_router.put("/{voucher_id}", response_model=APIResponse[VoucherDefinitionOut])
async def update_voucher(
    db: DBDependency,
    admin: CurrentAdmin,
    voucher_id: int,
    data: VoucherDefinitionUpdate,
):
    """Update a voucher definition."""
    voucher = await _get_voucher_or_404(db, voucher_id)

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(voucher, field, value)

    voucher.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(voucher)
    await auto_translate_record(db, "voucher_definitions", voucher.id, {
        "display_title": voucher.display_title,
        "description": voucher.description or "",
        "short_description": voucher.short_description or "",
        "long_description": voucher.long_description or "",
    })
    return APIResponse(data=VoucherDefinitionOut.model_validate(voucher))


@admin_router.delete("/{voucher_id}", response_model=APIResponse[dict])
async def delete_voucher(
    db: DBDependency,
    admin: CurrentAdmin,
    voucher_id: int,
):
    """Soft-delete a voucher definition."""
    voucher = await _get_voucher_or_404(db, voucher_id)

    voucher.is_active = False
    voucher.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    await delete_translations(db, "voucher_definitions", voucher.id)
    return APIResponse(data={"id": voucher.id, "deleted": True})


@admin_router.get("/{voucher_id}/redemptions", response_model=APIResponse[PaginatedResponse[CustomerVoucherOut]])
async def list_voucher_redemptions(
    db: DBDependency,
    admin: CurrentAdmin,
    voucher_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List customer redemptions for a voucher."""
    await _get_voucher_or_404(db, voucher_id)

    count_stmt = select(func.count(CustomerVoucher.id)).where(
        CustomerVoucher.voucher_definition_id == voucher_id
    )
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        select(CustomerVoucher)
        .options(selectinload(CustomerVoucher.voucher_definition))
        .where(CustomerVoucher.voucher_definition_id == voucher_id)
        .order_by(CustomerVoucher.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    vouchers = result.unique().scalars().all()

    items = []
    for v in vouchers:
        item = CustomerVoucherOut.model_validate(v).model_dump()
        vd = v.voucher_definition
        item["discount_type"] = vd.voucher_type if vd else None
        item["discount_value"] = float(vd.discount_value) if vd else None
        item["min_spend"] = float(vd.minimum_order_value) if vd else None
        item["max_discount"] = float(vd.maximum_discount) if vd and vd.maximum_discount is not None else None
        item["voucher_title"] = vd.display_title if vd else None
        item["voucher_image_url"] = vd.image_url if vd else None
        items.append(item)

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------

@public_router.get("/me", response_model=APIResponse[PaginatedResponse[CustomerVoucherOut]])
async def list_my_vouchers(
    customer: ActiveCustomer,
    db: DBDependency,
    locale: OptionalLocale,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List current customer's vouchers."""
    count_stmt = select(func.count(CustomerVoucher.id)).where(CustomerVoucher.customer_id == customer.id)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        select(CustomerVoucher)
        .options(selectinload(CustomerVoucher.voucher_definition))
        .where(CustomerVoucher.customer_id == customer.id)
        .order_by(CustomerVoucher.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    vouchers = result.unique().scalars().all()

    items = []
    vd_ids = []
    for v in vouchers:
        item = CustomerVoucherOut.model_validate(v).model_dump()
        vd = v.voucher_definition
        item["discount_type"] = vd.voucher_type if vd else None
        item["discount_value"] = float(vd.discount_value) if vd else None
        item["min_spend"] = float(vd.minimum_order_value) if vd else None
        item["max_discount"] = float(vd.maximum_discount) if vd and vd.maximum_discount is not None else None
        item["voucher_title"] = vd.display_title if vd else None
        item["voucher_image_url"] = vd.image_url if vd else None
        if vd:
            vd_ids.append(vd.id)
            item["_vd_id"] = vd.id
        items.append(item)

    # Translate voucher definitions
    if vd_ids:
        vd_dicts = []
        for item in items:
            if item.get("_vd_id"):
                vd_dicts.append({
                    "id": item["_vd_id"],
                    "display_title": item.get("voucher_title") or "",
                    "description": "",
                    "short_description": "",
                    "long_description": "",
                })
        await merge_translations(db, vd_dicts, "voucher_definitions", locale)
        # Apply translated titles back
        vd_lookup = {d["id"]: d for d in vd_dicts}
        for item in items:
            vd_id = item.pop("_vd_id", None)
            if vd_id and vd_id in vd_lookup and vd_lookup[vd_id].get("display_title"):
                item["voucher_title"] = vd_lookup[vd_id]["display_title"]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@public_router.post("/validate", response_model=APIResponse[dict])
async def validate_voucher(
    customer: ActiveCustomer,
    db: DBDependency,
    request: Request,
):
    """Validate a voucher code and return discount preview without consuming it."""
    body = await request.json()
    voucher_code = body.get("voucher_code", "").strip()
    order_total = float(body.get("order_total", 0) or 100.0)
    if not voucher_code:
        raise HTTPException(status_code=400, detail="voucher_code is required")

    result = await db.execute(
        select(CustomerVoucher, VoucherDefinition)
        .join(VoucherDefinition, CustomerVoucher.voucher_definition_id == VoucherDefinition.id)
        .where(
            CustomerVoucher.voucher_code == voucher_code,
            CustomerVoucher.customer_id == customer.id,
            CustomerVoucher.status == "active",
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Voucher not found or not active")
    cv, vd = row

    now = datetime.now(timezone.utc)
    if cv.expires_at and cv.expires_at < now:
        raise HTTPException(status_code=400, detail="Voucher has expired")
    if vd.valid_from and vd.valid_from > now:
        raise HTTPException(status_code=400, detail="Voucher is not yet valid")
    if vd.valid_until and vd.valid_until < now:
        raise HTTPException(status_code=400, detail="Voucher has expired")

    min_spend = float(vd.minimum_order_value or 0)
    if order_total < min_spend:
        raise HTTPException(status_code=400, detail=f"Minimum spend RM {min_spend:.2f} required")

    if vd.voucher_type == "percentage_off":
        discount = round(order_total * (float(vd.discount_value) / 100), 2)
        if vd.discount_max_amount:
            discount = min(discount, float(vd.discount_max_amount))
    elif vd.voucher_type == "fixed_amount_off":
        discount = float(vd.discount_value)
    elif vd.voucher_type == "free_delivery":
        discount = 5.0
    elif vd.voucher_type == "free_item":
        discount = order_total * 0.2
    else:
        discount = 0.0

    return APIResponse(data={
        "valid": True,
        "voucher_code": voucher_code,
        "discount_type": vd.voucher_type,
        "discount_value": discount,
        "display_title": vd.display_title,
        "minimum_order_value": float(vd.minimum_order_value or 0),
    })


@public_router.post("/apply", response_model=APIResponse[CustomerVoucherOut])
async def apply_voucher(
    customer: ActiveCustomer,
    db: DBDependency,
    data: VoucherApplyRequest,
):
    """Apply a voucher to an order."""
    result = await db.execute(
        select(CustomerVoucher)
        .options(selectinload(CustomerVoucher.voucher_definition))
        .where(
            CustomerVoucher.voucher_code == data.voucher_code,
            CustomerVoucher.customer_id == customer.id,
            CustomerVoucher.status == "active",
        )
    )
    voucher = result.scalar_one_or_none()
    if voucher is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voucher not found or inactive")

    # Reserve / mark as used
    voucher.status = "used"
    voucher.used_at = datetime.now(timezone.utc)
    if data.order_id is not None:
        voucher.order_id = data.order_id
    voucher.use_count += 1

    await db.commit()
    await db.refresh(voucher)

    vd = voucher.voucher_definition
    item = CustomerVoucherOut.model_validate(voucher).model_dump()
    item["discount_type"] = vd.voucher_type if vd else None
    item["discount_value"] = float(vd.discount_value) if vd else None
    item["min_spend"] = float(vd.minimum_order_value) if vd else None
    item["max_discount"] = float(vd.maximum_discount) if vd and vd.maximum_discount is not None else None
    item["voucher_title"] = vd.display_title if vd else None
    item["voucher_image_url"] = vd.image_url if vd else None
    return APIResponse(data=item)
