from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_, distinct, text, update

from app.core.database import get_db
from app.core.security import require_hq_access
from app.core.audit import log_action, get_client_ip
from app.core.utils import to_float
from app.models.user import User, RoleIDs
from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction
from app.models.order import Order
from app.models.wallet import Wallet, WalletTransaction
from app.schemas.admin_customers import AdjustPointsRequest, CustomerUpdateRequest


# Tables to clear when resetting customer data, in safe deletion order
# (children before parents to respect FK constraints)
# NO cascades exist in this DB — all FKs are NO ACTION, must delete in order
_CUSTOMER_RESET_TABLES = [
    # 1. loyalty_transactions: depends on orders, users, stores (no FK from these TO it)
    "loyalty_transactions",
    # 2. user_vouchers: depends on users, vouchers, orders, stores
    "user_vouchers",
    # 3. user_rewards: depends on users, rewards, orders, stores
    "user_rewards",
    # 4. cart_items: depends on users, stores, menu_items (we only delete users part)
    "cart_items",
    # 5. order_items: depends on orders, menu_items
    "order_items",
    # 6. order_status_history: depends on orders
    "order_status_history",
    # 7. payments: depends on orders
    "payments",
    # 8. feedback: depends on users, orders, stores
    "feedback",
    # 9. orders: depends on users, stores, store_tables
    "orders",
    # 10. wallet_transactions: depends on wallets, users
    "wallet_transactions",
    # 11. wallets: depends on users
    "wallets",
    # 12. loyalty_accounts: depends on users
    "loyalty_accounts",
    # 13. user_addresses: depends on users
    "user_addresses",
    # 14. device_tokens: depends on users
    "device_tokens",
    # 15. notifications: depends on users
    "notifications",
    # 16. favorites: depends on users, menu_items
    "favorites",
    # 17. referrals: depends on users (both referrer_id and invitee_id)
    "referrals",
    # 18. payment_methods: depends on users
    "payment_methods",
    # 19. survey_responses: depends on users, surveys
    "survey_responses",
    # 20. audit_log: depends on users, stores
    "audit_log",
    # 21. token_blacklist: depends on users
    "token_blacklist",
    # 22. users (customers only): depends on users (self-ref: referred_by)
    "users",
]

router = APIRouter(prefix="/admin", tags=["Admin — Customers"])


def _calc_tier(total_earned: int) -> str:
    """Calculate tier name from lifetime total points earned (not current balance).
    
    Tier is based on cumulative lifetime earnings, so spending points doesn't
    demote a customer. Only earning more points can promote them."""
    if total_earned >= 3000:
        return "platinum"
    elif total_earned >= 1500:
        return "gold"
    elif total_earned >= 500:
        return "silver"
    return "bronze"


@router.get("/customers")
async def list_customers(
    search: str | None = None,
    tier: str | None = None,
    sort_by: str = Query("created_at", regex="^(name|created_at|points_balance|total_spent)$"),
    sort_dir: str = Query("desc", regex="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    # Base query for counting
    base_count = select(func.count(User.id.distinct())).where(User.role_id == RoleIDs.CUSTOMER)
    if search:
        base_count = base_count.where(or_(
            User.name.ilike(f"%{search}%"),
            User.email.ilike(f"%{search}%"),
            User.phone.ilike(f"%{search}%"),
        ))
    if tier:
        base_count = base_count.join(LoyaltyAccount, LoyaltyAccount.user_id == User.id, isouter=True).where(LoyaltyAccount.tier == tier)
    count_result = await db.execute(base_count)
    total = count_result.scalar() or 0

    # Determine sort column
    sort_col = {
        "name": User.name,
        "created_at": User.created_at,
        "points_balance": LoyaltyAccount.points_balance,
        "total_spent": func.coalesce(func.sum(Order.total), 0),
    }.get(sort_by, User.created_at)

    # Paginated results with aggregates
    data_query = (
        select(
            User.id, User.name, User.email, User.phone, User.created_at,
            LoyaltyAccount.tier, LoyaltyAccount.points_balance,
            LoyaltyAccount.total_points_earned,
            func.count(Order.id).label("total_orders"),
            func.coalesce(func.sum(Order.total), 0).label("total_spent"),
        )
        .join(LoyaltyAccount, LoyaltyAccount.user_id == User.id, isouter=True)
        .join(Order, Order.user_id == User.id, isouter=True)
        .where(User.role_id == RoleIDs.CUSTOMER)
        .group_by(User.id, LoyaltyAccount.tier, LoyaltyAccount.points_balance, LoyaltyAccount.total_points_earned)
    )
    if search:
        data_query = data_query.where(or_(
            User.name.ilike(f"%{search}%"),
            User.email.ilike(f"%{search}%"),
            User.phone.ilike(f"%{search}%"),
        ))
    if tier:
        data_query = data_query.where(LoyaltyAccount.tier == tier)

    # Apply sorting
    if sort_dir == "asc":
        data_query = data_query.order_by(sort_col.asc())
    else:
        data_query = data_query.order_by(desc(sort_col))

    data_query = data_query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(data_query)
    rows = result.all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "customers": [
            {
                "id": r.id, "name": r.name, "email": r.email, "phone": r.phone,
                "tier": r.tier, "points_balance": r.points_balance or 0,
                "total_points_earned": r.total_points_earned or 0,
                "total_orders": r.total_orders,                 "total_spent": to_float(r.total_spent),
                "created_at": r.created_at,
            }
            for r in rows
        ],
    }


@router.get("/customers/{user_id}")
async def get_customer(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
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
        "total_spent": to_float(stats.total_spent),
        "wallet_balance": to_float(wallet.balance) if wallet else 0.0,
        "created_at": target.created_at,
        "recent_orders": [
            {
                "id": o.id,
                "order_number": o.order_number,
                "total": to_float(o.total),
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
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    base = select(Order).where(Order.user_id == user_id)
    if status:
        base = base.where(Order.status == status)
    if from_date is not None:
        base = base.where(Order.created_at >= from_date)
    if to_date is not None:
        base = base.where(Order.created_at <= to_date)

    count_base = select(func.count()).select_from(Order).where(Order.user_id == user_id)
    if status:
        count_base = count_base.where(Order.status == status)
    if from_date is not None:
        count_base = count_base.where(Order.created_at >= from_date)
    if to_date is not None:
        count_base = count_base.where(Order.created_at <= to_date)
    count_result = await db.execute(count_base)
    total = count_result.scalar() or 0
    result = await db.execute(
        base.order_by(desc(Order.created_at)).offset((page - 1) * page_size).limit(page_size)
    )
    orders = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": o.id,
                "order_number": o.order_number,
                "order_type": o.order_type.value if hasattr(o.order_type, 'value') else str(o.order_type),
                "subtotal": to_float(o.subtotal),
                "total": to_float(o.total),
                "status": o.status.value if hasattr(o.status, 'value') else str(o.status),
                "payment_status": o.payment_status.value if hasattr(o.payment_status, 'value') else str(o.payment_status) if o.payment_status else None,
                "created_at": o.created_at,
            }
            for o in orders
        ],
    }


@router.get("/customers/{user_id}/loyalty-history")
async def customer_loyalty_history(
    user_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
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
    user: User = Depends(require_hq_access()),
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
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == user_id))
    account = result.scalar_one_or_none()
    if not account:
        account = LoyaltyAccount(user_id=user_id, points_balance=0, tier="bronze")
        db.add(account)
        await db.flush()
    # Atomic SQL UPDATE to prevent race conditions
    values = {"points_balance": LoyaltyAccount.points_balance + data.points}
    if data.points > 0:
        values["total_points_earned"] = LoyaltyAccount.total_points_earned + data.points
    await db.execute(
        update(LoyaltyAccount).where(LoyaltyAccount.user_id == user_id).values(**values)
    )
    # Re-read to get correct tier
    await db.flush()
    result2 = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == user_id))
    account_fresh = result2.scalar_one()
    new_tier = _calc_tier(account_fresh.total_points_earned)
    if new_tier != account_fresh.tier:
        await db.execute(
            update(LoyaltyAccount).where(LoyaltyAccount.user_id == user_id).values(tier=new_tier)
        )
    txn = LoyaltyTransaction(
        user_id=user_id,
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


@router.put("/customers/{user_id}")
async def update_customer(
    user_id: int,
    request: Request,
    data: CustomerUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Customer not found")

    changes = data.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No changes provided")

    # Check uniqueness constraints
    if "phone" in changes and changes["phone"] != target.phone:
        existing = await db.execute(select(User).where(User.phone == changes["phone"]))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Phone number already in use by another account")

    if "email" in changes and changes["email"] and changes["email"] != target.email:
        existing = await db.execute(select(User).where(User.email == changes["email"]))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Email already in use by another account")

    for key, value in changes.items():
        setattr(target, key, value)

    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_CUSTOMER", user_id=user.id, entity_type="customer", entity_id=user_id, details={"changes": changes}, ip_address=ip)
    await db.flush()
    await db.refresh(target)
    return {
        "id": target.id,
        "name": target.name,
        "email": target.email,
        "phone": target.phone,
    }


@router.delete("/customers/reset")
async def reset_all_customers(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    """Delete ALL customers and all their associated data via API.
    
    Clears: users (role=customer), orders, wallets, loyalty accounts,
    vouchers, rewards, transactions, addresses, notifications, etc.
    Preserves: admin/staff accounts, stores, menu items, rewards catalog,
    voucher catalog, system config.
    
    Requires HQ access. Use with caution — this is irreversible.
    """
    CUSTOMER_ROLE_ID = 6  # RoleIDs.CUSTOMER

    # Delete customer data table by table in safe FK order
    # Use SAVEPOINTs so each failed DELETE doesn't abort the whole transaction
    deleted_counts = {}

    for table in _CUSTOMER_RESET_TABLES:
        savepoint_name = f"sp_{table}"
        try:
            # Rollback to savepoint if one exists from a failed prior iteration
            await db.execute(text(f"SAVEPOINT {savepoint_name}"))

            if table == "users":
                # Only delete users with customer role
                await db.execute(
                    text(f"DELETE FROM {table} WHERE role_id = :role_id"),
                    {"role_id": CUSTOMER_ROLE_ID}
                )
            elif table == "referrals":
                # referrals has both referrer_id and invitee_id
                await db.execute(
                    text(f"""
                        DELETE FROM {table} 
                        WHERE referrer_id IN (SELECT id FROM users WHERE role_id = :role_id)
                           OR invitee_id IN (SELECT id FROM users WHERE role_id = :role_id)
                    """),
                    {"role_id": CUSTOMER_ROLE_ID}
                )
            elif table == "order_items":
                # order_items has order_id FK (no user_id)
                await db.execute(
                    text("""
                        DELETE FROM order_items
                        WHERE order_id IN (
                            SELECT id FROM orders
                            WHERE user_id IN (SELECT id FROM users WHERE role_id = :role_id)
                        )
                    """),
                    {"role_id": CUSTOMER_ROLE_ID}
                )
            elif table in ("order_status_history", "payments"):
                # These have order_id FK (no user_id)
                await db.execute(
                    text(f"""
                        DELETE FROM {table}
                        WHERE order_id IN (
                            SELECT id FROM orders
                            WHERE user_id IN (SELECT id FROM users WHERE role_id = :role_id)
                        )
                    """),
                    {"role_id": CUSTOMER_ROLE_ID}
                )
            elif table == "feedback":
                # feedback has both user_id AND order_id — use order_id path to catch all
                await db.execute(
                    text("""
                        DELETE FROM feedback
                        WHERE order_id IN (
                            SELECT id FROM orders
                            WHERE user_id IN (SELECT id FROM users WHERE role_id = :role_id)
                        )
                    """),
                    {"role_id": CUSTOMER_ROLE_ID}
                )
            elif table == "audit_log":
                # audit_log has nullable user_id AND store_id — use user_id for customers
                await db.execute(
                    text("""
                        DELETE FROM audit_log
                        WHERE user_id IN (SELECT id FROM users WHERE role_id = :role_id)
                    """),
                    {"role_id": CUSTOMER_ROLE_ID}
                )
            else:
                # All other tables have user_id column
                await db.execute(
                    text(f"""
                        DELETE FROM {table}
                        WHERE user_id IN (SELECT id FROM users WHERE role_id = :role_id)
                    """),
                    {"role_id": CUSTOMER_ROLE_ID}
                )
            deleted_counts[table] = "ok"
        except Exception as e:
            # Release savepoint to allow continued execution after error
            await db.execute(text(f"RELEASE SAVEPOINT {savepoint_name}"))
            deleted_counts[table] = f"ERROR: {str(e)[:80]}"

    # Delete ALL wallets and wallet_transactions (including admin wallets)
    # Admin should not have wallets - they are for customers only
    try:
        await db.execute(text("DELETE FROM wallet_transactions"))
        deleted_counts["wallet_transactions"] = "ok_all"
    except Exception as e:
        deleted_counts["wallet_transactions"] = f"ERROR: {str(e)[:80]}"

    try:
        await db.execute(text("DELETE FROM wallets"))
        deleted_counts["wallets"] = "ok_all"
    except Exception as e:
        deleted_counts["wallets"] = f"ERROR: {str(e)[:80]}"


    # Log the reset action
    ip = get_client_ip(request)
    await log_action(
        db,
        action="RESET_ALL_CUSTOMERS",
        user_id=user.id,
        entity_type="system",
        entity_id=None,
        details={"deleted_tables": deleted_counts},
        ip_address=ip,
    )

    return {
        "message": "All customer data deleted successfully",
        "deleted_counts": deleted_counts,
    }
