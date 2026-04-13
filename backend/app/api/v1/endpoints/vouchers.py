from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.voucher import Voucher, UserVoucher
from app.schemas.voucher import VoucherValidate, VoucherApply

router = APIRouter(prefix="/vouchers", tags=["Vouchers"])


@router.get("/me")
async def my_vouchers(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserVoucher).where(UserVoucher.user_id == user.id).order_by(UserVoucher.applied_at.desc())
    )
    vouchers = []
    for uv in result.scalars().all():
        v_result = await db.execute(select(Voucher).where(Voucher.id == uv.voucher_id))
        v = v_result.scalar_one_or_none()
        if v:
            vouchers.append({"id": v.id, "code": v.code, "discount_type": v.discount_type, "discount_value": float(v.discount_value), "is_used": bool(uv.order_id)})
    return vouchers


@router.post("/validate")
async def validate_voucher(req: VoucherValidate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Voucher).where(Voucher.code == req.code, Voucher.is_active == True, Voucher.deleted_at.is_(None)))
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    now = datetime.now(timezone.utc)
    if voucher.valid_from and now < voucher.valid_from.replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=400, detail="Voucher not yet valid")
    if voucher.valid_until and now > voucher.valid_until.replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=400, detail="Voucher expired")
    if voucher.max_uses and voucher.used_count >= voucher.max_uses:
        raise HTTPException(status_code=400, detail="Voucher usage limit reached")
    if req.order_total and voucher.min_order and req.order_total < float(voucher.min_order):
        raise HTTPException(status_code=400, detail=f"Minimum order {voucher.min_order} required")
    discount = 0.0
    if voucher.discount_type == "percent":
        discount = (req.order_total or 0) * float(voucher.discount_value) / 100
    elif voucher.discount_type == "fixed":
        discount = float(voucher.discount_value)
    return {"valid": True, "discount_type": voucher.discount_type, "discount_value": float(voucher.discount_value), "discount": round(discount, 2)}


@router.post("/apply")
async def apply_voucher(req: VoucherApply, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Voucher).where(Voucher.code == req.code, Voucher.is_active == True, Voucher.deleted_at.is_(None)))
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    voucher.used_count += 1
    uv = UserVoucher(user_id=user.id, voucher_id=voucher.id, order_id=req.order_id)
    db.add(uv)
    await db.flush()
    return {"message": "Voucher applied", "discount_type": voucher.discount_type, "discount_value": float(voucher.discount_value)}
