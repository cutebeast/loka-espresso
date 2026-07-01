"""Payment service layer."""

from decimal import Decimal, ROUND_HALF_UP
import logging
from datetime import datetime, timezone
from uuid import uuid4

import anyio
import stripe
from stripe._error import InvalidRequestError, StripeError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
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


def _to_cents(amount: Decimal) -> int:
    """Convert a decimal amount to the smallest currency unit (cents)."""
    return int((amount * Decimal(100)).to_integral_value(rounding=ROUND_HALF_UP))


def _from_cents(cents: int) -> Decimal:
    """Convert an integer cent amount back to a decimal currency value."""
    return Decimal(cents) / Decimal(100)


async def _get_stripe_secret_key(db: AsyncSession) -> str | None:
    """Read Stripe secret key from platform_config, falling back to .env."""
    value = await PlatformConfigService(db).get_str("stripe.secret_key", default="")
    if value:
        return value
    return get_settings().stripe_secret_key or None


async def _get_stripe_publishable_key(db: AsyncSession) -> str | None:
    """Read Stripe publishable key from platform_config, falling back to .env."""
    value = await PlatformConfigService(db).get_str("stripe.publishable_key", default="")
    if value:
        return value
    return get_settings().stripe_publishable_key or None


async def _get_stripe_webhook_secret(db: AsyncSession) -> str | None:
    """Read Stripe webhook secret from platform_config, falling back to .env."""
    value = await PlatformConfigService(db).get_str("stripe.webhook_secret", default="")
    if value:
        return value
    return get_settings().stripe_webhook_secret or None


async def _stripe_enabled(db: AsyncSession) -> bool:
    """Return True when a real Stripe secret key is configured."""
    return bool(await _get_stripe_secret_key(db))


async def get_payment_gateway_config(db: AsyncSession) -> dict:
    """Return public payment gateway configuration (no secrets)."""
    secret = await _get_stripe_secret_key(db)
    publishable = await _get_stripe_publishable_key(db)
    return {"stripe_enabled": bool(secret), "stripe_publishable_key": publishable or ""}


async def get_stripe_webhook_secret(db: AsyncSession) -> str | None:
    """Return the configured Stripe webhook secret, preferring platform_config over .env."""
    return await _get_stripe_webhook_secret(db)


async def _create_stripe_intent(
    payment: Payment,
    idempotency_key: str,
    api_key: str,
) -> dict:
    """Create a real Stripe PaymentIntent."""
    params: dict = {
        "amount": _to_cents(payment.amount),
        "currency": payment.currency_code.lower(),
        "automatic_payment_methods": {"enabled": True},
        "metadata": {
            "order_id": payment.order_id,
            "payment_id": payment.id,
            "idempotency_key": idempotency_key,
        },
        "idempotency_key": idempotency_key,
    }

    try:
        intent = await anyio.to_thread.run_sync(
            lambda: stripe.PaymentIntent.create(**params, api_key=api_key)
        )
    except StripeError as exc:
        logger.error("Stripe PaymentIntent creation failed: %s", exc)
        raise PaymentError(f"Stripe error: {exc.user_message or str(exc)}", 402) from exc

    return {
        "id": intent.id,
        "client_secret": intent.client_secret,
        "status": intent.status,
        "amount": intent.amount,
        "currency": intent.currency,
    }


async def _retrieve_stripe_intent(payment: Payment, api_key: str) -> stripe.PaymentIntent:
    """Retrieve a Stripe PaymentIntent by its provider transaction id."""
    assert payment.provider_transaction_id is not None

    try:
        return await anyio.to_thread.run_sync(
            lambda: stripe.PaymentIntent.retrieve(
                payment.provider_transaction_id,
                api_key=api_key,
            )
        )
    except StripeError as exc:
        logger.error("Stripe PaymentIntent retrieve failed: %s", exc)
        raise PaymentError(f"Stripe error: {exc.user_message or str(exc)}", 502) from exc


async def _capture_stripe_intent(payment: Payment, api_key: str) -> stripe.PaymentIntent:
    """Capture an authorized Stripe PaymentIntent."""
    assert payment.provider_transaction_id is not None

    try:
        return await anyio.to_thread.run_sync(
            lambda: stripe.PaymentIntent.capture(
                payment.provider_transaction_id,
                api_key=api_key,
            )
        )
    except StripeError as exc:
        logger.error("Stripe PaymentIntent capture failed: %s", exc)
        raise PaymentError(f"Stripe error: {exc.user_message or str(exc)}", 402) from exc


async def _cancel_stripe_intent(payment: Payment, api_key: str) -> stripe.PaymentIntent:
    """Cancel a Stripe PaymentIntent."""
    assert payment.provider_transaction_id is not None

    try:
        return await anyio.to_thread.run_sync(
            lambda: stripe.PaymentIntent.cancel(
                payment.provider_transaction_id,
                api_key=api_key,
            )
        )
    except InvalidRequestError as exc:
        # Already-canceled intents can be treated as voided.
        if "already canceled" in str(exc).lower() or "canceled" in str(exc).lower():
            return stripe.PaymentIntent.construct_from(
                {"id": payment.provider_transaction_id, "status": "canceled"},
                api_key,
            )
        logger.error("Stripe PaymentIntent cancel failed: %s", exc)
        raise PaymentError(f"Stripe error: {exc.user_message or str(exc)}", 402) from exc
    except StripeError as exc:
        logger.error("Stripe PaymentIntent cancel failed: %s", exc)
        raise PaymentError(f"Stripe error: {exc.user_message or str(exc)}", 402) from exc


async def _create_stripe_refund(
    payment: Payment,
    amount: Decimal,
    api_key: str,
) -> stripe.Refund:
    """Create a real Stripe refund."""
    assert payment.provider_transaction_id is not None

    params: dict = {
        "payment_intent": payment.provider_transaction_id,
        "amount": _to_cents(amount),
        "reason": "requested_by_customer",
        "metadata": {
            "payment_id": payment.id,
            "order_id": payment.order_id,
        },
    }

    try:
        return await anyio.to_thread.run_sync(
            lambda: stripe.Refund.create(**params, api_key=api_key)
        )
    except StripeError as exc:
        logger.error("Stripe refund creation failed: %s", exc)
        raise PaymentError(f"Stripe error: {exc.user_message or str(exc)}", 402) from exc


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
                stripe_enabled = await _stripe_enabled(db)
                if stripe_enabled and existing_payment.provider_transaction_id:
                    api_key = await _get_stripe_secret_key(db)
                    stripe_intent = await _retrieve_stripe_intent(existing_payment, api_key)
                    provider_response = {
                        "id": stripe_intent.id,
                        "client_secret": stripe_intent.client_secret,
                        "status": stripe_intent.status,
                        "amount": stripe_intent.amount,
                        "currency": stripe_intent.currency,
                    }
                else:
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
        extra_metadata={"return_url": return_url, "simulated": not (provider == "stripe" and await _stripe_enabled(db))},
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment)

    # Provider API call
    provider_response: dict
    if provider == "stripe":
        if await _stripe_enabled(db):
            api_key = await _get_stripe_secret_key(db)
            provider_response = await _create_stripe_intent(payment, payment.idempotency_key, api_key)
        else:
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

    if payment.provider == "stripe" and await _stripe_enabled(db):
        api_key = await _get_stripe_secret_key(db)
        intent = await _retrieve_stripe_intent(payment, api_key)
        if intent.status == "succeeded":
            config_service = PlatformConfigService(db)
            precision = await config_service.get_accounting_precision()
            rounding_mode = await config_service.get_accounting_rounding()

            payment.status = "captured"
            payment.captured_amount = _from_cents(intent.amount_received) if intent.amount_received else payment.amount
            await _apply_capture_fees(payment, precision, rounding_mode)
            await _add_payment_event(
                db,
                payment,
                to_status="captured",
                from_status=old_status,
                amount=payment.captured_amount,
                provider_response={"action": "confirm", "stripe_status": intent.status},
            )
            await _sync_order_payment_status(db, payment)
        elif intent.status == "requires_capture":
            payment.status = "authorized"
            await _add_payment_event(
                db,
                payment,
                to_status="authorized",
                from_status=old_status,
                provider_response={"action": "confirm", "stripe_status": intent.status},
            )
        else:
            raise PaymentError(
                f"Payment has not been completed by the customer (Stripe status: {intent.status})",
                400,
            )
    else:
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


async def _apply_capture_fees(payment: Payment, precision: int, rounding_mode: str) -> None:
    """Apply provider fee estimate and net amount to a captured payment."""
    if payment.provider in ("stripe", "adyen", "braintree", "paypal"):
        fee = money_round(
            payment.captured_amount * Decimal("0.029") + Decimal("0.30"),
            precision,
            rounding_mode,
        )
    else:
        fee = Decimal(0)
    payment.fee_amount = fee
    payment.net_amount = money_round(payment.captured_amount - fee, precision, rounding_mode)


async def _sync_order_payment_status(db: AsyncSession, payment: Payment) -> None:
    """Recompute and persist an order's payment status from its captured payments."""
    order_result = await db.execute(
        select(Order).where(Order.id == payment.order_id).with_for_update()
    )
    order = order_result.scalar_one_or_none()
    if not order:
        return

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    captured_payments = (
        await db.execute(
            select(Payment).where(
                Payment.order_id == order.id,
                Payment.status == "captured",
            )
        )
    ).scalars().all()
    total_captured = money_round(
        sum(to_decimal(p.amount) for p in captured_payments),
        precision,
        rounding_mode,
    )

    if total_captured >= money_round(to_decimal(order.total_amount or 0), precision, rounding_mode):
        order.payment_status = "captured"
    else:
        order.payment_status = "initiated"
    order.updated_at = datetime.now(timezone.utc)


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

    stripe_enabled = await _stripe_enabled(db)
    if payment.provider == "stripe" and stripe_enabled:
        api_key = await _get_stripe_secret_key(db)
        intent = await _retrieve_stripe_intent(payment, api_key)
        if intent.status == "requires_capture":
            intent = await _capture_stripe_intent(payment, api_key)
        elif intent.status != "succeeded":
            raise PaymentError(f"Cannot capture Stripe PaymentIntent with status {intent.status}", 400)
        payment.status = "captured"
        payment.captured_amount = _from_cents(intent.amount_received) if intent.amount_received else payment.amount
    else:
        payment.status = "captured"
        payment.captured_amount = payment.amount

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()
    await _apply_capture_fees(payment, precision, rounding_mode)

    await _add_payment_event(
        db,
        payment,
        to_status="captured",
        from_status=old_status,
        amount=payment.captured_amount,
        provider_response={"action": "capture", "simulated": not (payment.provider == "stripe" and stripe_enabled)},
    )
    await _sync_order_payment_status(db, payment)

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

    stripe_enabled = await _stripe_enabled(db)
    if payment.provider == "stripe" and stripe_enabled and payment.provider_transaction_id:
        api_key = await _get_stripe_secret_key(db)
        await _cancel_stripe_intent(payment, api_key)

    old_status = payment.status
    payment.status = "voided"

    await _add_payment_event(
        db,
        payment,
        to_status="voided",
        from_status=old_status,
        provider_response={"action": "cancel", "simulated": not (payment.provider == "stripe" and stripe_enabled)},
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

    provider_refund_id = f"re_sim_{uuid4().hex}"
    refund_status = "pending"

    stripe_enabled = await _stripe_enabled(db)
    if payment.provider == "stripe" and stripe_enabled:
        api_key = await _get_stripe_secret_key(db)
        stripe_refund = await _create_stripe_refund(payment, refund_amount, api_key)
        provider_refund_id = stripe_refund.id
        refund_status = "completed" if stripe_refund.status in ("succeeded", "pending") else "pending"

    refund = Refund(
        payment_id=payment_id,
        order_id=payment.order_id,
        amount=refund_amount,
        reason=reason,
        reason_category=reason_category,
        approved_by=approved_by,
        provider_refund_id=provider_refund_id,
        status=refund_status,
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
        provider_response={"action": "refund", "refund_id": refund.id, "simulated": not (payment.provider == "stripe" and stripe_enabled)},
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

    # Stripe payloads nest the resource under data.object; GrabPay uses data directly.
    data_wrapper = payload.get("data", {})
    data = data_wrapper.get("object", data_wrapper)
    transaction_id = data.get("id") or payload.get("transaction_id") or payload.get("session_id")

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
            last_error = data.get("last_payment_error", {})
            payment.failure_code = last_error.get("code")
            payment.failure_message = last_error.get("message")
        elif event_type in ("payment_intent.succeeded", "charge.succeeded"):
            new_status = "captured"
            payment.captured_amount = _from_cents(data.get("amount_received")) if data.get("amount_received") is not None else payment.amount
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

        if new_status == "captured":
            config_service = PlatformConfigService(db)
            precision = await config_service.get_accounting_precision()
            rounding_mode = await config_service.get_accounting_rounding()
            await _apply_capture_fees(payment, precision, rounding_mode)
            await _sync_order_payment_status(db, payment)

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
