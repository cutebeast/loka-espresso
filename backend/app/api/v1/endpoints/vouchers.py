"""PWA Voucher endpoints.

- GET /vouchers/me        — customer's voucher wallet (auth)
- POST /vouchers/validate — validate a code before checkout (auth)
- POST /vouchers/use/{code} — use voucher at checkout (auth or staff)
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.voucher import Voucher, UserVoucher

router = APIRouter(prefix="/vouchers", tags=["PWA Vouchers"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class VoucherWalletOut(BaseModel):
    """Voucher instance in customer's wallet."""
    id: int
    voucher_id: int
    code: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    min_spend: Optional[float] = None
    status: Optional[str] = "available"
    source: Optional[str] = None
    expires_at: Optional[datetime] = None
    voucher_title: Optional[str] = None
    voucher_image_url: Optional[str] = None

    class Config:
        from_attributes = True


class ValidateResult(BaseModel):
    valid: bool
    message: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    discount: Optional[float] = None
    min_spend: Optional[float] = None


class UseResult(BaseModel):
    success: bool
    message: str
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    discount: Optional[float] = None


class ValidateRequest(BaseModel):
    code: str
    order_total: Optional[float] = None


class UseRequest(BaseModel):
    order_id: Optional[int] = None
    store_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/me", response_model=List[VoucherWalletOut])
async def my_vouchers(
    user: User = Depends(require_role(UserRole.customer, UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    """Get all vouchers for the current customer (available + used + expired)."""
    now = datetime.now(timezone.utc)
    uv_result = await db.execute(
        select(UserVoucher, Voucher)
        .join(Voucher, UserVoucher.voucher_id == Voucher.id, isouter=True)
        .where(UserVoucher.user_id == user.id)
        .order_by(UserVoucher.expires_at.asc())
    )
    rows = uv_result.all()
    out = []
    for uv, v in rows:
        out.append(VoucherWalletOut(
            id=uv.id,
            voucher_id=uv.voucher_id,
            code=uv.code,
            discount_type=uv.discount_type or (v.discount_type.value if v and hasattr(v.discount_type, 'value') else None),
            discount_value=float(uv.discount_value) if uv.discount_value else (float(v.discount_value) if v and v.discount_value else None),
            min_spend=float(uv.min_spend) if uv.min_spend else (float(v.min_order) if v and v.min_order else None),
            status=uv.status,
            source=uv.source,
            expires_at=uv.expires_at,
            voucher_title=v.title if v else None,
            voucher_image_url=v.image_url if v else None,
        ))
    return out


@router.post("/validate", response_model=ValidateResult)
async def validate_voucher(
    req: ValidateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Validate a voucher instance code before checkout.
    
    Accepts per-instance code (e.g. WELCOME10-A3F2B1) or catalog code (e.g. WELCOME10).
    """
    now = datetime.now(timezone.utc)

    # Try per-instance code first
    uv_result = await db.execute(
        select(UserVoucher).where(
            UserVoucher.code == req.code,
            UserVoucher.user_id == user.id,
        )
    )
    uv = uv_result.scalar_one_or_none()

    if uv:
        # Validate instance
        if uv.status != "available":
            return ValidateResult(valid=False, message=f"Voucher is {uv.status}")
        if uv.expires_at and uv.expires_at < now:
            return ValidateResult(valid=False, message="Voucher has expired")

        discount_type = uv.discount_type
        discount_value = float(uv.discount_value) if uv.discount_value else 0
        min_spend = float(uv.min_spend) if uv.min_spend else 0

        if req.order_total and min_spend and req.order_total < min_spend:
            return ValidateResult(valid=False, message=f"Minimum spend RM{min_spend:.0f} required")

        discount = 0.0
        if discount_type == "percent" and req.order_total:
            discount = req.order_total * discount_value / 100
        elif discount_type == "fixed":
            discount = discount_value

        return ValidateResult(
            valid=True,
            discount_type=discount_type,
            discount_value=discount_value,
            discount=round(discount, 2),
            min_spend=min_spend if min_spend else None,
        )

    # Fallback: try catalog code (legacy)
    v_result = await db.execute(
        select(Voucher).where(
            Voucher.code == req.code,
            Voucher.is_active == True,
            Voucher.deleted_at.is_(None),
        )
    )
    voucher = v_result.scalar_one_or_none()
    if not voucher:
        return ValidateResult(valid=False, message="Voucher not found")

    if voucher.valid_from and voucher.valid_from > now:
        return ValidateResult(valid=False, message="Voucher not yet valid")
    if voucher.valid_until and voucher.valid_until < now:
        return ValidateResult(valid=False, message="Voucher has expired")
    if voucher.max_uses and voucher.used_count >= voucher.max_uses:
        return ValidateResult(valid=False, message="Voucher usage limit reached")

    discount_value = float(voucher.discount_value)
    min_spend = float(voucher.min_order) if voucher.min_order else 0
    if req.order_total and min_spend and req.order_total < min_spend:
        return ValidateResult(valid=False, message=f"Minimum spend RM{min_spend:.0f} required")

    discount = 0.0
    discount_type = voucher.discount_type.value if hasattr(voucher.discount_type, 'value') else str(voucher.discount_type)
    if discount_type == "percent" and req.order_total:
        discount = req.order_total * discount_value / 100
    elif discount_type == "fixed":
        discount = discount_value

    return ValidateResult(
        valid=True,
        discount_type=discount_type,
        discount_value=discount_value,
        discount=round(discount, 2),
        min_spend=min_spend if min_spend else None,
    )


@router.post("/use/{code}", response_model=UseResult)
async def use_voucher(
    code: str,
    req: UseRequest,
    user: User = Depends(require_role(UserRole.customer, UserRole.admin, UserRole.store_owner)),
    db: AsyncSession = Depends(get_db),
):
    """
    Use/consume a voucher instance at checkout.
    
    Barista/cashier scans the per-instance code (e.g. WELCOME10-A3F2B1).
    Sets status='used', used_at=now, links order_id if provided.
    Also increments voucher catalog used_count.
    """
    now = datetime.now(timezone.utc)

    # Find instance by code
    uv_result = await db.execute(
        select(UserVoucher).where(UserVoucher.code == code)
    )
    uv = uv_result.scalar_one_or_none()
    if not uv:
        raise HTTPException(404, "Voucher code not found")

    if uv.status != "available":
        raise HTTPException(400, f"Voucher is already {uv.status}")

    if uv.expires_at and uv.expires_at < now:
        raise HTTPException(400, "Voucher has expired")

    # Mark used
    uv.status = "used"
    uv.used_at = now
    uv.is_used = True
    if req.order_id:
        uv.order_id = req.order_id
    if req.store_id:
        uv.store_id = req.store_id

    # Increment catalog used_count
    v_result = await db.execute(select(Voucher).where(Voucher.id == uv.voucher_id))
    voucher = v_result.scalar_one_or_none()
    if voucher:
        voucher.used_count += 1

    # Compute discount for response
    discount_type = uv.discount_type or (voucher.discount_type.value if voucher and hasattr(voucher.discount_type, 'value') else None)
    discount_value = float(uv.discount_value) if uv.discount_value else (float(voucher.discount_value) if voucher else 0)

    await db.commit()

    return UseResult(
        success=True,
        message="Voucher applied successfully",
        discount_type=discount_type,
        discount_value=discount_value,
    )
