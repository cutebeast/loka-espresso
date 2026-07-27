"""Staff-scoped order management endpoints (POS operations)."""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field
from sqlalchemy import select, func, case

from app.api.routes.deps import CurrentStaff, DBDependency, RequireStaffRole
from app.core.money import money_round, to_decimal
from app.models.customer import Customer
from app.models.order import Order, OrderAdjustment, OrderLineItem, OrderStatusLog
from app.models.menu import MenuCategory, MenuItem
from app.models.platform import AuditLog
from app.models.pos import OrderModificationLog
from app.models.reward import CustomerReward, RewardCatalog
from app.models.staff import StaffProfile
from app.models.store import DiningTable
from app.models.voucher import CustomerVoucher, VoucherDefinition
from app.models.wallet import Wallet, WalletLedgerEntry
from app.schemas.base import APIResponse, BaseSchema
from app.schemas.order import (
    ApplyOrderRewardRequest,
    ApplyOrderVoucherRequest,
    MergeOrderRequest,
    PayWithWalletRequest,
    ProcessOrderPaymentRequest,
)
from app.services.order import OrderError, reverse_order_effects, validate_voucher_eligibility
from app.services.payment import PaymentError, cancel_pending_order_payments, create_stripe_checkout_session
from app.services.platform_config import PlatformConfigService

router = APIRouter(prefix="/staff/orders", tags=["staff — orders"])


def _audit_principal_id(staff) -> int | None:
    """Return the principal_id to use for audit logs, or None if not available."""
    pid = getattr(staff, "principal_id", None)
    return pid if pid else None


async def _require_store_order(staff, order: Order) -> None:
    if order.store_id != staff.store_id:
        raise HTTPException(status_code=403, detail="Access denied for this store")


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
        select(Payment).where(Payment.order_id == order.id, Payment.status == "captured")
    )
    captured_from_payments = money_round(
        sum(to_decimal(p.amount) for p in existing_payments.scalars().all()),
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

        # Quantity already allocated to earlier payments, per line item
        prior_q = await db.execute(
            select(
                PaymentLineAllocation.order_line_item_id,
                func.coalesce(func.sum(PaymentLineAllocation.quantity), 0),
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
        "qr": "grabpay",
        "stripe_qr": "stripe",
        "credit_card": "stripe",
        "debit_card": "stripe",
        "e_wallet": "grabpay",
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

    # Spend-based lucky draw: grant tickets whenever the order ends up captured
    # (cash/card/QR manual capture, wallet payment — idempotent per order)
    if order.payment_status == "captured":
        from app.services.lucky_draw import grant_tickets_for_order
        await grant_tickets_for_order(db, order)

    log = OrderStatusLog(
        order_id=order.id,
        from_status=order.status,
        to_status=order.status,
        reason=f"Payment processed: {payment_method}, amount={net_amount}",
        actor_type="staff",
        actor_id=staff.id,
    )
    db.add(log)
    await db.commit()
    await db.refresh(order)

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

    paid_q = await db.execute(
        select(
            PaymentLineAllocation.order_line_item_id,
            func.coalesce(func.sum(PaymentLineAllocation.quantity), 0),
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
    total_paid = sum(float(p.captured_amount or 0) for p in payments)

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
        select(Payment).where(Payment.order_id == order.id, Payment.status == "captured")
    )
    already_paid = money_round(
        sum(to_decimal(p.amount) for p in payment_result.scalars().all()),
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

    from app.services.payment import _accrue_loyalty_annual_spend
    await _accrue_loyalty_annual_spend(db, payment)

    new_total_paid = money_round(already_paid + amount, precision, rounding_mode)
    if new_total_paid >= to_decimal(order.total_amount):
        order.payment_status = "captured"
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

    menu_result = await db.execute(select(MenuItem).where(MenuItem.id == data.menu_item_id))
    menu_item = menu_result.scalar_one_or_none()
    if not menu_item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    price = to_decimal(menu_item.base_price)
    total = money_round(price * data.quantity, precision, rounding_mode)

    line_item = OrderLineItem(
        order_id=order.id,
        menu_item_id=menu_item.id,
        item_snapshot={"item_name": menu_item.item_name},
        quantity=data.quantity,
        unit_price=price,
        line_total=total,
        selected_modifiers={},
        special_instructions=data.special_instructions,
    )
    db.add(line_item)

    order.items_subtotal = to_decimal(order.items_subtotal) + total
    order.item_count = (order.item_count or 0) + data.quantity
    order.total_amount = money_round(
        to_decimal(order.items_subtotal)
        + to_decimal(order.modifier_subtotal)
        + to_decimal(order.delivery_fee)
        + to_decimal(order.service_charge)
        + to_decimal(order.tax_amount)
        + to_decimal(order.tip_amount)
        - to_decimal(order.discount_amount),
        precision,
        rounding_mode,
    )
    order.updated_at = datetime.now(timezone.utc)

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

    removed_total = to_decimal(line_item.line_total)
    order.items_subtotal = to_decimal(order.items_subtotal) - removed_total
    order.item_count = max(0, (order.item_count or 0) - (line_item.quantity or 1))
    order.total_amount = money_round(
        to_decimal(order.items_subtotal)
        + to_decimal(order.modifier_subtotal)
        + to_decimal(order.delivery_fee)
        + to_decimal(order.service_charge)
        + to_decimal(order.tax_amount)
        + to_decimal(order.tip_amount)
        - to_decimal(order.discount_amount),
        precision,
        rounding_mode,
    )
    order.total_amount = max(Decimal(0), order.total_amount)
    order.updated_at = datetime.now(timezone.utc)

    log = OrderModificationLog(
        order_id=order.id,
        staff_id=staff.id,
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
        select(Payment.id).where(Payment.order_id == order.id, Payment.status == "captured").limit(1)
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
    target.items_subtotal += source.items_subtotal
    target.modifier_subtotal += source.modifier_subtotal
    target.service_charge += source.service_charge
    target.tax_amount += source.tax_amount
    target.discount_amount += source.discount_amount
    target.total_amount += source.total_amount
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
    source.status = "cancelled_by_merchant"
    source.cancellation_reason = f"Merged into order {target.order_number}"
    source.cancelled_by = "merchant"
    source.cancelled_at = datetime.now(timezone.utc)
    source.updated_at = datetime.now(timezone.utc)
    cancelled_payment_ids = await cancel_pending_order_payments(db, source.id)

    db.add(OrderStatusLog(
        order_id=source.id,
        from_status="pending",
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
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
):
    """List orders for the staff member's store.

    `station` enables KDS station routing (bar vs kitchen tabs): only orders
    containing at least one line item routed to that station are returned, and
    each order carries an `items` list limited to that station's items. Routing
    comes from the `kds.station_map` platform config (category slugs per
    station; "*" matches any category not explicitly claimed by another
    station, including uncategorized items).
    """
    stmt = (
        select(Order, Customer, DiningTable)
        .outerjoin(Customer, Customer.id == Order.customer_id)
        .outerjoin(DiningTable, DiningTable.id == Order.dining_table_id)
        .where(Order.store_id == staff.store_id)
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

    return APIResponse(data={
        "id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "order_type": order.order_type,
        "payment_status": order.payment_status,
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
    # value would otherwise blow up as a 500 at commit time).
    VALID = {
        "confirmed", "preparing", "ready_for_pickup", "out_for_delivery",
        "delivered", "cancelled_by_customer", "cancelled_by_merchant",
    }
    if status not in VALID:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid order status '{status}'. Valid: {', '.join(sorted(VALID))}",
        )
    result = await db.execute(
        select(Order).where(
            Order.id == order_id,
            Order.store_id == staff.store_id,
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.status = status
    if status.startswith("cancelled") and reason:
        order.cancellation_reason = reason
        order.cancelled_at = datetime.now(timezone.utc)
    elif status == "delivered":
        order.completed_at = datetime.now(timezone.utc)
    elif status == "preparing":
        order.prepared_at = datetime.now(timezone.utc)
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
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.dining_table_id = new_table_id
    await db.commit()
    return APIResponse(data={"id": order.id, "table_id": new_table_id})
