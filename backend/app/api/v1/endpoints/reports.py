from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.core.database import get_db
from app.core.security import require_role
from app.models.user import User
from app.models.order import Order, OrderStatus
from app.models.loyalty import LoyaltyTransaction, LoyaltyAccount
from app.models.menu import InventoryItem
from app.models.admin_extras import Feedback
from app.models.reward import Reward, UserReward
from app.models.voucher import Voucher, UserVoucher
from app.models.store import Store

router = APIRouter(prefix="/admin/reports", tags=["Admin Reports"])


@router.get("/revenue")
async def revenue_report(
    from_date: datetime = Query(...), to_date: datetime = Query(...),
    store_id: int = Query(None), group_by: str = Query("day"),
    user: User = Depends(require_role("admin", "store_owner")),
    db: AsyncSession = Depends(get_db),
):
    q = select(Order).where(Order.created_at >= from_date, Order.created_at <= to_date, Order.status != OrderStatus.cancelled)
    if store_id:
        q = q.where(Order.store_id == store_id)
    result = await db.execute(q)
    orders = result.scalars().all()
    total = sum(float(o.total) for o in orders)
    by_type = {}
    by_store = {}
    by_day = {}
    for o in orders:
        ot = o.order_type.value if hasattr(o.order_type, 'value') else str(o.order_type)
        by_type[ot] = by_type.get(ot, 0) + float(o.total)
        by_store[o.store_id] = by_store.get(o.store_id, 0) + float(o.total)
        if group_by == "month":
            key = o.created_at.strftime("%Y-%m") if o.created_at else "unknown"
        else:
            key = o.created_at.date().isoformat() if o.created_at else "unknown"
        by_day[key] = by_day.get(key, 0) + float(o.total)
    return {"total": round(total, 2), "by_type": by_type, "by_store": by_store, "by_day": by_day}


@router.get("/loyalty")
async def loyalty_report(
    from_date: datetime = Query(...), to_date: datetime = Query(...),
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    q = select(LoyaltyTransaction).where(LoyaltyTransaction.created_at >= from_date, LoyaltyTransaction.created_at <= to_date)
    result = await db.execute(q)
    txns = result.scalars().all()
    issued = sum(t.points for t in txns if t.type == "earn")
    redeemed = sum(t.points for t in txns if t.type == "redeem")
    expired = sum(t.points for t in txns if t.type == "expire")
    return {"points_issued": issued, "points_redeemed": redeemed, "points_expired": expired, "transactions": len(txns)}


@router.get("/inventory")
async def inventory_report(
    store_id: int = Query(...),
    user: User = Depends(require_role("admin", "store_owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(InventoryItem).where(InventoryItem.store_id == store_id))
    items = result.scalars().all()
    low_stock = [{"name": i.name, "current": float(i.current_stock), "reorder": float(i.reorder_level)} for i in items if i.current_stock <= i.reorder_level]
    return {"total_items": len(items), "low_stock": low_stock, "items": [{"name": i.name, "stock": float(i.current_stock), "unit": i.unit} for i in items]}


@router.get("/marketing")
async def marketing_report(
    from_date: datetime = Query(...),
    to_date: datetime = Query(...),
    store_id: int = Query(None),
    user: User = Depends(require_role("admin")),
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
        redemptions_q = redemptions_q.where(UserReward.store_id == store_id)
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
        usage_q = usage_q.where(UserVoucher.store_id == store_id)
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
    all_feedback = fb_result.result().scalars().all() if hasattr(fb_result, 'result') else fb_result.scalars().all()
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
        select(LoyaltyAccount)
    )
    accounts = loyalty_result.scalars().all()
    total_members = len(accounts)
    tier_dist = {}
    for a in accounts:
        t = a.tier or "bronze"
        tier_dist[t] = tier_dist.get(t, 0) + 1

    tx_query = select(LoyaltyTransaction).where(LoyaltyTransaction.created_at >= from_date, LoyaltyTransaction.created_at <= to_date)
    tx_result = await db.execute(tx_query)
    txns = tx_result.scalars().all()
    points_issued = sum(t.points for t in txns if t.type == "earn")
    points_redeemed = sum(t.points for t in txns if t.type == "redeem")

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
