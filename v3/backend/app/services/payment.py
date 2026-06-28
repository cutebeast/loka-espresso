"""Payment service layer."""

from decimal import Decimal
import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.money import money_round, to_decimal
from app.services.platform_config import PlatformConfigService
from app.models.order import Order
from app.models.payment import Payment, PaymentEvent, Refund

logger = logging.getLogger(__name__)


class PaymentError(Exception):
    """Payment-related error."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _generate_idempotency_key() -> str:
    return f"fnb-{uuid4().hex}"


def _simulate_stripe_intent(payment: Payment) -> dict:
    """Simulate a Stripe PaymentIntent creation response."""
    pi_id = f"pi_test_{uuid4().hex}"
    secret = f"{pi_id}_secret_{uuid4().hex[:24]}"
    return {
        "id": pi_id,
        "client_secret": secret,
        "status": "requires_confirmation",
        "amount": int(payment.amount * 100),
        "currency": payment.currency_code.lower(),
    }


def _simulate_grabpay_intent(payment: Payment, return_url: str | None) -> dict:
    """Simulate a GrabPay session creation response."""
    session_id = uuid4().hex
    redirect = return_url or "https://example.com/payment/complete"
    return {
        "session_id": session_id,
        "redirect_url": f"https://partner-api.grab.com/payments/v1/session/{session_id}?return_url={redirect}",
        "status": "pending",
        "amount": float(payment.amount),
        "currency": payment.currency_code,
    }


async def _add_payment_event(
    db: AsyncSession,
    payment: Payment,
    to_status: str,
    from_status: str | None = None,
    amount: Decimal | float | None = None,
    provider_response: dict | None = None,
) -> PaymentEvent:
    """Record a payment lifecycle event."""
    event = PaymentEvent(
        payment_id=payment.id,
        from_status=from_status or payment.status,
        to_status=to_status,
        amount=amount,
        provider_response=provider_response or {},
    )
    db.add(event)
    await db.flush()
    return event


async def create_payment_intent(
    db: AsyncSession,
    order_id: int,
    provider: str,
    payment_method_type: str,
    payment_method_id: int | None,
    return_url: str | None,
    customer_id: int,
    idempotency_key: str | None = None,
) -> tuple[Payment, dict]:
    """Create a payment intent for an order."""
    key = (idempotency_key or "").strip()[:255]
    if key:
        existing = await db.execute(select(Payment).where(Payment.idempotency_key == key))
        existing_payment = existing.scalar_one_or_none()
        if existing_payment:
            # Verify ownership before returning the cached intent
            order_result = await db.execute(select(Order).where(Order.id == existing_payment.order_id))
            existing_order = order_result.scalar_one_or_none()
            if existing_order is None or existing_order.customer_id != customer_id:
                raise PaymentError("Idempotency key belongs to another customer", 403)
            # Rebuild a minimal provider response for the cached payment
            provider_response = {"status": existing_payment.status, "payment_id": existing_payment.id}
            if existing_payment.provider == "stripe":
                provider_response["id"] = existing_payment.provider_transaction_id or f"pi_{existing_payment.id}"
                provider_response["client_secret"] = f"{existing_payment.provider_transaction_id}_secret" if existing_payment.provider_transaction_id else None
            elif existing_payment.provider in ("grabpay", "gcash", "alipay", "wechat_pay"):
                provider_response["session_id"] = existing_payment.provider_transaction_id or f"session_{existing_payment.id}"
                provider_response["redirect_url"] = return_url or existing_payment.extra_metadata.get("return_url") if existing_payment.extra_metadata else return_url
            return existing_payment, provider_response

    # Verify order exists and belongs to customer
    order_result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = order_result.scalar_one_or_none()
    if order is None:
        raise PaymentError("Order not found", 404)
    if order.customer_id != customer_id:
        raise PaymentError("Order does not belong to customer", 403)

    order_amount = to_decimal(order.total_amount)

    # Create payment record
    payment = Payment(
        order_id=order_id,
        payment_method_id=payment_method_id,
        provider=provider,
        provider_transaction_id=None,
        idempotency_key=key or _generate_idempotency_key(),
        payment_method_type=payment_method_type,
        amount=order_amount,
        currency_code=order.total_amount_currency,
        status="initiated",
        captured_amount=Decimal(0),
        refunded_amount=Decimal(0),
        refund_count=0,
        fee_amount=Decimal(0),
        net_amount=Decimal(0),
        extra_metadata={"return_url": return_url, "simulated": True},
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment)

    # Simulate provider API call
    provider_response: dict
    if provider == "stripe":
        provider_response = _simulate_stripe_intent(payment)
        payment.provider_transaction_id = provider_response["id"]
        payment.status = "pending_authorization"
    elif provider in ("grabpay", "gcash", "alipay", "wechat_pay"):
        provider_response = _simulate_grabpay_intent(payment, return_url)
        payment.provider_transaction_id = provider_response["session_id"]
        payment.status = "pending_authorization"
    else:
        provider_response = {"status": "pending", "simulated": True}
        payment.provider_transaction_id = f"sim_{uuid4().hex}"
        payment.status = "pending_authorization"

    await _add_payment_event(
        db,
        payment,
        to_status="pending_authorization",
        from_status="initiated",
        provider_response=provider_response,
    )
    await db.commit()
    await db.refresh(payment)
    return payment, provider_response


async def confirm_payment(db: AsyncSession, payment_id: int) -> Payment:
    """Confirm a payment (simulate provider confirmation)."""
    result = await db.execute(
        select(Payment).where(Payment.id == payment_id).with_for_update()
    )
    payment = result.scalar_one_or_none()
    if payment is None:
        raise PaymentError("Payment not found", 404)

    if payment.status not in ("initiated", "pending_authorization"):
        raise PaymentError(f"Cannot confirm payment with status {payment.status}", 400)

    old_status = payment.status
    payment.status = "authorized"

    await _add_payment_event(
        db,
        payment,
        to_status="authorized",
        from_status=old_status,
        provider_response={"action": "confirm", "simulated": True},
    )
    await db.commit()
    await db.refresh(payment)
    return payment


async def capture_payment(db: AsyncSession, payment_id: int) -> Payment:
    """Capture an authorized payment."""
    result = await db.execute(
        select(Payment).where(Payment.id == payment_id).with_for_update()
    )
    payment = result.scalar_one_or_none()
    if payment is None:
        raise PaymentError("Payment not found", 404)

    if payment.status != "authorized":
        raise PaymentError(f"Cannot capture payment with status {payment.status}", 400)

    old_status = payment.status
    payment.status = "captured"
    payment.captured_amount = payment.amount

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    # Simulate fee calculation (e.g., 2.9% + 0.30 for card payments)
    if payment.provider in ("stripe", "adyen", "braintree", "paypal"):
        fee = money_round(payment.captured_amount * Decimal("0.029") + Decimal("0.30"), precision, rounding_mode)
    else:
        fee = Decimal(0)
    payment.fee_amount = fee
    payment.net_amount = money_round(payment.captured_amount - fee, precision, rounding_mode)

    await _add_payment_event(
        db,
        payment,
        to_status="captured",
        from_status=old_status,
        amount=payment.captured_amount,
        provider_response={"action": "capture", "simulated": True},
    )

    # Update order payment status
    order_result = await db.execute(
        select(Order).where(Order.id == payment.order_id).with_for_update()
    )
    order = order_result.scalar_one_or_none()
    if order:
        captured_payments = (await db.execute(
            select(Payment).where(Payment.order_id == order.id, Payment.status == "captured")
        )).scalars().all()
        total_captured = money_round(
            sum(to_decimal(p.amount) for p in captured_payments) + to_decimal(payment.amount),
            precision,
            rounding_mode,
        )
        if total_captured >= to_decimal(order.total_amount or 0):
            order.payment_status = "captured"
        else:
            order.payment_status = "initiated"
        order.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(payment)
    return payment


async def cancel_payment(db: AsyncSession, payment_id: int) -> Payment:
    """Cancel a pending payment."""
    result = await db.execute(
        select(Payment).where(Payment.id == payment_id).with_for_update()
    )
    payment = result.scalar_one_or_none()
    if payment is None:
        raise PaymentError("Payment not found", 404)

    if payment.status not in ("initiated", "pending_authorization", "authorized"):
        raise PaymentError(f"Cannot cancel payment with status {payment.status}", 400)

    old_status = payment.status
    payment.status = "voided"

    await _add_payment_event(
        db,
        payment,
        to_status="voided",
        from_status=old_status,
        provider_response={"action": "cancel", "simulated": True},
    )
    await db.commit()
    await db.refresh(payment)
    return payment


async def refund_payment(
    db: AsyncSession,
    payment_id: int,
    amount: Decimal | float | str,
    reason: str,
    reason_category: str,
    approved_by: int | None,
) -> Refund:
    """Request a refund for a captured payment."""
    result = await db.execute(
        select(Payment).where(Payment.id == payment_id).with_for_update()
    )
    payment = result.scalar_one_or_none()
    if payment is None:
        raise PaymentError("Payment not found", 404)

    if payment.status not in ("captured", "partially_refunded"):
        raise PaymentError(f"Cannot refund payment with status {payment.status}", 400)

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    refund_amount = to_decimal(amount)
    max_refund = money_round(payment.captured_amount - payment.refunded_amount, precision, rounding_mode)
    if refund_amount > max_refund:
        raise PaymentError(f"Refund amount exceeds available balance ({max_refund})", 400)

    refund = Refund(
        payment_id=payment_id,
        order_id=payment.order_id,
        amount=refund_amount,
        reason=reason,
        reason_category=reason_category,
        approved_by=approved_by,
        provider_refund_id=f"re_sim_{uuid4().hex}",
        status="pending",
    )
    db.add(refund)
    await db.flush()
    await db.refresh(refund)

    payment.refunded_amount = money_round(payment.refunded_amount + refund_amount, precision, rounding_mode)
    payment.refund_count += 1

    if payment.refunded_amount >= payment.captured_amount:
        new_status = "refunded"
    else:
        new_status = "partially_refunded"

    old_status = payment.status
    payment.status = new_status

    await _add_payment_event(
        db,
        payment,
        to_status=new_status,
        from_status=old_status,
        amount=refund_amount,
        provider_response={"action": "refund", "refund_id": refund.id, "simulated": True},
    )
    await db.commit()
    await db.refresh(refund)
    return refund


async def process_webhook_event(
    db: AsyncSession,
    provider: str,
    payload: dict,
) -> Payment | None:
    """Process an incoming webhook event from a payment provider."""
    event_type = payload.get("type", payload.get("event_type", "unknown"))
    transaction_id = payload.get("data", {}).get("id") or payload.get("transaction_id") or payload.get("session_id")

    if not transaction_id:
        logger.warning("Webhook payload missing transaction identifier")
        return None

    result = await db.execute(
        select(Payment).where(Payment.provider_transaction_id == transaction_id).with_for_update()
    )
    payment = result.scalar_one_or_none()
    if payment is None:
        logger.warning("Payment not found for transaction_id %s", transaction_id)
        return None

    old_status = payment.status
    new_status = old_status

    # Simple event-to-status mapping
    if provider == "stripe":
        if event_type in ("payment_intent.payment_failed", "charge.failed"):
            new_status = "failed"
            payment.failure_code = payload.get("data", {}).get("last_payment_error", {}).get("code")
            payment.failure_message = payload.get("data", {}).get("last_payment_error", {}).get("message")
        elif event_type in ("payment_intent.succeeded", "charge.succeeded"):
            new_status = "captured"
            payment.captured_amount = payment.amount
        elif event_type == "payment_intent.canceled":
            new_status = "voided"
        elif event_type == "charge.refunded":
            new_status = "refunded"
    elif provider == "grabpay":
        if event_type in ("payment.success", "session.completed"):
            new_status = "captured"
            payment.captured_amount = payment.amount
        elif event_type in ("payment.failed", "session.failed"):
            new_status = "failed"
        elif event_type in ("payment.cancelled", "session.cancelled"):
            new_status = "voided"

    if new_status != old_status:
        payment.status = new_status
        await _add_payment_event(
            db,
            payment,
            to_status=new_status,
            from_status=old_status,
            provider_response=payload,
        )
        await db.commit()
        await db.refresh(payment)

    return payment
