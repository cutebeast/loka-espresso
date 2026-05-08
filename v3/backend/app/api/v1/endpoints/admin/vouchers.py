"""Admin and public voucher endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import ActiveCustomer, CurrentAdmin, DBDependency
from app.models.voucher import CustomerVoucher, VoucherDefinition
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.voucher import (
    CustomerVoucherOut,
    VoucherApplyRequest,
    VoucherDefinitionCreate,
    VoucherDefinitionOut,
    VoucherDefinitionUpdate,
)

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
    store_id: int | None = Query(None),
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List voucher definitions with filters."""
    base_stmt = select(VoucherDefinition).where(VoucherDefinition.deleted_at.is_(None))
    count_stmt = select(func.count(VoucherDefinition.id)).where(VoucherDefinition.deleted_at.is_(None))

    if store_id is not None:
        base_stmt = base_stmt.where(VoucherDefinition.store_id == store_id)
        count_stmt = count_stmt.where(VoucherDefinition.store_id == store_id)
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
    return APIResponse(data=VoucherDefinitionOut.model_validate(voucher))


@admin_router.delete("/{voucher_id}", response_model=APIResponse[dict])
async def delete_voucher(
    db: DBDependency,
    admin: CurrentAdmin,
    voucher_id: int,
):
    """Soft-delete a voucher definition."""
    voucher = await _get_voucher_or_404(db, voucher_id)

    voucher.deleted_at = datetime.now(timezone.utc)
    voucher.is_active = False
    await db.commit()
    return APIResponse(data={"id": voucher.id, "deleted": True})


@admin_router.get("/{voucher_id}/redemptions", response_model=APIResponse[PaginatedResponse[CustomerVoucherOut]])
async def list_voucher_redemptions(
    db: DBDependency,
    admin: CurrentAdmin,
    voucher_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
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
        .where(CustomerVoucher.voucher_definition_id == voucher_id)
        .order_by(CustomerVoucher.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [CustomerVoucherOut.model_validate(v) for v in result.scalars().all()]

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
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List current customer's vouchers."""
    count_stmt = select(func.count(CustomerVoucher.id)).where(CustomerVoucher.customer_id == customer.id)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        select(CustomerVoucher)
        .where(CustomerVoucher.customer_id == customer.id)
        .order_by(CustomerVoucher.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [CustomerVoucherOut.model_validate(v) for v in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@public_router.post("/apply", response_model=APIResponse[CustomerVoucherOut])
async def apply_voucher(
    customer: ActiveCustomer,
    db: DBDependency,
    data: VoucherApplyRequest,
):
    """Apply a voucher to an order."""
    result = await db.execute(
        select(CustomerVoucher).where(
            CustomerVoucher.customer_id == customer.id,
            CustomerVoucher.voucher_code == data.voucher_code,
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
    return APIResponse(data=CustomerVoucherOut.model_validate(voucher))
