"""Admin order management endpoints."""

import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

logger = logging.getLogger(__name__)

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import Field
from sqlalchemy import select, func, text, case, or_
from sqlalchemy.orm import joinedload

from app.api.routes.deps import CurrentAdmin, DBDependency, get_staff_store_id_from_request, require_store_admin, _get_admin_store_ids, _get_admin_role_keys, enum_filter_or_400
from app.core.money import money_round, to_decimal
from app.models.customer import Customer
from app.models.order import Order, OrderAdjustment, OrderFulfillment, OrderLineItem, OrderStatusLog
from app.models.menu import MenuItem, MenuCategory
from app.models.platform import AuditLog
from app.models.pos import OrderModificationLog
from app.models.reward import CustomerReward, RewardCatalog
from app.models.store import DiningTable, TableStatusSnapshot
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
from app.services.order import OrderError, reverse_order_effects, validate_voucher_eligibility, _build_order_out, _priced_modifier_options
from app.services.payment import PaymentError, cancel_pending_order_payments, create_stripe_checkout_session
from app.services.platform_config import PlatformConfigService

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
    # Cancelled orders are terminal except the money-reconciliation exit
    # (refunded) — resurrection to confirmed/preparing would silently undo
    # the cancel-time reversal (stock/vouchers/points/order_count).
    "cancelled_by_customer": ["refunded"],
    "cancelled_by_merchant": ["refunded"],
    # Refunded orders may still be formally cancelled (refund reverses money
    # and benefits; the cancel restores stock/seats/table — reverse_order_effects
    # is safe here: points already zeroed, voucher release is status-guarded).
    "refunded": ["cancelled_by_merchant"],
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
    search: str | None = Query(None, description="Search by order number or customer phone"),
    category_slug: str | None = Query(None, description="Only orders containing a line item whose menu item is in this category (e.g. 'experiences')"),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List all orders with pagination and filters (admin view)."""
    from app.models.enums import OrderStatus, OrderType, PaymentStatus
    status_filter = enum_filter_or_400(status_filter, OrderStatus, "status")
    order_type = enum_filter_or_400(order_type, OrderType, "order_type")
    payment_status = enum_filter_or_400(payment_status, PaymentStatus, "payment_status")
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
        if not is_hq:
            if not admin_store_ids:
                # Non-HQ admin with no store assignments sees nothing
                return APIResponse(
                    data=PaginatedResponse(
                        items=[],
                        total=0,
                        page=page,
                        per_page=per_page,
                        total_pages=0,
                    )
                )
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
    else:
        # Default: exclude cancelled (noise). Staff can explicitly request them via ?status=cancelled_by_customer
        base_stmt = base_stmt.where(Order.status.notin_(["cancelled_by_customer", "cancelled_by_merchant"]))
        count_stmt = count_stmt.where(Order.status.notin_(["cancelled_by_customer", "cancelled_by_merchant"]))
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
        base_stmt = base_stmt.outerjoin(Customer, Customer.id == Order.customer_id).where(
            or_(
                Order.order_number.ilike(f"%{search}%"),
                Customer.phone_number.ilike(f"%{search}%"),
            )
        )
        count_stmt = count_stmt.outerjoin(Customer, Customer.id == Order.customer_id).where(
            or_(
                Order.order_number.ilike(f"%{search}%"),
                Customer.phone_number.ilike(f"%{search}%"),
            )
        )
    if category_slug:
        category_order_ids = (
            select(OrderLineItem.order_id)
            .join(MenuItem, MenuItem.id == OrderLineItem.menu_item_id)
            .join(MenuCategory, MenuCategory.id == MenuItem.category_id)
            .where(MenuCategory.slug == category_slug)
        )
        base_stmt = base_stmt.where(Order.id.in_(category_order_ids))
        count_stmt = count_stmt.where(Order.id.in_(category_order_ids))
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
            "total_amount": order.total_amount,
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
    # Customer identity for the detail header (walk-in guests show as "Walk-in")
    if order.customer is not None:
        order_out.customer_name = order.customer.display_name
        order_out.customer_phone = order.customer.phone_number

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

    # Prepaid-only delivery (anti-prank policy, same guard as the staff
    # endpoint): an unpaid delivery order must not move forward — payment
    # capture confirms it. Cancellations are always allowed.
    is_cancellation_target = status_value in ("cancelled_by_customer", "cancelled_by_merchant")
    is_delivery_order = order.order_type == "delivery" or order.fulfillment_type in (
        "standard_delivery", "express_delivery", "third_party_delivery",
    )
    if (
        not is_cancellation_target
        and from_status != status_value
        and is_delivery_order
        and order.payment_status not in ("captured", "partially_refunded")
    ):
        raise HTTPException(
            status_code=400,
            detail="Delivery order must be paid before it can be advanced",
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

    is_cancellation = (
        status_value in ("cancelled_by_customer", "cancelled_by_merchant")
        and from_status != status_value
    )
    if is_cancellation:
        from app.models.payment import Payment
        has_captured = (await db.execute(
            select(Payment.id).where(
                Payment.order_id == order.id,
                Payment.status.in_(("captured", "partially_refunded")),
            ).limit(1)
        )).scalar_one_or_none()
        if has_captured is not None:
            raise HTTPException(status_code=400, detail="Order has captured payments — issue a refund before cancelling")

    await db.execute(text("SET LOCAL app.current_actor_type = 'staff'"))
    order.status = status_value
    order.updated_at = now
    if is_cancellation and data.reason:
        order.cancellation_reason = data.reason
        order.cancelled_by = "merchant" if status_value == "cancelled_by_merchant" else "customer"
    await db.flush()

    cancelled_payment_ids: list[int] = []
    if is_cancellation:
        await reverse_order_effects(db, order)
        cancelled_payment_ids = await cancel_pending_order_payments(db, order.id)

    await db.commit()
    await db.refresh(order)

    # Transactional notification (savepoint-isolated; never blocks the status change).
    from app.services.transactional_notifications import notify_order_status
    await notify_order_status(db, order, status_value, reason=data.reason)

    response_data = {
        "id": order.id,
        "status": order.status,
        "from_status": from_status,
        "message": f"Order {order.order_number} status updated to {status_value}",
    }
    if is_cancellation:
        response_data["cancelled_payment_ids"] = cancelled_payment_ids

    return APIResponse(data=response_data)


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

    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant"):
        raise HTTPException(status_code=400, detail="Cannot pay for a completed/cancelled order")

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    # Prevent overpayment: compute already-captured amount for this order.
    # Prevent overpayment: compute already-captured amount for this order by
    # summing captured payments. (Order has no denormalized captured_amount
    # column, so the Payment table is the source of truth.)
    existing_payments = await db.execute(
        select(Payment).where(
            Payment.order_id == order.id,
            Payment.status.in_(("captured", "partially_refunded")),
        )
    )
    captured_from_payments = money_round(
        sum(
            to_decimal(p.captured_amount or 0) - to_decimal(p.refunded_amount or 0)
            for p in existing_payments.scalars().all()
        ),
        precision,
        rounding_mode,
    )
    # In-request tracker for the order's captured total; updated as payments are
    # recorded below so overpayment checks and final status reflect this payment.
    order_captured = captured_from_payments
    already_paid = captured_from_payments

    payment_method = data.payment_method
    amount_tendered = to_decimal(data.amount_tendered or 0)
    amount = to_decimal(data.amount) if data.amount is not None else None
    discount_amount = to_decimal(data.discount_amount or 0)
    discount_type = data.discount_type
    tip_amount = to_decimal(data.tip_amount or 0)

    # Recompute the expected total server-side; do not trust client-supplied amount/discount/tip.
    # order.total_amount is the current amount due before this POS payment.
    current_total = money_round(to_decimal(order.total_amount), precision, rounding_mode)
    computed_discount = Decimal(0)
    if discount_amount > 0:
        if discount_type == "percentage":
            computed_discount = money_round(
                to_decimal(order.items_subtotal or order.total_amount) * discount_amount / Decimal(100),
                precision,
                rounding_mode,
            )
        else:
            computed_discount = money_round(discount_amount, precision, rounding_mode)
        computed_discount = min(computed_discount, current_total)

    if already_paid > 0 and computed_discount > 0:
        raise HTTPException(status_code=400, detail="Cannot apply discount after a payment has already been made")

    expected_total = money_round(max(Decimal(0), current_total - computed_discount + tip_amount), precision, rounding_mode)
    if amount is not None and abs(money_round(amount, precision, rounding_mode) - expected_total) > Decimal(0):
        raise HTTPException(
            status_code=400,
            detail=f"Payment amount does not match expected total. Expected: RM {expected_total:.2f}, Received: RM {amount:.2f}",
        )

    order.discount_amount = money_round(to_decimal(order.discount_amount or 0) + computed_discount, precision, rounding_mode)
    order.total_amount = expected_total
    order.tip_amount = money_round(to_decimal(order.tip_amount or 0) + tip_amount, precision, rounding_mode)

    remaining_due = money_round(expected_total - already_paid, precision, rounding_mode)

    # Prevent double payment: reject if order is already fully paid
    if already_paid > 0 and remaining_due <= 0:
        raise HTTPException(status_code=400, detail=f"Order is already fully paid (RM {already_paid:.2f})")

    net_amount = max(Decimal(0), remaining_due)

    # If wallet fully covered the bill, there is nothing left to capture.
    fully_paid_by_wallet = net_amount <= 0

    # Cash tender validation
    change = Decimal(0)
    if payment_method == "cash":
        if amount_tendered < net_amount:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient cash tendered. Required: RM {net_amount:.2f}, Tendered: RM {amount_tendered:.2f}",
            )
        change = money_round(amount_tendered - net_amount, precision, rounding_mode)

    # Map POS methods to valid DB enum values
    method_type_map = {
        "cash": "cash",
        "card": "credit_card",
        "qr": "e_wallet",
        "stripe_qr": "qr_pay",
        "credit_card": "credit_card",
        "debit_card": "debit_card",
        "e_wallet": "e_wallet",
    }
    payment_method_type = method_type_map.get(payment_method, "cash")
    provider_map = {
        "cash": "cash",
        "card": "stripe",
        "stripe_qr": "stripe",
        "credit_card": "stripe",
        "debit_card": "stripe",
    }
    provider = provider_map.get(payment_method, "cash")
    is_stripe_qr = payment_method == "stripe_qr"

    # Idempotency: stable key including the running paid total so legitimate
    # equal split shares (3× RM12) are distinct while exact double-taps 409
    # (mirrors the staff POS path).
    idempotency_key = f"pos-payment-{order.id}-{payment_method}-{net_amount:.2f}-{already_paid:.2f}"
    dup_check = await db.execute(
        select(Payment).where(Payment.idempotency_key == idempotency_key, Payment.status == "captured")
    )
    if dup_check.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Duplicate payment request")

    # Void any earlier live provider session on this order before issuing a
    # new QR session — a pending session can still be paid (double-charge).
    if is_stripe_qr and net_amount > 0:
        await cancel_pending_order_payments(db, order.id)

    payment = None
    payment_url: str | None = None
    if net_amount > 0:
        payment = Payment(
            order_id=order.id,
            provider=provider,
            payment_method_type=payment_method_type,
            amount=net_amount,
            currency_code=order.total_amount_currency,
            status="pending_authorization" if is_stripe_qr else "captured",
            # Refunds compute the refundable balance from captured_amount —
            # it must mirror the captured total for cash/manual payments.
            captured_amount=Decimal(0) if is_stripe_qr else net_amount,
            net_amount=Decimal(0) if is_stripe_qr else net_amount,
            idempotency_key=idempotency_key,
        )
        db.add(payment)
        await db.flush()
        await db.refresh(payment)

        if is_stripe_qr:
            order.payment_status = "pending_authorization"
            try:
                checkout = await create_stripe_checkout_session(db, payment, order, customer_id=order.customer_id)
            except PaymentError as exc:
                await db.rollback()
                raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
            payment.provider_transaction_id = checkout["id"]
            payment_url = checkout["url"]
        else:
            # Track the captured amount in-request for idempotent balance tracking.
            order_captured = money_round(order_captured + net_amount, precision, rounding_mode)

    order.updated_at = datetime.now(timezone.utc)

    # Payment status reflects whether the order is fully paid
    if not is_stripe_qr:
        total_paid = order_captured
        if total_paid >= to_decimal(order.total_amount):
            order.payment_status = "captured"
        elif total_paid > 0:
            order.payment_status = "initiated"

    if fully_paid_by_wallet:
        order.payment_status = "captured"

    # Paid orders advance to the kitchen: pending -> confirmed (prepaid
    # PWA/kiosk orders paid in cash at the counter must enter the queue).
    if order.payment_status == "captured" and order.status == "pending":
        order.status = "confirmed"

    # Grant loyalty points on capture (idempotent — this endpoint sets the
    # status directly instead of going through _sync_order_payment_status).
    if order.payment_status == "captured":
        # Spend-based lucky draw: grant tickets whenever the order ends up
        # captured (idempotent per order) — same as the staff/POS paths.
        from app.services.lucky_draw import grant_tickets_for_order
        await grant_tickets_for_order(db, order)
        from app.services.payment import _credit_order_loyalty_points
        await _credit_order_loyalty_points(db, order)
        if payment is not None:
            from app.services.payment import _accrue_loyalty_annual_spend
            await _accrue_loyalty_annual_spend(db, payment)

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

    # LHDN e-invoice: auto-issue on captured payments when einvoice.auto_issue
    # is on. Fully guarded — e-invoicing must never break the payment flow.
    if order.payment_status == "captured" and payment is not None:
        try:
            from app.services.einvoice import auto_issue_on_payment
            await auto_issue_on_payment(db, order, payment)
        except Exception:
            logger.exception("e-invoice auto-issue failed for order %s", order.id)
        # Receipt email (self-gated on email.receipts_enabled, idempotent,
        # failure-swallowing).
        from app.services.email import send_order_receipt_email
        await send_order_receipt_email(db, order, payment)
        # Receipt/drawer print jobs (self-gated on print.*, idempotent,
        # failure-swallowing).
        from app.services.printing import auto_print_on_payment
        await auto_print_on_payment(db, order, payment)

    response_data: dict = {
        "id": order.id,
        "order_number": order.order_number,
        "payment_status": order.payment_status,
        "amount": net_amount,
        "change": change,
        "tip_amount": tip_amount,
        "payment_method": payment_method,
        "message": "Payment processed successfully",
    }
    if payment_url:
        response_data["payment_url"] = payment_url

    return APIResponse(data=response_data)


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
    if order.payment_status in ("captured", "settled"):
        raise HTTPException(status_code=400, detail="Cannot apply voucher to an order that has already been paid")
    if to_decimal(order.reward_discount) > 0:
        raise HTTPException(status_code=400, detail="This order already has a reward applied — one voucher OR one reward per order")
    # A zero-discount redemption (e.g. free_delivery reward on a takeaway order)
    # leaves reward_discount at 0 — also reject when a reward is bound to the order.
    bound_reward = (await db.execute(
        select(CustomerReward.id).where(CustomerReward.order_id == order_id).limit(1)
    )).scalar_one_or_none()
    if bound_reward is not None:
        raise HTTPException(status_code=400, detail="This order already has a reward applied — one voucher OR one reward per order")

    result = await db.execute(
        select(CustomerVoucher, VoucherDefinition)
        .join(VoucherDefinition, CustomerVoucher.voucher_definition_id == VoucherDefinition.id, isouter=True)
        .where(
            CustomerVoucher.voucher_code == voucher_code,
            CustomerVoucher.customer_id == order.customer_id,
            CustomerVoucher.status == "active",
        )
        .with_for_update(of=CustomerVoucher)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Voucher not found or not active for this customer")
    customer_voucher, voucher_def = row

    # Validate expiry
    now = datetime.now(timezone.utc)
    if customer_voucher.expires_at and customer_voucher.expires_at < now:
        raise HTTPException(status_code=400, detail="Voucher has expired")

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    # Validate minimum order value
    subtotal = to_decimal(order.items_subtotal)
    min_spend = to_decimal(voucher_def.minimum_order_value) if voucher_def else Decimal(0)
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

    if voucher_def:
        li_ids_result = await db.execute(
            select(OrderLineItem.menu_item_id).where(OrderLineItem.order_id == order.id)
        )
        try:
            await validate_voucher_eligibility(
                db, voucher_def, customer_voucher,
                customer_id=order.customer_id,
                store_id=order.store_id,
                menu_item_ids={r[0] for r in li_ids_result.all()},
                has_other_discount=(
                    to_decimal(order.reward_discount) > 0 or to_decimal(order.voucher_discount) > 0
                ),
                current_order_id=order.id,
            )
        except OrderError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    # Compute discount
    discount = Decimal(0)
    voucher_type = voucher_def.voucher_type if voucher_def else ""
    discount_value = to_decimal(voucher_def.discount_value) if voucher_def else Decimal(0)

    if voucher_type == "percentage_off":
        discount = money_round(subtotal * (discount_value / Decimal(100)), precision, rounding_mode)
        max_disc = to_decimal(voucher_def.discount_max_amount) if voucher_def else Decimal(0)
        if max_disc > 0:
            discount = min(discount, max_disc)
    elif voucher_type == "fixed_amount_off":
        discount = discount_value
    elif voucher_type == "free_delivery":
        discount = to_decimal(order.delivery_fee)
    elif voucher_type == "free_item":
        line_items_result = await db.execute(
            select(OrderLineItem).where(OrderLineItem.order_id == order_id)
        )
        line_items = line_items_result.scalars().all()
        if voucher_def.menu_item_id:
            for li in line_items:
                if li.menu_item_id == voucher_def.menu_item_id:
                    discount = to_decimal(li.unit_price) * li.quantity
                    break
        elif line_items:
            cheapest = min(line_items, key=lambda li: to_decimal(li.unit_price))
            discount = to_decimal(cheapest.unit_price) * cheapest.quantity
        max_disc = to_decimal(voucher_def.discount_max_amount) if voucher_def else Decimal(0)
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
    order.voucher_discount = money_round(to_decimal(order.voucher_discount) + discount, precision, rounding_mode)
    order.discount_amount = money_round(to_decimal(order.discount_amount) + discount, precision, rounding_mode)
    order.total_amount = money_round(to_decimal(order.total_amount) - discount, precision, rounding_mode)
    order.updated_at = now

    # Create adjustment log
    adj = OrderAdjustment(
        order_id=order.id,
        adjustment_type="discount_override",
        amount_delta=money_round(-discount, precision, rounding_mode),
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
        changes_summary={"voucher_code": voucher_code, "discount": str(discount), "customer_id": order.customer_id},
    ))

    await db.commit()
    await db.refresh(order)

    return APIResponse(
        data={
            "order_id": order.id,
            "voucher_code": voucher_code,
            "discount_amount": discount,
            "new_total": order.total_amount,
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
    if order.payment_status in ("captured", "settled"):
        raise HTTPException(status_code=400, detail="Cannot apply reward to an order that has already been paid")
    if to_decimal(order.voucher_discount) > 0:
        raise HTTPException(status_code=400, detail="This order already has a voucher applied — one voucher OR one reward per order")
    # A zero-discount redemption (e.g. free_delivery voucher on a takeaway order)
    # leaves voucher_discount at 0 — also reject when a voucher is bound to the order.
    bound_voucher = (await db.execute(
        select(CustomerVoucher.id).where(CustomerVoucher.order_id == order_id).limit(1)
    )).scalar_one_or_none()
    if bound_voucher is not None:
        raise HTTPException(status_code=400, detail="This order already has a voucher applied — one voucher OR one reward per order")

    result = await db.execute(
        select(CustomerReward, RewardCatalog)
        .join(RewardCatalog, CustomerReward.reward_catalog_id == RewardCatalog.id, isouter=True)
        .where(
            CustomerReward.id == reward_id,
            CustomerReward.customer_id == order.customer_id,
            CustomerReward.status.in_(["active", "reserved"]),
        )
        .with_for_update(of=CustomerReward)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Reward not found or not available for this customer")
    customer_reward, reward_cat = row

    # Validate expiry
    now = datetime.now(timezone.utc)
    if customer_reward.expires_at and customer_reward.expires_at < now:
        raise HTTPException(status_code=400, detail="Reward has expired")

    order_base = to_decimal(order.items_subtotal)
    min_order = to_decimal(reward_cat.minimum_order_value) if reward_cat else Decimal(0)
    if order_base < min_order:
        raise HTTPException(status_code=400, detail=f"Reward requires minimum order of {min_order:.2f}")

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    # Compute discount from reward catalog
    discount = Decimal(0)
    if reward_cat and reward_cat.discount_value:
        dv = to_decimal(reward_cat.discount_value)
        if reward_cat.reward_type == "percentage_discount":
            order_base = to_decimal(order.items_subtotal)
            discount = money_round(order_base * dv / Decimal(100), precision, rounding_mode)
            if reward_cat.discount_max_amount:
                discount = min(discount, to_decimal(reward_cat.discount_max_amount))
        else:
            discount = dv
    elif customer_reward.reward_snapshot:
        snapshot_val = to_decimal(customer_reward.reward_snapshot.get("discount_value", 0))
        snapshot_type = customer_reward.reward_snapshot.get("reward_type", "")
        if snapshot_type == "percentage_discount":
            order_base = to_decimal(order.items_subtotal)
            discount = money_round(order_base * snapshot_val / Decimal(100), precision, rounding_mode)
            snapshot_max = customer_reward.reward_snapshot.get("discount_max_amount")
            if snapshot_max:
                discount = min(discount, to_decimal(snapshot_max))
        else:
            discount = snapshot_val

    subtotal = to_decimal(order.items_subtotal)
    discount = min(discount, subtotal)

    # Mark reward used
    customer_reward.status = "used"
    customer_reward.used_at = now
    customer_reward.order_id = order_id

    # Update order
    order.reward_discount = money_round(to_decimal(order.reward_discount) + discount, precision, rounding_mode)
    order.discount_amount = money_round(to_decimal(order.discount_amount) + discount, precision, rounding_mode)
    order.total_amount = money_round(to_decimal(order.total_amount) - discount, precision, rounding_mode)
    order.updated_at = now

    # Create adjustment log
    adj = OrderAdjustment(
        order_id=order.id,
        adjustment_type="discount_override",
        amount_delta=money_round(-discount, precision, rounding_mode),
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
        changes_summary={"reward_id": reward_id, "discount": str(discount), "customer_id": order.customer_id},
    ))

    await db.commit()
    await db.refresh(order)

    return APIResponse(
        data={
            "order_id": order.id,
            "reward_id": customer_reward.id,
            "discount_amount": discount,
            "new_total": order.total_amount,
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
    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    amount = to_decimal(data.amount)

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
    current_balance = money_round(balance_result.scalar() or 0, precision, rounding_mode)

    if current_balance < amount:
        raise HTTPException(status_code=400, detail=f"Insufficient wallet balance. Available: RM {current_balance:.2f}")

    # Prevent overpayment: compute already-captured amount for this order
    from app.models.payment import Payment
    payment_result = await db.execute(
        select(Payment).where(
            Payment.order_id == order.id,
            Payment.status.in_(("captured", "partially_refunded")),
        )
    )
    # Net paid = captured minus refunded — a partially refunded payment must
    # not still count as fully paid (mirrors process_order_payment).
    already_paid = money_round(
        sum(
            to_decimal(p.captured_amount or 0) - to_decimal(p.refunded_amount or 0)
            for p in payment_result.scalars().all()
        ),
        precision,
        rounding_mode,
    )
    remaining_due = money_round(to_decimal(order.total_amount) - already_paid, precision, rounding_mode)
    if amount > remaining_due:
        raise HTTPException(
            status_code=400,
            detail=f"Payment amount exceeds remaining balance. Remaining: RM {remaining_due:.2f}",
        )

    new_balance = money_round(current_balance - amount, precision, rounding_mode)
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

    payment = Payment(
        order_id=order.id,
        provider="internal_wallet",
        payment_method_type="e_wallet",
        amount=amount,
        currency_code=order.total_amount_currency,
        status="captured",
        captured_amount=amount,
        net_amount=amount,
        idempotency_key=f"wallet-payment-{order.id}-{uuid.uuid4().hex}",
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment)

    # Route through the shared capture pipeline instead of hand-setting the
    # status: recompute the order payment status (net of refunds), advance
    # pending → confirmed, and grant loyalty points + lucky-draw tickets (all
    # idempotent), plus annual-spend accrual.
    from app.services.payment import _accrue_loyalty_annual_spend, _sync_order_payment_status
    await _sync_order_payment_status(db, payment)
    await _accrue_loyalty_annual_spend(db, payment)
    order.updated_at = now

    # Audit log
    db.add(AuditLog(
        principal_id=admin.id,
        action="wallet_payment",
        resource_type="order",
        resource_id=order_id,
        changes_summary={"amount": str(amount), "remaining_balance": str(new_balance), "customer_id": order.customer_id},
    ))

    await db.commit()
    await db.refresh(order)

    # LHDN e-invoice: auto-issue on captured payments when einvoice.auto_issue
    # is on. Fully guarded — e-invoicing must never break the payment flow.
    if order.payment_status == "captured":
        import logging
        try:
            from app.services.einvoice import auto_issue_on_payment
            await auto_issue_on_payment(db, order, payment)
        except Exception:
            logging.getLogger(__name__).exception("e-invoice auto-issue failed for order %s", order.id)
        # Receipt email (self-gated on email.receipts_enabled, idempotent,
        # failure-swallowing).
        from app.services.email import send_order_receipt_email
        await send_order_receipt_email(db, order, payment)
        # Receipt/drawer print jobs (self-gated on print.*, idempotent,
        # failure-swallowing).
        from app.services.printing import auto_print_on_payment
        await auto_print_on_payment(db, order, payment)

    return APIResponse(
        data={
            "order_id": order.id,
            "amount_paid": float(amount),
            "wallet_balance_remaining": float(new_balance),
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

    menu_result = await db.execute(
        select(MenuItem).where(MenuItem.id == data.menu_item_id, MenuItem.deleted_at.is_(None))
    )
    menu_item = menu_result.scalar_one_or_none()
    if not menu_item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    if not menu_item.is_available:
        raise HTTPException(status_code=400, detail=f"{menu_item.item_name} is currently unavailable")

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    # Always derive price from the menu item; do not trust client-supplied unit_price.
    # Modifier options add to the unit price (mirrors the staff/POS path);
    # ownership of every option is enforced (foreign options inflate the price).
    price = to_decimal(menu_item.base_price)
    modifier_ids = data.modifier_ids or []
    try:
        modifier_total = await _priced_modifier_options(db, menu_item.id, modifier_ids)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    price += modifier_total
    total = money_round(price * data.quantity, precision, rounding_mode)

    line_item = OrderLineItem(
        order_id=order.id,
        menu_item_id=menu_item.id,
        item_snapshot={"item_name": menu_item.item_name},
        quantity=data.quantity,
        unit_price=price,
        line_total=total,
        modifier_total=modifier_total,
        selected_modifiers={"modifier_ids": modifier_ids},
        special_instructions=data.special_instructions,
    )
    db.add(line_item)
    await db.flush()

    # Added lines must deduct stock — creation did, and cancel-time reversal
    # restores whatever the current lines hold.
    from app.api.routes.endpoints.staff.orders import (
        _reprice_order_from_lines,
        _resync_payment_status_after_total_change,
    )
    from app.services.order import _deduct_stock_for_order
    stock_warnings = await _deduct_stock_for_order(db, order, [line_item])
    for w in stock_warnings:
        logger.warning("order %s: %s", order.order_number, w)

    order.item_count = (order.item_count or 0) + data.quantity
    await _reprice_order_from_lines(db, order, precision, rounding_mode)
    order.updated_at = datetime.now(timezone.utc)

    # If money was already captured, drop payment_status back to collectible.
    await _resync_payment_status_after_total_change(db, order)

    log = OrderModificationLog(
        order_id=order.id,
        staff_id=admin.id,
        modification_type="add_item",
        new_value={"menu_item_id": data.menu_item_id, "item_name": menu_item.item_name, "quantity": data.quantity, "unit_price": float(price)},
    )
    db.add(log)
    await db.commit()
    await db.refresh(line_item)
    return APIResponse(data={"id": line_item.id, "order_id": order.id, "item_name": line_item.item_snapshot.get("item_name"), "total": float(total)}, status_code=201)


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

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    # A line covered by a captured split-bill share can't be removed — the
    # allocation rows would orphan and the per-line paid math corrupts.
    from app.models.payment import Payment, PaymentLineAllocation
    alloc_result = await db.execute(
        select(func.coalesce(func.sum(
            PaymentLineAllocation.quantity * case(
                (Payment.captured_amount > 0,
                 (Payment.captured_amount - func.coalesce(Payment.refunded_amount, 0)) / Payment.captured_amount),
                else_=0,
            )
        ), 0))
        .join(Payment, Payment.id == PaymentLineAllocation.payment_id)
        .where(
            PaymentLineAllocation.order_line_item_id == line_item.id,
            Payment.status.in_(("captured", "partially_refunded")),
        )
    )
    if (alloc_result.scalar() or 0) > 0:
        raise HTTPException(status_code=400, detail="Cannot remove an item that has been (partially) paid via split bill — refund the share first")

    removed_total = to_decimal(line_item.line_total)
    order.item_count = max(0, (order.item_count or 0) - (line_item.quantity or 1))

    # Restore this line's recipe stock (single-line scope) so cancel-time
    # reversal stays symmetric with creation-time deduction.
    from app.api.routes.endpoints.staff.orders import (
        _reprice_order_from_lines,
        _resync_payment_status_after_total_change,
    )
    from app.services.order import _restore_stock_for_order
    await _restore_stock_for_order(db, order, [line_item])

    # Write the log BEFORE deleting the line: the FK is ON DELETE SET NULL,
    # so inserting after the delete would reference a dead row (409), while
    # inserting first lets the delete null the reference cleanly.
    log = OrderModificationLog(
        order_id=order.id,
        staff_id=admin.id,
        modification_type="remove_item",
        line_item_id=line_item.id,
        # JSONB can't hold Decimal — float() or the flush 500s.
        previous_value={"item_name": line_item.item_snapshot.get("item_name"), "total_price": float(removed_total)},
        reason=reason,
    )
    db.add(log)
    await db.flush()
    await db.delete(line_item)
    await db.flush()
    await _reprice_order_from_lines(db, order, precision, rounding_mode)
    order.updated_at = datetime.now(timezone.utc)
    await _resync_payment_status_after_total_change(db, order)

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

    from app.models.payment import Payment
    has_captured = (await db.execute(
        select(Payment.id).where(
            Payment.order_id == order.id,
            Payment.status.in_(("captured", "partially_refunded")),
        ).limit(1)
    )).scalar_one_or_none()
    if has_captured is not None:
        raise HTTPException(status_code=400, detail="Order has captured payments — issue a refund before cancelling")

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
    await db.flush()
    await reverse_order_effects(db, order)
    cancelled_payment_ids = await cancel_pending_order_payments(db, order.id)
    await db.commit()
    from app.services.transactional_notifications import notify_order_status
    await notify_order_status(db, order, "cancelled_by_merchant", reason=reason or "Cancelled by staff")
    return APIResponse(data={
        "id": order.id,
        "order_number": order.order_number,
        "status": "cancelled_by_merchant",
        "cancelled_payment_ids": cancelled_payment_ids,
    })


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

    # Lock both old and new tables to prevent concurrent transfers corrupting occupancy.
    table_ids = [new_table_id]
    if order.dining_table_id:
        table_ids.append(order.dining_table_id)
    table_result = await db.execute(
        select(DiningTable).where(
            DiningTable.id.in_(table_ids),
            DiningTable.store_id == order.store_id,
            DiningTable.deleted_at.is_(None),
        ).with_for_update()
    )
    locked_tables = {t.id: t for t in table_result.scalars().all()}
    new_table = locked_tables.get(new_table_id)
    if not new_table:
        raise HTTPException(status_code=404, detail="Table not found in this store")

    # Table occupancy lives in table_status_snapshot (DiningTable has no status columns).
    snap_result = await db.execute(
        select(TableStatusSnapshot).where(
            TableStatusSnapshot.table_id.in_(table_ids)
        ).with_for_update()
    )
    snap_map = {s.table_id: s for s in snap_result.scalars().all()}

    new_snap = snap_map.get(new_table_id)
    if new_snap and new_snap.status == "occupied" and new_snap.current_order_id != order.id:
        raise HTTPException(status_code=400, detail="Target table is occupied by a different order")

    old_table_id = order.dining_table_id
    order.dining_table_id = new_table_id
    order.updated_at = datetime.now(timezone.utc)

    # Free old table's snapshot
    if old_table_id:
        old_snap = snap_map.get(old_table_id)
        if old_snap:
            old_snap.status = "available"
            old_snap.current_order_id = None
            old_snap.updated_at = datetime.now(timezone.utc)

    # Occupy the new table's snapshot
    if new_snap:
        new_snap.status = "occupied"
        new_snap.current_order_id = order.id
        new_snap.updated_at = datetime.now(timezone.utc)
    else:
        db.add(TableStatusSnapshot(
            table_id=new_table_id,
            store_id=order.store_id,
            status="occupied",
            current_order_id=order.id,
        ))

    await db.commit()
    return APIResponse(data={
        "id": order.id,
        "order_number": order.order_number,
        "old_table_id": old_table_id,
        "new_table_id": new_table_id,
        "new_table_number": new_table.table_number,
    })
