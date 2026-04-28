"""PWA Rewards endpoints.

- GET /rewards          — catalog listing (public)
- GET /rewards/{id}     — catalog detail (public)
- POST /rewards/{id}/redeem — customer redeems (auth required)
"""
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.security import get_current_user, require_role, now_utc
from app.models.customer import Customer
from app.models.user import RoleIDs
from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction
from app.models.reward import Reward, UserReward

router = APIRouter(prefix="/rewards", tags=["Rewards"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class RewardCatalogOut(BaseModel):
    """Reward item for PWA listing."""
    id: int
    name: str
    short_description: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    points_cost: int
    reward_type: str
    validity_days: Optional[int] = 30
    terms: Optional[List[str]] = None
    how_to_redeem: Optional[str] = None

    class Config:
        from_attributes = True


class RewardDetailOut(BaseModel):
    """Full reward detail for PWA detail page."""
    id: int
    name: str
    description: Optional[str] = None
    short_description: Optional[str] = None
    long_description: Optional[str] = None
    image_url: Optional[str] = None
    points_cost: int
    reward_type: str
    validity_days: Optional[int] = 30
    terms: Optional[List[str]] = None
    how_to_redeem: Optional[str] = None
    stock_limit: Optional[int] = None
    total_redeemed: int = 0

    class Config:
        from_attributes = True


class RedeemResult(BaseModel):
    success: bool
    message: str
    user_reward_id: Optional[int] = None
    redemption_code: Optional[str] = None
    expires_at: Optional[datetime] = None
    remaining_points: Optional[int] = None


# ---------------------------------------------------------------------------
# Public catalog endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=List[RewardCatalogOut])
async def list_rewards_catalog(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List all active rewards for PWA catalog. Public (no auth)."""
    count_q = select(func.count()).select_from(Reward).where(Reward.is_active == True, Reward.deleted_at.is_(None))
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    result = await db.execute(
        select(Reward)
        .where(Reward.is_active == True, Reward.deleted_at.is_(None))
        .order_by(Reward.points_cost.asc())
        .offset((page - 1) * page_size).limit(page_size)
    )
    return result.scalars().all()


@router.get("/{reward_id}", response_model=RewardDetailOut)
async def get_reward_detail(reward_id: int, db: AsyncSession = Depends(get_db)):
    """Get single reward detail for PWA. Public (no auth)."""
    result = await db.execute(
        select(Reward).where(Reward.id == reward_id, Reward.is_active == True, Reward.deleted_at.is_(None))
    )
    reward = result.scalar_one_or_none()
    if not reward:
        raise HTTPException(404, "Reward not found")
    return reward


# ---------------------------------------------------------------------------
# Redeem endpoint (customer auth)
# ---------------------------------------------------------------------------

@router.post("/{reward_id}/redeem", response_model=RedeemResult)
async def redeem_reward(
    reward_id: int,
    user: Customer = Depends(require_role(RoleIDs.CUSTOMER, RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """
    Customer redeems a reward using loyalty points.
    
    Creates a user_rewards row with:
    - Unique redemption_code (for barista scanning)
    - expires_at = now + reward.validity_days
    - status = 'available'
    - points_spent = snapshot of points_cost
    - reward_snapshot = frozen copy of reward details
    
    Guards:
    - Reward must be active, not deleted, not out of stock
    - Customer must have enough points
    - Deducts points from loyalty_accounts.points_balance
    - Increments reward.total_redeemed
    - Records loyalty_transaction (type='redeem')
    """
    # Fetch reward
    result = await db.execute(
        select(Reward).where(Reward.id == reward_id, Reward.is_active == True, Reward.deleted_at.is_(None))
    )
    reward = result.scalar_one_or_none()
    if not reward:
        raise HTTPException(404, "Reward not found")

    # Check stock
    if reward.stock_limit is not None and reward.total_redeemed >= reward.stock_limit:
        raise HTTPException(400, "Reward out of stock")

    # Check loyalty points
    la_result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == user.id))
    la = la_result.scalar_one_or_none()
    if not la or la.points_balance < reward.points_cost:
        raise HTTPException(400, f"Not enough points. You have {la.points_balance if la else 0}, need {reward.points_cost}")

    # Generate unique redemption code
    redemption_code = f"RWD-{reward.id}-{secrets.token_hex(4).upper()}"

    # Compute expiry
    now = now_utc()
    validity_days = reward.validity_days or 30
    expires_at = now + timedelta(days=validity_days)

    # Snapshot reward details (in case catalog changes later)
    reward_snapshot = {
        "name": reward.name,
        "description": reward.description,
        "image_url": reward.image_url,
        "points_cost": reward.points_cost,
        "reward_type": reward.reward_type.value if hasattr(reward.reward_type, 'value') else str(reward.reward_type),
    }

    # Deduct points (atomic SQL UPDATE to prevent race conditions)
    await db.execute(
        update(LoyaltyAccount)
        .where(LoyaltyAccount.user_id == user.id)
        .values(points_balance=LoyaltyAccount.points_balance - reward.points_cost)
    )

    # Increment redeemed count
    reward.total_redeemed += 1

    # Record loyalty transaction
    lt = LoyaltyTransaction(
        user_id=user.id,
        points=reward.points_cost,
        type="redeem",
        description=f"Redeemed: {reward.name}",
    )
    db.add(lt)

    # Create user_reward
    ur = UserReward(
        user_id=user.id,
        reward_id=reward.id,
        status="available",
        redeemed_at=now,
        expires_at=expires_at,
        redemption_code=redemption_code,
        points_spent=reward.points_cost,
        reward_snapshot=reward_snapshot,
    )
    db.add(ur)
    await db.flush()


    return RedeemResult(
        success=True,
        message=f"Reward redeemed! Code: {redemption_code}",
        user_reward_id=ur.id,
        redemption_code=redemption_code,
        expires_at=expires_at,
        remaining_points=la.points_balance,
    )
