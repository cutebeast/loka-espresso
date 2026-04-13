from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.admin_extras import AuditLog, NotificationBroadcast, PromoBanner
from app.models.loyalty import LoyaltyTier
from app.schemas.admin_extras import (
    AuditLogOut,
    BroadcastCreate,
    BroadcastOut,
    PromoBannerCreate,
    PromoBannerUpdate,
    PromoBannerOut,
    LoyaltyTierOut,
    LoyaltyTierUpdate,
    LoyaltyTierCreate,
)

router = APIRouter()


@router.get("/admin/audit-log")
async def list_audit_log(
    user_id: int | None = None,
    store_id: int | None = None,
    action: str | None = None,
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    query = select(AuditLog)
    if user_id is not None:
        query = query.where(AuditLog.user_id == user_id)
    if store_id is not None:
        query = query.where(AuditLog.store_id == store_id)
    if action is not None:
        query = query.where(AuditLog.action == action)
    query = query.order_by(desc(AuditLog.created_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    logs = result.scalars().all()
    items = []
    for log in logs:
        user_email = None
        if log.user_id:
            u = await db.execute(select(User.email).where(User.id == log.user_id))
            row = u.first()
            user_email = row[0] if row else None
        items.append({
            "id": log.id,
            "user_id": log.user_id,
            "store_id": log.store_id,
            "action": log.action,
            "details": log.details,
            "created_at": log.created_at,
            "user_email": user_email,
        })
    return items


@router.get("/admin/broadcasts", response_model=list[BroadcastOut])
async def list_broadcasts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(
        select(NotificationBroadcast).order_by(desc(NotificationBroadcast.created_at))
    )
    return result.scalars().all()


@router.post("/admin/broadcasts", response_model=BroadcastOut)
async def create_broadcast(
    data: BroadcastCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    obj = NotificationBroadcast(created_by=user.id, **data.model_dump())
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    await db.commit()
    return obj


@router.get("/banners", response_model=list[PromoBannerOut])
async def list_active_banners(
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — returns active banners for the customer app."""
    from datetime import timezone
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(PromoBanner).where(
            PromoBanner.is_active == True,
            (PromoBanner.start_date == None) | (PromoBanner.start_date <= now),
        ).order_by(PromoBanner.position)
    )
    return result.scalars().all()


@router.get("/admin/banners", response_model=list[PromoBannerOut])
async def list_banners(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(PromoBanner).order_by(desc(PromoBanner.created_at)))
    return result.scalars().all()


@router.post("/admin/banners", response_model=PromoBannerOut)
async def create_banner(
    data: PromoBannerCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    obj = PromoBanner(**data.model_dump())
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    await db.commit()
    return obj


@router.put("/admin/banners/{banner_id}", response_model=PromoBannerOut)
async def update_banner(
    banner_id: int,
    data: PromoBannerUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(PromoBanner).where(PromoBanner.id == banner_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await db.refresh(obj)
    await db.commit()
    return obj


@router.delete("/admin/banners/{banner_id}")
async def delete_banner(
    banner_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(PromoBanner).where(PromoBanner.id == banner_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    await db.delete(obj)
    await db.flush()
    await db.commit()
    return {"detail": "Banner deleted"}


@router.get("/admin/loyalty-tiers", response_model=list[LoyaltyTierOut])
async def list_loyalty_tiers(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(LoyaltyTier))
    return result.scalars().all()


@router.post("/admin/loyalty-tiers", status_code=201, response_model=LoyaltyTierOut)
async def create_loyalty_tier(
    data: LoyaltyTierCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    obj = LoyaltyTier(**data.model_dump())
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    await db.commit()
    return obj


@router.put("/admin/loyalty-tiers/{tier_id}", response_model=LoyaltyTierOut)
async def update_loyalty_tier(
    tier_id: int,
    data: LoyaltyTierUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(LoyaltyTier).where(LoyaltyTier.id == tier_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await db.refresh(obj)
    await db.commit()
    return obj
