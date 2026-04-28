from datetime import timezone, datetime
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.core.database import get_db
from app.core.security import require_role
from app.core.audit import log_action, get_client_ip
from app.models.admin_user import AdminUser
from app.models.user import RoleIDs
from app.models.voucher import Voucher, UserVoucher
from app.models.customer import Customer
from app.schemas.voucher import VoucherOut, VoucherCreate, VoucherUpdate

router = APIRouter(prefix="/admin", tags=["Admin Vouchers"])


@router.get("/vouchers")
async def list_vouchers_admin(
    include_deleted: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    base = select(Voucher)
    if not include_deleted:
        base = base.where(Voucher.deleted_at.is_(None))

    count_q = select(func.count()).select_from(Voucher)
    if not include_deleted:
        count_q = count_q.where(Voucher.deleted_at.is_(None))
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    q = base.order_by(desc(Voucher.created_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    vouchers = result.scalars().all()
    return {
        "items": vouchers,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.post("/vouchers", status_code=201, response_model=VoucherOut)
async def create_voucher(request: Request, req: VoucherCreate, user: AdminUser = Depends(require_role(RoleIDs.ADMIN)), db: AsyncSession = Depends(get_db)):
    payload = req.model_dump()
    voucher = Voucher(**payload)
    db.add(voucher)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="VOUCHER_CREATED", user_id=user.id, entity_type="voucher", entity_id=voucher.id, ip_address=ip)
    await db.refresh(voucher)
    return voucher


@router.put("/vouchers/{voucher_id}")
async def update_voucher(voucher_id: int, request: Request, req: VoucherUpdate, user: AdminUser = Depends(require_role(RoleIDs.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Voucher).where(Voucher.id == voucher_id))
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    updates = req.model_dump(exclude_unset=True)
    # Skip code if unchanged to avoid unique constraint violation
    if "code" in updates and updates["code"] == voucher.code:
        del updates["code"]
    for k, v in updates.items():
        setattr(voucher, k, v)
    ip = get_client_ip(request)
    await log_action(db, action="VOUCHER_UPDATED", user_id=user.id, entity_type="voucher", entity_id=voucher.id, ip_address=ip)
    return {"message": "Voucher updated"}


@router.delete("/vouchers/{voucher_id}")
async def deactivate_voucher(voucher_id: int, request: Request, user: AdminUser = Depends(require_role(RoleIDs.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Voucher).where(Voucher.id == voucher_id))
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    voucher.is_active = False
    voucher.deleted_at = datetime.now(timezone.utc)
    ip = get_client_ip(request)
    await log_action(db, action="VOUCHER_DELETED", user_id=user.id, entity_type="voucher", entity_id=voucher.id, ip_address=ip)
    return {"message": "Voucher soft-deleted"}


@router.get("/vouchers/{voucher_id}/usage")
async def voucher_usage(
    voucher_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(select(func.count()).select_from(UserVoucher).where(UserVoucher.voucher_id == voucher_id))
    total = count_result.scalar() or 0
    total_pages = (total + page_size - 1) // page_size

    result = await db.execute(
        select(UserVoucher).where(UserVoucher.voucher_id == voucher_id)
        .order_by(desc(UserVoucher.applied_at)).offset((page - 1) * page_size).limit(page_size)
    )
    usages = result.scalars().all()
    out = []
    for uv in usages:
        user_result = await db.execute(select(Customer).where(Customer.id == uv.user_id))
        u = user_result.scalar_one_or_none()
        out.append({"user_id": uv.user_id, "user_name": u.name if u else "Unknown", "applied_at": uv.applied_at.isoformat() if uv.applied_at else None, "order_id": uv.order_id, "store_id": uv.store_id})
    return {
        "items": out,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }
