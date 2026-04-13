from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import require_role
from app.models.user import User
from app.models.voucher import Voucher, UserVoucher
from app.models.user import User as UserModel
from app.schemas.voucher import VoucherOut, VoucherCreate, VoucherUpdate

router = APIRouter(prefix="/admin/vouchers", tags=["Admin Vouchers"])


@router.get("", response_model=list[VoucherOut])
async def list_vouchers_admin(user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Voucher).order_by(Voucher.created_at.desc()))
    return result.scalars().all()


@router.post("", status_code=201)
async def create_voucher(req: VoucherCreate, user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    voucher = Voucher(**req.model_dump())
    db.add(voucher)
    await db.flush()
    return {"id": voucher.id, "code": voucher.code, "discount_type": voucher.discount_type, "discount_value": float(voucher.discount_value)}


@router.put("/{voucher_id}")
async def update_voucher(voucher_id: int, req: VoucherUpdate, user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Voucher).where(Voucher.id == voucher_id))
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(voucher, k, v)
    await db.flush()
    return {"message": "Voucher updated"}


@router.delete("/{voucher_id}")
async def deactivate_voucher(voucher_id: int, user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Voucher).where(Voucher.id == voucher_id))
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    voucher.is_active = False
    await db.flush()
    return {"message": "Voucher deactivated"}


@router.get("/{voucher_id}/usage")
async def voucher_usage(voucher_id: int, user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserVoucher).where(UserVoucher.voucher_id == voucher_id))
    usages = result.scalars().all()
    out = []
    for uv in usages:
        user_result = await db.execute(select(UserModel).where(UserModel.id == uv.user_id))
        u = user_result.scalar_one_or_none()
        out.append({"user_id": uv.user_id, "user_name": u.name if u else "Unknown", "applied_at": uv.applied_at.isoformat() if uv.applied_at else None, "order_id": uv.order_id, "store_id": uv.store_id})
    return out
