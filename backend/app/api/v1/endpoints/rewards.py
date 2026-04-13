from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction
from app.models.reward import Reward, UserReward
from app.schemas.reward import RewardOut, RewardCreate, RewardUpdate

router = APIRouter(prefix="/rewards", tags=["Rewards"])


@router.get("", response_model=list[RewardOut])
async def list_rewards(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Reward).where(Reward.is_active == True, Reward.deleted_at.is_(None)))
    return result.scalars().all()


@router.post("/{reward_id}/redeem")
async def redeem_reward(reward_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Reward).where(Reward.id == reward_id, Reward.is_active == True, Reward.deleted_at.is_(None)))
    reward = result.scalar_one_or_none()
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")
    if reward.stock_limit is not None and reward.total_redeemed >= reward.stock_limit:
        raise HTTPException(status_code=400, detail="Reward out of stock")

    la_result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == user.id))
    la = la_result.scalar_one_or_none()
    if not la or la.points_balance < reward.points_cost:
        raise HTTPException(status_code=400, detail="Not enough points")

    la.points_balance -= reward.points_cost
    reward.total_redeemed += 1
    lt = LoyaltyTransaction(user_id=user.id, points=reward.points_cost, type="redeem")
    db.add(lt)
    ur = UserReward(user_id=user.id, reward_id=reward.id)
    db.add(ur)
    await db.flush()
    return {"message": "Reward redeemed", "remaining_points": la.points_balance}
