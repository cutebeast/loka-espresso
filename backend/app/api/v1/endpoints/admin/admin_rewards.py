from datetime import timezone, datetime
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.core.database import get_db
from app.core.security import require_role
from app.core.audit import log_action, get_client_ip
from app.models.admin_user import AdminUser
from app.models.user import RoleIDs
from app.models.reward import Reward, UserReward
from app.models.admin_user import AdminUser as UserModel
from app.schemas.reward import RewardOut, RewardCreate, RewardUpdate

router = APIRouter(prefix="/admin", tags=["Admin Rewards"])


@router.get("/rewards")
async def list_rewards_admin(
    include_deleted: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    base = select(Reward)
    if not include_deleted:
        base = base.where(Reward.deleted_at.is_(None))

    count_q = select(func.count()).select_from(Reward)
    if not include_deleted:
        count_q = count_q.where(Reward.deleted_at.is_(None))
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    q = base.order_by(desc(Reward.created_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    rewards = result.scalars().all()
    return {
        "items": rewards,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.post("/rewards", status_code=201, response_model=RewardOut)
async def create_reward(request: Request, req: RewardCreate, user: AdminUser = Depends(require_role(RoleIDs.ADMIN)), db: AsyncSession = Depends(get_db)):
    reward = Reward(**req.model_dump())
    db.add(reward)
    await db.flush()
    await db.refresh(reward)
    ip = get_client_ip(request)
    await log_action(db, action="REWARD_CREATED", user_id=user.id, entity_type="reward", entity_id=reward.id, ip_address=ip)
    return reward


@router.put("/rewards/{reward_id}")
async def update_reward(reward_id: int, request: Request, req: RewardUpdate, user: AdminUser = Depends(require_role(RoleIDs.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Reward).where(Reward.id == reward_id))
    reward = result.scalar_one_or_none()
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")
    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(reward, k, v)
    ip = get_client_ip(request)
    await log_action(db, action="REWARD_UPDATED", user_id=user.id, entity_type="reward", entity_id=reward.id, ip_address=ip)
    return {"message": "Reward updated"}


@router.delete("/rewards/{reward_id}")
async def deactivate_reward(reward_id: int, request: Request, user: AdminUser = Depends(require_role(RoleIDs.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Reward).where(Reward.id == reward_id))
    reward = result.scalar_one_or_none()
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")
    reward.is_active = False
    reward.deleted_at = datetime.now(timezone.utc)
    ip = get_client_ip(request)
    await log_action(db, action="REWARD_DELETED", user_id=user.id, entity_type="reward", entity_id=reward.id, ip_address=ip)
    return {"message": "Reward soft-deleted"}


@router.get("/rewards/{reward_id}/redemptions")
async def reward_redemptions(
    reward_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(select(func.count()).select_from(UserReward).where(UserReward.reward_id == reward_id))
    total = count_result.scalar() or 0
    total_pages = (total + page_size - 1) // page_size

    result = await db.execute(
        select(UserReward).where(UserReward.reward_id == reward_id)
        .order_by(desc(UserReward.redeemed_at)).offset((page - 1) * page_size).limit(page_size)
    )
    redemptions = result.scalars().all()
    out = []
    for r in redemptions:
        user_result = await db.execute(select(UserModel).where(UserModel.id == r.user_id))
        u = user_result.scalar_one_or_none()
        out.append({"user_id": r.user_id, "user_name": u.name if u else "Unknown", "redeemed_at": r.redeemed_at.isoformat() if r.redeemed_at else None, "store_id": r.store_id, "is_used": r.is_used})
    return {
        "items": out,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }
