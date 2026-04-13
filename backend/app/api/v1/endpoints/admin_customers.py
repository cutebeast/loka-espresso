from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_

from app.core.database import get_db
from app.core.security import require_role
from app.core.audit import log_action
from app.models.user import User, UserRole
from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction
from app.models.order import Order
from app.models.wallet import Wallet, WalletTransaction
from app.schemas.admin_customers import AdjustPointsRequest

router = APIRouter(prefix="/admin", tags=["Admin — Customers"])


@router.get("/customers")
async def list_customers(
    search: str | None = None,
    tier: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    query = (
        select(
            User.id, User.name, User.email, User.phone, User.created_at,
            LoyaltyAccount.tier, LoyaltyAccount.points_balance,
            func.count(Order.id).label("total_orders"),
            func.coalesce(func.sum(Order.total), 0).label("total_spent"),
        )
        .join(LoyaltyAccount, LoyaltyAccount.user_id == User.id, isouter=True)
        .join(Order, Order.user_id == User.id, isouter=True)
        .where(User.role == "customer")
        .group_by(User.id, LoyaltyAccount.tier, LoyaltyAccount.points_balance)
    )
    if search:
        query = query.where(or_(
            User.name.ilike(f"%{search}%"),
            User.email.ilike(f"%{search}%"),
            User.phone.ilike(f"%{search}%"),
        ))
    if tier:
        query = query.where(LoyaltyAccount.tier == tier)
    query = query.order_by(desc(User.created_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.all()
    return [
        {
            "id": r.id, "name": r.name, "email": r.email, "phone": r.phone,
            "tier": r.tier, "points_balance": r.points_balance or 0,
            "total_orders": r.total_orders, "total_spent": float(r.total_spent),
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.get("/customers/{user_id}")
async def get_customer(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Customer not found")

    result = await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.user_id == user_id)
    )
    loyalty = result.scalar_one_or_none()

    result = await db.execute(
        select(
            func.count(Order.id).label("total_orders"),
            func.coalesce(func.sum(Order.total), 0).label("total_spent"),
        ).where(Order.user_id == user_id)
    )
    stats = result.one()

    result = await db.execute(
        select(Wallet).where(Wallet.user_id == user_id)
    )
    wallet = result.scalar_one_or_none()

    result = await db.execute(
        select(Order)
        .where(Order.user_id == user_id)
        .order_by(desc(Order.created_at))
        .limit(10)
    )
    recent_orders = result.scalars().all()

    return {
        "id": target.id,
        "name": target.name,
        "email": target.email,
        "phone": target.phone,
        "avatar_url": target.avatar_url,
        "tier": loyalty.tier if loyalty else None,
        "points_balance": loyalty.points_balance if loyalty else 0,
        "total_points_earned": loyalty.total_points_earned if loyalty else 0,
        "total_orders": stats.total_orders,
        "total_spent": float(stats.total_spent),
        "wallet_balance": float(wallet.balance) if wallet else 0.0,
        "created_at": target.created_at,
        "recent_orders": [
            {
                "id": o.id,
                "order_number": o.order_number,
                "total": float(o.total),
                "status": o.status,
                "created_at": o.created_at,
            }
            for o in recent_orders
        ],
    }


@router.get("/customers/{user_id}/orders")
async def customer_orders(
    user_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    query = select(Order).where(Order.user_id == user_id)
    if status:
        query = query.where(Order.status == status)
    query = query.order_by(desc(Order.created_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    orders = result.scalars().all()
    return [
        {
            "id": o.id,
            "order_number": o.order_number,
            "order_type": o.order_type,
            "subtotal": float(o.subtotal),
            "total": float(o.total),
            "status": o.status,
            "payment_status": o.payment_status,
            "created_at": o.created_at,
        }
        for o in orders
    ]


@router.get("/customers/{user_id}/loyalty-history")
async def customer_loyalty_history(
    user_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(
        select(LoyaltyTransaction)
        .where(LoyaltyTransaction.user_id == user_id)
        .order_by(desc(LoyaltyTransaction.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    txns = result.scalars().all()
    return [
        {
            "id": t.id,
            "points": t.points,
            "type": t.type,
            "order_id": t.order_id,
            "store_id": t.store_id,
            "created_at": t.created_at,
        }
        for t in txns
    ]


@router.get("/customers/{user_id}/wallet-history")
async def customer_wallet_history(
    user_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.wallet_id.in_(select(Wallet.id).where(Wallet.user_id == user_id)))
        .order_by(desc(WalletTransaction.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    txns = result.scalars().all()
    return [
        {
            "id": t.id,
            "amount": float(t.amount),
            "type": t.type,
            "description": t.description,
            "created_at": t.created_at,
        }
        for t in txns
    ]


@router.post("/customers/{user_id}/adjust-points")
async def adjust_customer_points(
    user_id: int,
    data: AdjustPointsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == user_id))
    account = result.scalar_one_or_none()
    if not account:
        account = LoyaltyAccount(user_id=user_id, points_balance=0, tier="bronze")
        db.add(account)
        await db.flush()
    account.points_balance += data.points
    if data.points > 0:
        account.total_points_earned += data.points
    txn = LoyaltyTransaction(
        user_id=user_id,
        points=data.points,
        type="earn" if data.points > 0 else "redeem",
    )
    db.add(txn)
    await log_action(db, action="ADJUST_CUSTOMER_POINTS", user_id=user.id, entity_type="customer", entity_id=user_id, details={"points": data.points, "reason": data.reason, "new_balance": account.points_balance + data.points})
    await db.flush()
    await db.commit()
    return {"message": "Points adjusted", "new_balance": account.points_balance}
