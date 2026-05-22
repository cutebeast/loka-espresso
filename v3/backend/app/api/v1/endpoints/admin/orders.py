"""Admin order management endpoints."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import select, func, text
from sqlalchemy.orm import joinedload

from app.api.v1.deps import CurrentAdmin, DBDependency, get_staff_store_id_from_request
from app.models.customer import Customer
from app.models.order import Order, OrderAdjustment, OrderFulfillment, OrderLineItem, OrderStatusLog
from app.models.store import Store, DiningTable
from app.models.voucher import CustomerVoucher, VoucherDefinition
from app.models.reward import CustomerReward, RewardCatalog
from app.models.wallet import Wallet, WalletLedgerEntry
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.order import (
    OrderAdjustmentOut,
    OrderFulfillmentOut,
    OrderLineItemOut,
    OrderOut,
    OrderStatusLogOut,
)

router = APIRouter(prefix="/admin/orders", tags=["admin — orders"])

ORDER_STATUSES = [
    "pending", "confirmed", "preparing", "ready_for_pickup",
    "out_for_delivery", "delivered", "cancelled_by_customer",
    "cancelled_by_merchant", "refunded", "partially_refunded", "disputed",
]


def _build_order_out(order: Order) -> OrderOut:
    """Build OrderOut from Order model."""
    order_dict = {c: getattr(order, c) for c in order.__table__.columns.keys()}
    return OrderOut.model_validate(order_dict)


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
    per_page: int = Query(20, ge=1, le=100),
):
    """List all orders with pagination and filters (admin view)."""
    # Enforce store scoping for staff tokens
    staff_store_id = get_staff_store_id_from_request(request)
    if staff_store_id is not None:
        if store_id is not None and store_id != staff_store_id:
            raise HTTPException(status_code=403, detail="Access denied for this store")
        store_id = staff_store_id

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
    data: dict,
):
    """Update order status (admin)."""
    status_value = data.get("status")
    if not status_value:
        raise HTTPException(status_code=400, detail="status is required")
    if status_value not in ORDER_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Valid: {ORDER_STATUSES}",
        )

    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None))
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    from_status = order.status

    # Update timestamp based on status
    now = datetime.now(timezone.utc)
    if status_value == "confirmed":
        order.confirmed_at = now
    elif status_value == "preparing":
        order.prepared_at = now
    elif status_value in ("delivered", "completed"):
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
    data: dict,
):
    """Process POS payment for an order (cash/card/qr)."""
    from app.models.payment import Payment

    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None))
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    payment_method = data.get("payment_method", "cash")
    amount_tendered = float(data.get("amount_tendered", 0) or 0)
    amount = float(data.get("amount") or order.total_amount or 0)
    discount_amount = float(data.get("discount_amount", 0) or 0)
    discount_type = data.get("discount_type")

    if amount <= 0 and not discount_amount:
        amount = float(order.total_amount or 0)

    # Apply discount if provided (compute from original amount to avoid compounding)
    computed_discount = discount_amount
    if discount_amount > 0:
        if discount_type == "percentage":
            computed_discount = round(amount * discount_amount / 100, 2)
        order.discount_amount = float(order.discount_amount or 0) + computed_discount

    net_amount = round(amount - computed_discount, 2)
    change = round(max(0, amount_tendered - net_amount), 2)

    # Determine provider based on payment method
    provider_map = {"cash": "cash", "card": "internal_wallet", "qr": "internal_wallet", "credit_card": "internal_wallet", "debit_card": "internal_wallet"}
    provider = provider_map.get(payment_method, "cash")

    payment = Payment(
        order_id=order.id,
        provider=provider,
        payment_method_type=payment_method,
        amount=amount,
        currency_code=order.total_amount_currency,
        status="captured",
        net_amount=net_amount,
        idempotency_key=f"pos-payment-{order.id}-{datetime.now(timezone.utc).timestamp()}",
    )
    db.add(payment)

    order.payment_status = "captured"
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
    data: dict,
):
    """Apply a customer voucher to an existing order."""
    voucher_code = data.get("voucher_code", "").strip()
    if not voucher_code:
        raise HTTPException(status_code=400, detail="voucher_code is required")

    # Load order
    result = await db.execute(select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant"):
        raise HTTPException(status_code=400, detail="Cannot apply voucher to a completed/cancelled order")

    # Load voucher
    result = await db.execute(
        select(CustomerVoucher, VoucherDefinition)
        .join(VoucherDefinition, CustomerVoucher.voucher_definition_id == VoucherDefinition.id, isouter=True)
        .where(
            CustomerVoucher.voucher_code == voucher_code,
            CustomerVoucher.customer_id == order.customer_id,
            CustomerVoucher.status == "active",
        )
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
    else:
        # Fallback: treat as fixed amount
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
    data: dict,
):
    """Apply a customer reward to an existing order."""
    reward_id = data.get("reward_id")
    if not reward_id:
        raise HTTPException(status_code=400, detail="reward_id is required")

    # Load order
    result = await db.execute(select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant"):
        raise HTTPException(status_code=400, detail="Cannot apply reward to a completed/cancelled order")

    # Load reward
    result = await db.execute(
        select(CustomerReward, RewardCatalog)
        .join(RewardCatalog, CustomerReward.reward_catalog_id == RewardCatalog.id, isouter=True)
        .where(
            CustomerReward.id == int(reward_id),
            CustomerReward.customer_id == order.customer_id,
            CustomerReward.status.in_(["active", "reserved"]),
        )
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
        discount = float(reward_cat.discount_value)
    elif customer_reward.reward_snapshot:
        discount = float(customer_reward.reward_snapshot.get("discount_value", 0) or 0)

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
    data: dict,
):
    """Pay for an order using the customer's wallet credit."""
    amount = float(data.get("amount", 0) or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be greater than 0")

    # Load order
    result = await db.execute(select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant"):
        raise HTTPException(status_code=400, detail="Cannot pay for a completed/cancelled order")

    # Load wallet
    result = await db.execute(select(Wallet).where(Wallet.customer_id == order.customer_id))
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Customer has no wallet")

    if wallet.is_frozen:
        raise HTTPException(status_code=400, detail="Wallet is frozen")

    # Compute current balance from ledger
    lr = await db.execute(select(WalletLedgerEntry).where(WalletLedgerEntry.wallet_id == wallet.id))
    total_credited = 0.0
    total_debited = 0.0
    for entry in lr.scalars().all():
        if entry.entry_type in ("credit", "release"):
            total_credited += float(entry.amount)
        elif entry.entry_type in ("debit", "hold"):
            total_debited += float(entry.amount)
        elif entry.entry_type == "adjustment":
            total_credited += float(entry.amount)
    current_balance = round(total_credited - total_debited, 2)

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
        idempotency_key=f"wallet-payment-{order.id}-{now.timestamp()}",
    )
    db.add(payment)

    # Update order payment status if wallet covers full remaining total
    remaining_total = float(order.total_amount or 0)
    if amount >= remaining_total:
        order.payment_status = "captured"
    order.updated_at = now

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
