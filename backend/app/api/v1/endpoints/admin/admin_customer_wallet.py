from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, update

from app.core.database import get_db
from app.core.security import require_hq_access, now_utc
from app.core.audit import log_action, get_client_ip
from app.core.utils import to_float
from app.models.admin_user import AdminUser
from app.models.customer import Customer
from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction
from app.models.voucher import Voucher, UserVoucher
from app.models.wallet import Wallet, WalletTransaction
from app.schemas.admin_customers import AdjustPointsRequest, AwardVoucherRequest, SetTierRequest

from .admin_customer_list import _calc_tier

router = APIRouter(prefix="/admin", tags=["Admin Customers"])


@router.get("/customers/{user_id}/loyalty-history")
async def customer_loyalty_history(
    user_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_hq_access()),
):
    count_result = await db.execute(
        select(func.count()).select_from(LoyaltyTransaction).where(LoyaltyTransaction.user_id == user_id)
    )
    total = count_result.scalar() or 0
    result = await db.execute(
        select(LoyaltyTransaction)
        .where(LoyaltyTransaction.user_id == user_id)
        .order_by(desc(LoyaltyTransaction.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    txns = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "items": [
            {
                "id": t.id,
                "points": t.points,
                "type": t.type.value if hasattr(t.type, 'value') else str(t.type),
                "description": t.description or f"{t.type.value if hasattr(t.type, 'value') else str(t.type)} {abs(t.points)} pts",
                "order_id": t.order_id,
                "store_id": t.store_id,
                "created_at": t.created_at,
            }
            for t in txns
        ],
    }


@router.get("/customers/{user_id}/wallet-history")
async def customer_wallet_history(
    user_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_hq_access()),
):
    wallet_subquery = select(Wallet.id).where(Wallet.user_id == user_id)
    count_result = await db.execute(
        select(func.count()).select_from(WalletTransaction).where(WalletTransaction.wallet_id.in_(wallet_subquery))
    )
    total = count_result.scalar() or 0
    result = await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.wallet_id.in_(wallet_subquery))
        .order_by(desc(WalletTransaction.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    txns = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "items": [
            {
                "id": t.id,
                "amount": to_float(t.amount),
                "type": t.type,
                "description": t.description,
                "created_at": t.created_at,
            }
            for t in txns
        ],
    }


@router.post("/customers/{user_id}/adjust-points")
async def adjust_customer_points(
    user_id: int,
    data: AdjustPointsRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_hq_access()),
):
    result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == user_id))
    account = result.scalar_one_or_none()
    if not account:
        account = LoyaltyAccount(user_id=user_id, customer_id=user_id, points_balance=0, tier="bronze")
        db.add(account)
        await db.flush()
    values = {"points_balance": LoyaltyAccount.points_balance + data.points}
    if data.points > 0:
        values["total_points_earned"] = LoyaltyAccount.total_points_earned + data.points
    await db.execute(
        update(LoyaltyAccount).where(LoyaltyAccount.user_id == user_id).values(**values)
    )
    await db.flush()
    result2 = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == user_id))
    account_fresh = result2.scalar_one()
    new_tier = _calc_tier(account_fresh.total_points_earned)
    if new_tier != account_fresh.tier:
        await db.execute(
            update(LoyaltyAccount).where(LoyaltyAccount.user_id == user_id).values(tier=new_tier)
        )
    txn = LoyaltyTransaction(
        user_id=user_id, customer_id=user_id,
        points=data.points,
        type="earn" if data.points > 0 else "redeem",
        created_by=user.id,
        description=data.reason,
    )
    db.add(txn)
    ip = get_client_ip(request)
    await log_action(db, action="ADJUST_CUSTOMER_POINTS", user_id=user.id, entity_type="customer", entity_id=user_id, details={"points": data.points, "reason": data.reason, "new_balance": account_fresh.points_balance}, ip_address=ip)
    await db.flush()
    return {"message": "Points adjusted", "new_balance": account_fresh.points_balance}


@router.post("/customers/{user_id}/award-voucher")
async def award_voucher_to_customer(
    user_id: int,
    data: AwardVoucherRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_hq_access()),
):
    """Award a voucher to a customer. Admin action — bypasses promo claim flow."""
    result = await db.execute(select(Customer).where(Customer.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Customer not found")

    result = await db.execute(select(Voucher).where(Voucher.id == data.voucher_id))
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    if not voucher.is_active or voucher.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Voucher is not active")

    user_count = await db.execute(
        select(func.count()).select_from(UserVoucher).where(
            UserVoucher.user_id == user_id,
            UserVoucher.voucher_id == data.voucher_id,
        )
    )
    total_claimed = user_count.scalar() or 0
    max_per_user = voucher.max_uses_per_user
    if max_per_user is not None and total_claimed >= max_per_user:
        raise HTTPException(status_code=400, detail=f"Customer already has {total_claimed} instance(s) of this voucher (max {max_per_user} per user)")

    import secrets
    from datetime import timedelta

    validity_days = voucher.validity_days if voucher.validity_days else 30
    code = f"{voucher.code}-ADM-{secrets.token_hex(4).upper()}"

    uv = UserVoucher(
        user_id=user_id,
        customer_id=user_id,
        voucher_id=data.voucher_id,
        source="admin_award",
        source_id=user.id,
        status="available",
        code=code,
        expires_at=now_utc() + timedelta(days=validity_days),
        discount_type=voucher.discount_type.value if hasattr(voucher.discount_type, 'value') else str(voucher.discount_type),
        discount_value=voucher.discount_value,
        min_spend=voucher.min_spend,
    )
    db.add(uv)

    ip = get_client_ip(request)
    await log_action(
        db,
        action="AWARD_VOUCHER_TO_CUSTOMER",
        user_id=user.id,
        entity_type="customer",
        entity_id=user_id,
        details={"voucher_id": data.voucher_id, "voucher_code": code, "reason": data.reason},
        ip_address=ip,
    )
    await db.flush()

    return {
        "message": "Voucher awarded",
        "user_voucher_id": uv.id,
        "voucher_code": code,
        "voucher_title": voucher.title or voucher.code,
        "expires_at": uv.expires_at,
    }


@router.post("/customers/{user_id}/set-tier")
async def set_customer_tier(
    user_id: int,
    data: SetTierRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_hq_access()),
):
    """Manually override a customer's loyalty tier."""
    result = await db.execute(select(Customer).where(Customer.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Customer not found")

    valid_tiers = {"bronze", "silver", "gold", "platinum"}
    tier = data.tier.strip().lower()
    if tier not in valid_tiers:
        raise HTTPException(status_code=400, detail=f"Invalid tier. Must be one of: {', '.join(sorted(valid_tiers))}")

    result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == user_id))
    account = result.scalar_one_or_none()
    if not account:
        account = LoyaltyAccount(user_id=user_id, customer_id=user_id, points_balance=0, tier=tier, total_points_earned=0)
        db.add(account)
    else:
        account.tier = tier

    ip = get_client_ip(request)
    await log_action(
        db,
        action="SET_CUSTOMER_TIER",
        user_id=user.id,
        entity_type="customer",
        entity_id=user_id,
        details={"tier": tier, "reason": data.reason},
        ip_address=ip,
    )
    await db.flush()

    return {"message": f"Tier set to {tier}", "tier": tier}
