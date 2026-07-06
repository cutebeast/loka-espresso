"""Payment service layer."""

from decimal import Decimal, ROUND_HALF_UP
import logging
from datetime import datetime, timezone
from uuid import uuid4

import anyio
import stripe
from stripe._error import InvalidRequestError, StripeError
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.money import money_round, to_decimal
from app.services.platform_config import PlatformConfigService
from app.services.hitpay import (
    HitPayError,
    _get_payment_methods as get_hitpay_payment_methods,
    _hitpay_enabled as hitpay_enabled,
    cancel_hitpay_payment_request,
    create_hitpay_payment_request,
    create_hitpay_refund,
    get_hitpay_payment_request,
)
from app.models.customer import Customer
from app.models.order import Order
from app.models.payment import Payment, PaymentEvent, Refund
from app.models.wallet import Wallet, WalletLedgerEntry

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


async def _get_myr_payment_method_types(db: AsyncSession) -> list[str]:
    """Return the Stripe payment method types enabled for Malaysia/MYR."""
    value = await PlatformConfigService(db).get("stripe.payment_method_types", default=None)
    if isinstance(value, list):
        return [str(v).lower() for v in value]
    return ["card", "fpx", "grabpay"]


async def _get_stripe_automatic_tax_enabled(db: AsyncSession) -> bool:
    """Return whether Stripe Tax should be enabled on intents/sessions."""
    return await PlatformConfigService(db).get_bool("stripe.automatic_tax_enabled", default=False)


async def _get_or_create_stripe_customer(
    db: AsyncSession,
    customer_id: int,
    api_key: str,
) -> str | None:
    """Return a Stripe Customer ID for the app customer, creating one if needed."""
    result = await db.execute(select(Customer).where(Customer.id == customer_id).with_for_update())
    customer = result.scalar_one_or_none()
    if customer is None:
        return None
    if customer.stripe_customer_id:
        return customer.stripe_customer_id

    name = customer.display_name or f"{customer.given_name or ''} {customer.family_name or ''}".strip() or None
    params: dict = {}
    if name:
        params["name"] = name
    if customer.email_address:
        params["email"] = customer.email_address
    if customer.phone_number:
        params["phone"] = customer.phone_number
    params["metadata"] = {"app_customer_id": customer.id}

    try:
        stripe_customer = await anyio.to_thread.run_sync(
            lambda: stripe.Customer.create(**params, api_key=api_key)
        )
    except StripeError as exc:
        logger.error("Stripe Customer creation failed: %s", exc)
        return None

    customer.stripe_customer_id = stripe_customer.id
    await db.flush()
    return stripe_customer.id


async def _stripe_enabled(db: AsyncSession) -> bool:
    """Return True when Stripe is enabled and a secret key is configured."""
    config = PlatformConfigService(db)
    enabled = await config.get_bool("stripe.enabled", default=True)
    if not enabled:
        return False
    return bool(await _get_stripe_secret_key(db))


async def get_payment_gateway_config(db: AsyncSession) -> dict:
    """Return public payment gateway configuration (no secrets)."""
    publishable = await _get_stripe_publishable_key(db)
    return {
        "stripe_enabled": await _stripe_enabled(db),
        "stripe_publishable_key": publishable or "",
        "hitpay_enabled": await hitpay_enabled(db),
        "hitpay_payment_methods": await get_hitpay_payment_methods(db),
        "currency": await PlatformConfigService(db).get_str("currency.default", default="MYR"),
        "payment_method_types": await _get_myr_payment_method_types(db),
    }


async def get_stripe_webhook_secret(db: AsyncSession) -> str | None:
    """Return the configured Stripe webhook secret, preferring platform_config over .env."""
    return await _get_stripe_webhook_secret(db)


async def _create_stripe_intent(
    db: AsyncSession,
    payment: Payment,
    idempotency_key: str,
    api_key: str,
    customer_id: int | None = None,
) -> dict:
    """Create a real Stripe PaymentIntent with Malaysia payment methods."""
    params: dict = {
        "amount": _to_cents(payment.amount),
        "currency": payment.currency_code.lower(),
        "payment_method_types": await _get_myr_payment_method_types(db),
        "metadata": {
            "order_id": payment.order_id,
            "payment_id": payment.id,
            "idempotency_key": idempotency_key,
        },
        "idempotency_key": idempotency_key,
    }

    if customer_id:
        stripe_customer_id = await _get_or_create_stripe_customer(db, customer_id, api_key)
        if stripe_customer_id:
            params["customer"] = stripe_customer_id
            if await _get_stripe_automatic_tax_enabled(db):
                params["automatic_tax"] = {"enabled": True}

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


async def _expire_stripe_checkout_session(session_id: str, api_key: str) -> dict:
    """Expire a Stripe Checkout Session so it can no longer be paid."""
    try:
        return await anyio.to_thread.run_sync(
            lambda: stripe.checkout.Session.expire(session_id, api_key=api_key)
        )
    except InvalidRequestError as exc:
        if "already expired" in str(exc).lower() or "expired" in str(exc).lower() or "not available" in str(exc).lower():
            return {"id": session_id, "status": "expired"}
        logger.error("Stripe Checkout Session expire failed: %s", exc)
        raise PaymentError(f"Stripe error: {exc.user_message or str(exc)}", 402) from exc
    except StripeError as exc:
        logger.error("Stripe Checkout Session expire failed: %s", exc)
        raise PaymentError(f"Stripe error: {exc.user_message or str(exc)}", 402) from exc


async def _create_stripe_refund(
    payment: Payment,
    amount: Decimal,
    api_key: str,
) -> stripe.Refund:
    """Create a real Stripe refund."""
    assert payment.provider_transaction_id is not None

    transaction_id = payment.provider_transaction_id
    # Checkout Session ids must be resolved to their PaymentIntent before refunding.
    if transaction_id.startswith("cs_"):
        try:
            session = await anyio.to_thread.run_sync(
                lambda: stripe.checkout.Session.retrieve(
                    transaction_id,
                    api_key=api_key,
                )
            )
        except StripeError as exc:
            logger.error("Stripe Checkout Session retrieve for refund failed: %s", exc)
            raise PaymentError(f"Stripe error: {exc.user_message or str(exc)}", 402) from exc
        transaction_id = session.get("payment_intent") or transaction_id
        if not transaction_id or transaction_id.startswith("cs_"):
            raise PaymentError("Checkout Session has no associated PaymentIntent; cannot refund yet", 400)

    params: dict = {
        "payment_intent": transaction_id,
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


async def _create_stripe_checkout_session(
    db: AsyncSession,
    payment: Payment,
    order: Order,
    api_key: str,
    success_url: str | None = None,
    cancel_url: str | None = None,
    customer_id: int | None = None,
) -> dict:
    """Create a Stripe Checkout Session for QR/customer-device payments."""
    config_service = PlatformConfigService(db)
    staff_public_url = await config_service.get_staff_public_url()
    success = success_url or f"{staff_public_url}/pos"
    cancel = cancel_url or f"{staff_public_url}/pos"
    params: dict = {
        "payment_method_types": await _get_myr_payment_method_types(db),
        "line_items": [
            {
                "price_data": {
                    "currency": payment.currency_code.lower(),
                    "product_data": {"name": f"Order {order.order_number}"},
                    "unit_amount": _to_cents(payment.amount),
                },
                "quantity": 1,
            }
        ],
        "mode": "payment",
        "success_url": f"{success}?session_id={{CHECKOUT_SESSION_ID}}&status=success",
        "cancel_url": f"{cancel}?session_id={{CHECKOUT_SESSION_ID}}&status=cancel",
        "payment_intent_data": {
            "metadata": {
                "order_id": order.id,
                "payment_id": payment.id,
            },
        },
        "metadata": {
            "order_id": order.id,
            "payment_id": payment.id,
        },
    }

    if customer_id:
        stripe_customer_id = await _get_or_create_stripe_customer(db, customer_id, api_key)
        if stripe_customer_id:
            params["customer"] = stripe_customer_id
            if await _get_stripe_automatic_tax_enabled(db):
                params["automatic_tax"] = {"enabled": True}

    try:
        session = await anyio.to_thread.run_sync(
            lambda: stripe.checkout.Session.create(**params, api_key=api_key)
        )
    except StripeError as exc:
        logger.error("Stripe Checkout Session creation failed: %s", exc)
        raise PaymentError(f"Stripe error: {exc.user_message or str(exc)}", 402) from exc

    return {
        "id": session.id,
        "url": session.url,
        "payment_intent": session.payment_intent,
    }


async def create_wallet_topup_checkout_session(
    db: AsyncSession,
    session_id: int,
    customer_id: int,
    amount: Decimal,
    currency_code: str,
    success_url: str | None = None,
    cancel_url: str | None = None,
) -> dict:
    """Create a Stripe Checkout Session for a wallet top-up."""
    if not await _stripe_enabled(db):
        fake_id = f"cs_test_{uuid4().hex}"
        settings = get_settings()
        checkout_url = (settings.stripe_simulator_checkout_url or "https://checkout.stripe.com/test-session/{session_id}").format(session_id=fake_id)
        return {
            "id": fake_id,
            "url": checkout_url,
            "payment_intent": f"pi_test_{uuid4().hex}",
        }
    api_key = await _get_stripe_secret_key(db)
    assert api_key is not None
    config_service = PlatformConfigService(db)
    app_public_url = await config_service.get_app_public_url()
    base = success_url or f"{app_public_url}/wallet"
    params: dict = {
        "payment_method_types": await _get_myr_payment_method_types(db),
        "line_items": [
            {
                "price_data": {
                    "currency": currency_code.lower(),
                    "product_data": {"name": "Wallet Top-up"},
                    "unit_amount": _to_cents(amount),
                },
                "quantity": 1,
            }
        ],
        "mode": "payment",
        "success_url": f"{base}?session_id={{CHECKOUT_SESSION_ID}}&status=success",
        "cancel_url": f"{base}?session_id={{CHECKOUT_SESSION_ID}}&status=cancel",
        "payment_intent_data": {
            "metadata": {
                "wallet_topup_session_id": session_id,
                "customer_id": customer_id,
            },
        },
        "metadata": {
            "wallet_topup_session_id": session_id,
            "customer_id": customer_id,
        },
    }

    stripe_customer_id = await _get_or_create_stripe_customer(db, customer_id, api_key)
    if stripe_customer_id:
        params["customer"] = stripe_customer_id
        if await _get_stripe_automatic_tax_enabled(db):
            params["automatic_tax"] = {"enabled": True}

    try:
        session = await anyio.to_thread.run_sync(
            lambda: stripe.checkout.Session.create(**params, api_key=api_key)
        )
    except StripeError as exc:
        logger.error("Stripe wallet top-up session creation failed: %s", exc)
        raise PaymentError(f"Stripe error: {exc.user_message or str(exc)}", 402) from exc
    return {
        "id": session.id,
        "url": session.url,
        "payment_intent": session.payment_intent,
    }


async def create_stripe_checkout_session(
    db: AsyncSession,
    payment: Payment,
    order: Order,
    success_url: str | None = None,
    cancel_url: str | None = None,
    customer_id: int | None = None,
) -> dict:
    """Public wrapper to create a Stripe Checkout Session for POS QR / customer pay links."""
    if not success_url or not cancel_url:
        config = PlatformConfigService(db)
        staff_public_url = await config.get_staff_public_url()
        default_success = await config.get_str("stripe.checkout_success_url", default="")
        default_cancel = await config.get_str("stripe.checkout_cancel_url", default="")
        if not default_success:
            default_success = get_settings().stripe_checkout_success_url or f"{staff_public_url}/pos"
        if not default_cancel:
            default_cancel = get_settings().stripe_checkout_cancel_url or f"{staff_public_url}/pos"
        success_url = success_url or default_success
        cancel_url = cancel_url or default_cancel

    if await _stripe_enabled(db):
        api_key = await _get_stripe_secret_key(db)
        assert api_key is not None
        return await _create_stripe_checkout_session(
            db, payment, order, api_key, success_url=success_url, cancel_url=cancel_url, customer_id=customer_id
        )

    # Simulator fallback: produce a fake session URL so staff/client UIs can be tested.
    session_id = f"cs_test_{uuid4().hex}"
    settings = get_settings()
    checkout_url = (settings.stripe_simulator_checkout_url or "https://checkout.stripe.com/test-session/{session_id}").format(session_id=session_id)
    return {
        "id": session_id,
        "url": checkout_url,
        "payment_intent": f"pi_test_{uuid4().hex}",
    }


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
    settings = get_settings()
    template = settings.grabpay_simulator_session_url or "https://partner-api.grab.com/payments/v1/session/{session_id}?return_url={return_url}"
    return {
        "session_id": session_id,
        "redirect_url": template.format(session_id=session_id, return_url=redirect),
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
        existing = await db.execute(
            select(Payment).where(Payment.idempotency_key == key).with_for_update()
        )
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
            elif existing_payment.provider == "hitpay":
                provider_response = {
                    "id": existing_payment.provider_transaction_id,
                    "redirect_url": existing_payment.extra_metadata.get("redirect_url") if existing_payment.extra_metadata else None,
                    "status": existing_payment.status,
                    "amount": float(existing_payment.amount),
                    "currency": existing_payment.currency_code,
                }
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
        extra_metadata={
            "return_url": return_url,
            "simulated": not (
                (provider == "stripe" and await _stripe_enabled(db))
                or (provider == "hitpay" and await hitpay_enabled(db))
            ),
        },
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment)

    # Provider API call
    provider_response: dict
    if provider == "stripe":
        if await _stripe_enabled(db):
            api_key = await _get_stripe_secret_key(db)
            provider_response = await _create_stripe_intent(db, payment, payment.idempotency_key, api_key, customer_id=customer_id)
        else:
            provider_response = _simulate_stripe_intent(payment)
        payment.provider_transaction_id = provider_response["id"]
        payment.status = "pending_authorization"
    elif provider == "hitpay":
        if await hitpay_enabled(db):
            customer_result = await db.execute(select(Customer).where(Customer.id == customer_id))
            customer = customer_result.scalar_one_or_none()
            provider_response = await create_hitpay_payment_request(db, payment, order, customer, return_url=return_url)
            payment.provider_transaction_id = provider_response["id"]
            payment.extra_metadata = {
                **(payment.extra_metadata or {}),
                "redirect_url": provider_response["url"],
                "hitpay": True,
            }
            payment.status = "pending_authorization"
        else:
            raise PaymentError("HitPay is not enabled", 503)
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

    if payment.status == "captured":
        return payment
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
            await _apply_capture_fees(db, payment, precision, rounding_mode)
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
    elif payment.provider == "hitpay" and await hitpay_enabled(db):
        config_service = PlatformConfigService(db)
        precision = await config_service.get_accounting_precision()
        rounding_mode = await config_service.get_accounting_rounding()

        if not payment.provider_transaction_id:
            raise PaymentError("HitPay payment request id is missing", 400)

        hitpay_request = await get_hitpay_payment_request(db, payment.provider_transaction_id)
        hitpay_status = hitpay_request.get("status", "").lower()
        if hitpay_status == "completed":
            payment.status = "captured"
            payment.captured_amount = to_decimal(hitpay_request.get("amount", payment.amount))
            fee = _parse_hitpay_fee(hitpay_request)
            await _apply_capture_fees(db, payment, precision, rounding_mode, fee_amount=fee)
            _record_hitpay_payment_id(payment, hitpay_request)
            await _add_payment_event(
                db,
                payment,
                to_status="captured",
                from_status=old_status,
                amount=payment.captured_amount,
                provider_response={"action": "confirm", "hitpay_status": hitpay_status},
            )
            await _sync_order_payment_status(db, payment)
        elif hitpay_status in ("pending",):
            raise PaymentError("Payment is still pending. Please wait for the confirmation.", 400)
        elif hitpay_status in ("failed", "expired", "canceled"):
            raise PaymentError(f"HitPay payment {hitpay_status}", 400)
        else:
            raise PaymentError(f"Unexpected HitPay status: {hitpay_status}", 400)
    else:
        # Cash-like / wallet providers are captured immediately on confirmation.
        # Redirect-based providers remain pending until the webhook arrives.
        if payment.provider in ("cash", "internal_wallet", "store_credit"):
            config_service = PlatformConfigService(db)
            precision = await config_service.get_accounting_precision()
            rounding_mode = await config_service.get_accounting_rounding()
            payment.status = "captured"
            payment.captured_amount = payment.amount
            await _apply_capture_fees(db, payment, precision, rounding_mode)
            await _add_payment_event(
                db,
                payment,
                to_status="captured",
                from_status=old_status,
                amount=payment.captured_amount,
                provider_response={"action": "confirm", "simulated": True},
            )
            await _sync_order_payment_status(db, payment)
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


async def _fetch_stripe_fee_amount(db: AsyncSession, payment: Payment) -> Decimal | None:
    """Fetch the actual Stripe fee from the captured charge's balance transaction.

    Returns None if Stripe is not enabled, the transaction id is missing,
    or the balance transaction cannot be retrieved.
    """
    if payment.provider != "stripe":
        return None
    if not await _stripe_enabled(db):
        return None
    if not payment.provider_transaction_id:
        return None

    api_key = await _get_stripe_secret_key(db)
    if not api_key:
        return None

    try:
        tx_id = payment.provider_transaction_id
        if tx_id.startswith("cs_"):
            session = await anyio.to_thread.run_sync(
                lambda: stripe.checkout.Session.retrieve(tx_id, api_key=api_key)
            )
            tx_id = session.get("payment_intent") or tx_id
            if not tx_id or tx_id.startswith("cs_"):
                return None

        intent = await anyio.to_thread.run_sync(
            lambda: stripe.PaymentIntent.retrieve(tx_id, api_key=api_key)
        )
        charge_id = intent.get("latest_charge") or (
            intent.charges.data[0].id if intent.get("charges") and intent.charges.data else None
        )
        if not charge_id:
            return None

        charge = await anyio.to_thread.run_sync(
            lambda: stripe.Charge.retrieve(charge_id, api_key=api_key, expand=["balance_transaction"])
        )
        bt = charge.get("balance_transaction")
        if isinstance(bt, dict):
            fee_cents = bt.get("fee")
        elif bt:
            bt_obj = await anyio.to_thread.run_sync(
                lambda: stripe.BalanceTransaction.retrieve(bt, api_key=api_key)
            )
            fee_cents = bt_obj.get("fee")
        else:
            return None

        if fee_cents is None:
            return None
        return _from_cents(fee_cents)
    except StripeError as exc:
        logger.warning("Could not fetch Stripe fee for payment %s: %s", payment.id, exc)
        return None
    except Exception:
        logger.exception("Unexpected error fetching Stripe fee for payment %s", payment.id)
        return None


async def _apply_capture_fees(
    db: AsyncSession,
    payment: Payment,
    precision: int,
    rounding_mode: str,
    fee_amount: Decimal | None = None,
) -> None:
    """Apply provider fee and net amount to a captured payment."""
    if fee_amount is not None:
        fee = money_round(fee_amount, precision, rounding_mode)
    elif payment.provider == "stripe":
        actual_fee = await _fetch_stripe_fee_amount(db, payment)
        if actual_fee is not None:
            fee = money_round(actual_fee, precision, rounding_mode)
        else:
            # Fallback estimate only when the real fee cannot be retrieved.
            fee = money_round(
                payment.captured_amount * Decimal("0.029") + Decimal("0.30"),
                precision,
                rounding_mode,
            )
    elif payment.provider in ("adyen", "braintree", "paypal"):
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
    """Recompute and persist an order's payment status from its payments."""
    order_result = await db.execute(
        select(Order).where(Order.id == payment.order_id).with_for_update()
    )
    order = order_result.scalar_one_or_none()
    if not order:
        return

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    relevant_statuses = ("captured", "partially_refunded", "refunded")
    payments = (
        await db.execute(
            select(Payment).where(
                Payment.order_id == order.id,
                Payment.status.in_(relevant_statuses),
            )
        )
    ).scalars().all()

    total_captured = money_round(
        sum(to_decimal(p.captured_amount or 0) for p in payments),
        precision,
        rounding_mode,
    )
    total_refunded = money_round(
        sum(to_decimal(p.refunded_amount or 0) for p in payments),
        precision,
        rounding_mode,
    )
    order_total = money_round(to_decimal(order.total_amount or 0), precision, rounding_mode)

    if total_refunded > 0:
        if total_refunded >= total_captured:
            order.payment_status = "refunded"
        else:
            order.payment_status = "partially_refunded"
    elif total_captured >= order_total:
        order.payment_status = "captured"
    elif total_captured > 0:
        order.payment_status = "initiated"
    order.updated_at = datetime.now(timezone.utc)


def _record_hitpay_payment_id(payment: Payment, data: dict) -> None:
    """Persist the underlying HitPay payment id from a webhook/lookup payload."""
    payments = data.get("payments") or []
    if payments and payments[0].get("id"):
        payment.extra_metadata = {
            **(payment.extra_metadata or {}),
            "hitpay_payment_id": payments[0]["id"],
            "hitpay_payment_type": payments[0].get("payment_type"),
        }


def _parse_hitpay_fee(data: dict) -> Decimal | None:
    """Extract the fee amount from a HitPay payment request payload.

    Uses the `fees` field on the first payment object when available,
    otherwise falls back to configured default rates.
    """
    payments = data.get("payments") or []
    if payments:
        fees = payments[0].get("fees")
        if fees is not None:
            try:
                return to_decimal(fees)
            except Exception:
                pass
        payment_type = payments[0].get("payment_type", "")
    else:
        payment_type = ""

    # Fallback fee schedule (online HitPay MYR rates as of 2026).
    # These are used only when the webhook/lookup does not include the fee.
    fee_schedule: dict[str, tuple[Decimal, Decimal]] = {
        "duitnow": (Decimal("1.2"), Decimal("0")),
        "fpx": (Decimal("1.8"), Decimal("0.40")),
        "touch_n_go": (Decimal("1.9"), Decimal("0")),
        "boost": (Decimal("2.1"), Decimal("0")),
        "shopee_pay": (Decimal("2.2"), Decimal("0")),
        "grabpay_direct": (Decimal("2.0"), Decimal("0")),
        "grabpay": (Decimal("2.0"), Decimal("0")),
        "card": (Decimal("1.2"), Decimal("1.0")),
    }
    percent, fixed = fee_schedule.get(payment_type, (Decimal("2.0"), Decimal("0")))
    try:
        amount = to_decimal(data.get("amount", 0))
    except Exception:
        return None
    return money_round(amount * percent / Decimal("100") + fixed, 4, "ROUND_HALF_UP")


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
    await _apply_capture_fees(db, payment, precision, rounding_mode)

    await _add_payment_event(
        db,
        payment,
        to_status="captured",
        from_status=old_status,
        amount=payment.captured_amount,
        provider_response={"action": "capture", "simulated": not (payment.provider == "stripe" and stripe_enabled)},
    )
    await db.flush()
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
        tx_id = payment.provider_transaction_id
        if tx_id.startswith("cs_"):
            await _expire_stripe_checkout_session(tx_id, api_key)
        else:
            await _cancel_stripe_intent(payment, api_key)
    elif payment.provider == "hitpay" and await hitpay_enabled(db) and payment.provider_transaction_id:
        await cancel_hitpay_payment_request(db, payment.provider_transaction_id)

    old_status = payment.status
    payment.status = "voided"

    is_real_provider = (payment.provider == "stripe" and stripe_enabled) or (
        payment.provider == "hitpay" and await hitpay_enabled(db)
    )
    await _add_payment_event(
        db,
        payment,
        to_status="voided",
        from_status=old_status,
        provider_response={"action": "cancel", "simulated": not is_real_provider},
    )
    await db.commit()
    await db.refresh(payment)
    return payment


async def cancel_pending_order_payments(db: AsyncSession, order_id: int) -> list[int]:
    """Void every pending Stripe/simulated payment for an order when it is cancelled."""
    result = await db.execute(
        select(Payment).where(
            Payment.order_id == order_id,
            Payment.status.in_(["initiated", "pending_authorization", "authorized"]),
        )
    )
    payments = result.scalars().all()
    cancelled_ids: list[int] = []
    for payment in payments:
        try:
            await cancel_payment(db, payment.id)
            cancelled_ids.append(payment.id)
        except PaymentError:
            logger.warning("Could not cancel payment %s for order %s", payment.id, order_id, exc_info=True)
    return cancelled_ids


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
    completed_at: datetime | None = None

    stripe_enabled = await _stripe_enabled(db)
    is_real_provider = (payment.provider == "stripe" and stripe_enabled) or (
        payment.provider == "hitpay" and await hitpay_enabled(db)
    )
    if payment.provider == "stripe" and stripe_enabled:
        api_key = await _get_stripe_secret_key(db)
        stripe_refund = await _create_stripe_refund(payment, refund_amount, api_key)
        provider_refund_id = stripe_refund.id
        refund_status = "completed" if stripe_refund.status == "succeeded" else "pending"
    elif payment.provider == "hitpay" and await hitpay_enabled(db):
        hitpay_refund = await create_hitpay_refund(db, payment, refund_amount)
        provider_refund_id = hitpay_refund["id"]
        refund_status = "completed" if hitpay_refund.get("status") == "completed" else "pending"
    elif payment.provider == "internal_wallet":
        refund_status = "completed"
        completed_at = datetime.now(timezone.utc)

    refund = Refund(
        payment_id=payment_id,
        order_id=payment.order_id,
        amount=refund_amount,
        reason=reason,
        reason_category=reason_category,
        approved_by=approved_by,
        provider_refund_id=provider_refund_id,
        status=refund_status,
        completed_at=completed_at,
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
        provider_response={"action": "refund", "refund_id": refund.id, "simulated": not is_real_provider},
    )
    await db.flush()

    if payment.provider == "internal_wallet" and refund_status == "completed":
        order_customer = await db.execute(
            select(Order.customer_id).where(Order.id == payment.order_id)
        )
        customer_id = order_customer.scalar_one()
        wallet_res = await db.execute(
            select(Wallet).where(Wallet.customer_id == customer_id).with_for_update()
        )
        wallet = wallet_res.scalar_one_or_none()
        if wallet is None:
            wallet = Wallet(customer_id=customer_id, currency_code=payment.currency_code)
            db.add(wallet)
            await db.flush()
            await db.refresh(wallet)
        last_res = await db.execute(
            select(WalletLedgerEntry)
            .where(WalletLedgerEntry.wallet_id == wallet.id)
            .order_by(WalletLedgerEntry.id.desc())
            .limit(1)
            .with_for_update()
        )
        last_entry = last_res.scalar_one_or_none()
        current_balance = to_decimal(last_entry.running_balance) if last_entry else Decimal(0)
        new_balance = money_round(current_balance + refund_amount, precision, rounding_mode)
        db.add(
            WalletLedgerEntry(
                wallet_id=wallet.id,
                entry_type="credit",
                amount=refund_amount,
                running_balance=new_balance,
                description=f"Refund for payment {payment.id}",
                reference_type="refund",
                reference_id=refund.id,
            )
        )

    await _sync_order_payment_status(db, payment)
    await db.commit()
    await db.refresh(refund)
    return refund


async def _handle_stripe_refund_webhook(
    db: AsyncSession,
    payment: Payment,
    data: dict,
) -> None:
    """Record a Stripe refund from a charge.refunded webhook and update payment/order state."""
    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    # Stripe sends the refunded amount in cents under amount_refunded for the charge.
    refund_cents = data.get("amount_refunded")
    if refund_cents is None and data.get("refunds", {}).get("data"):
        # Fallback: sum the refunds array
        refund_cents = sum(r.get("amount", 0) for r in data["refunds"]["data"])
    refund_amount = _from_cents(refund_cents) if refund_cents else Decimal(0)

    if refund_amount <= 0:
        return

    # Avoid double-counting if the webhook is replayed.
    existing_total = payment.refunded_amount or Decimal(0)
    new_total = money_round(existing_total + refund_amount, precision, rounding_mode)
    if new_total > payment.captured_amount:
        new_total = payment.captured_amount
    refund_delta = money_round(new_total - existing_total, precision, rounding_mode)
    if refund_delta <= 0:
        return

    refund = Refund(
        payment_id=payment.id,
        order_id=payment.order_id,
        amount=refund_delta,
        reason="Refund initiated by Stripe webhook",
        reason_category="customer_request",
        provider_refund_id=data.get("id") or f"re_webhook_{uuid4().hex}",
        status="completed",
    )
    db.add(refund)
    payment.refunded_amount = new_total
    payment.refund_count = (payment.refund_count or 0) + 1


async def _handle_wallet_topup_webhook(
    db: AsyncSession,
    session_id: int,
    data: dict,
) -> None:
    """Credit a customer wallet when a wallet top-up checkout session completes."""
    from app.models.wallet import Wallet, WalletLedgerEntry, WalletTopupSession

    result = await db.execute(
        select(WalletTopupSession).where(WalletTopupSession.id == session_id).with_for_update()
    )
    session = result.scalar_one_or_none()
    if session is None:
        logger.warning("Wallet top-up session %s not found", session_id)
        return
    if session.status == "completed":
        return

    wallet_result = await db.execute(
        select(Wallet).where(Wallet.customer_id == session.customer_id).with_for_update()
    )
    wallet = wallet_result.scalar_one_or_none()
    if wallet is None:
        logger.warning("Wallet not found for customer %s", session.customer_id)
        return

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    # Compute current balance
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
    new_balance = money_round(current_balance + session.amount, precision, rounding_mode)

    ledger = WalletLedgerEntry(
        wallet_id=wallet.id,
        entry_type="credit",
        amount=session.amount,
        running_balance=new_balance,
        description=f"Online top-up via Stripe",
        reference_type="wallet_topup",
        reference_id=session.id,
    )
    db.add(ledger)
    session.status = "completed"
    session.completed_at = datetime.now(timezone.utc)
    if data.get("payment_intent"):
        session.provider_session_id = data["payment_intent"]
    await db.commit()


async def _handle_stripe_dispute_webhook(
    db: AsyncSession,
    payment: Payment,
    data: dict,
) -> None:
    """Record a Stripe chargeback/dispute and move the order to disputed status."""
    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    dispute_id = data.get("id")
    dispute_amount = _from_cents(data.get("amount", 0))
    if dispute_amount <= 0:
        return

    # Avoid double-counting if the webhook is replayed.
    existing_total = payment.refunded_amount or Decimal(0)
    new_total = money_round(existing_total + dispute_amount, precision, rounding_mode)
    if new_total > payment.captured_amount:
        new_total = payment.captured_amount
    refund_delta = money_round(new_total - existing_total, precision, rounding_mode)
    if refund_delta <= 0:
        return

    refund = Refund(
        payment_id=payment.id,
        order_id=payment.order_id,
        amount=refund_delta,
        reason=f"Stripe dispute: {data.get('reason', 'unknown')} (ID: {dispute_id})",
        reason_category="customer_request",
        provider_refund_id=dispute_id or f"dp_webhook_{uuid4().hex}",
        status="completed",
    )
    db.add(refund)

    payment.refunded_amount = new_total
    payment.refund_count = (payment.refund_count or 0) + 1

    order_result = await db.execute(select(Order).where(Order.id == payment.order_id).with_for_update())
    order = order_result.scalar_one_or_none()
    if order and order.status not in ("cancelled_by_customer", "cancelled_by_merchant", "refunded"):
        order.status = "disputed"
        order.updated_at = datetime.now(timezone.utc)


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

    # Wallet top-up sessions are identified by metadata and have no Payment row.
    if provider == "stripe" and event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        metadata = data.get("metadata", {})
        wallet_session_id = metadata.get("wallet_topup_session_id")
        if wallet_session_id:
            await _handle_wallet_topup_webhook(db, int(wallet_session_id), data)
            return None

    # Stripe disputes reference the charge id, not the PaymentIntent/session id.
    if provider == "stripe" and event_type in ("charge.dispute.created", "charge.dispute.funds_withdrawn"):
        charge_id = data.get("charge")
        if charge_id:
            result = await db.execute(
                select(Payment).where(Payment.provider_transaction_id == charge_id).with_for_update()
            )
            payment = result.scalar_one_or_none()
            if payment is None:
                logger.warning("Payment not found for dispute charge_id %s", charge_id)
                return None
            old_status = payment.status
            if old_status == "chargeback":
                return payment
            await _handle_stripe_dispute_webhook(db, payment, data)
            payment.status = "chargeback"
            await _add_payment_event(
                db,
                payment,
                to_status="chargeback",
                from_status=old_status,
                amount=payment.refunded_amount,
                provider_response=payload,
            )
            await db.commit()
            await db.refresh(payment)
            return payment

    if not transaction_id:
        logger.warning("Webhook payload missing transaction identifier")
        return None

    result = await db.execute(
        select(Payment).where(Payment.provider_transaction_id == transaction_id).with_for_update()
    )
    payment = result.scalar_one_or_none()

    # Stripe charge events reference a Charge id, but our provider_transaction_id
    # is normally the PaymentIntent id. Try to resolve via payment_intent or metadata.
    if payment is None and provider == "stripe" and event_type.startswith("charge."):
        pi_id = data.get("payment_intent")
        if pi_id:
            result = await db.execute(
                select(Payment).where(Payment.provider_transaction_id == pi_id).with_for_update()
            )
            payment = result.scalar_one_or_none()
        metadata = data.get("metadata", {})
        payment_id = metadata.get("payment_id")
        if payment is None and payment_id:
            result = await db.execute(
                select(Payment).where(Payment.id == int(payment_id)).with_for_update()
            )
            payment = result.scalar_one_or_none()

    # Stripe Checkout Sessions are created with metadata pointing back to our payment/order.
    if payment is None and provider == "stripe" and event_type in (
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed",
        "checkout.session.expired",
    ):
        metadata = data.get("metadata", {})
        payment_id = metadata.get("payment_id")
        if payment_id:
            result = await db.execute(
                select(Payment).where(Payment.id == int(payment_id)).with_for_update()
            )
            payment = result.scalar_one_or_none()
        # Also try resolving via the session's payment_intent id.
        if payment is None and data.get("payment_intent"):
            result = await db.execute(
                select(Payment).where(Payment.provider_transaction_id == data["payment_intent"]).with_for_update()
            )
            payment = result.scalar_one_or_none()

    if payment is None:
        logger.warning("Payment not found for transaction_id %s", transaction_id)
        return None

    old_status = payment.status
    new_status = old_status
    hitpay_fee_amount: Decimal | None = None

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
        elif event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            new_status = "captured"
            payment.captured_amount = _from_cents(data.get("amount_total")) if data.get("amount_total") is not None else payment.amount
            # Link the payment to the underlying PaymentIntent id when available.
            if data.get("payment_intent"):
                payment.provider_transaction_id = data["payment_intent"]
        elif event_type == "payment_intent.canceled":
            new_status = "voided"
        elif event_type == "checkout.session.async_payment_failed":
            new_status = "failed"
            last_error = data.get("last_payment_error") or data.get("payment_intent", {}).get("last_payment_error", {})
            if isinstance(last_error, dict):
                payment.failure_code = last_error.get("code")
                payment.failure_message = last_error.get("message")
        elif event_type == "checkout.session.expired":
            new_status = "voided"
        elif event_type == "charge.refunded":
            await _handle_stripe_refund_webhook(db, payment, data)
            if payment.refunded_amount and payment.refunded_amount >= payment.captured_amount:
                new_status = "refunded"
            else:
                new_status = "partially_refunded"
    elif provider == "grabpay":
        if event_type in ("payment.success", "session.completed"):
            new_status = "captured"
            payment.captured_amount = payment.amount
        elif event_type in ("payment.failed", "session.failed"):
            new_status = "failed"
        elif event_type in ("payment.cancelled", "session.cancelled"):
            new_status = "voided"
    elif provider == "hitpay":
        hitpay_status = (data.get("status") or event_type.split(".")[-1]).lower()
        if hitpay_status == "completed" or event_type in ("payment_request.completed", "charge.created"):
            new_status = "captured"
            try:
                payment.captured_amount = to_decimal(data.get("amount", payment.amount))
            except Exception:
                payment.captured_amount = payment.amount
            _record_hitpay_payment_id(payment, data)
            hitpay_fee_amount = _parse_hitpay_fee(data)
        elif hitpay_status == "failed":
            new_status = "failed"
            payment.failure_message = data.get("status", "HitPay payment failed")
        elif hitpay_status in ("expired", "canceled"):
            new_status = "voided"

    # Guard against late capture events reverting terminal states.
    if new_status == "captured" and old_status in ("refunded", "partially_refunded", "chargeback", "voided"):
        logger.warning(
            "Ignoring late capture event for payment %s (current status: %s)",
            payment.id,
            old_status,
        )
        return payment

    if new_status != old_status:
        payment.status = new_status

        if new_status == "captured":
            config_service = PlatformConfigService(db)
            precision = await config_service.get_accounting_precision()
            rounding_mode = await config_service.get_accounting_rounding()
            await _apply_capture_fees(
                db,
                payment,
                precision,
                rounding_mode,
                fee_amount=hitpay_fee_amount if provider == "hitpay" else None,
            )
            await db.flush()
            await _sync_order_payment_status(db, payment)
        elif new_status in ("refunded", "partially_refunded"):
            await db.flush()
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
