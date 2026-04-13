from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import require_role
from app.core.audit import log_action
from app.models.user import User
from app.models.reward import Reward, UserReward
from app.models.user import User as UserModel
from app.schemas.reward import RewardOut, RewardCreate, RewardUpdate

router = APIRouter(prefix="/admin/rewards", tags=["Admin Rewards"])


@router.get("", response_model=list[RewardOut])
async def list_rewards_admin(user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Reward).order_by(Reward.created_at.desc()))
    return result.scalars().all()


@router.post("", status_code=201)
async def create_reward(req: RewardCreate, user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    reward = Reward(**req.model_dump())
    db.add(reward)
    await db.flush()
    await log_action(db, action="REWARD_CREATED", user_id=user.id, entity_type="reward", entity_id=reward.id)
    return {"id": reward.id, "name": reward.name, "points_cost": reward.points_cost}


@router.put("/{reward_id}")
async def update_reward(reward_id: int, req: RewardUpdate, user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Reward).where(Reward.id == reward_id))
    reward = result.scalar_one_or_none()
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")
    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(reward, k, v)
    await log_action(db, action="REWARD_UPDATED", user_id=user.id, entity_type="reward", entity_id=reward.id)
    await db.flush()
    return {"message": "Reward updated"}


@router.delete("/{reward_id}")
async def deactivate_reward(reward_id: int, user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Reward).where(Reward.id == reward_id))
    reward = result.scalar_one_or_none()
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")
    reward.is_active = False
    reward.deleted_at = datetime.utcnow()
    await log_action(db, action="REWARD_DELETED", user_id=user.id, entity_type="reward", entity_id=reward.id)
    await db.flush()
    return {"message": "Reward soft-deleted"}


@router.get("/{reward_id}/redemptions")
async def reward_redemptions(reward_id: int, user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserReward).where(UserReward.reward_id == reward_id))
    redemptions = result.scalars().all()
    out = []
    for r in redemptions:
        user_result = await db.execute(select(UserModel).where(UserModel.id == r.user_id))
        u = user_result.scalar_one_or_none()
        out.append({"user_id": r.user_id, "user_name": u.name if u else "Unknown", "redeemed_at": r.redeemed_at.isoformat() if r.redeemed_at else None, "store_id": r.store_id, "is_used": r.is_used})
    return out
