"""PWA Customer Wallet endpoint.

GET /me/wallet — returns all usable rewards, vouchers, and cash balance.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.security import require_role, now_utc, ensure_utc
from app.core.utils import to_float
from app.models.user import User, RoleIDs
from app.models.reward import UserReward, Reward
from app.models.voucher import UserVoucher, Voucher
from app.models.wallet import Wallet

router = APIRouter(prefix="/me", tags=["PWA Customer"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class WalletRewardOut(BaseModel):
    """A redeemed reward in the customer's wallet."""
    id: int
    reward_id: int
    reward_name: Optional[str] = None
    reward_image_url: Optional[str] = None
    redemption_code: Optional[str] = None
    points_spent: Optional[int] = None
    status: Optional[str] = "available"
    redeemed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    used_at: Optional[datetime] = None
    reward_snapshot: Optional[dict] = None

    class Config:
        from_attributes = True


class WalletVoucherOut(BaseModel):
    """A voucher in the customer's wallet."""
    id: int
    voucher_id: int
    voucher_title: Optional[str] = None
    voucher_image_url: Optional[str] = None
    code: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    min_spend: Optional[float] = None
    status: Optional[str] = "available"
    source: Optional[str] = None
    issued_at: Optional[datetime] = None  # maps from applied_at
    expires_at: Optional[datetime] = None
    used_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class WalletCashOut(BaseModel):
    """Cash wallet balance."""
    balance: float
    currency: str = "MYR"


class CustomerWalletOut(BaseModel):
    """Full customer wallet."""
    rewards: List[WalletRewardOut]
    vouchers: List[WalletVoucherOut]
    cash: Optional[WalletCashOut] = None
    loyalty_points: Optional[int] = None


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/wallet", response_model=CustomerWalletOut)
async def get_customer_wallet(
    user: User = Depends(require_role(RoleIDs.CUSTOMER, RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the customer's full wallet:
    - Usable rewards (status='available', not expired)
    - Usable vouchers (status='available', not expired)
    - Cash balance
    - Loyalty points
    """
    now = now_utc()

    # ── Rewards ──────────────────────────────────────────────────────────
    ur_query = (
        select(UserReward, Reward)
        .join(Reward, UserReward.reward_id == Reward.id, isouter=True)
        .where(
            UserReward.user_id == user.id,
            UserReward.status == "available",
            (UserReward.expires_at == None) | (UserReward.expires_at > ensure_utc(now)),
        )
        .order_by(UserReward.expires_at.asc())
    )
    ur_result = await db.execute(ur_query)
    reward_rows = ur_result.all()

    rewards_out = []
    for ur, r in reward_rows:
        rewards_out.append(WalletRewardOut(
            id=ur.id,
            reward_id=ur.reward_id,
            reward_name=r.name if r else (ur.reward_snapshot or {}).get("name"),
            reward_image_url=r.image_url if r else (ur.reward_snapshot or {}).get("image_url"),
            redemption_code=ur.redemption_code,
            points_spent=ur.points_spent,
            status=ur.status,
            redeemed_at=ur.redeemed_at,
            expires_at=ur.expires_at,
            used_at=ur.used_at,
            reward_snapshot=ur.reward_snapshot,
        ))

    # ── Vouchers ─────────────────────────────────────────────────────────
    uv_query = (
        select(UserVoucher, Voucher)
        .join(Voucher, UserVoucher.voucher_id == Voucher.id, isouter=True)
        .where(
            UserVoucher.user_id == user.id,
            UserVoucher.status == "available",
            (UserVoucher.expires_at == None) | (UserVoucher.expires_at > ensure_utc(now)),
        )
        .order_by(UserVoucher.expires_at.asc())
    )
    uv_result = await db.execute(uv_query)
    voucher_rows = uv_result.all()

    vouchers_out = []
    for uv, v in voucher_rows:
        vouchers_out.append(WalletVoucherOut(
            id=uv.id,
            voucher_id=uv.voucher_id,
            voucher_title=v.title if v else None,
            voucher_image_url=v.image_url if v else None,
            code=uv.code,
            discount_type=uv.discount_type or (v.discount_type.value if v and hasattr(v.discount_type, 'value') else None),
            discount_value=to_float(uv.discount_value) if uv.discount_value else (to_float(v.discount_value) if v and v.discount_value else None),
            min_spend=to_float(uv.min_spend) if uv.min_spend else (to_float(v.min_order) if v and v.min_order else None),
            status=uv.status,
            source=uv.source,
            issued_at=uv.applied_at,
            expires_at=uv.expires_at,
            used_at=uv.used_at,
        ))

    # ── Cash ─────────────────────────────────────────────────────────────
    cash_out = None
    w_result = await db.execute(select(Wallet).where(Wallet.user_id == user.id))
    wallet = w_result.scalar_one_or_none()
    if wallet:
        cash_out = WalletCashOut(balance=to_float(wallet.balance), currency=wallet.currency)

    # ── Loyalty Points ───────────────────────────────────────────────────
    from app.models.user import User  # loyalty_accounts imported via model
    from app.models.loyalty import LoyaltyAccount
    la_result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == user.id))
    la = la_result.scalar_one_or_none()
    loyalty_points = la.points_balance if la else None

    return CustomerWalletOut(
        rewards=rewards_out,
        vouchers=vouchers_out,
        cash=cash_out,
        loyalty_points=loyalty_points,
    )
