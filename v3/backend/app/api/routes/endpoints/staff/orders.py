"""Staff-scoped order management endpoints (POS operations)."""

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field
from sqlalchemy import select, func, case

from app.api.routes.deps import CurrentStaff, DBDependency, RequireStaffRole, enum_filter_or_400
from app.core.money import money_round, to_decimal
from app.models.customer import Customer
from app.models.order import Order, OrderAdjustment, OrderFulfillment, OrderLineItem, OrderStatusLog
from app.models.menu import MenuCategory, MenuItem
from app.models.platform import AuditLog
from app.models.pos import OrderModificationLog
from app.models.reward import CustomerReward, RewardCatalog
from app.models.payment import Payment
from app.services.payment import refund_payment
from app.models.staff import StaffProfile
from app.models.store import DiningTable
from app.models.voucher import CustomerVoucher, VoucherDefinition
from app.models.wallet import Wallet, WalletLedgerEntry
from app.schemas.base import APIResponse, BaseSchema, Money
from app.schemas.order import (
    ApplyOrderRewardRequest,
    ApplyOrderVoucherRequest,
    MergeOrderRequest,
    PayWithWalletRequest,
    ProcessOrderPaymentRequest,
)
from app.services.order import (
    OrderError,
    _deduct_stock_for_order,
    _priced_modifier_options,
    _restore_stock_for_order,
    reverse_order_effects,
    validate_voucher_eligibility,
)
from app.services.payment import PaymentError, cancel_pending_order_payments, create_stripe_checkout_session
from app.services.platform_config import PlatformConfigService

router = APIRouter(prefix="/staff/orders", tags=["staff — orders"])

logger = logging.getLogger(__name__)


def _audit_principal_id(staff) -> int | None:
    """Return the principal_id to use for audit logs, or None if not available."""
    pid = getattr(staff, "principal_id", None)
    return pid if pid else None


async def _require_store_order(staff, order: Order) -> None:
    if order.store_id != staff.store_id:
        raise HTTPException(status_code=403, detail="Access denied for this store")


# Staff status machine: monotonic forward only. Terminal statuses
# (delivered, cancelled_*, refunded, partially_refunded, disputed) have no
# outgoing transitions — a reversed order must never be resurrected.
_STAFF_STATUS_TRANSITIONS: dict[str, list[str]] = {
    "pending": ["confirmed"],
    "confirmed": ["preparing"],
    "preparing": ["ready_for_pickup", "out_for_delivery"],
    "ready_for_pickup": ["out_for_delivery", "delivered"],
    "out_for_delivery": ["delivered"],
}


async def _reprice_order_from_lines(db, order: Order, precision: int, rounding_mode: str) -> None:
    """Recompute items_subtotal / modifier_subtotal / tax / total from the
    order's current line items.

    Cart- and POS-originated lines both store line_total INCLUSIVE of
    modifiers (cart lines keep unit_price excl. modifiers, POS lines incl.),
    so items_subtotal = Σ line_total and modifier_subtotal = Σ(line_total −
    unit_price × qty) — adding modifier_subtotal on top would double-count.
    Tax follows the creation convention (services/order.py: pre-discount
    items_subtotal × rate) using the order's own effective rate.
    """
    lines = (await db.execute(
        select(OrderLineItem).where(OrderLineItem.order_id == order.id)
    )).scalars().all()
    items_subtotal = sum((to_decimal(li.line_total) for li in lines), Decimal(0))
    modifier_subtotal = sum(
        (to_decimal(li.line_total) - to_decimal(li.unit_price) * li.quantity for li in lines),
        Decimal(0),
    )
    old_subtotal = to_decimal(order.items_subtotal)
    effective_rate = (to_decimal(order.tax_amount) / old_subtotal) if old_subtotal > 0 else Decimal(0)
    order.items_subtotal = money_round(items_subtotal, precision, rounding_mode)
    order.modifier_subtotal = money_round(max(Decimal(0), modifier_subtotal), precision, rounding_mode)
    order.tax_amount = money_round(order.items_subtotal * effective_rate, precision, rounding_mode)
    order.total_amount = money_round(
        max(
            Decimal(0),
            order.items_subtotal
            + to_decimal(order.delivery_fee)
            + to_decimal(order.service_charge)
            + order.tax_amount
            + to_decimal(order.tip_amount)
            - to_decimal(order.discount_amount),
        ),
        precision,
        rounding_mode,
    )


async def _resync_payment_status_after_total_change(db, order: Order) -> None:
    """Re-derive payment_status after an add/remove changed the order total.

    Adding items to an already-paid order must not leave 'captured' hiding an
    uncovered balance — route through the shared capture-pipeline helper so
    the net-of-refunds math (captured → initiated/partially_refunded) stays
    in one place.
    """
    from app.models.payment import Payment
    from app.services.payment import _sync_order_payment_status

    paid = (await db.execute(
        select(Payment).where(
            Payment.order_id == order.id,
            Payment.status.in_(("captured", "partially_refunded")),
        ).limit(1)
    )).scalar_one_or_none()
    if paid is not None:
        await _sync_order_payment_status(db, paid)


@router.patch("/{order_id}/payment", response_model=APIResponse[dict])
async def process_staff_order_payment(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    order_id: int,
    data: ProcessOrderPaymentRequest,
):
    """Process POS payment for an order (cash/card/qr) scoped to staff's store."""
    from app.models.payment import Payment

    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    await _require_store_order(staff, order)

    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant"):
        raise HTTPException(status_code=400, detail="Cannot pay for a completed/cancelled order")

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    existing_payments = await db.execute(
        select(Payment).where(
            Payment.order_id == order.id,
            Payment.status.in_(("captured", "partially_refunded")),
        )
    )
    # Net paid = captured minus refunded — a partially refunded payment must
    # not still count as fully paid (the refunded share is uncollectable).
    captured_from_payments = money_round(
        sum(
            to_decimal(p.captured_amount or 0) - to_decimal(p.refunded_amount or 0)
            for p in existing_payments.scalars().all()
        ),
        precision,
        rounding_mode,
    )
    order_captured = captured_from_payments
    already_paid = captured_from_payments

    payment_method = data.payment_method
    amount_tendered = to_decimal(data.amount_tendered or 0)
    amount = to_decimal(data.amount) if data.amount is not None else None
    discount_amount = to_decimal(data.discount_amount or 0)
    discount_type = data.discount_type
    tip_amount = to_decimal(data.tip_amount or 0)

    current_total = money_round(to_decimal(order.total_amount), precision, rounding_mode)
    computed_discount = Decimal(0)
    if discount_amount > 0:
        if discount_type == "percentage":
            if discount_amount > 100:
                raise HTTPException(status_code=400, detail="Percentage discount cannot exceed 100%")
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

    if already_paid > 0 and remaining_due <= 0:
        raise HTTPException(status_code=400, detail=f"Order is already fully paid (RM {already_paid:.2f})")

    net_amount = max(Decimal(0), remaining_due)
    fully_paid_by_wallet = net_amount <= 0

    # ── Split bill: this payment covers specific line items ──
    allocation_rows: list[tuple[OrderLineItem, Decimal]] = []
    if data.allocations:
        from app.models.payment import PaymentLineAllocation
        li_ids = {a.line_item_id for a in data.allocations}
        li_result = await db.execute(
            select(OrderLineItem).where(
                OrderLineItem.order_id == order.id,
                OrderLineItem.id.in_(li_ids),
            )
        )
        li_map = {li.id: li for li in li_result.scalars().all()}
        missing = li_ids - set(li_map)
        if missing:
            raise HTTPException(status_code=400, detail=f"Line items not on this order: {sorted(missing)}")

        # Quantity already allocated to earlier payments, per line item.
        # Pro-rata net of refunds: a partially refunded payment only counts
        # for the share of its allocations that is still paid for, so the
        # refunded share stays collectible (matches the net money math above).
        prior_q = await db.execute(
            select(
                PaymentLineAllocation.order_line_item_id,
                func.coalesce(func.sum(
                    PaymentLineAllocation.quantity * case(
                        (
                            Payment.captured_amount > 0,
                            (Payment.captured_amount - func.coalesce(Payment.refunded_amount, 0)) / Payment.captured_amount,
                        ),
                        else_=0,
                    )
                ), 0),
            )
            .join(Payment, Payment.id == PaymentLineAllocation.payment_id)
            .where(
                PaymentLineAllocation.order_line_item_id.in_(li_ids),
                Payment.status.in_(("captured", "partially_refunded")),
            )
            .group_by(PaymentLineAllocation.order_line_item_id)
        )
        prior_map = {r[0]: to_decimal(r[1]) for r in prior_q.all()}

        allocated_total = Decimal(0)
        for alloc in data.allocations:
            li = li_map[alloc.line_item_id]
            alloc_qty = to_decimal(alloc.quantity)
            remaining_qty = to_decimal(li.quantity) - prior_map.get(li.id, Decimal(0))
            if alloc_qty > remaining_qty:
                li_name = (li.item_snapshot or {}).get("name") or (li.item_snapshot or {}).get("item_name") or str(li.menu_item_id)
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot allocate {alloc_qty}× \"{li_name}\" — only {remaining_qty} left to pay for",
                )
            # Effective unit price incl. modifiers = line_total / quantity
            effective_unit = li.line_total / li.quantity if li.quantity else li.unit_price
            allocated_total += alloc_qty * effective_unit
            allocation_rows.append((li, alloc_qty))

        allocated_total = money_round(allocated_total, precision, rounding_mode)
        if allocated_total <= 0:
            raise HTTPException(status_code=400, detail="Allocation total must be greater than 0")
        if allocated_total > remaining_due:
            raise HTTPException(
                status_code=400,
                detail=f"Allocation total RM {allocated_total:.2f} exceeds the remaining balance RM {remaining_due:.2f}",
            )
        # The payment charge is the allocated share, not the full remaining due
        net_amount = allocated_total
        fully_paid_by_wallet = False
        if tip_amount > 0:
            raise HTTPException(status_code=400, detail="Add tip on the final (full-balance) payment of a split bill")
    elif data.charge_amount is not None:
        # Split bill by amount (e.g. even N ways): explicit partial charge
        charge = money_round(to_decimal(data.charge_amount), precision, rounding_mode)
        if charge > remaining_due:
            raise HTTPException(
                status_code=400,
                detail=f"Charge RM {charge:.2f} exceeds the remaining balance RM {remaining_due:.2f}",
            )
        net_amount = charge
        fully_paid_by_wallet = False


    change = Decimal(0)
    if payment_method == "cash":
        if amount_tendered < net_amount:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient cash tendered. Required: RM {net_amount:.2f}, Tendered: RM {amount_tendered:.2f}",
            )
        change = money_round(amount_tendered - net_amount, precision, rounding_mode)

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

    # Include the running paid total so sequential split shares of the SAME
    # amount (e.g. 3× RM 12) are distinct keys — while an exact double-tap of
    # the same share (same amount, same already_paid) is still rejected.
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

        # Split bill: persist which line items this payment covers
        if allocation_rows:
            from app.models.payment import PaymentLineAllocation
            for li, alloc_qty in allocation_rows:
                db.add(PaymentLineAllocation(
                    payment_id=payment.id,
                    order_line_item_id=li.id,
                    quantity=alloc_qty,
                ))

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
            order_captured = money_round(order_captured + net_amount, precision, rounding_mode)
            from app.services.payment import _accrue_loyalty_annual_spend
            await _accrue_loyalty_annual_spend(db, payment)

    order.updated_at = datetime.now(timezone.utc)

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

    # Spend-based lucky draw: grant tickets whenever the order ends up captured
    # (cash/card/QR manual capture, wallet payment — idempotent per order)
    if order.payment_status == "captured":
        from app.services.lucky_draw import grant_tickets_for_order
        await grant_tickets_for_order(db, order)
        # Loyalty points are granted on capture, not at order creation (idempotent).
        from app.services.payment import _credit_order_loyalty_points
        await _credit_order_loyalty_points(db, order)

    discount_note = (
        f", discount {discount_type or 'fixed'}={discount_amount} (-{computed_discount})"
        if computed_discount > 0 else ""
    )
    log = OrderStatusLog(
        order_id=order.id,
        from_status=order.status,
        to_status=order.status,
        reason=f"Payment processed: {payment_method}, amount={net_amount}{discount_note}",
        actor_type="staff",
        actor_id=staff.id,
    )
    db.add(log)
    await db.commit()
    await db.refresh(order)

    # LHDN e-invoice: auto-issue on captured payments when einvoice.auto_issue
    # is on. Fully guarded — e-invoicing must never break the payment flow.
    if payment is not None:
        try:
            from app.services.einvoice import auto_issue_on_payment
            await auto_issue_on_payment(db, order, payment)
        except Exception:
            logger.exception("e-invoice auto-issue failed for order %s", order.id)

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
    if allocation_rows:
        response_data["allocations"] = [
            {"line_item_id": li.id, "item_name": (li.item_snapshot or {}).get("name") or (li.item_snapshot or {}).get("item_name"), "quantity": float(qty)}
            for li, qty in allocation_rows
        ]

    return APIResponse(data=response_data)


@router.get("/{order_id}/split-state", response_model=APIResponse[dict])
async def get_staff_order_split_state(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    order_id: int,
):
    """Per-item paid/remaining quantities + order totals — drives the split-bill UI."""
    from app.models.payment import Payment, PaymentLineAllocation

    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None))
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    await _require_store_order(staff, order)

    li_result = await db.execute(
        select(OrderLineItem).where(OrderLineItem.order_id == order.id).order_by(OrderLineItem.id)
    )
    line_items = li_result.scalars().all()

    # Pro-rata net of refunds — a partially refunded payment only covers the
    # still-paid share of its allocations (matches the net total_paid below).
    paid_q = await db.execute(
        select(
            PaymentLineAllocation.order_line_item_id,
            func.coalesce(func.sum(
                PaymentLineAllocation.quantity * case(
                    (
                        Payment.captured_amount > 0,
                        (Payment.captured_amount - func.coalesce(Payment.refunded_amount, 0)) / Payment.captured_amount,
                    ),
                    else_=0,
                )
            ), 0),
        )
        .join(Payment, Payment.id == PaymentLineAllocation.payment_id)
        .where(
            PaymentLineAllocation.order_line_item_id.in_([li.id for li in line_items] or [0]),
            Payment.status.in_(("captured", "partially_refunded")),
        )
        .group_by(PaymentLineAllocation.order_line_item_id)
    )
    paid_map = {r[0]: float(r[1]) for r in paid_q.all()}

    pay_result = await db.execute(
        select(Payment).where(
            Payment.order_id == order.id,
            Payment.status.in_(("captured", "partially_refunded")),
        )
    )
    payments = pay_result.scalars().all()
    # Net of refunds — refunded money is not collectable towards the total.
    total_paid = sum(float(p.captured_amount or 0) - float(p.refunded_amount or 0) for p in payments)

    lines = []
    for li in line_items:
        paid_qty = paid_map.get(li.id, 0.0)
        remaining_qty = max(0, li.quantity - paid_qty)
        effective_unit = float(li.line_total / li.quantity) if li.quantity else float(li.unit_price)
        lines.append({
            "line_item_id": li.id,
            "item_name": (li.item_snapshot or {}).get("name") or (li.item_snapshot or {}).get("item_name"),
            "unit_price": effective_unit,
            "ordered_qty": li.quantity,
            "paid_qty": paid_qty,
            "remaining_qty": remaining_qty,
            "remaining_amount": round(remaining_qty * effective_unit, 2),
        })

    return APIResponse(data={
        "order_id": order.id,
        "order_number": order.order_number,
        "total_amount": float(order.total_amount),
        "total_paid": round(total_paid, 2),
        "remaining_due": round(max(0.0, float(order.total_amount) - total_paid), 2),
        "fully_paid": total_paid >= float(order.total_amount),
        "lines": lines,
    })


@router.get("/{order_id}/einvoice", response_model=APIResponse[dict])
async def get_staff_order_einvoice(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    order_id: int,
):
    """Latest e-invoice document for an order in staff's store (null if none)."""
    from app.models.einvoice import EinvoiceDocument

    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None))
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    await _require_store_order(staff, order)

    doc_result = await db.execute(
        select(EinvoiceDocument)
        .where(EinvoiceDocument.order_id == order.id)
        .order_by(EinvoiceDocument.id.desc())
        .limit(1)
    )
    doc = doc_result.scalar_one_or_none()
    if doc is None:
        return APIResponse(data=None)
    return APIResponse(data={
        "document_type": doc.document_type,
        "code_number": doc.code_number,
        "status": doc.status,
        "myinvois_uuid": doc.myinvois_uuid,
        "validation_link": doc.validation_link,
        "submitted_at": doc.submitted_at.isoformat() if doc.submitted_at else None,
    })


class StaffRefundRequest(BaseSchema):
    """Counter refund — staff issue a refund for a captured payment."""

    amount: Money = Field(..., gt=0)
    reason: str = Field(..., min_length=3, max_length=300)
    reason_category: Literal[
        "customer_request", "item_unavailable", "quality_issue", "wrong_order", "late_delivery", "other"
    ] = "other"
    payment_id: int | None = None


@router.post("/{order_id}/refund", response_model=APIResponse[dict])
async def staff_refund_order(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    order_id: int,
    data: StaffRefundRequest,
):
    """Refund a captured payment on an order (counter refund).

    Picks the single captured/partially_refunded payment automatically;
    split-bill orders with multiple payments require payment_id.
    """
    order = (
        await db.execute(
            select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
        )
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    await _require_store_order(staff, order)

    payments = (
        await db.execute(
            select(Payment)
            .where(
                Payment.order_id == order.id,
                Payment.status.in_(("captured", "partially_refunded")),
            )
            .order_by(Payment.id)
        )
    ).scalars().all()

    if data.payment_id is not None:
        payment = next((p for p in payments if p.id == data.payment_id), None)
        if payment is None:
            raise HTTPException(status_code=400, detail="payment_id is not a refundable payment on this order")
    elif len(payments) == 1:
        payment = payments[0]
    elif len(payments) == 0:
        raise HTTPException(status_code=400, detail="This order has no captured payment to refund")
    else:
        raise HTTPException(
            status_code=409,
            detail="Split-bill order has multiple payments — specify payment_id",
        )

    try:
        refund = await refund_payment(
            db=db,
            payment_id=payment.id,
            amount=data.amount,
            reason=data.reason,
            reason_category=data.reason_category,
            approved_by=None,
            approved_by_staff=staff.id,
        )
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return APIResponse(data={
        "id": refund.id,
        "payment_id": refund.payment_id,
        "order_id": refund.order_id,
        "amount": str(refund.amount or 0),
        "reason": refund.reason,
        "reason_category": refund.reason_category,
        "status": refund.status,
        "payment_status": payment.status,
        "order_status": order.status,
    })


class DeliveryDispatchRequest(BaseSchema):
    """Manual delivery dispatch — staff key the order into an external
    delivery system (Lalamove/GrabExpress/…) and record the booking ref."""

    provider: Literal[
        "lalamove", "grab_express", "in_house", "uber_direct", "doordash",
        "deliveroo", "foodpanda", "postmates", "third_party",
    ]
    external_ref: str = Field(..., min_length=1, max_length=100)


@router.post("/{order_id}/delivery-dispatch", response_model=APIResponse[dict])
async def staff_delivery_dispatch(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    order_id: int,
    data: DeliveryDispatchRequest,
):
    """Record that the order was keyed into an external delivery system.

    Until a delivery-provider API integration lands, delivery orders are
    dispatched manually: staff create the booking in Lalamove etc. and mark
    the order here with the provider + booking reference. Dispatching also
    advances the order to out_for_delivery (idempotent re-key updates the
    reference).
    """
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    await _require_store_order(staff, order)

    if order.order_type != "delivery" and order.fulfillment_type not in (
        "standard_delivery", "express_delivery", "third_party_delivery",
    ):
        raise HTTPException(status_code=400, detail="This is not a delivery order")
    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant", "refunded"):
        raise HTTPException(status_code=400, detail="Cannot dispatch a completed/cancelled order")

    now = datetime.now(timezone.utc)
    fulfillment = (
        await db.execute(
            select(OrderFulfillment).where(OrderFulfillment.order_id == order.id).with_for_update()
        )
    ).scalar_one_or_none()
    if fulfillment is None:
        fulfillment = OrderFulfillment(
            order_id=order.id,
            status="pending_assignment",
            delivery_fee_snapshot=order.delivery_fee,
        )
        db.add(fulfillment)
        await db.flush()

    fulfillment.delivery_provider = data.provider
    fulfillment.delivery_provider_order_id = data.external_ref.strip()
    fulfillment.delivery_dispatched_at = now
    fulfillment.delivery_dispatched_by = staff.id
    fulfillment.updated_at = now

    status_advanced = False
    if order.status in ("confirmed", "preparing", "ready_for_pickup"):
        db.add(OrderStatusLog(
            order_id=order.id,
            from_status=order.status,
            to_status="out_for_delivery",
            reason=f"Delivery keyed into {data.provider} ({data.external_ref.strip()})",
            actor_type="staff",
            actor_id=staff.id,
        ))
        order.status = "out_for_delivery"
        order.updated_at = now
        status_advanced = True

    await db.commit()
    return APIResponse(data={
        "order_id": order.id,
        "provider": fulfillment.delivery_provider,
        "external_ref": fulfillment.delivery_provider_order_id,
        "dispatched_at": fulfillment.delivery_dispatched_at.isoformat() if fulfillment.delivery_dispatched_at else None,
        "status": order.status,
        "status_advanced": status_advanced,
    })


@router.post("/{order_id}/apply-voucher", response_model=APIResponse[dict])
async def apply_staff_order_voucher(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    order_id: int,
    data: ApplyOrderVoucherRequest,
):
    """Apply a customer voucher to an existing order in staff's store."""
    voucher_code = data.voucher_code.strip()
    if not voucher_code:
        raise HTTPException(status_code=400, detail="voucher_code is required")

    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await _require_store_order(staff, order)

    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant"):
        raise HTTPException(status_code=400, detail="Cannot apply voucher to a completed/cancelled order")
    if order.payment_status in ("captured", "settled"):
        raise HTTPException(status_code=400, detail="Cannot apply voucher to an order that has already been paid")

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
    if voucher_def is not None:
        # Lock the definition row as well — the outer join above cannot
        # FOR UPDATE its nullable side.
        voucher_def = (await db.execute(
            select(VoucherDefinition).where(VoucherDefinition.id == voucher_def.id).with_for_update()
        )).scalar_one()

    now = datetime.now(timezone.utc)
    if customer_voucher.expires_at and customer_voucher.expires_at < now:
        raise HTTPException(status_code=400, detail="Voucher has expired")

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

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

    customer_voucher.status = "used"
    customer_voucher.used_at = now
    customer_voucher.order_id = order_id
    customer_voucher.use_count = (customer_voucher.use_count or 0) + 1
    if voucher_def:
        voucher_def.global_use_count = (voucher_def.global_use_count or 0) + 1

    order.voucher_discount = money_round(to_decimal(order.voucher_discount) + discount, precision, rounding_mode)
    order.discount_amount = money_round(to_decimal(order.discount_amount) + discount, precision, rounding_mode)
    order.total_amount = money_round(to_decimal(order.total_amount) - discount, precision, rounding_mode)
    order.updated_at = now

    adj = OrderAdjustment(
        order_id=order.id,
        adjustment_type="discount_override",
        amount_delta=money_round(-discount, precision, rounding_mode),
        reason=f"Voucher applied: {voucher_code} ({voucher_def.display_title if voucher_def else voucher_type})",
        approved_by=staff.id,
    )
    db.add(adj)

    principal_id = _audit_principal_id(staff)
    if principal_id:
        db.add(AuditLog(
            principal_id=principal_id,
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
async def apply_staff_order_reward(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    order_id: int,
    data: ApplyOrderRewardRequest,
):
    """Apply a customer reward to an existing order in staff's store."""
    reward_id = data.reward_id

    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await _require_store_order(staff, order)

    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant"):
        raise HTTPException(status_code=400, detail="Cannot apply reward to a completed/cancelled order")
    if order.payment_status in ("captured", "settled"):
        raise HTTPException(status_code=400, detail="Cannot apply reward to an order that has already been paid")

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
    if reward_cat is not None:
        # Lock the catalog row as well — the outer join above cannot
        # FOR UPDATE its nullable side.
        reward_cat = (await db.execute(
            select(RewardCatalog).where(RewardCatalog.id == reward_cat.id).with_for_update()
        )).scalar_one()

    now = datetime.now(timezone.utc)
    if customer_reward.expires_at and customer_reward.expires_at < now:
        raise HTTPException(status_code=400, detail="Reward has expired")

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

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

    customer_reward.status = "used"
    customer_reward.used_at = now
    customer_reward.order_id = order_id
    if reward_cat:
        reward_cat.total_redemptions = (reward_cat.total_redemptions or 0) + 1

    order.reward_discount = money_round(to_decimal(order.reward_discount) + discount, precision, rounding_mode)
    order.discount_amount = money_round(to_decimal(order.discount_amount) + discount, precision, rounding_mode)
    order.total_amount = money_round(to_decimal(order.total_amount) - discount, precision, rounding_mode)
    order.updated_at = now

    adj = OrderAdjustment(
        order_id=order.id,
        adjustment_type="discount_override",
        amount_delta=money_round(-discount, precision, rounding_mode),
        reason=f"Reward applied: {reward_cat.reward_name if reward_cat else customer_reward.redemption_code}",
        approved_by=staff.id,
    )
    db.add(adj)

    principal_id = _audit_principal_id(staff)
    if principal_id:
        db.add(AuditLog(
            principal_id=principal_id,
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
async def staff_pay_with_wallet(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    order_id: int,
    data: PayWithWalletRequest,
):
    """Pay for an order using the customer's wallet credit in staff's store."""
    from app.models.payment import Payment

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    amount = to_decimal(data.amount)

    result = await db.execute(
        select(Order)
        .where(Order.id == order_id, Order.deleted_at.is_(None))
        .with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await _require_store_order(staff, order)

    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant"):
        raise HTTPException(status_code=400, detail="Cannot pay for a completed/cancelled order")

    result = await db.execute(select(Wallet).where(Wallet.customer_id == order.customer_id).with_for_update())
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Customer has no wallet")

    if wallet.is_frozen:
        raise HTTPException(status_code=400, detail="Wallet is frozen")

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

    payment_result = await db.execute(
        select(Payment).where(
            Payment.order_id == order.id,
            Payment.status.in_(("captured", "partially_refunded")),
        )
    )
    # Net paid = captured minus refunded — a partially refunded payment must
    # not still count as fully paid (mirrors process_staff_order_payment).
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

    # Route through the same capture pipeline as the cash path: recompute the
    # order payment status (net of refunds), advance pending → confirmed, and
    # grant loyalty points + lucky-draw tickets (all idempotent), plus
    # annual-spend accrual.
    from app.services.payment import _accrue_loyalty_annual_spend, _sync_order_payment_status
    await _sync_order_payment_status(db, payment)
    await _accrue_loyalty_annual_spend(db, payment)
    order.updated_at = now

    principal_id = _audit_principal_id(staff)
    if principal_id:
        db.add(AuditLog(
            principal_id=principal_id,
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
        try:
            from app.services.einvoice import auto_issue_on_payment
            await auto_issue_on_payment(db, order, payment)
        except Exception:
            logger.exception("e-invoice auto-issue failed for order %s", order.id)

    return APIResponse(
        data={
            "order_id": order.id,
            "amount_paid": float(amount),
            "wallet_balance_remaining": float(new_balance),
            "payment_status": order.payment_status,
            "message": f"RM {amount:.2f} paid from wallet. Remaining balance: RM {new_balance:.2f}",
        }
    )


class AddLineItemRequest(BaseSchema):
    menu_item_id: int
    quantity: int = Field(1, ge=1, le=99)
    modifier_ids: list[int] = []
    special_instructions: str | None = None
    unit_price: float = Field(0, ge=0)


@router.post("/{order_id}/items", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def add_staff_order_line_item(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    order_id: int,
    data: AddLineItemRequest,
):
    """Add a line item to an existing order in staff's store."""
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await _require_store_order(staff, order)

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

    # Price from the menu item (never the client); modifier options add to the
    # unit price, mirroring POS line construction (staff/pos.py). Ownership of
    # every option is enforced (foreign options would inflate the price).
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
        item_snapshot={"item_name": menu_item.item_name, "image_url": menu_item.image_url},
        quantity=data.quantity,
        unit_price=price,
        line_total=total,
        modifier_total=modifier_total,
        selected_modifiers={"modifier_ids": modifier_ids},
        special_instructions=data.special_instructions,
    )
    db.add(line_item)
    await db.flush()

    # Stock: creation deducts recipe needs, so an added line must deduct too —
    # otherwise a later cancel's reverse_order_effects restores stock that was
    # never taken.
    stock_warnings = await _deduct_stock_for_order(db, order, [line_item])
    for w in stock_warnings:
        logger.warning("order %s: %s", order.order_number, w)

    order.item_count = (order.item_count or 0) + data.quantity
    await _reprice_order_from_lines(db, order, precision, rounding_mode)
    order.updated_at = datetime.now(timezone.utc)

    # Totals grew — if money was already captured, drop payment_status back to
    # collectible so the new balance resurfaces instead of hiding under 'captured'.
    await _resync_payment_status_after_total_change(db, order)

    log = OrderModificationLog(
        order_id=order.id,
        staff_id=staff.id,
        modification_type="add_item",
        new_value={"menu_item_id": data.menu_item_id, "item_name": menu_item.item_name, "quantity": data.quantity, "unit_price": float(price)},
    )
    db.add(log)
    await db.commit()
    await db.refresh(line_item)
    return APIResponse(data={"id": line_item.id, "order_id": order.id, "item_name": line_item.item_snapshot.get("item_name"), "total": float(total)}, status_code=201)


@router.delete("/{order_id}/items/{line_item_id}", response_model=APIResponse[dict])
async def remove_staff_order_line_item(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    order_id: int,
    line_item_id: int,
    reason: str | None = None,
):
    """Void/remove a line item from an existing order in staff's store."""
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await _require_store_order(staff, order)

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

    # Stock: creation deducted this line's recipe needs — removal restores
    # them (single-line scope), keeping cancel-time reversal symmetric.
    await _restore_stock_for_order(db, order, [line_item])

    # Write the log BEFORE deleting the line: the FK is ON DELETE SET NULL,
    # so inserting after the delete would reference a dead row (409), while
    # inserting first lets the delete null the reference cleanly.
    log = OrderModificationLog(
        order_id=order.id,
        staff_id=staff.id,
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

    # Totals shrank/grew — keep payment_status honest about captured money.
    await _resync_payment_status_after_total_change(db, order)

    await db.commit()
    return APIResponse(data={"id": line_item_id, "order_id": order.id, "removed": True, "new_total": order.total_amount})


@router.post("/{order_id}/cancel", response_model=APIResponse[dict])
async def cancel_staff_order(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    order_id: int,
    reason: str | None = None,
):
    """Cancel an order in staff's store."""
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await _require_store_order(staff, order)

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
        actor_id=staff.id,
    )
    db.add(log)
    await db.flush()
    await reverse_order_effects(db, order)
    cancelled_payment_ids = await cancel_pending_order_payments(db, order.id)
    await db.commit()
    return APIResponse(data={
        "id": order.id,
        "order_number": order.order_number,
        "status": "cancelled_by_merchant",
        "cancelled_payment_ids": cancelled_payment_ids,
    })


@router.post("/{order_id}/merge", response_model=APIResponse[dict])
async def merge_staff_order(
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    db: DBDependency,
    order_id: int,
    data: MergeOrderRequest,
):
    """Merge this (source) order into the target order — move all line items,
    add totals, cancel the source. Both orders must be unpaid (no captured
    payments) so split-bill allocations are never orphaned. Source side
    effects (workshop seats, loyalty) are intentionally NOT reversed: the
    line items live on under the target order."""
    if data.target_order_id == order_id:
        raise HTTPException(status_code=400, detail="Cannot merge an order into itself")

    lock_ids = sorted([order_id, data.target_order_id])
    locked: dict[int, Order] = {}
    for lid in lock_ids:
        r = await db.execute(
            select(Order).where(Order.id == lid, Order.deleted_at.is_(None)).with_for_update()
        )
        o = r.scalar_one_or_none()
        if o is None:
            raise HTTPException(status_code=404, detail=f"Order {lid} not found")
        locked[lid] = o
    source, target = locked[order_id], locked[data.target_order_id]
    await _require_store_order(staff, source)
    await _require_store_order(staff, target)

    terminal_statuses = ("delivered", "cancelled_by_customer", "cancelled_by_merchant", "refunded")
    for o in (source, target):
        if o.status in terminal_statuses:
            raise HTTPException(status_code=400, detail=f"Order {o.order_number} is already completed or cancelled")

    from app.models.payment import Payment
    for o in (source, target):
        has_captured = (await db.execute(
            select(Payment.id).where(
                Payment.order_id == o.id,
                Payment.status.in_(("captured", "partially_refunded")),
            ).limit(1)
        )).scalar_one_or_none()
        if has_captured is not None:
            raise HTTPException(
                status_code=400,
                detail=f"Order {o.order_number} already has payments — only fully unpaid orders can be merged",
            )

    # Move line items to the target order
    li_result = await db.execute(
        select(OrderLineItem).where(OrderLineItem.order_id == source.id).with_for_update()
    )
    moved = 0
    for li in li_result.scalars().all():
        li.order_id = target.id
        moved += 1
    if moved == 0:
        raise HTTPException(status_code=400, detail="Source order has no line items to merge")

    # Additive totals — both orders are same-store, same tax/service config
    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()
    target.items_subtotal += source.items_subtotal
    target.modifier_subtotal += source.modifier_subtotal
    # Flat service charge: two orders on the SAME table are one table's
    # service — don't double it; different tables keep both.
    if source.dining_table_id and source.dining_table_id == target.dining_table_id:
        target.service_charge = max(target.service_charge, source.service_charge)
    else:
        target.service_charge += source.service_charge
    target.tax_amount += source.tax_amount
    target.discount_amount += source.discount_amount
    target.delivery_fee += source.delivery_fee
    target.tip_amount += source.tip_amount
    target.item_count = (target.item_count or 0) + (source.item_count or 0)
    # Recompute the total from the merged components — adding raw totals would
    # double the shared flat service charge on same-table merges and silently
    # drop the source's tip from the components (stored total would drift from
    # items + delivery + service + tax + tip − discount).
    target.total_amount = money_round(
        max(
            Decimal(0),
            to_decimal(target.items_subtotal)
            + to_decimal(target.delivery_fee)
            + to_decimal(target.service_charge)
            + to_decimal(target.tax_amount)
            + to_decimal(target.tip_amount)
            - to_decimal(target.discount_amount),
        ),
        precision,
        rounding_mode,
    )
    # Mixed flows: merging a prepaid-pending source into an open tab keeps the
    # target's flow — merge already blocks captured payments, so nothing is
    # prepaid-and-waived; the source has no money attached by construction.
    target.updated_at = datetime.now(timezone.utc)

    # Free the source table if its snapshot points at the source order
    if source.dining_table_id:
        from app.models.store import TableStatusSnapshot
        snap_r = await db.execute(
            select(TableStatusSnapshot).where(
                TableStatusSnapshot.table_id == source.dining_table_id
            ).with_for_update()
        )
        snap = snap_r.scalar_one_or_none()
        if snap and snap.current_order_id == source.id:
            snap.status = "available"
            snap.current_order_id = None
            snap.updated_at = datetime.now(timezone.utc)

    # Cancel the (now empty) source order — no reverse_order_effects: seats
    # and loyalty stay attached to the moved line items.
    source_status_before = source.status
    source.status = "cancelled_by_merchant"
    source.cancellation_reason = f"Merged into order {target.order_number}"
    source.cancelled_by = "merchant"
    source.cancelled_at = datetime.now(timezone.utc)
    source.updated_at = datetime.now(timezone.utc)
    cancelled_payment_ids = await cancel_pending_order_payments(db, source.id)

    db.add(OrderStatusLog(
        order_id=source.id,
        from_status=source_status_before,
        to_status="cancelled_by_merchant",
        reason=f"Merged into order {target.order_number}",
        actor_type="staff",
        actor_id=staff.id,
    ))
    db.add(OrderStatusLog(
        order_id=target.id,
        from_status=target.status,
        to_status=target.status,
        reason=f"Merged order {source.order_number} into this order ({moved} items)",
        actor_type="staff",
        actor_id=staff.id,
    ))
    await db.commit()

    return APIResponse(data={
        "id": target.id,
        "order_number": target.order_number,
        "merged_from_order_id": source.id,
        "merged_from_order_number": source.order_number,
        "moved_items": moved,
        "total_amount": str(target.total_amount),
        "cancelled_payment_ids": cancelled_payment_ids,
    })


@router.get("")
async def staff_list_orders(
    staff: CurrentStaff,
    db: DBDependency,
    status_filter: str | None = Query(None, alias="status"),
    order_type: str | None = Query(None),
    payment_status: str | None = Query(None),
    station: str | None = Query(None),
    timeframe: str | None = Query(None, alias="timeframe", description="preset: today | 24h | all"),
    issues_only: bool = Query(False, alias="issues", description="Only unpaid (>30 min) or stuck orders"),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
):
    """List orders for the staff member's store.

    Defaults to the last 24 hours and excludes cancelled orders. Staff see
    only what they can act on — old/cancelled history belongs in the admin
    portal, not the counter queue.

    - `timeframe`: "today" (MYT midnight→now), "24h" (default), "all"
    - `issues`: only unpaid (>30 min old) or payment-stuck orders
    - `station` enables KDS station routing (bar vs kitchen tabs): only orders
      containing at least one line item routed to that station are returned, and
      each order carries an `items` list limited to that station's items. Routing
      comes from the `kds.station_map` platform config (category slugs per
      station; "*" matches any category not explicitly claimed by another
      station, including uncategorized items).
    """
    from app.core.business_time import BUSINESS_TZ, day_start_utc
    from datetime import timedelta as _td
    from app.models.enums import OrderStatus, OrderType, PaymentStatus
    status_filter = enum_filter_or_400(status_filter, OrderStatus, "status")
    order_type = enum_filter_or_400(order_type, OrderType, "order_type")
    payment_status = enum_filter_or_400(payment_status, PaymentStatus, "payment_status")

    now_utc = datetime.now(timezone.utc)
    if timeframe == "all":
        since = None
    elif timeframe == "today":
        since = day_start_utc(now_utc)
    else:
        since = now_utc - _td(hours=24)

    stmt = (
        select(Order, Customer, DiningTable)
        .outerjoin(Customer, Customer.id == Order.customer_id)
        .outerjoin(DiningTable, DiningTable.id == Order.dining_table_id)
        .where(Order.store_id == staff.store_id)
    )
    if since and not issues_only:
        # Issues view skips the timeframe cap: old unpaid orders must still
        # surface even when they fall outside the default 24h window.
        stmt = stmt.where(Order.created_at >= since)
    if issues_only:
        # Unpaid orders older than 30 minutes, still pending/confirmed (not cancelled)
        stale_cutoff = now_utc - _td(minutes=30)
        stmt = stmt.where(
            Order.payment_status.in_(["initiated", "pending_authorization"]),
            Order.created_at < stale_cutoff,
            Order.status.in_(["pending", "confirmed"]),
        )
    elif not status_filter:
        # Default: LIVE orders only — exclude cancelled AND unpaid-pending.
        # Unpaid orders older than 30 min surface via ?issues=true instead.
        # Fully refunded orders are settled money-wise — they leave the queue.
        stmt = stmt.where(
            Order.status.notin_(["cancelled_by_customer", "cancelled_by_merchant", "pending"]),
            Order.payment_status != "refunded",
        )
    if status_filter:
        stmt = stmt.where(Order.status == status_filter)
    if order_type:
        stmt = stmt.where(Order.order_type == order_type)
    if payment_status:
        stmt = stmt.where(Order.payment_status == payment_status)
    stmt = stmt.order_by(Order.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    rows = result.all()

    # Batch-fetch delivery dispatch info (manual key-in to Lalamove etc.)
    dispatch_map: dict[int, dict] = {}
    row_ids = [o.id for o, _, _ in rows]
    if row_ids:
        f_result = await db.execute(
            select(
                OrderFulfillment.order_id,
                OrderFulfillment.delivery_provider,
                OrderFulfillment.delivery_provider_order_id,
                OrderFulfillment.delivery_dispatched_at,
            ).where(OrderFulfillment.order_id.in_(row_ids))
        )
        for f_order_id, provider, ref, dispatched_at in f_result.all():
            dispatch_map[f_order_id] = {
                "delivery_provider": provider,
                "delivery_provider_order_id": ref,
                "delivery_dispatched_at": dispatched_at.isoformat() if dispatched_at else None,
            }

    station_items: dict[int, list[dict]] = {}
    if station:
        station_map = await PlatformConfigService(db).get("kds.station_map", default={})
        if not isinstance(station_map, dict) or station not in station_map:
            raise HTTPException(status_code=400, detail=f"Unknown KDS station: {station}")
        wanted = set(station_map.get(station) or [])
        star = "*" in wanted
        claimed_elsewhere = {
            slug
            for other, slugs in station_map.items()
            if other != station
            for slug in (slugs or [])
            if slug != "*"
        }
        order_ids = [o.id for o, _, _ in rows]
        if order_ids:
            li_result = await db.execute(
                select(
                    OrderLineItem.order_id,
                    OrderLineItem.menu_item_id,
                    OrderLineItem.item_snapshot,
                    OrderLineItem.quantity,
                    MenuCategory.slug,
                )
                .outerjoin(MenuItem, MenuItem.id == OrderLineItem.menu_item_id)
                .outerjoin(MenuCategory, MenuCategory.id == MenuItem.category_id)
                .where(OrderLineItem.order_id.in_(order_ids))
            )
            for line_order_id, menu_item_id, snapshot, qty, slug in li_result.all():
                matched = (slug not in claimed_elsewhere) if star else (slug in wanted)
                if matched:
                    station_items.setdefault(line_order_id, []).append({
                        "menu_item_id": menu_item_id,
                        "name": (snapshot or {}).get("item_name") or "Item",
                        "quantity": float(qty or 0),
                        "category_slug": slug,
                    })
        rows = [row for row in rows if row[0].id in station_items]

    return APIResponse(data=[
        {
            "id": o.id,
            "order_number": o.order_number,
            "status": o.status,
            "order_type": o.order_type,
            "payment_flow": o.payment_flow,
            "payment_status": o.payment_status,
            "customer_id": o.customer_id,
            "customer_name": c.display_name if c else None,
            "customer_phone": c.phone_number if c else None,
            "dining_table_id": o.dining_table_id,
            "table_number": t.table_number if t else None,
            "item_count": o.item_count,
            "items_subtotal": float(o.items_subtotal) if o.items_subtotal else 0,
            "tax_amount": float(o.tax_amount) if o.tax_amount else 0,
            "service_charge": float(o.service_charge) if o.service_charge else 0,
            "discount_amount": float(o.discount_amount) if o.discount_amount else 0,
            "total_amount": float(o.total_amount) if o.total_amount else 0,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "updated_at": o.updated_at.isoformat() if o.updated_at else None,
            **dispatch_map.get(o.id, {}),
            **({"items": station_items.get(o.id, [])} if station else {}),
        }
        for o, c, t in rows
    ])


# ── Staff order operations ──

@router.get("/{order_id}")
async def staff_get_order(staff: CurrentStaff, db: DBDependency, order_id: int):
    """Get a single order with line items (staff endpoint)."""
    result = await db.execute(
        select(Order, Customer, DiningTable)
        .outerjoin(Customer, Customer.id == Order.customer_id)
        .outerjoin(DiningTable, DiningTable.id == Order.dining_table_id)
        .where(
            Order.id == order_id,
            Order.store_id == staff.store_id,
        )
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")
    order, customer, table = row

    # Get line items
    items_result = await db.execute(
        select(OrderLineItem).where(OrderLineItem.order_id == order_id)
    )
    line_items = items_result.scalars().all()

    # Delivery dispatch info (manual key-in to Lalamove etc.)
    fulfillment = (
        await db.execute(select(OrderFulfillment).where(OrderFulfillment.order_id == order_id))
    ).scalar_one_or_none()

    return APIResponse(data={
        "id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "order_type": order.order_type,
        "payment_status": order.payment_status,
        "delivery_provider": fulfillment.delivery_provider if fulfillment else None,
        "delivery_provider_order_id": fulfillment.delivery_provider_order_id if fulfillment else None,
        "delivery_dispatched_at": (
            fulfillment.delivery_dispatched_at.isoformat() if fulfillment and fulfillment.delivery_dispatched_at else None
        ),
        "customer_id": order.customer_id,
        "customer_name": customer.display_name if customer else None,
        "customer_phone": customer.phone_number if customer else None,
        "dining_table_id": order.dining_table_id,
        "table_number": table.table_number if table else None,
        "items_subtotal": float(order.items_subtotal) if order.items_subtotal else 0,
        "tax_amount": float(order.tax_amount) if order.tax_amount else 0,
        "service_charge": float(order.service_charge) if order.service_charge else 0,
        "discount_amount": float(order.discount_amount) if order.discount_amount else 0,
        "total_amount": float(order.total_amount) if order.total_amount else 0,
        "customer_notes": order.customer_notes,
        "staff_notes": order.staff_notes,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        "items": [
            {
                "id": li.id,
                "menu_item_id": li.menu_item_id,
                "item_name": (li.item_snapshot or {}).get("item_name") if li.item_snapshot else None,
                "image_url": (li.item_snapshot or {}).get("image_url") if li.item_snapshot else None,
                "quantity": li.quantity,
                "unit_price": float(li.unit_price) if li.unit_price else 0,
                "total": float(li.line_total) if li.line_total else 0,
                "notes": li.special_instructions,
                "status": li.fulfillment_status,
                "selected_modifiers": li.selected_modifiers,
            }
            for li in line_items
        ],
    })

@router.patch("/{order_id}/status")
async def staff_update_order_status(
    staff: CurrentStaff,
    db: DBDependency,
    order_id: int,
    status: str = Query(...),
    reason: str | None = Query(None),
):
    """Update order status (staff endpoint)."""
    # Valid staff transitions (must match the order_status enum — an invalid
    # value would otherwise blow up as a 500 at commit time). Cancellations
    # must go through the dedicated cancel endpoint, which blocks captured
    # orders and reverses order side effects.
    VALID = {
        "confirmed", "preparing", "ready_for_pickup", "out_for_delivery",
        "delivered",
    }
    if status in ("cancelled_by_customer", "cancelled_by_merchant"):
        raise HTTPException(
            status_code=400,
            detail="Cannot cancel via this endpoint — use POST /staff/orders/{order_id}/cancel instead",
        )
    if status not in VALID:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid order status '{status}'. Valid: {', '.join(sorted(VALID))}",
        )
    result = await db.execute(
        select(Order).where(
            Order.id == order_id,
            Order.store_id == staff.store_id,
        ).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Enforce the monotonic state machine — no jumps (pending→delivered skips
    # payment) and no resurrection of terminal orders (a cancelled order had
    # its stock/vouchers/points reversed; confirming it again undoes nothing).
    allowed = _STAFF_STATUS_TRANSITIONS.get(order.status, [])
    if status not in allowed:
        # Idempotent no-op: a double-tap on the same KDS button or a retry
        # after a timed-out request already landed — report success instead
        # of a confusing 400.
        if status == order.status:
            return APIResponse(data={"id": order.id, "status": order.status, "unchanged": True})
        raise HTTPException(
            status_code=400,
            detail=f"Cannot move order from '{order.status}' to '{status}'",
        )

    from_status = order.status
    order.status = status
    if status == "delivered":
        order.completed_at = datetime.now(timezone.utc)
    elif status == "preparing":
        order.prepared_at = datetime.now(timezone.utc)
    db.add(OrderStatusLog(
        order_id=order.id,
        from_status=from_status,
        to_status=status,
        reason=reason,
        actor_type="staff",
        actor_id=staff.id,
    ))
    await db.commit()
    return APIResponse(data={"id": order.id, "status": order.status})


@router.patch("/{order_id}/transfer-table")
async def staff_transfer_table(
    staff: CurrentStaff,
    db: DBDependency,
    order_id: int,
    new_table_id: int = Query(..., alias="new_table_id"),
):
    """Transfer order to a different table (staff endpoint)."""
    result = await db.execute(
        select(Order).where(
            Order.id == order_id,
            Order.store_id == staff.store_id,
        ).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    # Only live dine-in orders can move tables (mirrors the admin guards) —
    # transferring a terminal order would occupy the new table for a dead order.
    if order.order_type != "dine_in":
        raise HTTPException(status_code=400, detail="Only dine-in orders can be transferred between tables")
    if order.status in ("delivered", "cancelled_by_customer", "cancelled_by_merchant", "refunded"):
        raise HTTPException(status_code=400, detail="Cannot transfer a completed or cancelled order")

    # Validate the target table belongs to this store, then move table-status
    # snapshots too (was: order moved only, leaving the old table stuck
    # "occupied" and the new one unmarked — and no occupancy check at all).
    from app.models.store import DiningTable, TableStatusSnapshot

    table_ids = [new_table_id] + ([order.dining_table_id] if order.dining_table_id else [])
    tables = (await db.execute(
        select(DiningTable).where(
            DiningTable.id.in_(table_ids),
            DiningTable.store_id == staff.store_id,
            DiningTable.deleted_at.is_(None),
        )
    )).scalars().all()
    if new_table_id not in {t.id for t in tables}:
        raise HTTPException(status_code=404, detail="Table not found in this store")

    snaps = {s.table_id: s for s in (await db.execute(
        select(TableStatusSnapshot).where(TableStatusSnapshot.table_id.in_(table_ids)).with_for_update()
    )).scalars().all()}
    new_snap = snaps.get(new_table_id)
    if new_snap and new_snap.status == "occupied" and new_snap.current_order_id != order.id:
        raise HTTPException(status_code=400, detail="Target table is occupied by a different order")

    old_table_id = order.dining_table_id
    order.dining_table_id = new_table_id
    order.updated_at = datetime.now(timezone.utc)

    if old_table_id and old_table_id in snaps:
        old_snap = snaps[old_table_id]
        old_snap.status = "available"
        old_snap.current_order_id = None
        old_snap.updated_at = datetime.now(timezone.utc)

    if new_snap:
        new_snap.status = "occupied"
        new_snap.current_order_id = order.id
        new_snap.updated_at = datetime.now(timezone.utc)
    else:
        db.add(TableStatusSnapshot(
            table_id=new_table_id, store_id=staff.store_id,
            status="occupied", current_order_id=order.id,
        ))

    await db.commit()
    return APIResponse(data={"id": order.id, "table_id": new_table_id})
