from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.core.audit import log_action, get_client_ip
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


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------

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
        else:
            user_email = "System"
        items.append({
            "id": log.id,
            "user_id": log.user_id,
            "store_id": log.store_id,
            "action": log.action,
            "details": log.details,
            "ip_address": log.ip_address or "-",
            "status": log.status,
            "created_at": log.created_at,
            "timestamp": log.created_at.isoformat() if log.created_at else None,
            "user_email": user_email,
        })
    return items


# ---------------------------------------------------------------------------
# Broadcasts
# ---------------------------------------------------------------------------

@router.get("/admin/broadcasts")
async def list_broadcasts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_archived: bool | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    query = select(NotificationBroadcast)
    count_query = select(func.count(NotificationBroadcast.id))

    if is_archived is not None:
        query = query.where(NotificationBroadcast.is_archived == is_archived)
        count_query = count_query.where(NotificationBroadcast.is_archived == is_archived)
    else:
        query = query.where(NotificationBroadcast.is_archived == False)
        count_query = count_query.where(NotificationBroadcast.is_archived == False)

    if from_date:
        try:
            fd = datetime.fromisoformat(from_date)
            query = query.where(NotificationBroadcast.created_at >= fd)
            count_query = count_query.where(NotificationBroadcast.created_at >= fd)
        except ValueError:
            pass
    if to_date:
        try:
            td = datetime.fromisoformat(to_date + "T23:59:59")
            query = query.where(NotificationBroadcast.created_at <= td)
            count_query = count_query.where(NotificationBroadcast.created_at <= td)
        except ValueError:
            pass

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(desc(NotificationBroadcast.created_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = result.scalars().all()

    return {
        "broadcasts": [
            {
                "id": b.id,
                "title": b.title,
                "body": b.body,
                "audience": b.audience,
                "store_id": b.store_id,
                "scheduled_at": b.scheduled_at.isoformat() if b.scheduled_at else None,
                "sent_at": b.sent_at.isoformat() if b.sent_at else None,
                "sent_count": b.sent_count,
                "open_count": b.open_count,
                "is_archived": b.is_archived,
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.patch("/admin/broadcasts/{broadcast_id}/archive")
async def toggle_archive_broadcast(
    broadcast_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(NotificationBroadcast).where(NotificationBroadcast.id == broadcast_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Broadcast not found")
    obj.is_archived = not obj.is_archived
    ip = get_client_ip(request)
    action = "ARCHIVE_BROADCAST" if obj.is_archived else "UNARCHIVE_BROADCAST"
    await log_action(db, action=action, user_id=user.id, entity_type="broadcast", entity_id=broadcast_id, details={"title": obj.title}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    await db.commit()
    return {"id": obj.id, "is_archived": obj.is_archived}


@router.post("/admin/broadcasts", response_model=BroadcastOut)
async def create_broadcast(
    request: Request,
    data: BroadcastCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    obj = NotificationBroadcast(created_by=user.id, **data.model_dump())
    db.add(obj)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_BROADCAST", user_id=user.id, entity_type="broadcast", entity_id=obj.id, details={"title": obj.title, "audience": obj.audience}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    await db.commit()
    return obj


# ---------------------------------------------------------------------------
# Banners (Promo)
# ---------------------------------------------------------------------------

@router.get("/banners", response_model=list[PromoBannerOut])
async def list_active_banners(
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — returns active banners for the customer app."""
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
    request: Request,
    data: PromoBannerCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    obj = PromoBanner(**data.model_dump())
    db.add(obj)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_BANNER", user_id=user.id, entity_type="banner", entity_id=obj.id, details={"title": obj.title}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    await db.commit()
    return obj


@router.put("/admin/banners/{banner_id}", response_model=PromoBannerOut)
async def update_banner(
    banner_id: int,
    request: Request,
    data: PromoBannerUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(PromoBanner).where(PromoBanner.id == banner_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(obj, key, value)
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_BANNER", user_id=user.id, entity_type="banner", entity_id=banner_id, details={"changes": changes}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    await db.commit()
    return obj


@router.delete("/admin/banners/{banner_id}")
async def delete_banner(
    banner_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(PromoBanner).where(PromoBanner.id == banner_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_BANNER", user_id=user.id, entity_type="banner", entity_id=banner_id, details={"title": obj.title}, ip_address=ip)
    await db.delete(obj)
    await db.flush()
    await db.commit()
    return {"detail": "Banner deleted"}


# ---------------------------------------------------------------------------
# Loyalty Tiers
# ---------------------------------------------------------------------------

@router.get("/admin/loyalty-tiers", response_model=list[LoyaltyTierOut])
async def list_loyalty_tiers(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(LoyaltyTier))
    return result.scalars().all()


@router.post("/admin/loyalty-tiers", status_code=201, response_model=LoyaltyTierOut)
async def create_loyalty_tier(
    request: Request,
    data: LoyaltyTierCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    obj = LoyaltyTier(**data.model_dump())
    db.add(obj)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_LOYALTY_TIER", user_id=user.id, entity_type="loyalty_tier", entity_id=obj.id, details={"name": obj.name, "min_points": obj.min_points}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    await db.commit()
    return obj


@router.put("/admin/loyalty-tiers/{tier_id}", response_model=LoyaltyTierOut)
async def update_loyalty_tier(
    tier_id: int,
    request: Request,
    data: LoyaltyTierUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(LoyaltyTier).where(LoyaltyTier.id == tier_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(obj, key, value)
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_LOYALTY_TIER", user_id=user.id, entity_type="loyalty_tier", entity_id=tier_id, details={"changes": changes}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    await db.commit()
    return obj


@router.delete("/admin/loyalty-tiers/{tier_id}")
async def delete_loyalty_tier(
    tier_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(LoyaltyTier).where(LoyaltyTier.id == tier_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Tier not found")
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_LOYALTY_TIER", user_id=user.id, entity_type="loyalty_tier", entity_id=tier_id, details={"name": obj.name}, ip_address=ip)
    await db.delete(obj)
    await db.flush()
    await db.commit()
    return {"message": "Tier deleted", "id": tier_id}
