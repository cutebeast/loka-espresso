import csv
import io
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_

from app.core.database import get_db
from app.core.security import require_role, require_hq_access
from app.core.utils import to_float
from app.models.user import User, RoleIDs
from app.models.order import Order, OrderStatus
from app.models.loyalty import LoyaltyTransaction, LoyaltyAccount
from app.models.menu import InventoryItem
from app.models.feedback import Feedback
from app.models.reward import Reward, UserReward
from app.models.voucher import Voucher, UserVoucher
from app.models.store import Store

router = APIRouter(prefix="/admin/reports", tags=["Admin Reports"])


@router.get("/revenue")
async def revenue_report(
    from_date: datetime = Query(...), to_date: datetime = Query(...),
    store_id: int = Query(None), group_by: str = Query("day"),
    page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=500),
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    base_q = select(Order).where(Order.created_at >= from_date, Order.created_at <= to_date, Order.status != OrderStatus.cancelled)
    if store_id:
        base_q = base_q.where(Order.store_id == store_id)
    
    count_result = await db.execute(select(func.count()).select_from(base_q.subquery()))
    total_count = count_result.scalar() or 0
    
    q = base_q.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    orders = result.scalars().all()

    total = sum(to_float(o.total) for o in orders)
    by_type = {}
    by_store = {}
    by_day = {}
    for o in orders:
        ot = o.order_type.value if hasattr(o.order_type, 'value') else str(o.order_type)
        by_type[ot] = by_type.get(ot, 0) + to_float(o.total)
        by_store[o.store_id] = by_store.get(o.store_id, 0) + to_float(o.total)
        if group_by == "month":
            key = o.created_at.strftime("%Y-%m") if o.created_at else "unknown"
        else:
            key = o.created_at.date().isoformat() if o.created_at else "unknown"
        by_day[key] = by_day.get(key, 0) + to_float(o.total)

    total_pages = (total_count + page_size - 1) // page_size
    return {"total": round(total, 2), "by_type": by_type, "by_store": by_store, "by_day": by_day,
            "order_count": len(orders), "page": page, "page_size": page_size, "total_pages": total_pages}


@router.get("/loyalty")
async def loyalty_report(
    from_date: datetime = Query(...), to_date: datetime = Query(...),
    page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=500),
    user: User = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    base_q = select(LoyaltyTransaction).where(LoyaltyTransaction.created_at >= from_date, LoyaltyTransaction.created_at <= to_date)
    count_result = await db.execute(select(func.count()).select_from(base_q.subquery()))
    total_count = count_result.scalar() or 0
    
    q = base_q.order_by(LoyaltyTransaction.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    txns = result.scalars().all()
    issued = sum(t.points for t in txns if t.type == "earn")
    redeemed = sum(t.points for t in txns if t.type == "redeem")
    expired = sum(t.points for t in txns if t.type == "expire")
    total_pages = (total_count + page_size - 1) // page_size
    return {"points_issued": issued, "points_redeemed": redeemed, "points_expired": expired,
            "transactions": len(txns), "page": page, "page_size": page_size, "total_pages": total_pages}


@router.get("/inventory")
async def inventory_report(
    store_id: int = Query(...),
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(InventoryItem).where(InventoryItem.store_id == store_id))
    items = result.scalars().all()
    low_stock = [{"name": i.name, "current": to_float(i.current_stock), "reorder": to_float(i.reorder_level)} for i in items if i.current_stock <= i.reorder_level]
    return {"total_items": len(items), "low_stock": low_stock, "items": [{"name": i.name, "stock": to_float(i.current_stock), "unit": i.unit} for i in items]}


@router.get("/marketing")
async def marketing_report(
    from_date: datetime = Query(...),
    to_date: datetime = Query(...),
    store_id: int = Query(None),
    user: User = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    # --- Rewards (ALL active, even zero redemptions — zeros are marketing data) ---
    reward_result = await db.execute(select(Reward).where(Reward.is_active == True))
    all_rewards = reward_result.scalars().all()
    total_rewards = len(all_rewards)

    total_reward_result = await db.execute(select(Reward))
    active_rewards = len([r for r in total_reward_result.scalars().all() if r.is_active])

    redemptions_q = select(UserReward).where(UserReward.redeemed_at >= from_date, UserReward.redeemed_at <= to_date)
    if store_id:
        redemptions_q = redemptions_q.outerjoin(Order, UserReward.order_id == Order.id)
        redemptions_q = redemptions_q.where(or_(UserReward.store_id == store_id, Order.store_id == store_id))
    redemptions_result = await db.execute(redemptions_q)
    redemptions = redemptions_result.scalars().all()
    total_redemptions = len(redemptions)
    # Start every active reward at 0, then increment
    redemptions_by_reward = {r.name: 0 for r in all_rewards}
    for ur in redemptions:
        r = next((r for r in all_rewards if r.id == ur.reward_id), None)
        name = r.name if r else f"Reward {ur.reward_id}"
        redemptions_by_reward[name] = redemptions_by_reward.get(name, 0) + 1

    # --- Vouchers (ALL active, even zero usages — zeros are marketing data) ---
    voucher_result = await db.execute(select(Voucher).where(Voucher.is_active == True))
    all_vouchers = voucher_result.scalars().all()
    total_vouchers = len(all_vouchers)

    total_voucher_result = await db.execute(select(Voucher))
    active_vouchers = len([v for v in total_voucher_result.scalars().all() if v.is_active])

    usage_q = select(UserVoucher).where(UserVoucher.applied_at >= from_date, UserVoucher.applied_at <= to_date)
    if store_id:
        usage_q = usage_q.outerjoin(Order, UserVoucher.order_id == Order.id)
        usage_q = usage_q.where(or_(UserVoucher.store_id == store_id, Order.store_id == store_id))
    usage_result = await db.execute(usage_q)
    usages = usage_result.scalars().all()
    total_voucher_usages = len(usages)
    # Start every active voucher at 0, then increment
    usage_by_voucher = {v.code: 0 for v in all_vouchers}
    for uv in usages:
        v = next((v for v in all_vouchers if v.id == uv.voucher_id), None)
        name = v.code if v else f"Voucher {uv.voucher_id}"
        usage_by_voucher[name] = usage_by_voucher.get(name, 0) + 1

    # --- Feedback ---
    fb_query = select(Feedback).where(Feedback.created_at >= from_date, Feedback.created_at <= to_date)
    if store_id:
        fb_query = fb_query.where(Feedback.store_id == store_id)
    fb_result = await db.execute(fb_query)
    all_feedback = fb_result.scalars().all()
    total_feedback = len(all_feedback)
    avg_rating = sum(f.rating for f in all_feedback) / total_feedback if total_feedback > 0 else 0
    resolved = len([f for f in all_feedback if f.is_resolved])
    unreplied = len([f for f in all_feedback if not f.admin_reply])
    rating_dist = {}
    for f in all_feedback:
        key = str(f.rating)
        rating_dist[key] = rating_dist.get(key, 0) + 1

    # Feedback by store
    fb_by_store = {}
    store_ids = {f.store_id for f in all_feedback if f.store_id}
    if store_ids:
        s_result = await db.execute(select(Store).where(Store.id.in_(store_ids)))
        store_map = {s.id: s.name for s in s_result.scalars().all()}
        for f in all_feedback:
            sname = store_map.get(f.store_id, f"Store {f.store_id}")
            if sname not in fb_by_store:
                fb_by_store[sname] = {"count": 0, "total_rating": 0}
            fb_by_store[sname]["count"] += 1
            fb_by_store[sname]["total_rating"] += f.rating
    # Convert to averages
    fb_by_store_avg = {k: {"count": v["count"], "avg_rating": round(v["total_rating"] / v["count"], 1)} for k, v in fb_by_store.items()}

    # --- Loyalty ---
    loyalty_result = await db.execute(
        select(User, LoyaltyAccount)
        .join(LoyaltyAccount, LoyaltyAccount.user_id == User.id, isouter=True)
        .where(User.role_id == RoleIDs.CUSTOMER)
    )
    loyalty_rows = loyalty_result.all()
    total_members = 0
    tier_dist = {}
    for customer, account in loyalty_rows:
        profile_complete = bool(customer.phone_verified and (customer.name or "").strip() and (customer.email or "").strip())
        if not profile_complete:
            continue
        total_members += 1
        tier_name = (account.tier if account and account.tier else "bronze").strip().lower()
        tier_dist[tier_name] = tier_dist.get(tier_name, 0) + 1

    tx_query = select(LoyaltyTransaction).where(LoyaltyTransaction.created_at >= from_date, LoyaltyTransaction.created_at <= to_date)
    tx_result = await db.execute(tx_query)
    txns = tx_result.scalars().all()
    points_issued = sum(t.points for t in txns if t.type == "earn")
    points_redeemed = sum(-t.points for t in txns if t.type == "redeem")

    return {
        "period": {"from": from_date.isoformat(), "to": to_date.isoformat()},
        "rewards": {
            "total": total_rewards,
            "active": active_rewards,
            "total_redemptions": total_redemptions,
            "top_redeemed": dict(sorted(redemptions_by_reward.items(), key=lambda x: -x[1])),
        },
        "vouchers": {
            "total": total_vouchers,
            "active": active_vouchers,
            "total_usages": total_voucher_usages,
            "top_used": dict(sorted(usage_by_voucher.items(), key=lambda x: -x[1])),
        },
        "feedback": {
            "total": total_feedback,
            "average_rating": round(avg_rating, 1),
            "resolved": resolved,
            "unreplied": unreplied,
            "rating_distribution": rating_dist,
            "by_store": fb_by_store_avg,
        },
        "loyalty": {
            "total_members": total_members,
            "tier_distribution": tier_dist,
            "points_issued": points_issued,
            "points_redeemed": points_redeemed,
        },
    }


@router.get("/marketing/paginated")
async def marketing_report_paginated(
    from_date: datetime = Query(...),
    to_date: datetime = Query(...),
    store_id: int = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    # --- Rewards ---
    reward_result = await db.execute(select(Reward).where(Reward.is_active == True))
    all_rewards = reward_result.scalars().all()
    total_rewards = len(all_rewards)

    total_reward_result = await db.execute(select(Reward))
    active_rewards = len([r for r in total_reward_result.scalars().all() if r.is_active])

    redemptions_q = select(UserReward).where(UserReward.redeemed_at >= from_date, UserReward.redeemed_at <= to_date)
    if store_id:
        redemptions_q = redemptions_q.outerjoin(Order, UserReward.order_id == Order.id)
        redemptions_q = redemptions_q.where(or_(UserReward.store_id == store_id, Order.store_id == store_id))
    redemptions_result = await db.execute(redemptions_q)
    redemptions = redemptions_result.scalars().all()
    total_redemptions = len(redemptions)

    redemptions_by_reward = {r.name: 0 for r in all_rewards}
    for ur in redemptions:
        r = next((r for r in all_rewards if r.id == ur.reward_id), None)
        name = r.name if r else f"Reward {ur.reward_id}"
        redemptions_by_reward[name] = redemptions_by_reward.get(name, 0) + 1

    # --- Vouchers ---
    voucher_result = await db.execute(select(Voucher).where(Voucher.is_active == True))
    all_vouchers = voucher_result.scalars().all()
    total_vouchers = len(all_vouchers)

    total_voucher_result = await db.execute(select(Voucher))
    active_vouchers = len([v for v in total_voucher_result.scalars().all() if v.is_active])

    usage_q = select(UserVoucher).where(UserVoucher.applied_at >= from_date, UserVoucher.applied_at <= to_date)
    if store_id:
        usage_q = usage_q.outerjoin(Order, UserVoucher.order_id == Order.id)
        usage_q = usage_q.where(or_(UserVoucher.store_id == store_id, Order.store_id == store_id))
    usage_result = await db.execute(usage_q)
    usages = usage_result.scalars().all()
    total_voucher_usages = len(usages)

    usage_by_voucher = {v.code: 0 for v in all_vouchers}
    for uv in usages:
        v = next((v for v in all_vouchers if v.id == uv.voucher_id), None)
        name = v.code if v else f"Voucher {uv.voucher_id}"
        usage_by_voucher[name] = usage_by_voucher.get(name, 0) + 1

    # --- Feedback (paginated) ---
    fb_query = select(Feedback).where(Feedback.created_at >= from_date, Feedback.created_at <= to_date)
    if store_id:
        fb_query = fb_query.where(Feedback.store_id == store_id)
    fb_count_result = await db.execute(select(func.count()).select_from(fb_query.subquery()))
    total_feedback = fb_count_result.scalar() or 0

    fb_paginated = fb_query.order_by(Feedback.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    fb_result = await db.execute(fb_paginated)
    all_feedback = fb_result.scalars().all()

    avg_rating = sum(f.rating for f in all_feedback) / len(all_feedback) if all_feedback else 0
    resolved = len([f for f in all_feedback if f.is_resolved])
    unreplied = len([f for f in all_feedback if not f.admin_reply])
    rating_dist = {}
    for f in all_feedback:
        key = str(f.rating)
        rating_dist[key] = rating_dist.get(key, 0) + 1

    # Feedback by store
    fb_by_store = {}
    store_ids = {f.store_id for f in all_feedback if f.store_id}
    if store_ids:
        s_result = await db.execute(select(Store).where(Store.id.in_(store_ids)))
        store_map = {s.id: s.name for s in s_result.scalars().all()}
        for f in all_feedback:
            sname = store_map.get(f.store_id, f"Store {f.store_id}")
            if sname not in fb_by_store:
                fb_by_store[sname] = {"count": 0, "total_rating": 0}
            fb_by_store[sname]["count"] += 1
            fb_by_store[sname]["total_rating"] += f.rating
    fb_by_store_avg = {k: {"count": v["count"], "avg_rating": round(v["total_rating"] / v["count"], 1)} for k, v in fb_by_store.items()}

    # --- Loyalty ---
    loyalty_result = await db.execute(
        select(User, LoyaltyAccount)
        .join(LoyaltyAccount, LoyaltyAccount.user_id == User.id, isouter=True)
        .where(User.role_id == RoleIDs.CUSTOMER)
    )
    loyalty_rows = loyalty_result.all()
    total_members = 0
    tier_dist = {}
    for customer, account in loyalty_rows:
        profile_complete = bool(customer.phone_verified and (customer.name or "").strip() and (customer.email or "").strip())
        if not profile_complete:
            continue
        total_members += 1
        tier_name = (account.tier if account and account.tier else "bronze").strip().lower()
        tier_dist[tier_name] = tier_dist.get(tier_name, 0) + 1

    tx_query = select(LoyaltyTransaction).where(LoyaltyTransaction.created_at >= from_date, LoyaltyTransaction.created_at <= to_date)
    tx_result = await db.execute(tx_query)
    txns = tx_result.scalars().all()
    points_issued = sum(t.points for t in txns if t.type == "earn")
    points_redeemed = sum(-t.points for t in txns if t.type == "redeem")

    total_feedback_pages = (total_feedback + page_size - 1) // page_size

    return {
        "period": {"from": from_date.isoformat(), "to": to_date.isoformat()},
        "page": page,
        "page_size": page_size,
        "total_pages": total_feedback_pages,
        "total_counts": {
            "rewards": total_rewards,
            "active_rewards": active_rewards,
            "total_redemptions": total_redemptions,
            "vouchers": total_vouchers,
            "active_vouchers": active_vouchers,
            "total_voucher_usages": total_voucher_usages,
            "total_feedback": total_feedback,
            "total_members": total_members,
        },
        "rewards": {
            "top_redeemed": dict(sorted(redemptions_by_reward.items(), key=lambda x: -x[1])),
        },
        "vouchers": {
            "top_used": dict(sorted(usage_by_voucher.items(), key=lambda x: -x[1])),
        },
        "feedback": {
            "average_rating": round(avg_rating, 1),
            "resolved": resolved,
            "unreplied": unreplied,
            "rating_distribution": rating_dist,
            "by_store": fb_by_store_avg,
        },
        "loyalty": {
            "tier_distribution": tier_dist,
            "points_issued": points_issued,
            "points_redeemed": points_redeemed,
        },
    }


@router.get("/csv")
async def export_orders_csv(
    from_date: datetime = Query(...),
    to_date: datetime = Query(...),
    store_id: int = Query(None),
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    base_q = select(Order).where(
        Order.created_at >= from_date,
        Order.created_at <= to_date,
        Order.status != OrderStatus.cancelled,
    )
    if store_id:
        base_q = base_q.where(Order.store_id == store_id)
    base_q = base_q.order_by(Order.created_at.desc())
    result = await db.execute(base_q)
    orders = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Order Number", "Date", "Status", "Type", "Subtotal", "Discount", "Total", "Store"])

    for o in orders:
        writer.writerow([
            o.order_number or "",
            o.created_at.isoformat() if o.created_at else "",
            o.status.value if hasattr(o.status, 'value') else str(o.status),
            o.order_type.value if hasattr(o.order_type, 'value') else str(o.order_type),
            round(to_float(o.subtotal), 2),
            round(to_float(o.discount), 2),
            round(to_float(o.total), 2),
            o.store_id,
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=orders-{from_date.date()}-{to_date.date()}.csv"},
    )
