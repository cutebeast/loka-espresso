from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import require_hq_access
from app.core.audit import log_action, get_client_ip
from app.models.user import User
from app.models.loyalty import LoyaltyTier
from app.schemas.admin_extras import (
    LoyaltyTierOut,
    LoyaltyTierUpdate,
    LoyaltyTierCreate,
)

router = APIRouter(tags=["Admin Loyalty Tiers"])


@router.get("/admin/loyalty-tiers", response_model=list[LoyaltyTierOut])
async def list_loyalty_tiers(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(LoyaltyTier).order_by(LoyaltyTier.sort_order, LoyaltyTier.min_points))
    return result.scalars().all()


@router.post("/admin/loyalty-tiers", status_code=201, response_model=LoyaltyTierOut)
async def create_loyalty_tier(
    request: Request,
    data: LoyaltyTierCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    obj = LoyaltyTier(**data.model_dump())
    db.add(obj)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_LOYALTY_TIER", user_id=user.id, entity_type="loyalty_tier", entity_id=obj.id, details={"name": obj.name, "min_points": obj.min_points}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/admin/loyalty-tiers/{tier_id}", response_model=LoyaltyTierOut)
async def update_loyalty_tier(
    tier_id: int,
    request: Request,
    data: LoyaltyTierUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
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
    return obj


@router.delete("/admin/loyalty-tiers/{tier_id}")
async def delete_loyalty_tier(
    tier_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(LoyaltyTier).where(LoyaltyTier.id == tier_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Tier not found")
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_LOYALTY_TIER", user_id=user.id, entity_type="loyalty_tier", entity_id=tier_id, details={"name": obj.name}, ip_address=ip)
    await db.delete(obj)
    await db.flush()
    return {"message": "Tier deleted", "id": tier_id}
