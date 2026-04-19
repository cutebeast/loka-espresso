"""Barista scan endpoint + Cron expiry job.

- POST /scan/reward/{code}  — barista scans reward redemption code → marks used
- POST /scan/voucher/{code} — barista scans voucher code → marks used (redirects to vouchers/use)
- POST /cron/expire         — marks expired rewards and vouchers
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.security import require_role, require_hq_access, now_utc, ensure_utc
from app.models.user import User
from app.models.reward import UserReward, Reward
from app.models.voucher import UserVoucher, Voucher

router = APIRouter(prefix="/scan", tags=["Scan & Cron"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ScanRewardResult(BaseModel):
    success: bool
    message: str
    reward_name: Optional[str] = None
    reward_image_url: Optional[str] = None
    customer_id: Optional[int] = None
    redeemed_at: Optional[str] = None


class ScanRequest(BaseModel):
    order_id: Optional[int] = None
    store_id: Optional[int] = None


class CronResult(BaseModel):
    rewards_expired: int
    vouchers_expired: int


# ---------------------------------------------------------------------------
# Scan reward redemption code
# ---------------------------------------------------------------------------

@router.post("/reward/{code}", response_model=ScanRewardResult)
async def scan_reward_code(
    code: str,
    req: ScanRequest,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """
    Barista scans reward redemption code (e.g. RWD-1-4438FE).
    Marks the reward as used, links order if provided.
    """
    now = now_utc()

    # Find by redemption code
    result = await db.execute(
        select(UserReward).where(UserReward.redemption_code == code)
    )
    ur = result.scalar_one_or_none()
    if not ur:
        raise HTTPException(404, "Redemption code not found")

    if ur.status == "used":
        raise HTTPException(400, "Reward already used")
    if ur.status == "expired":
        raise HTTPException(400, "Reward has expired")
    if ur.status == "cancelled":
        raise HTTPException(400, "Reward was cancelled")
    if ur.expires_at and ensure_utc(ur.expires_at) < now:
        ur.status = "expired"
        await db.flush()
        raise HTTPException(400, "Reward has expired")

    # Mark used
    ur.status = "used"
    ur.is_used = True
    ur.used_at = now
    if req.order_id:
        ur.order_id = req.order_id
    if req.store_id:
        ur.store_id = req.store_id

    # Fetch reward name for receipt
    r_result = await db.execute(select(Reward).where(Reward.id == ur.reward_id))
    reward = r_result.scalar_one_or_none()


    return ScanRewardResult(
        success=True,
        message=f"Reward redeemed: {reward.name if reward else 'Unknown'}",
        reward_name=reward.name if reward else (ur.reward_snapshot or {}).get("name"),
        reward_image_url=reward.image_url if reward else (ur.reward_snapshot or {}).get("image_url"),
        customer_id=ur.user_id,
        redeemed_at=ur.redeemed_at.isoformat() if ur.redeemed_at else None,
    )


# ---------------------------------------------------------------------------
# Scan voucher code (delegates to voucher use logic)
# ---------------------------------------------------------------------------

@router.post("/voucher/{code}", response_model=ScanRewardResult)
async def scan_voucher_code(
    code: str,
    req: ScanRequest,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """
    Barista scans voucher per-instance code (e.g. WELCOME10-A3F2B1).
    Marks as used, increments catalog used_count.
    """
    now = now_utc()

    result = await db.execute(
        select(UserVoucher).where(UserVoucher.code == code)
    )
    uv = result.scalar_one_or_none()
    if not uv:
        raise HTTPException(404, "Voucher code not found")

    if uv.status == "used":
        raise HTTPException(400, "Voucher already used")
    if uv.status == "expired":
        raise HTTPException(400, "Voucher has expired")
    if uv.expires_at and ensure_utc(uv.expires_at) < now:
        uv.status = "expired"
        await db.flush()
        raise HTTPException(400, "Voucher has expired")

    # Mark used
    uv.status = "used"
    uv.used_at = now
    uv.is_used = True
    if req.order_id:
        uv.order_id = req.order_id
    if req.store_id:
        uv.store_id = req.store_id

    # Increment catalog used_count
    v_result = await db.execute(select(Voucher).where(Voucher.id == uv.voucher_id))
    voucher = v_result.scalar_one_or_none()
    if voucher:
        voucher.used_count += 1


    return ScanRewardResult(
        success=True,
        message=f"Voucher applied: {voucher.title or voucher.code if voucher else code}",
        reward_name=voucher.title if voucher else None,
        reward_image_url=voucher.image_url if voucher else None,
        customer_id=uv.user_id,
    )


# ---------------------------------------------------------------------------
# Cron: expire items past their expires_at
# ---------------------------------------------------------------------------

@router.post("/cron/expire", response_model=CronResult)
async def expire_items(
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """
    Mark all 'available' rewards and vouchers past their expires_at as 'expired'.
    Called by admin or scheduled cron.
    """
    now = now_utc()

    # Expire rewards
    r_result = await db.execute(
        update(UserReward)
        .where(
            UserReward.status == "available",
            UserReward.expires_at != None,
            UserReward.expires_at < ensure_utc(now),
        )
        .values(status="expired")
        .returning(UserReward.id)
    )
    reward_ids = r_result.scalars().all()

    # Expire vouchers
    v_result = await db.execute(
        update(UserVoucher)
        .where(
            UserVoucher.status == "available",
            UserVoucher.expires_at != None,
            UserVoucher.expires_at < ensure_utc(now),
        )
        .values(status="expired")
        .returning(UserVoucher.id)
    )
    voucher_ids = v_result.scalars().all()


    return CronResult(
        rewards_expired=len(reward_ids),
        vouchers_expired=len(voucher_ids),
    )
