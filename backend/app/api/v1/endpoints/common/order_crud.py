import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.commerce import (
    credit_wallet,
    enum_value,
    serialize_order_item,
    settle_order_payment,
    validate_delivery_request,
)
from app.core.database import get_db
from app.core.security import get_current_user, require_role, require_hq_access, is_global_admin, is_hq, can_access_store, now_utc, ensure_utc
from app.core.webhooks import verify_webhook_request
from app.core.audit import log_action
from app.core.utils import to_float
from app.core.config import get_settings
from app.models.user import User, UserTypeIDs, RoleIDs
from app.models.order import Order, OrderStatusHistory, OrderType, OrderStatus, CartItem, OrderItem, Payment, CheckoutToken
from app.models.menu import MenuItem
from app.models.store import Store
from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction, LoyaltyTier
from app.models.notification import Notification
from app.models.voucher import UserVoucher
from app.models.reward import UserReward
from app.models.splash import AppConfig
from app.schemas.order import OrderCreate, OrderOut, OrderStatusUpdate, OrderListOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["Orders"])

VALID_TRANSITIONS = {
    "pending": ["paid", "confirmed", "cancelled"],
    "paid": ["confirmed", "cancelled"],
    "confirmed": ["preparing", "cancelled"],
    "preparing": ["ready", "cancelled"],
    "ready": ["out_for_delivery", "completed", "cancelled"],
    "out_for_delivery": ["completed", "cancelled"],
}

FLOW_A_TYPES = {"pickup", "delivery"}
FLOW_B_TYPES = {"dine_in"}

VALID_TRANSITIONS_BY_TYPE = {
    "pickup": {
        "pending": ["confirmed", "cancelled"],
        "confirmed": ["preparing", "cancelled"],
        "preparing": ["ready", "cancelled"],
        "ready": ["completed", "cancelled"],
    },
    "delivery": {
        "pending": ["confirmed", "cancelled"],
        "confirmed": ["preparing", "cancelled"],
        "preparing": ["ready", "cancelled"],
        "ready": ["out_for_delivery", "cancelled"],
        "out_for_delivery": ["completed", "cancelled"],
    },
    "dine_in": {
        "pending": ["confirmed", "cancelled"],
        "confirmed": ["preparing", "cancelled"],
        "preparing": ["ready", "cancelled"],
        "ready": ["completed", "cancelled"],
    },
}


def _order_out(order: Order, timeline: list[dict] | None = None) -> OrderOut:
    items = [serialize_order_item(item) for item in (order.items or [])]
    return OrderOut(
        id=order.id,
        user_id=order.user_id,
        store_id=order.store_id,
        table_id=order.table_id,
        order_number=order.order_number,
        order_type=order.order_type,
        items=items,
        subtotal=to_float(order.subtotal),
        delivery_fee=to_float(order.delivery_fee),
        discount=to_float(order.discount),
        voucher_discount=to_float(order.voucher_discount),
        reward_discount=to_float(order.reward_discount),
        voucher_code=order.voucher_code,
        reward_redemption_code=order.reward_redemption_code,
        total=to_float(order.total),
        status=order.status,
        pickup_time=order.pickup_time,
        delivery_address=order.delivery_address,
        payment_method=order.payment_method,
        payment_status=order.payment_status,
        loyalty_points_earned=order.loyalty_points_earned,
        notes=order.notes,
        delivery_provider=order.delivery_provider,
        delivery_status=order.delivery_status,
        delivery_external_id=order.delivery_external_id,
        delivery_quote_id=order.delivery_quote_id,
        delivery_tracking_url=order.delivery_tracking_url,
        delivery_eta_minutes=order.delivery_eta_minutes,
        delivery_courier_name=order.delivery_courier_name,
        delivery_courier_phone=order.delivery_courier_phone,
        delivery_last_event_at=order.delivery_last_event_at,
        pos_synced_at=order.pos_synced_at,
        pos_synced_by=order.pos_synced_by,
        delivery_dispatched_at=order.delivery_dispatched_at,
        delivery_dispatched_by=order.delivery_dispatched_by,
        staff_notes=order.staff_notes,
        created_at=order.created_at,
        updated_at=order.updated_at,
        status_timeline=timeline,
    )


@router.post("", response_model=OrderOut, status_code=201)
async def create_order(
    req: OrderCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cart_result = await db.execute(select(CartItem).where(CartItem.user_id == user.id))
    cart_items = cart_result.scalars().all()
    if not cart_items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    ctk = None
    if req.checkout_token:
        ctk_result = await db.execute(
            select(CheckoutToken).where(
                CheckoutToken.token == req.checkout_token,
                CheckoutToken.user_id == user.id,
                CheckoutToken.is_used == False,
                CheckoutToken.expires_at > datetime.now(timezone.utc),
            )
        )
        ctk = ctk_result.scalar_one_or_none()
        if not ctk or ctk.is_used or ensure_utc(ctk.expires_at) < now_utc():
            raise HTTPException(status_code=400, detail="Invalid or expired checkout token. Please go back to checkout and try again.")
        if req.store_id and ctk.store_id != req.store_id:
            raise HTTPException(status_code=400, detail="Checkout token store mismatch. Please restart checkout.")

    if req.order_type == OrderType.dine_in and not req.table_id:
        raise HTTPException(status_code=400, detail="table_id required for dine_in")
    if req.order_type == OrderType.pickup and not req.pickup_time:
        raise HTTPException(status_code=400, detail="pickup_time required for pickup")
    if req.order_type == OrderType.delivery and not req.delivery_address:
        raise HTTPException(status_code=400, detail="delivery_address required for delivery")

    if req.order_type == OrderType.dine_in and req.table_id:
        from app.models.store import StoreTable as STModel
        from app.models.marketing import TableOccupancySnapshot
        table_result = await db.execute(select(STModel).where(STModel.id == req.table_id))
        table_obj = table_result.scalar_one_or_none()
        if not table_obj:
            raise HTTPException(status_code=400, detail="Table not found")
        if not table_obj.is_active:
            raise HTTPException(status_code=400, detail="Table is not active")
        existing_active = await db.execute(
            select(Order).where(
                Order.table_id == req.table_id,
                Order.order_type == OrderType.dine_in,
                Order.status.in_([OrderStatus.pending, OrderStatus.confirmed, OrderStatus.preparing, OrderStatus.ready]),
                Order.user_id != user.id,
            )
        )
        if existing_active.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Table is currently occupied by another customer")
        table_obj.is_occupied = True
        snap_result = await db.execute(
            select(TableOccupancySnapshot).where(TableOccupancySnapshot.table_id == req.table_id)
        )
        snapshot = snap_result.scalar_one_or_none()
        if snapshot:
            snapshot.is_occupied = True
            snapshot.updated_at = datetime.now(timezone.utc)
        else:
            snapshot = TableOccupancySnapshot(
                table_id=req.table_id,
                store_id=table_obj.store_id,
                is_occupied=True,
            )
            db.add(snapshot)
        await db.flush()

    if req.voucher_code and getattr(req, 'reward_redemption_code', None):
        raise HTTPException(status_code=400, detail="Only one discount allowed per order")

    store_id = req.store_id or cart_items[0].store_id

    for ci in cart_items:
        if ci.store_id != store_id:
            raise HTTPException(status_code=400, detail="All cart items must be from the same store")

    order_items = []
    subtotal = 0.0
    for ci in cart_items:
        ir = await db.execute(select(MenuItem).where(MenuItem.id == ci.item_id))
        mi = ir.scalar_one_or_none()
        if not mi:
            raise HTTPException(status_code=400, detail=f"Menu item {ci.item_id} not found")
        # Menu items are universal (HQ-managed); store validation is done
        # on cart item store_id, not menu item store_id.
        name = mi.name
        price = to_float(ci.unit_price)
        custom_adj = 0.0
        customizations_data = None
        if ci.customization_option_ids:
            customizations_data = {"option_ids": ci.customization_option_ids}
            from app.models.marketing import CustomizationOption
            opts_result = await db.execute(
                select(CustomizationOption).where(CustomizationOption.id.in_(ci.customization_option_ids))
            )
            for opt in opts_result.scalars().all():
                custom_adj += to_float(opt.price_adjustment)
        line_total = round((price + custom_adj) * ci.quantity, 2)
        order_items.append({
            "item_id": ci.item_id, "name": name, "quantity": ci.quantity,
            "unit_price": price, "customizations": customizations_data,
            "line_total": line_total,
        })
        subtotal += line_total

    delivery_fee = 0.0
    delivery_provider = None
    delivery_address = req.delivery_address
    delivery_status = None
    if req.order_type == OrderType.delivery:
        _, delivery_address, _ = await validate_delivery_request(
            db,
            store_id,
            subtotal,
            req.delivery_address,
            customer_name=user.name,
            customer_phone=user.phone,
        )
        from app.models.splash import AppConfig
        cfg = await db.execute(select(AppConfig).where(AppConfig.key == "delivery_fee"))
        fee_row = cfg.scalar_one_or_none()
        delivery_fee = float(fee_row.value) if fee_row else 3.0
        delivery_provider = getattr(req, 'delivery_provider', None) or "internal"
        delivery_status = "awaiting_dispatch"

    if ctk:
        if abs(subtotal - to_float(ctk.subtotal)) > 0.01:
            raise HTTPException(status_code=400, detail="Cart has changed since checkout. Please restart checkout.")
        if abs(delivery_fee - to_float(ctk.delivery_fee)) > 0.01:
            raise HTTPException(status_code=400, detail="Delivery fee has changed since checkout. Please restart checkout.")

    voucher_discount = 0.0
    reward_discount = 0.0
    used_voucher_code = None
    used_reward_code = None
    used_voucher = None
    used_reward = None

    if ctk:
        if ctk.voucher_code:
            uv_result = await db.execute(
                select(UserVoucher).where(
                    UserVoucher.code == ctk.voucher_code,
                    UserVoucher.user_id == user.id,
                )
            )
            uv = uv_result.scalar_one_or_none()
            if uv:
                voucher_discount = to_float(ctk.discount_amount)
                used_voucher_code = ctk.voucher_code
                used_voucher = uv
                uv.status = "used"
                uv.used_at = datetime.now(timezone.utc)
        elif ctk.reward_id:
            ur_result = await db.execute(
                select(UserReward).where(
                    UserReward.id == ctk.reward_id,
                    UserReward.user_id == user.id,
                )
            )
            ur = ur_result.scalar_one_or_none()
            if ur:
                reward_discount = to_float(ctk.discount_amount)
                used_reward = ur
                if ur.redemption_code:
                    used_reward_code = ur.redemption_code
                ur.status = "used"
                ur.used_at = datetime.now(timezone.utc)
                ur.is_used = True
    else:
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

            if min_spend and subtotal < min_spend:
                raise HTTPException(status_code=400, detail=f"Minimum spend RM{min_spend:.0f} required")

            if disc_type == "percent":
                voucher_discount = round(subtotal * disc_value / 100, 2)
            elif disc_type in ("fixed", "free_item"):
                voucher_discount = disc_value

            voucher_discount = min(voucher_discount, subtotal + delivery_fee)
            used_voucher_code = req.voucher_code
            used_voucher = uv
            uv.status = "used"
            uv.used_at = datetime.now(timezone.utc)
            uv.order_id = None

        elif getattr(req, 'reward_redemption_code', None):
            ur_result = await db.execute(
                select(UserReward).where(
                    UserReward.redemption_code == req.reward_redemption_code,
                    UserReward.user_id == user.id,
                )
            )
            ur = ur_result.scalar_one_or_none()
            if not ur:
                raise HTTPException(status_code=400, detail="Reward not found")
            if ur.status != "available":
                raise HTTPException(status_code=400, detail=f"Reward is {ur.status}")

            from app.models.reward import Reward
            r_result = await db.execute(select(Reward).where(Reward.id == ur.reward_id))
            reward = r_result.scalar_one_or_none()
            if not reward:
                raise HTTPException(status_code=400, detail="Reward not found")

            disc_value = to_float(reward.discount_value) if reward.discount_value else 0
            if disc_value:
                reward_discount = min(disc_value, subtotal + delivery_fee - voucher_discount)

            used_reward_code = req.reward_redemption_code
            used_reward = ur
            ur.status = "used"
            ur.used_at = datetime.now(timezone.utc)
            ur.is_used = True
            ur.order_id = None

    discount = round(voucher_discount + reward_discount, 2)
    total = round(subtotal + delivery_fee - discount, 2)

    if ctk:
        if abs(total - to_float(ctk.total)) > 0.01:
            raise HTTPException(status_code=400, detail="Order total mismatch. Please restart checkout.")
        ctk.is_used = True

    order_number = f"ORD-{uuid.uuid4().hex[:8].upper()}"

    order = Order(
        user_id=user.id, store_id=store_id, table_id=req.table_id,
        order_number=order_number, order_type=req.order_type,
        items=order_items, subtotal=round(subtotal, 2),
        delivery_fee=round(delivery_fee, 2), discount=round(discount, 2),
        voucher_discount=round(voucher_discount, 2),
        reward_discount=round(reward_discount, 2),
        voucher_code=used_voucher_code,
        reward_redemption_code=used_reward_code,
        total=total, status=OrderStatus.pending,
        pickup_time=req.pickup_time, delivery_address=delivery_address,
        payment_method=req.payment_method, notes=req.notes,
        delivery_provider=delivery_provider,
        delivery_status=delivery_status,
    )
    db.add(order)
    await db.flush()

    if used_voucher is not None:
        used_voucher.order_id = order.id
        used_voucher.store_id = order.store_id
    if used_reward is not None:
        used_reward.order_id = order.id
        used_reward.store_id = order.store_id

    for oi in order_items:
        oi_record = OrderItem(
            order_id=order.id,
            menu_item_id=oi.get("item_id"),
            name=oi["name"],
            quantity=oi["quantity"],
            unit_price=oi["unit_price"],
            customizations=oi.get("customizations"),
            line_total=oi["line_total"],
        )
        db.add(oi_record)

    history = OrderStatusHistory(order_id=order.id, status=OrderStatus.pending, note="Order placed")
    db.add(history)

    for ci in cart_items:
        await db.delete(ci)

    notif = Notification(
        user_id=user.id, title="Order Placed",
        body=f"Your order {order_number} has been placed!",
        type="order", is_read=False,
    )
    db.add(notif)
    await db.flush()

    return _order_out(order)


@router.get("", response_model=OrderListOut)
async def list_orders(
    page: int = 1, page_size: int = 20,
    store_id: int | None = None,
    status: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if is_global_admin(user) or is_hq(user):
        q = select(Order).order_by(Order.created_at.desc())
    else:
        q = select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc())

    if store_id:
        q = q.where(Order.store_id == store_id)
    if status:
        q = q.where(Order.status == status)
    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar() or 0
    result = await db.execute(q.offset((page - 1) * page_size).limit(page_size))
    orders = result.scalars().all()
    out = [_order_out(o) for o in orders]
    return OrderListOut(orders=out, total=total, page=page, page_size=page_size)


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != user.id and not is_global_admin(user):
        if not await can_access_store(user, order.store_id, db):
            raise HTTPException(status_code=403, detail="Forbidden")
    hist_result = await db.execute(
        select(OrderStatusHistory).where(OrderStatusHistory.order_id == order_id).order_by(OrderStatusHistory.created_at)
    )
    timeline = [{"status": h.status.value if hasattr(h.status, 'value') else str(h.status), "note": h.note, "created_at": h.created_at.isoformat() if h.created_at else None} for h in hist_result.scalars().all()]
    return _order_out(order, timeline=timeline)


@router.post("/{order_id}/reorder")
async def reorder(order_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    added_items = []
    for item_data in order.items:
        ir = await db.execute(select(MenuItem).where(MenuItem.id == item_data.get("item_id")))
        mi = ir.scalar_one_or_none()
        if not mi:
            continue
        option_ids = (item_data.get("customizations") or {}).get("option_ids") if item_data.get("customizations") else None
        existing = await db.execute(
            select(CartItem).where(CartItem.user_id == user.id, CartItem.item_id == mi.id)
        )
        all_same_item = existing.scalars().all()
        ci = None
        for item in all_same_item:
            if item.customization_option_ids == option_ids:
                ci = item
                break
        if ci:
            ci.quantity += item_data.get("quantity", 1)
        else:
            from app.api.v1.endpoints.pwa.cart import _hash_option_ids
            ci = CartItem(
                user_id=user.id, store_id=order.store_id, item_id=mi.id,
                quantity=item_data.get("quantity", 1),
                customization_option_ids=option_ids,
                customization_hash=_hash_option_ids(option_ids),
                unit_price=mi.base_price,
            )
            db.add(ci)
        added_items.append(
            {
                "menu_item_id": mi.id,
                "name": mi.name,
                "price": to_float(mi.base_price),
                "quantity": item_data.get("quantity", 1),
                "customizations": item_data.get("customizations"),
            }
        )
    await db.flush()
    return {"message": "Items added to cart", "items": added_items, "store_id": order.store_id}


@router.post("/{order_id}/cancel")
async def cancel_order(order_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not is_global_admin(user) and order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Cannot cancel another user's order")
    if order.status in (OrderStatus.completed, OrderStatus.cancelled):
        raise HTTPException(status_code=400, detail="Cannot cancel this order")
    was_paid = order.payment_status == "paid"
    order.status = OrderStatus.cancelled
    history = OrderStatusHistory(order_id=order.id, status=OrderStatus.cancelled, note="Cancelled by user")
    db.add(history)

    if order.voucher_code:
        voucher_result = await db.execute(
            select(UserVoucher).where(
                UserVoucher.code == order.voucher_code,
                UserVoucher.user_id == order.user_id,
            )
        )
        voucher = voucher_result.scalar_one_or_none()
        if voucher:
            voucher.status = "available"
            voucher.used_at = None
            voucher.order_id = None
            voucher.store_id = None

    if order.reward_redemption_code:
        reward_result = await db.execute(
            select(UserReward).where(
                UserReward.redemption_code == order.reward_redemption_code,
                UserReward.user_id == order.user_id,
            )
        )
        reward = reward_result.scalar_one_or_none()
        if reward:
            reward.status = "available"
            reward.used_at = None
            reward.is_used = False
            reward.order_id = None
            reward.store_id = None

    if order.payment_status == "paid" and order.loyalty_points_earned and order.loyalty_points_earned > 0:
        la_result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == order.user_id))
        la = la_result.scalar_one_or_none()
        if la:
            await db.execute(
                update(LoyaltyAccount)
                .where(LoyaltyAccount.user_id == order.user_id)
                .values(
                    points_balance=LoyaltyAccount.points_balance - order.loyalty_points_earned,
                    total_points_earned=LoyaltyAccount.total_points_earned - order.loyalty_points_earned,
                )
            )
            lt = LoyaltyTransaction(
                user_id=order.user_id, order_id=order.id, store_id=order.store_id,
                points=-order.loyalty_points_earned, type="redeem",
                description=f"Points reversed: order {order.order_number} cancelled",
            )
            db.add(lt)
        order.loyalty_points_earned = 0

    if was_paid:
        if order.payment_method == "wallet":
            await credit_wallet(
                db,
                order.user_id,
                to_float(order.total),
                description=f"Refund for cancelled order {order.order_number}",
            )
        order.payment_status = "refunded"
        from app.models.order import Payment
        p_result = await db.execute(select(Payment).where(Payment.order_id == order.id))
        payment = p_result.scalar_one_or_none()
        if payment:
            payment.status = "refunded"

    await db.flush()
    return {"message": "Order cancelled", "loyalty_reversed": was_paid}
