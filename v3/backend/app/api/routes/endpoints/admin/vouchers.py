"""Admin and public voucher endpoints."""

from datetime import datetime, timezone
from decimal import Decimal

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
    VoucherValidateRequest,
    VoucherValidateResponse,
)
from app.services.translation import auto_translate_record, delete_translations
from app.core.money import money_round, to_decimal
from app.services.platform_config import PlatformConfigService
from app.models.loyalty import LoyaltyAccount

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
    item["discount_value"] = str(vd.discount_value) if vd else None
    item["min_spend"] = str(vd.minimum_order_value) if vd else None
    item["max_discount"] = str(vd.discount_max_amount) if vd and vd.discount_max_amount is not None else None
    item["voucher_title"] = vd.display_title if vd else None
    item["voucher_image_url"] = vd.image_url if vd else None
    return APIResponse(data=item)


@public_router.post("/validate", response_model=APIResponse[VoucherValidateResponse])
async def validate_voucher(
    request: Request,
    db: DBDependency,
    data: VoucherValidateRequest,
):
    """Validate a voucher code and return discount details.

    Public endpoint — does not require authentication. If a customer token
    is present, voucher ownership and tier requirements are checked.
    If no customer token, only basic validation is performed.
    """
    # Try to extract customer from token (optional)
    customer_id = None
    from app.core.security import decode_token
    token = None
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    elif request.cookies.get("access_token"):
        token = request.cookies.get("access_token")

    if token:
        try:
            payload = decode_token(token)
            if payload and payload.get("type") == "access" and payload.get("customer_id"):
                customer_id = int(payload["customer_id"])
        except Exception:
            pass

    # Build query — filter by code, optionally by customer
    stmt = (
        select(CustomerVoucher)
        .options(selectinload(CustomerVoucher.voucher_definition))
        .where(CustomerVoucher.voucher_code == data.voucher_code)
    )
    if customer_id:
        stmt = stmt.where(CustomerVoucher.customer_id == customer_id)

    voucher_result = await db.execute(stmt)
    cv = voucher_result.scalar_one_or_none()
    if cv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voucher not found")

    if cv.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Voucher is {cv.status}")

    now = datetime.now(timezone.utc)
    if cv.expires_at and cv.expires_at < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voucher has expired")

    vd = cv.voucher_definition
    if vd is None or not vd.is_active or vd.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voucher is no longer active")
    if vd.valid_from and vd.valid_from > now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voucher is not yet valid")
    if vd.valid_until and vd.valid_until < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voucher has expired")

    if vd.minimum_tier_id and customer_id:
        loyalty_result = await db.execute(
            select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer_id)
        )
        loyalty = loyalty_result.scalar_one_or_none()
        tier_id = loyalty.current_tier_id if loyalty else None
        if tier_id is None or tier_id < vd.minimum_tier_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Your loyalty tier is not eligible for this voucher",
            )

    order_total = to_decimal(data.order_total or 0)
    min_spend = to_decimal(vd.minimum_order_value)
    if order_total > 0 and order_total < min_spend:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Voucher requires minimum order of {min_spend:.2f}",
        )

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    discount_value = to_decimal(vd.discount_value)
    max_discount = to_decimal(vd.discount_max_amount) if vd.discount_max_amount is not None else None
    calculated_discount = Decimal(0)

    if vd.voucher_type == "percentage_off":
        pct = discount_value / Decimal(100)
        calculated_discount = money_round(order_total * pct, precision, rounding_mode)
        if max_discount is not None:
            calculated_discount = min(calculated_discount, max_discount)
    elif vd.voucher_type == "fixed_amount_off":
        calculated_discount = min(discount_value, order_total)
    elif vd.voucher_type == "free_delivery":
        # Free delivery discount is unknown without delivery fee; report the value as 0
        calculated_discount = Decimal(0)
    elif vd.voucher_type == "free_item":
        # Free item requires cart contents; report 0 and let order creation compute it
        calculated_discount = Decimal(0)

    return APIResponse(
        data=VoucherValidateResponse(
            voucher_code=cv.voucher_code,
            valid=True,
            discount_type=vd.voucher_type,
            discount_value=discount_value,
            max_discount=max_discount,
            min_spend=min_spend,
            calculated_discount=calculated_discount,
            display_title=vd.display_title,
            message="Voucher is valid",
        )
    )


@public_router.get("/me", response_model=APIResponse[PaginatedResponse[CustomerVoucherOut]])
async def list_my_vouchers(
    customer: ActiveCustomer,
    db: DBDependency,
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

    items = [CustomerVoucherOut.model_validate(v) for v in vouchers]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page if per_page else 0,
        )
    )
