from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_, and_, case, literal

from app.core.database import get_db
from app.core.security import require_hq_access
from app.core.utils import to_float
from app.models.admin_user import AdminUser
from app.models.customer import Customer
from app.models.loyalty import LoyaltyAccount
from app.models.order import Order
from app.models.wallet import Wallet

router = APIRouter(prefix="/admin", tags=["Admin Customers"])


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


def _normalize_tier_name(tier: str | None) -> str | None:
    if not tier:
        return None
    normalized = tier.strip().lower()
    return normalized or None


def _is_customer_profile_complete(name: str | None, email: str | None, phone_verified: bool) -> bool:
    """Profile is complete when phone is verified and name is set. Email is optional."""
    return bool(phone_verified and (name or "").strip())


def _effective_customer_tier(loyalty_tier: str | None, total_points_earned: int | None, *, profile_complete: bool) -> str | None:
    if not profile_complete:
        return None
    normalized = _normalize_tier_name(loyalty_tier)
    if normalized:
        return normalized
    return _calc_tier(int(total_points_earned or 0))


@router.get("/customers")
async def list_customers(
    search: str | None = None,
    tier: str | None = None,
    store_id: int | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    sort_by: str = Query("created_at", regex="^(name|created_at|points_balance|total_spent)$"),
    sort_dir: str = Query("desc", regex="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_hq_access()),
):
    order_stats_query = (
        select(
            Order.user_id.label("user_id"),
            func.count(Order.id).label("total_orders"),
            func.coalesce(func.sum(Order.total), 0).label("total_spent"),
        )
        .group_by(Order.user_id)
    )
    if store_id is not None:
        order_stats_query = order_stats_query.where(Order.store_id == store_id)
    if from_date is not None:
        order_stats_query = order_stats_query.where(Order.created_at >= from_date)
    if to_date is not None:
        order_stats_query = order_stats_query.where(Order.created_at <= to_date)
    order_stats_subquery = order_stats_query.subquery()

    normalized_tier_filter = _normalize_tier_name(tier)

    profile_complete_expr = and_(
        Customer.phone_verified == True,
        func.coalesce(func.trim(Customer.name), '') != '',
        func.coalesce(func.trim(Customer.email), '') != '',
    )

    effective_tier_case = case(
        (~profile_complete_expr, None),
        (func.coalesce(func.trim(func.lower(LoyaltyAccount.tier)), '') != '', func.trim(func.lower(LoyaltyAccount.tier))),
        (func.coalesce(LoyaltyAccount.total_points_earned, 0) >= 3000, literal('platinum')),
        (func.coalesce(LoyaltyAccount.total_points_earned, 0) >= 1500, literal('gold')),
        (func.coalesce(LoyaltyAccount.total_points_earned, 0) >= 500, literal('silver')),
        else_=literal('bronze'),
    )

    data_query = (
        select(
            Customer.id,
            Customer.name,
            Customer.email,
            Customer.phone,
            Customer.phone_verified,
            Customer.created_at,
            LoyaltyAccount.tier,
            LoyaltyAccount.points_balance,
            LoyaltyAccount.total_points_earned,
            func.coalesce(order_stats_subquery.c.total_orders, 0).label("total_orders"),
            func.coalesce(order_stats_subquery.c.total_spent, 0).label("total_spent"),
            effective_tier_case.label("effective_tier"),
        )
        .join(LoyaltyAccount, LoyaltyAccount.user_id == Customer.id, isouter=True)
        .join(order_stats_subquery, order_stats_subquery.c.user_id == Customer.id, isouter=True)
    )

    if search:
        search_digits = ''.join(c for c in search if c.isdigit())
        conditions = [
            Customer.name.ilike(f"%{search}%"),
            Customer.email.ilike(f"%{search}%"),
        ]
        if search_digits:
            conditions.append(func.regexp_replace(Customer.phone, r'\D', '', 'g').ilike(f"%{search_digits}%"))
        data_query = data_query.where(or_(*conditions))

    if normalized_tier_filter:
        data_query = data_query.where(effective_tier_case == normalized_tier_filter)

    sort_map = {
        'name': Customer.name,
        'created_at': Customer.created_at,
        'points_balance': LoyaltyAccount.points_balance,
        'total_spent': order_stats_subquery.c.total_spent,
    }
    sort_col = sort_map[sort_by]
    if sort_dir == 'desc':
        data_query = data_query.order_by(desc(sort_col))
    else:
        data_query = data_query.order_by(sort_col)

    count_q = select(func.count()).select_from(data_query.subquery())
    count_result = await db.execute(count_q)
    total = count_result.scalar() or 0

    data_query = data_query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(data_query)
    rows = result.all()

    customers = []
    for row in rows:
        profile_complete = _is_customer_profile_complete(row.name, row.email, bool(row.phone_verified))
        customers.append({
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "phone": row.phone,
            "tier": row.effective_tier,
            "points_balance": int(row.points_balance or 0),
            "total_points_earned": int(row.total_points_earned or 0),
            "total_orders": int(row.total_orders or 0),
            "total_spent": to_float(row.total_spent),
            "created_at": row.created_at,
            "is_profile_complete": profile_complete,
            "phone_verified": bool(row.phone_verified),
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "items": customers,
    }


@router.get("/customers/{user_id}")
async def get_customer(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_hq_access()),
):
    result = await db.execute(select(Customer).where(Customer.id == user_id))
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
        "tier": _effective_customer_tier(
            loyalty.tier if loyalty else None,
            loyalty.total_points_earned if loyalty else 0,
            profile_complete=_is_customer_profile_complete(target.name, target.email, bool(target.phone_verified)),
        ),
        "points_balance": loyalty.points_balance if loyalty else 0,
        "total_points_earned": loyalty.total_points_earned if loyalty else 0,
        "total_orders": stats.total_orders,
        "total_spent": to_float(stats.total_spent),
        "wallet_balance": to_float(wallet.balance) if wallet else 0.0,
        "created_at": target.created_at,
        "phone_verified": target.phone_verified,
        "is_profile_complete": _is_customer_profile_complete(target.name, target.email, bool(target.phone_verified)),
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
    user: AdminUser = Depends(require_hq_access()),
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
        "total_pages": max(1, (total + page_size - 1) // page_size),
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
