"""Admin order management endpoints."""

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import Field
from sqlalchemy import select, func, text, case
from sqlalchemy.orm import joinedload

from app.api.v1.deps import CurrentAdmin, DBDependency, get_staff_store_id_from_request, require_store_admin, _get_admin_store_ids, _get_admin_role_keys
from app.models.customer import Customer
from app.models.order import Order, OrderAdjustment, OrderFulfillment, OrderLineItem, OrderStatusLog
from app.models.menu import MenuItem
from app.models.platform import AuditLog
from app.models.pos import OrderModificationLog
from app.models.reward import CustomerReward, RewardCatalog
from app.models.store import DiningTable
from app.models.voucher import CustomerVoucher, VoucherDefinition
from app.models.wallet import Wallet, WalletLedgerEntry
from app.schemas.base import APIResponse, PaginatedResponse, BaseSchema
from app.schemas.order import (
    ApplyOrderRewardRequest,
    ApplyOrderVoucherRequest,
    OrderAdjustmentOut,
    OrderFulfillmentOut,
    OrderLineItemOut,
    OrderOut,
    OrderStatusLogOut,
    PayWithWalletRequest,
    ProcessOrderPaymentRequest,
    UpdateOrderStatusRequest,
)
from app.services.order import _build_order_out

router = APIRouter(prefix="/admin/orders", tags=["admin — orders"])

ORDER_STATUSES = [
    "pending", "confirmed", "preparing", "ready_for_pickup",
    "out_for_delivery", "delivered", "cancelled_by_customer",
    "cancelled_by_merchant", "refunded", "partially_refunded", "disputed",
]

VALID_STATUS_TRANSITIONS: dict[str, list[str]] = {
    "pending": ["confirmed", "preparing", "cancelled_by_customer", "cancelled_by_merchant"],
    "confirmed": ["preparing", "ready_for_pickup", "out_for_delivery", "delivered", "cancelled_by_customer", "cancelled_by_merchant"],
    "preparing": ["confirmed", "ready_for_pickup", "out_for_delivery", "delivered", "cancelled_by_merchant"],
    "ready_for_pickup": ["confirmed", "preparing", "delivered", "cancelled_by_merchant"],
    "out_for_delivery": ["confirmed", "preparing", "ready_for_pickup", "delivered", "cancelled_by_merchant"],
    "delivered": ["confirmed", "preparing", "ready_for_pickup", "out_for_delivery", "refunded", "partially_refunded", "disputed", "cancelled_by_merchant"],
    "cancelled_by_customer": ["confirmed", "preparing", "refunded"],
    "cancelled_by_merchant": ["confirmed", "preparing", "refunded"],
    "refunded": [],
    "partially_refunded": [],
    "disputed": ["refunded", "partially_refunded"],
}


@router.get("", response_model=APIResponse[PaginatedResponse[dict]])
async def list_orders(
    request: Request,
    admin: CurrentAdmin,
    db: DBDependency,
    status_filter: str | None = Query(None, alias="status"),
    order_type: str | None = Query(None),
    store_id: int | None = Query(None),
    payment_status: str | None = Query(None),
    search: str | None = Query(None, description="Search by order number"),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List all orders with pagination and filters (admin view)."""
    # Enforce store scoping for staff tokens
    staff_store_id = get_staff_store_id_from_request(request)
    if staff_store_id is not None:
        if store_id is not None and store_id != staff_store_id:
            raise HTTPException(status_code=403, detail="Access denied for this store")
        store_id = staff_store_id
    else:
        # Admin token: enforce store scoping for non-HQ admins
        admin_store_ids = await _get_admin_store_ids(db, admin.id)
        admin_roles = await _get_admin_role_keys(db, admin.id)
        is_hq = bool(admin_roles & {"system_admin", "regional_manager", "readonly_analyst"})
        if not is_hq and admin_store_ids:
            if store_id is not None:
                if store_id not in admin_store_ids:
                    raise HTTPException(status_code=403, detail="Access denied for this store")
            else:
                store_id = admin_store_ids

    base_stmt = select(Order).options(
        joinedload(Order.customer),
        joinedload(Order.store),
    ).where(Order.deleted_at.is_(None))

    count_stmt = select(func.count(Order.id)).where(Order.deleted_at.is_(None))

    if status_filter:
        base_stmt = base_stmt.where(Order.status == status_filter)
        count_stmt = count_stmt.where(Order.status == status_filter)
    if order_type:
        base_stmt = base_stmt.where(Order.order_type == order_type)
        count_stmt = count_stmt.where(Order.order_type == order_type)
    if payment_status:
        base_stmt = base_stmt.where(Order.payment_status == payment_status)
        count_stmt = count_stmt.where(Order.payment_status == payment_status)
    if store_id:
        if isinstance(store_id, (list, set)):
            base_stmt = base_stmt.where(Order.store_id.in_(store_id))
            count_stmt = count_stmt.where(Order.store_id.in_(store_id))
        else:
            base_stmt = base_stmt.where(Order.store_id == store_id)
            count_stmt = count_stmt.where(Order.store_id == store_id)
    if search:
        base_stmt = base_stmt.where(Order.order_number.ilike(f"%{search}%"))
        count_stmt = count_stmt.where(Order.order_number.ilike(f"%{search}%"))
    if date_from:
        try:
            dfrom = datetime.fromisoformat(date_from)
            base_stmt = base_stmt.where(Order.created_at >= dfrom)
            count_stmt = count_stmt.where(Order.created_at >= dfrom)
        except ValueError:
            pass
    if date_to:
        try:
            dto = datetime.fromisoformat(date_to)
            base_stmt = base_stmt.where(Order.created_at <= dto)
            count_stmt = count_stmt.where(Order.created_at <= dto)
        except ValueError:
            pass

    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        base_stmt.order_by(Order.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    orders = result.unique().scalars().all()

    # Batch-fetch table numbers and line items
    order_ids = [o.id for o in orders]
    table_ids = [o.dining_table_id for o in orders if o.dining_table_id]
    table_map = {}
    if table_ids:
        t_result = await db.execute(select(DiningTable.id, DiningTable.table_number).where(DiningTable.id.in_(table_ids)))
        table_map = {r[0]: r[1] for r in t_result.all()}

    li_result = await db.execute(select(OrderLineItem).where(OrderLineItem.order_id.in_(order_ids)))
    line_items_map: dict[int, list] = {}
    for li in li_result.scalars().all():
        line_items_map.setdefault(li.order_id, []).append({
            "id": li.id,
            "name": (li.item_snapshot or {}).get("item_name") or (li.item_snapshot or {}).get("name") or f"Item #{li.menu_item_id}",
            "quantity": li.quantity,
            "unit_price": float(li.unit_price),
            "line_total": float(li.line_total),
            "special_instructions": li.special_instructions,
        })

    items = []
    for order in orders:
        item = {
            "id": order.id,
            "order_number": order.order_number,
            "customer_id": order.customer_id,
            "customer_name": order.customer.display_name if order.customer else "Unknown",
            "store_id": order.store_id,
            "store_name": order.store.store_name if order.store else "Unknown",
            "order_type": order.order_type,
            "status": order.status,
            "payment_status": order.payment_status,
            "item_count": order.item_count,
            "total_amount": float(order.total_amount),
            "total_amount_currency": order.total_amount_currency,
            "dining_table_id": order.dining_table_id,
            "table_number": table_map.get(order.dining_table_id) if order.dining_table_id else None,
            "line_items": line_items_map.get(order.id, []),
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        }
        items.append(item)

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page if per_page else 0,
        )
    )


@router.get("/{order_id}", response_model=APIResponse[OrderOut])
async def get_order_detail(admin: CurrentAdmin, db: DBDependency, order_id: int):
    """Get order detail."""
    result = await db.execute(
        select(Order)
        .options(joinedload(Order.customer), joinedload(Order.store))
        .where(Order.id == order_id, Order.deleted_at.is_(None))
    )
    order = result.unique().scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    await require_store_admin(db, admin, order.store_id)

    order_out = _build_order_out(order)

    # Line items
    li_result = await db.execute(
        select(OrderLineItem).where(OrderLineItem.order_id == order.id)
    )
    order_out.line_items = [
        OrderLineItemOut.model_validate(i) for i in li_result.scalars().all()
    ]

    # Status log
    sl_result = await db.execute(
        select(OrderStatusLog)
        .where(OrderStatusLog.order_id == order.id)
        .order_by(OrderStatusLog.created_at.desc())
    )
    order_out.status_log = [
        OrderStatusLogOut.model_validate(i) for i in sl_result.scalars().all()
    ]

    # Adjustments
    adj_result = await db.execute(
        select(OrderAdjustment).where(OrderAdjustment.order_id == order.id)
    )
    order_out.adjustments = [
        OrderAdjustmentOut.model_validate(i) for i in adj_result.scalars().all()
    ]

    # Fulfillment
    ff_result = await db.execute(
        select(OrderFulfillment).where(OrderFulfillment.order_id == order.id)
    )
    fulfillment = ff_result.scalar_one_or_none()
    if fulfillment:
        order_out.fulfillment = OrderFulfillmentOut.model_validate(fulfillment)

    return APIResponse(data=order_out)


@router.patch("/{order_id}/status", response_model=APIResponse[dict])
async def update_order_status(
    admin: CurrentAdmin,
    db: DBDependency,
    order_id: int,
    data: UpdateOrderStatusRequest,
):
    """Update order status (admin)."""
    status_value = data.status
    if not status_value:
        raise HTTPException(status_code=400, detail="status is required")
    if status_value not in ORDER_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Valid: {ORDER_STATUSES}",
        )

    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    await require_store_admin(db, admin, order.store_id)

    from_status = order.status

    # Validate status transition
    if from_status != status_value:
        allowed = VALID_STATUS_TRANSITIONS.get(from_status, [])
        if status_value not in allowed:
            raise HTTPException(
                status_code=409,
                detail=f"Invalid status transition: {from_status} → {status_value}. Allowed from {from_status}: {allowed}",
            )

    # Update timestamp based on status
    now = datetime.now(timezone.utc)
    if status_value == "confirmed":
        order.confirmed_at = now
    elif status_value == "preparing":
        order.prepared_at = now
    elif status_value == "delivered":
        order.completed_at = now
    elif status_value in ("cancelled_by_customer", "cancelled_by_merchant"):
        order.cancelled_at = now

    await db.execute(text("SET LOCAL app.current_actor_type = 'staff'"))
    order.status = status_value
    order.updated_at = now
    await db.commit()
    await db.refresh(order)

    return APIResponse(
        data={
            "id": order.id,
            "status": order.status,
            "from_status": from_status,
            "message": f"Order {order.order_number} status updated to {status_value}",
        }
    )


@router.patch("/{order_id}/payment", response_model=APIResponse[dict])
async def process_order_payment(
    admin: CurrentAdmin,
    db: DBDependency,
    order_id: int,
    data: ProcessOrderPaymentRequest,
):
    """Process POS payment for an order (cash/card/qr)."""
    from app.models.payment import Payment

    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    await require_store_admin(db, admin, order.store_id)

    payment_method = data.payment_method
    amount_tendered = data.amount_tendered
    amount = data.amount if data.amount is not None else float(order.total_amount or 0)
    discount_amount = data.discount_amount
    discount_type = data.discount_type
    tip_amount = data.tip_amount

    if amount < 0:
        raise HTTPException(status_code=400, detail="Payment amount cannot be negative")
    if amount <= 0 and not discount_amount:
        amount = float(order.total_amount or 0)

    # Apply discount if provided (compute from original amount to avoid compounding)
    computed_discount = discount_amount
    if discount_amount > 0:
        if discount_type == "percentage":
            base_amount = float(order.items_subtotal or amount)  # discount on original subtotal, not already-discounted amount
            computed_discount = round(base_amount * discount_amount / 100, 2)
        order.discount_amount = float(order.discount_amount or 0) + computed_discount

    net_amount = max(0, round(amount - computed_discount, 2))
    change = round(max(0, amount_tendered - net_amount), 2)

    # Determine provider based on payment method
    provider_map = {"cash": "cash", "card": "stripe", "qr": "grabpay", "credit_card": "stripe", "debit_card": "stripe", "e_wallet": "grabpay"}
    provider = provider_map.get(payment_method, "cash")

    payment = Payment(
        order_id=order.id,
        provider=provider,
        payment_method_type=payment_method,
        amount=amount,
        currency_code=order.total_amount_currency,
        status="captured",
        net_amount=net_amount,
        idempotency_key=f"pos-payment-{order.id}-{uuid.uuid4().hex}",
    )
    db.add(payment)

    order.payment_status = "captured"
    order.tip_amount = float(order.tip_amount or 0) + tip_amount
    order.updated_at = datetime.now(timezone.utc)

    # Log status change
    log = OrderStatusLog(
        order_id=order.id,
        from_status=order.status,
        to_status=order.status,
        reason=f"Payment processed: {payment_method}, amount={net_amount}",
        actor_type="staff",
        actor_id=admin.id,
    )
    db.add(log)
    await db.commit()
    await db.refresh(order)

    return APIResponse(
        data={
            "id": order.id,
            "order_number": order.order_number,
            "payment_status": order.payment_status,
            "amount": net_amount,
            "change": change,
            "tip_amount": tip_amount,
            "payment_method": payment_method,
            "message": "Payment processed successfully",
        }
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Order-scoped voucher / reward / wallet payment
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/{order_id}/apply-voucher", response_model=APIResponse[dict])
async def apply_order_voucher(
    admin: CurrentAdmin,
    db: DBDependency,
    order_id: int,
    data: ApplyOrderVoucherRequest,
):
    """Apply a customer voucher to an existing order."""
    voucher_code = data.voucher_code.strip()
    if not voucher_code:
        raise HTTPException(status_code=400, detail="voucher_code is required")

    # Load and lock order in one query to prevent TOCTOU race
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await require_store_admin(db, admin, order.store_id)

    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant"):
        raise HTTPException(status_code=400, detail="Cannot apply voucher to a completed/cancelled order")
    result = await db.execute(
        select(CustomerVoucher, VoucherDefinition)
        .join(VoucherDefinition, CustomerVoucher.voucher_definition_id == VoucherDefinition.id, isouter=True)
        .where(
            CustomerVoucher.voucher_code == voucher_code,
            CustomerVoucher.customer_id == order.customer_id,
            CustomerVoucher.status == "active",
        )
        .with_for_update()
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Voucher not found or not active for this customer")
    customer_voucher, voucher_def = row

    # Validate expiry
    now = datetime.now(timezone.utc)
    if customer_voucher.expires_at and customer_voucher.expires_at < now:
        raise HTTPException(status_code=400, detail="Voucher has expired")

    # Validate minimum order value
    subtotal = float(order.items_subtotal or 0)
    min_spend = float(voucher_def.minimum_order_value or 0) if voucher_def else 0
    if subtotal < min_spend:
        raise HTTPException(status_code=400, detail=f"Minimum spend RM {min_spend:.2f} required")

    if voucher_def and voucher_def.minimum_tier_id:
        from app.models.loyalty import LoyaltyAccount
        loyalty_result = await db.execute(
            select(LoyaltyAccount).where(LoyaltyAccount.customer_id == order.customer_id)
        )
        loyalty = loyalty_result.scalar_one_or_none()
        tier_id = loyalty.current_tier_id if loyalty else None
        if tier_id is None or tier_id < voucher_def.minimum_tier_id:
            raise HTTPException(status_code=400, detail="Customer's loyalty tier is not eligible for this voucher")

    # Compute discount
    discount = 0.0
    voucher_type = voucher_def.voucher_type if voucher_def else ""
    discount_value = float(voucher_def.discount_value or 0) if voucher_def else 0

    if voucher_type == "percentage_off":
        discount = round(subtotal * (discount_value / 100), 2)
        max_disc = float(voucher_def.discount_max_amount or 0) if voucher_def else 0
        if max_disc > 0:
            discount = min(discount, max_disc)
    elif voucher_type == "fixed_amount_off":
        discount = discount_value
    elif voucher_type == "free_delivery":
        discount = float(order.delivery_fee or 0)
    elif voucher_type == "free_item":
        line_items_result = await db.execute(
            select(OrderLineItem).where(OrderLineItem.order_id == order_id)
        )
        line_items = line_items_result.scalars().all()
        if voucher_def.menu_item_id:
            for li in line_items:
                if li.menu_item_id == voucher_def.menu_item_id:
                    discount = float(li.unit_price) * li.quantity
                    break
        elif line_items:
            cheapest = min(line_items, key=lambda li: float(li.unit_price))
            discount = float(cheapest.unit_price) * cheapest.quantity
        max_disc = float(voucher_def.discount_max_amount or 0) if voucher_def else 0
        if max_disc > 0:
            discount = min(discount, max_disc)
    else:
        discount = discount_value

    discount = min(discount, subtotal)

    # Mark voucher used
    customer_voucher.status = "used"
    customer_voucher.used_at = now
    customer_voucher.order_id = order_id

    # Update order
    order.voucher_discount = round(float(order.voucher_discount or 0) + discount, 2)
    order.total_amount = round(float(order.total_amount or 0) - discount, 2)
    order.updated_at = now

    # Create adjustment log
    adj = OrderAdjustment(
        order_id=order.id,
        adjustment_type="discount_override",
        amount_delta=round(-discount, 2),
        reason=f"Voucher applied: {voucher_code} ({voucher_def.display_title if voucher_def else voucher_type})",
        approved_by=admin.id,
    )
    db.add(adj)

    # Audit log
    db.add(AuditLog(
        principal_id=admin.id,
        action="apply_voucher",
        resource_type="order",
        resource_id=order_id,
        changes_summary={"voucher_code": voucher_code, "discount": discount, "customer_id": order.customer_id},
    ))

    await db.commit()
    await db.refresh(order)

    return APIResponse(
        data={
            "order_id": order.id,
            "voucher_code": voucher_code,
            "discount_amount": discount,
            "new_total": float(order.total_amount),
            "message": f"Voucher applied. Discount: RM {discount:.2f}",
        }
    )


@router.post("/{order_id}/apply-reward", response_model=APIResponse[dict])
async def apply_order_reward(
    admin: CurrentAdmin,
    db: DBDependency,
    order_id: int,
    data: ApplyOrderRewardRequest,
):
    """Apply a customer reward to an existing order."""
    reward_id = data.reward_id

    # Load and lock order in one query to prevent TOCTOU race
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await require_store_admin(db, admin, order.store_id)

    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant"):
        raise HTTPException(status_code=400, detail="Cannot apply reward to a completed/cancelled order")
    result = await db.execute(
        select(CustomerReward, RewardCatalog)
        .join(RewardCatalog, CustomerReward.reward_catalog_id == RewardCatalog.id, isouter=True)
        .where(
            CustomerReward.id == reward_id,
            CustomerReward.customer_id == order.customer_id,
            CustomerReward.status.in_(["active", "reserved"]),
        )
        .with_for_update()
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Reward not found or not available for this customer")
    customer_reward, reward_cat = row

    # Validate expiry
    now = datetime.now(timezone.utc)
    if customer_reward.expires_at and customer_reward.expires_at < now:
        raise HTTPException(status_code=400, detail="Reward has expired")

    # Compute discount from reward catalog
    discount = 0.0
    if reward_cat and reward_cat.discount_value:
        dv = float(reward_cat.discount_value)
        if reward_cat.reward_type == "percentage_discount":
            order_base = float(order.items_subtotal or 0)
            discount = round(order_base * dv / 100.0, 2)
            if reward_cat.discount_max_amount:
                discount = min(discount, float(reward_cat.discount_max_amount))
        else:
            discount = dv
    elif customer_reward.reward_snapshot:
        snapshot_val = float(customer_reward.reward_snapshot.get("discount_value", 0) or 0)
        snapshot_type = customer_reward.reward_snapshot.get("reward_type", "")
        if snapshot_type == "percentage_discount":
            order_base = float(order.items_subtotal or 0)
            discount = round(order_base * snapshot_val / 100.0, 2)
            snapshot_max = customer_reward.reward_snapshot.get("discount_max_amount")
            if snapshot_max:
                discount = min(discount, float(snapshot_max))
        else:
            discount = snapshot_val

    subtotal = float(order.items_subtotal or 0)
    discount = min(discount, subtotal)

    # Mark reward used
    customer_reward.status = "used"
    customer_reward.used_at = now
    customer_reward.order_id = order_id

    # Update order
    order.reward_discount = round(float(order.reward_discount or 0) + discount, 2)
    order.total_amount = round(float(order.total_amount or 0) - discount, 2)
    order.updated_at = now

    # Create adjustment log
    adj = OrderAdjustment(
        order_id=order.id,
        adjustment_type="discount_override",
        amount_delta=round(-discount, 2),
        reason=f"Reward applied: {reward_cat.reward_name if reward_cat else customer_reward.redemption_code}",
        approved_by=admin.id,
    )
    db.add(adj)

    # Audit log
    db.add(AuditLog(
        principal_id=admin.id,
        action="apply_reward",
        resource_type="order",
        resource_id=order_id,
        changes_summary={"reward_id": reward_id, "discount": discount, "customer_id": order.customer_id},
    ))

    await db.commit()
    await db.refresh(order)

    return APIResponse(
        data={
            "order_id": order.id,
            "reward_id": customer_reward.id,
            "discount_amount": discount,
            "new_total": float(order.total_amount),
            "message": f"Reward applied. Discount: RM {discount:.2f}",
        }
    )


@router.post("/{order_id}/wallet-payment", response_model=APIResponse[dict])
async def pay_with_wallet(
    admin: CurrentAdmin,
    db: DBDependency,
    order_id: int,
    data: PayWithWalletRequest,
):
    """Pay for an order using the customer's wallet credit."""
    amount = data.amount

    # Load order with row lock to prevent concurrent payment race
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id, Order.deleted_at.is_(None))
        .with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await require_store_admin(db, admin, order.store_id)

    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant"):
        raise HTTPException(status_code=400, detail="Cannot pay for a completed/cancelled order")

    # Load wallet
    result = await db.execute(select(Wallet).where(Wallet.customer_id == order.customer_id).with_for_update())
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Customer has no wallet")

    if wallet.is_frozen:
        raise HTTPException(status_code=400, detail="Wallet is frozen")

    # Compute current balance from ledger using SQL SUM
    balance_result = await db.execute(
        select(
            func.coalesce(
                func.sum(
                    case(
                        (WalletLedgerEntry.entry_type.in_(["credit", "release", "adjustment"]), WalletLedgerEntry.amount),
                        else_=0,
                    )
                )
                -
                func.sum(
                    case(
                        (WalletLedgerEntry.entry_type.in_(["debit", "hold"]), WalletLedgerEntry.amount),
                        else_=0,
                    )
                ),
                0,
            )
        ).where(WalletLedgerEntry.wallet_id == wallet.id)
    )
    current_balance = round(float(balance_result.scalar() or 0), 2)

    if current_balance < amount:
        raise HTTPException(status_code=400, detail=f"Insufficient wallet balance. Available: RM {current_balance:.2f}")

    new_balance = round(current_balance - amount, 2)
    now = datetime.now(timezone.utc)

    # Create ledger entry
    ledger = WalletLedgerEntry(
        wallet_id=wallet.id,
        entry_type="debit",
        amount=amount,
        running_balance=new_balance,
        description=f"Order payment #{order.order_number}",
        reference_type="order_payment",
        reference_id=order.id,
    )
    db.add(ledger)

    # Create payment record
    from app.models.payment import Payment
    payment = Payment(
        order_id=order.id,
        provider="internal_wallet",
        payment_method_type="e_wallet",
        amount=amount,
        currency_code=order.total_amount_currency,
        status="captured",
        net_amount=amount,
        idempotency_key=f"wallet-payment-{order.id}-{uuid.uuid4().hex}",
    )
    db.add(payment)

    # Update order payment status if wallet covers full remaining total
    remaining_total = float(order.total_amount or 0)
    if amount >= remaining_total:
        order.payment_status = "captured"
    order.updated_at = now

    # Audit log
    db.add(AuditLog(
        principal_id=admin.id,
        action="wallet_payment",
        resource_type="order",
        resource_id=order_id,
        changes_summary={"amount": amount, "remaining_balance": new_balance, "customer_id": order.customer_id},
    ))

    await db.commit()
    await db.refresh(order)

    return APIResponse(
        data={
            "order_id": order.id,
            "amount_paid": amount,
            "wallet_balance_remaining": new_balance,
            "payment_status": order.payment_status,
            "message": f"RM {amount:.2f} paid from wallet. Remaining balance: RM {new_balance:.2f}",
        }
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Order Modification (add/remove line items + cancel)
# ═══════════════════════════════════════════════════════════════════════════════


class AddLineItemRequest(BaseSchema):
    menu_item_id: int
    quantity: int = Field(1, ge=1, le=99)
    modifier_ids: list[int] = []
    special_instructions: str | None = None
    unit_price: float = Field(0, ge=0)


class RemoveLineItemRequest(BaseSchema):
    reason: str | None = None


@router.post("/{order_id}/items", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def add_order_line_item(
    admin: CurrentAdmin,
    db: DBDependency,
    order_id: int,
    data: AddLineItemRequest,
):
    """Add a line item to an existing order (post-submission modification)."""
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await require_store_admin(db, admin, order.store_id)

    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant", "refunded"):
        raise HTTPException(status_code=400, detail="Cannot modify a completed or cancelled order")

    menu_result = await db.execute(select(MenuItem).where(MenuItem.id == data.menu_item_id))
    menu_item = menu_result.scalar_one_or_none()
    if not menu_item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    price = data.unit_price if data.unit_price > 0 else float(menu_item.base_price or 0)
    total = round(price * data.quantity, 2)

    line_item = OrderLineItem(
        order_id=order.id,
        menu_item_id=menu_item.id,
        item_snapshot={"item_name": menu_item.item_name},
        quantity=data.quantity,
        unit_price=price,
        line_total=total,
        selected_modifiers=data.modifier_ids or {},
        special_instructions=data.special_instructions,
    )
    db.add(line_item)

    order.items_subtotal = float(order.items_subtotal or 0) + total
    order.item_count = (order.item_count or 0) + data.quantity
    order.total_amount = round(float(order.items_subtotal or 0) + float(order.modifier_subtotal or 0) + float(order.delivery_fee or 0) + float(order.service_charge or 0) + float(order.tax_amount or 0) - float(order.discount_amount or 0) - float(order.voucher_discount or 0) - float(order.reward_discount or 0), 2)
    order.updated_at = datetime.now(timezone.utc)

    log = OrderModificationLog(
        order_id=order.id,
        staff_id=admin.id,
        modification_type="add_item",
        new_value={"menu_item_id": data.menu_item_id, "item_name": menu_item.item_name, "quantity": data.quantity, "unit_price": price},
    )
    db.add(log)
    await db.commit()
    await db.refresh(line_item)
    return APIResponse(data={"id": line_item.id, "order_id": order.id, "item_name": line_item.item_snapshot.get("item_name"), "total": total}, status_code=201)


@router.delete("/{order_id}/items/{line_item_id}", response_model=APIResponse[dict])
async def remove_order_line_item(
    admin: CurrentAdmin,
    db: DBDependency,
    order_id: int,
    line_item_id: int,
    reason: str | None = None,
):
    """Void/remove a line item from an existing order."""
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await require_store_admin(db, admin, order.store_id)

    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant", "refunded"):
        raise HTTPException(status_code=400, detail="Cannot modify a completed or cancelled order")

    item_result = await db.execute(
        select(OrderLineItem).where(OrderLineItem.id == line_item_id, OrderLineItem.order_id == order_id)
    )
    line_item = item_result.scalar_one_or_none()
    if not line_item:
        raise HTTPException(status_code=404, detail="Line item not found")

    removed_total = float(line_item.line_total or 0)
    order.items_subtotal = float(order.items_subtotal or 0) - removed_total
    order.item_count = max(0, (order.item_count or 0) - (line_item.quantity or 1))
    order.total_amount = round(float(order.items_subtotal or 0) + float(order.modifier_subtotal or 0) + float(order.delivery_fee or 0) + float(order.service_charge or 0) + float(order.tax_amount or 0) - float(order.discount_amount or 0) - float(order.voucher_discount or 0) - float(order.reward_discount or 0), 2)
    order.total_amount = max(0, order.total_amount)
    order.updated_at = datetime.now(timezone.utc)

    log = OrderModificationLog(
        order_id=order.id,
        staff_id=admin.id,
        modification_type="remove_item",
        line_item_id=line_item.id,
        previous_value={"item_name": line_item.item_snapshot.get("item_name"), "total_price": removed_total},
        reason=reason,
    )
    db.add(log)
    await db.delete(line_item)
    await db.commit()
    return APIResponse(data={"id": line_item_id, "order_id": order.id, "removed": True, "new_total": order.total_amount})


@router.post("/{order_id}/cancel", response_model=APIResponse[dict])
async def cancel_order_staff(
    admin: CurrentAdmin,
    db: DBDependency,
    order_id: int,
    reason: str | None = None,
):
    """Cancel an order from staff POS/orders page."""
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await require_store_admin(db, admin, order.store_id)

    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant", "refunded"):
        raise HTTPException(status_code=400, detail="Order is already completed or cancelled")

    old_status = order.status
    order.status = "cancelled_by_merchant"
    order.cancellation_reason = reason or "Cancelled by staff"
    order.cancelled_by = "merchant"
    order.cancelled_at = datetime.now(timezone.utc)
    order.updated_at = datetime.now(timezone.utc)

    log = OrderStatusLog(
        order_id=order.id,
        from_status=old_status,
        to_status="cancelled_by_merchant",
        reason=reason or "Cancelled by staff",
        actor_type="staff",
        actor_id=admin.id,
    )
    db.add(log)
    await db.commit()
    return APIResponse(data={"id": order.id, "order_number": order.order_number, "status": "cancelled_by_merchant"})


@router.patch("/{order_id}/transfer-table", response_model=APIResponse[dict])
async def transfer_table(
    admin: CurrentAdmin,
    db: DBDependency,
    order_id: int,
    new_table_id: int = Query(..., ge=1),
):
    """Transfer a dine-in order to a different table."""
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await require_store_admin(db, admin, order.store_id)

    if order.order_type != "dine_in":
        raise HTTPException(status_code=400, detail="Only dine-in orders support table transfer")
    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant", "refunded"):
        raise HTTPException(status_code=400, detail="Cannot transfer a completed or cancelled order")

    if order.dining_table_id == new_table_id:
        raise HTTPException(status_code=400, detail="Order is already assigned to this table")

    table_result = await db.execute(
        select(DiningTable).where(
            DiningTable.id == new_table_id,
            DiningTable.store_id == order.store_id,
            DiningTable.deleted_at.is_(None),
        )
    )
    new_table = table_result.scalar_one_or_none()
    if not new_table:
        raise HTTPException(status_code=404, detail="Table not found in this store")

    if new_table.status == "occupied" and new_table.active_order_id != order.id:
        raise HTTPException(status_code=400, detail="Target table is occupied by a different order")

    old_table_id = order.dining_table_id
    order.dining_table_id = new_table_id
    order.updated_at = datetime.now(timezone.utc)

    # Free old table
    if old_table_id:
        old_result = await db.execute(select(DiningTable).where(DiningTable.id == old_table_id))
        old_table = old_result.scalar_one_or_none()
        if old_table:
            old_table.status = "available"
            old_table.active_order_id = None

    new_table.status = "occupied"
    new_table.active_order_id = order.id

    await db.commit()
    return APIResponse(data={
        "id": order.id,
        "order_number": order.order_number,
        "old_table_id": old_table_id,
        "new_table_id": new_table_id,
        "new_table_number": new_table.table_number,
    })
