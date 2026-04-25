"""
POST /checkout endpoint.

Per the documented order flow (order_flow_status_guide.md Section 4.1 Step 2):

1. Customer adds items to cart
2. POST /checkout validates voucher OR reward discount
3. Returns discount token + amount (NOT yet applied to total)
4. POST /orders uses checkout_token to apply the pre-validated discount
5. Payment processed
6. Points awarded

This separates discount validation from order creation.
"""
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user, now_utc, ensure_utc
from app.core.utils import to_float
from app.models.user import User
from app.models.order import CartItem
from app.models.menu import MenuItem
from app.models.voucher import Voucher, UserVoucher
from app.models.reward import Reward, UserReward
from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction
from app.models.order import CheckoutToken

router = APIRouter(prefix="/checkout", tags=["Checkout"])


class CheckoutRequest(BaseModel):
    """Request body for checkout.
    
    order_type: "pickup", "delivery", or "dine_in"
    store_id: which store fulfills the order
    voucher_code: optional voucher code (mutually exclusive with reward_id)
    reward_id: optional reward id to redeem (mutually exclusive with voucher_code)
    """
    order_type: str
    store_id: int
    voucher_code: Optional[str] = None
    reward_id: Optional[int] = None


class CheckoutResponse(BaseModel):
    """Response from checkout with discount token."""
    checkout_token: str  # Pass this to POST /orders
    subtotal: float
    delivery_fee: float
    discount_type: Optional[str] = None  # "voucher" or "reward"
    discount_amount: float = 0  # Actual discount to apply
    total: float  # subtotal - discount_amount + delivery_fee
    message: str


@router.post("", response_model=CheckoutResponse)
async def checkout(
    req: CheckoutRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Process checkout: validate discount and reserve it.
    
    Flow:
    1. Validate cart has items
    2. Calculate subtotal
    3. If voucher_code: validate UserVoucher, mark as 'pending_checkout'
    4. If reward_id: validate UserReward, deduct points immediately
    5. Return checkout_token + discount info
    
    Caller then creates order with checkout_token.
    """
    # Check cart
    cart_result = await db.execute(select(CartItem).where(CartItem.user_id == user.id))
    cart_items = cart_result.scalars().all()
    if not cart_items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    store_id = req.store_id

    # Calculate subtotal (including customization price adjustments)
    subtotal = 0.0
    for ci in cart_items:
        base = to_float(ci.unit_price)
        custom_adj = 0.0
        if ci.customization_option_ids:
            from app.models.marketing import CustomizationOption
            opts_result = await db.execute(
                select(CustomizationOption).where(CustomizationOption.id.in_(ci.customization_option_ids))
            )
            for opt in opts_result.scalars().all():
                custom_adj += to_float(opt.price_adjustment)
        subtotal += (base + custom_adj) * ci.quantity

    # Calculate delivery fee
    delivery_fee = 0.0
    if req.order_type == "delivery":
        from app.models.splash import AppConfig
        cfg = await db.execute(select(AppConfig).where(AppConfig.key == "delivery_fee"))
        fee_row = cfg.scalar_one_or_none()
        delivery_fee = float(fee_row.value) if fee_row else 3.0

    # Enforce ONE discount only
    if req.voucher_code and req.reward_id:
        raise HTTPException(status_code=400, detail="Only one discount allowed per order")

    discount_type = None
    discount_amount = 0.0
    checkout_token = f"CHK-{uuid.uuid4().hex[:16].upper()}"
    ctk = CheckoutToken(
        token=checkout_token,
        user_id=user.id,
        store_id=store_id,
        subtotal=round(subtotal, 2),
        delivery_fee=round(delivery_fee, 2),
        total=0,
        expires_at=now_utc() + timedelta(minutes=15),
    )

    # ── Apply Voucher ──────────────────────────────────────────────────
    if req.voucher_code:
        uv_result = await db.execute(
            select(UserVoucher).where(
                UserVoucher.code == req.voucher_code,
                UserVoucher.user_id == user.id,
            )
        )
        uv = uv_result.scalar_one_or_none()
        if not uv:
            raise HTTPException(status_code=400, detail="Voucher not found")
        if uv.status != "available":
            raise HTTPException(status_code=400, detail=f"Voucher is {uv.status}")

        now = now_utc()
        if uv.expires_at and ensure_utc(uv.expires_at) < now:
            raise HTTPException(status_code=400, detail="Voucher has expired")

        disc_type = uv.discount_type
        disc_value = to_float(uv.discount_value) if uv.discount_value else 0
        min_spend = to_float(uv.min_spend) if uv.min_spend else 0

        if min_spend > 0 and subtotal < min_spend:
            raise HTTPException(status_code=400, detail=f"Minimum spend RM{min_spend:.0f} required")

        # Calculate discount
        if disc_type == "percent":
            discount_amount = round(subtotal * disc_value / 100, 2)
        elif disc_type in ("fixed", "free_item"):
            discount_amount = disc_value

        discount_amount = min(discount_amount, subtotal + delivery_fee)
        discount_type = "voucher"

        # Reserve voucher for this checkout
        uv.status = "pending_checkout"
        uv.order_id = None  # Will be set when order is created
        ctk.voucher_code = req.voucher_code
        ctk.discount_type = "voucher"
        ctk.discount_amount = discount_amount

    # ── Redeem Reward ─────────────────────────────────────────────────
    elif req.reward_id:
        ur_result = await db.execute(
            select(UserReward).where(
                UserReward.id == req.reward_id,
                UserReward.user_id == user.id,
            )
        )
        ur = ur_result.scalar_one_or_none()
        if not ur:
            raise HTTPException(status_code=400, detail="Reward not found")
        if ur.status != "available":
            raise HTTPException(status_code=400, detail=f"Reward is {ur.status}")

        now = now_utc()
        if ur.expires_at and ensure_utc(ur.expires_at) < now:
            raise HTTPException(status_code=400, detail="Reward has expired")

        # Get reward details
        r_result = await db.execute(select(Reward).where(Reward.id == ur.reward_id))
        reward = r_result.scalar_one_or_none()
        if not reward:
            raise HTTPException(status_code=400, detail="Reward not found")

        disc_value = to_float(reward.discount_value) if reward.discount_value else 0
        discount_amount = min(disc_value, subtotal + delivery_fee)
        discount_type = "reward"

        # Deduct points IMMEDIATELY (per doc: "redeems points immediately")
        la_result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == user.id))
        la = la_result.scalar_one_or_none()
        if not la or la.points_balance < reward.points_cost:
            raise HTTPException(status_code=400, detail=f"Not enough points. Need {reward.points_cost}")

        await db.execute(
            update(LoyaltyAccount)
            .where(LoyaltyAccount.user_id == user.id)
            .values(points_balance=LoyaltyAccount.points_balance - reward.points_cost)
        )

        # Record redemption transaction
        lt = LoyaltyTransaction(
            user_id=user.id,
            points=reward.points_cost,
            type="redeem",
            description=f"Redeemed for checkout: {reward.name}",
        )
        db.add(lt)

        # Reserve reward for this checkout
        ur.status = "pending_checkout"
        ctk.reward_id = req.reward_id
        ctk.discount_type = "reward"
        ctk.discount_amount = discount_amount

    total = round(subtotal + delivery_fee - discount_amount, 2)
    ctk.total = total
    db.add(ctk)

    await db.flush()

    return CheckoutResponse(
        checkout_token=checkout_token,
        subtotal=round(subtotal, 2),
        delivery_fee=round(delivery_fee, 2),
        discount_type=discount_type,
        discount_amount=discount_amount,
        total=total,
        message=f"Discount of RM{discount_amount:.2f} applied" if discount_amount > 0 else "No discount applied",
    )
