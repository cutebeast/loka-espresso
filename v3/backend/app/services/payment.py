"""Payment service layer."""

from decimal import Decimal, ROUND_HALF_UP
import logging
from datetime import datetime, timedelta, timezone
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
from app.models.loyalty import LoyaltyAccount
from app.models.order import Order
from app.models.payment import Payment, PaymentEvent, Refund
from app.models.platform import AuditLog
from app.models.wallet import Wallet, WalletLedgerEntry, WalletTopupSession

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
    return ["card", "fpx"]


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


async def _use_simulator(db: AsyncSession) -> bool:
    """Hosted checkouts go to the local simulator page instead of Stripe when
    stripe.checkout_mode = 'simulator' (admin toggle) or when no real Stripe
    keys are configured at all."""
    config = PlatformConfigService(db)
    mode = (await config.get_str("stripe.checkout_mode", default="stripe")).lower()
    if mode == "simulator":
        return True
    return not await _stripe_enabled(db)


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
    idempotency_key: str | None = None,
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
            lambda: stripe.Refund.create(**params, api_key=api_key, idempotency_key=idempotency_key)
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
    if await _use_simulator(db):
        # Simulator mode (no Stripe keys): redirect to OUR simulator page —
        # the old default (checkout.stripe.com/test-session/...) is a dead
        # URL that returns AccessDenied, which made dev top-ups impossible.
        fake_id = f"cs_test_{uuid4().hex}"
        settings = get_settings()
        config_service = PlatformConfigService(db)
        app_base = (await config_service.get_app_public_url()).rstrip("/")
        from urllib.parse import quote
        default_sim = (
            f"{app_base}/api/wallet/topup/simulator"
            f"?session_id={session_id}"
            + (f"&success={quote(success_url, safe='')}" if success_url else "")
            + (f"&cancel={quote(cancel_url, safe='')}" if cancel_url else "")
        )
        checkout_url = (settings.stripe_simulator_checkout_url or default_sim).format(session_id=fake_id)
        return {
            "id": fake_id,
            "url": checkout_url,
            "payment_intent": f"pi_test_{uuid4().hex}",
        }
    api_key = await _get_stripe_secret_key(db)
    assert api_key is not None
    config_service = PlatformConfigService(db)
    app_public_url = await config_service.get_app_public_url()
    # Provided URLs are used verbatim — the wallet endpoint builds them with
    # ?topup_session=&status= already; appending another "?session_id=…&status=…"
    # produced a malformed double query string and the PWA's return handler
    # never matched status=success (round-40 top-up bug).
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
        "success_url": success_url or f"{app_public_url}/#wallet?session_id={{CHECKOUT_SESSION_ID}}&status=success",
        "cancel_url": cancel_url or f"{app_public_url}/#wallet?session_id={{CHECKOUT_SESSION_ID}}&status=cancel",
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

    # Simulator mode (no keys, or stripe.checkout_mode='simulator'): route to
    # OUR simulator page — the old placeholder URL was a dead link. Completion
    # runs the same code as a real Stripe webhook.
    session_id = f"cs_test_{uuid4().hex}"
    settings = get_settings()
    config_service = PlatformConfigService(db)
    app_base = (await config_service.get_app_public_url()).rstrip("/")
    from urllib.parse import quote
    default_sim = (
        f"{app_base}/api/wallet/topup/simulator"
        f"?type=order&payment_id={payment.id}"
        + (f"&success={quote(success_url, safe='')}" if success_url else "")
        + (f"&cancel={quote(cancel_url, safe='')}" if cancel_url else "")
    )
    checkout_url = (settings.stripe_simulator_checkout_url or default_sim).format(session_id=session_id)
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
        "amount": _to_cents(payment.amount),
        "currency": payment.currency_code.lower(),
    }


def _simulate_hosted_provider_intent(payment: Payment, return_url: str | None) -> dict:
    """Simulate a hosted-checkout provider session creation response
    (gcash/alipay/wechat_pay placeholders — GrabPay itself was removed
    2026-08-17, see AGENTS.md round 38 pass 10)."""
    session_id = uuid4().hex
    redirect = return_url or "https://example.com/payment/complete"
    settings = get_settings()
    template = "https://partner-api.grab.com/payments/v1/session/{session_id}?return_url={return_url}"
    return {
        "session_id": session_id,
        "redirect_url": template.format(session_id=session_id, return_url=redirect),
        "status": "pending",
        "amount": str(payment.amount),
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
            elif existing_payment.provider in ("gcash", "alipay", "wechat_pay"):
                provider_response["session_id"] = existing_payment.provider_transaction_id or f"session_{existing_payment.id}"
                provider_response["redirect_url"] = return_url or existing_payment.extra_metadata.get("return_url") if existing_payment.extra_metadata else return_url
            elif existing_payment.provider == "hitpay":
                provider_response = {
                    "id": existing_payment.provider_transaction_id,
                    "redirect_url": existing_payment.extra_metadata.get("redirect_url") if existing_payment.extra_metadata else None,
                    "status": existing_payment.status,
                    "amount": str(existing_payment.amount),
                    "currency": existing_payment.currency_code,
                }
            return existing_payment, provider_response

    # Verify order exists and belongs to customer (unlocked fetch — the row
    # lock is taken AFTER cancelling stale sessions to keep the codebase-wide
    # lock order Payment(s) → Order and avoid deadlocking the webhook path).
    order_result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None))
    )
    order = order_result.scalar_one_or_none()
    if order is None:
        raise PaymentError("Order not found", 404)
    if order.customer_id != customer_id:
        raise PaymentError("Order does not belong to customer", 403)

    # An earlier attempt may have left a live provider session on this order —
    # void it so the customer can never complete two sessions for one order.
    await cancel_pending_order_payments(db, order_id)

    # Re-read under the row lock and re-verify before minting the new session —
    # a capture webhook may have landed while we were voiding the old one.
    order = (
        await db.execute(
            select(Order).where(Order.id == order_id, Order.deleted_at.is_(None)).with_for_update()
        )
    ).scalar_one()
    if order.payment_status in ("captured", "settled", "refunded"):
        raise PaymentError("Order is already paid", 400)
    if order.status in ("cancelled_by_customer", "cancelled_by_merchant", "refunded"):
        raise PaymentError("Order is cancelled or refunded", 400)

    # Charge only what is still owed, net of what prior payments already
    # covered (captured − refunded, over captured/partially_refunded payments)
    # — a POS cash split or partial refund makes the gross total overstate the
    # balance (same math as guest_pay; re-collection after a partial refund is
    # owner-approved, round-36 follow-up 2).
    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()
    existing_payments = await db.execute(
        select(Payment).where(
            Payment.order_id == order.id,
            Payment.status.in_(("captured", "partially_refunded")),
        )
    )
    net_paid = money_round(
        sum(
            to_decimal(p.captured_amount or 0) - to_decimal(p.refunded_amount or 0)
            for p in existing_payments.scalars().all()
        ),
        precision,
        rounding_mode,
    )
    order_amount = money_round(
        max(Decimal(0), to_decimal(order.total_amount) - net_paid), precision, rounding_mode
    )
    if order_amount <= 0:
        raise PaymentError("Order is already paid", 400)

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
    elif provider in ("gcash", "alipay", "wechat_pay"):
        provider_response = _simulate_hosted_provider_intent(payment, return_url)
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


async def _debit_wallet_for_payment(
    db: AsyncSession,
    payment: Payment,
    precision: int,
    rounding_mode: str,
) -> None:
    """Debit the ordering customer's wallet for an internal-wallet payment.

    Locks the wallet row, verifies sufficient balance, and appends a debit
    ledger entry with the correct running balance. Mirrors the staff wallet-pay
    flow in staff/orders.py.
    """
    order_result = await db.execute(
        select(Order).where(Order.id == payment.order_id).with_for_update()
    )
    order = order_result.scalar_one_or_none()
    if order is None or order.customer_id is None:
        raise PaymentError("Order has no customer to debit", 400)
    # Re-check under the row lock — a concurrent capture may have paid the
    # order between the caller's check and acquiring this lock.
    if order.payment_status in ("captured", "settled"):
        raise PaymentError("Order is already paid", 400)

    wallet_res = await db.execute(
        select(Wallet).where(Wallet.customer_id == order.customer_id).with_for_update()
    )
    wallet = wallet_res.scalar_one_or_none()
    if wallet is None:
        raise PaymentError("Customer has no wallet", 400)
    if wallet.is_frozen:
        raise PaymentError("Wallet is frozen", 400)

    last_res = await db.execute(
        select(WalletLedgerEntry)
        .where(WalletLedgerEntry.wallet_id == wallet.id)
        .order_by(WalletLedgerEntry.id.desc())
        .limit(1)
        .with_for_update()
    )
    last_entry = last_res.scalar_one_or_none()
    current_balance = to_decimal(last_entry.running_balance) if last_entry else Decimal(0)
    amount = money_round(to_decimal(payment.amount), precision, rounding_mode)
    if current_balance < amount:
        raise PaymentError(f"Insufficient wallet balance. Available: {current_balance:.2f}", 400)

    new_balance = money_round(current_balance - amount, precision, rounding_mode)
    db.add(
        WalletLedgerEntry(
            wallet_id=wallet.id,
            entry_type="debit",
            amount=amount,
            running_balance=new_balance,
            description=f"Order payment #{order.order_number}",
            reference_type="order_payment",
            reference_id=order.id,
        )
    )


async def _accrue_loyalty_annual_spend(db: AsyncSession, payment: Payment) -> None:
    """Accrue a captured payment into the customer's loyalty annual spend.

    Annual spend is stored in integer minor units (cents) on a rolling
    12-month window. Best-effort: accrual failures must never break capture.
    """
    try:
        customer_id = (
            await db.execute(select(Order.customer_id).where(Order.id == payment.order_id))
        ).scalar_one_or_none()
        if customer_id is None:
            return
        account = (
            await db.execute(
                select(LoyaltyAccount)
                .where(LoyaltyAccount.customer_id == customer_id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if account is None:
            return
        from app.services.commerce import _evaluate_tier_renewal, _recalculate_tier
        now = datetime.now(timezone.utc)
        # Run the 12-month renewal review first (may renew/downgrade + reset window)
        await _evaluate_tier_renewal(db, account)
        if account.annual_spend_window_start is None:
            account.annual_spend_window_start = now
        amount = payment.captured_amount or payment.amount or Decimal(0)
        account.annual_spend = (account.annual_spend or 0) + _to_cents(to_decimal(amount))
        # Spend-based upgrade (RM500 → Origin, RM1500 → Reserve)
        await _recalculate_tier(db, account)
    except Exception:
        logger.warning("Failed to accrue loyalty annual spend for payment %s", payment.id, exc_info=True)


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
            await _accrue_loyalty_annual_spend(db, payment)
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
            await _accrue_loyalty_annual_spend(db, payment)
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
            if payment.provider == "internal_wallet":
                await _debit_wallet_for_payment(db, payment, precision, rounding_mode)
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
            await _accrue_loyalty_annual_spend(db, payment)
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

    # MyInvois auto-issue on capture (self-gated, failure-swallowing) — the
    # confirm path is how PWA stripe/wallet payments complete.
    if payment.status == "captured":
        order = await db.get(Order, payment.order_id)
        if order is not None:
            from app.services.einvoice import auto_issue_on_payment
            await auto_issue_on_payment(db, order, payment)
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


async def _grant_coffee_pass_if_purchased(db: AsyncSession, order: Order) -> None:
    """Grant the 12-use free-drink voucher when a Coffee Pass item is in a
    captured order (idempotent per order)."""
    if not order.customer_id:
        return
    from app.models.menu import MenuItem
    pass_item_id = (
        await db.execute(
            select(MenuItem.id).where(MenuItem.item_code == "COFFEE-PASS-12")
        )
    ).scalar_one_or_none()
    if pass_item_id is None:
        return
    from app.models.order import OrderLineItem
    li_result = await db.execute(
        select(OrderLineItem.menu_item_id).where(OrderLineItem.order_id == order.id)
    )
    if pass_item_id not in {row[0] for row in li_result.all()}:
        return
    from app.models.voucher import CustomerVoucher
    already = (
        await db.execute(
            select(CustomerVoucher.id).where(
                CustomerVoucher.customer_id == order.customer_id,
                CustomerVoucher.source == "coffee_pass",
                CustomerVoucher.source_id == order.id,
            ).limit(1)
        )
    ).scalar_one_or_none()
    if already is not None:
        return
    from app.services.commerce import grant_voucher_to_customer
    await grant_voucher_to_customer(db, order.customer_id, "PASS-CLASSIC-12", source="coffee_pass", source_id=order.id)


async def _credit_order_loyalty_points(db: AsyncSession, order: Order) -> None:
    """Credit an order's estimated loyalty points now that it is paid (idempotent).

    Points are computed and stored on the order at creation as an estimate, but
    only granted to the customer's balance on capture. POS orders paid at
    creation are credited by the POS flow itself (staff/pos.py) with an
    order_id-linked ledger row, which the idempotency check below detects.
    """
    points = int(order.loyalty_points_earned or 0)
    # First PAID order converts a pending referral (idempotent — status flip).
    # Must run even when the order earned no points / has no loyalty account.
    from app.services.order import _convert_referral_on_first_paid_order
    await _convert_referral_on_first_paid_order(db, order)
    # Purchase-based product benefits (Coffee Pass) — must run even when the
    # customer has no loyalty account / zero point estimate
    await _grant_coffee_pass_if_purchased(db, order)
    if points <= 0 or not order.customer_id:
        return
    from app.models.loyalty import LoyaltyPointsLedger
    already_credited = (
        await db.execute(
            select(LoyaltyPointsLedger.id).where(
                LoyaltyPointsLedger.order_id == order.id,
                LoyaltyPointsLedger.event_type == "order_earned",
            ).limit(1)
        )
    ).scalar_one_or_none()
    if already_credited is not None:
        return
    la_result = await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.customer_id == order.customer_id).with_for_update()
    )
    la = la_result.scalar_one_or_none()
    if la is None:
        return
    db.add(LoyaltyPointsLedger(
        loyalty_account_id=la.id,
        customer_id=order.customer_id,
        event_type="order_earned",
        points_delta=points,
        running_balance=la.points_balance + points,
        order_id=order.id,
        description=f"Points earned from order {order.order_number}",
    ))
    la.points_balance += points
    la.lifetime_points_earned = (la.lifetime_points_earned or 0) + points
    from app.services.commerce import _recalculate_tier
    await _recalculate_tier(db, la)


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

    # Chargeback rows carry captured_amount + the disputed refunded_amount —
    # including them keeps _sync from flipping a disputed order back to
    # initiated and books the withdrawal as refunded money.
    relevant_statuses = ("captured", "partially_refunded", "refunded", "chargeback")
    payments = (
        await db.execute(
            select(Payment).where(
                Payment.order_id == order.id,
                Payment.status.in_(relevant_statuses),
            )
        )
    ).scalars().all()

    # Captures flagged at webhook time (capture_on_dead_order / duplicate_capture /
    # capture_after_void) are recorded for the books but must NOT move order
    # state or grant benefits — otherwise a later sync re-books them on a
    # cancelled/already-paid order, defeating the capture-time guards.
    def _is_flagged(p: Payment) -> bool:
        meta = p.extra_metadata or {}
        return bool(
            meta.get("capture_on_dead_order")
            or meta.get("duplicate_capture")
            or meta.get("capture_after_void")
        )

    flagged = any(_is_flagged(p) for p in payments)
    if flagged:
        effective = [p for p in payments if not _is_flagged(p)]
        if not effective:
            # Only flagged money on this order — leave order state untouched.
            return
        payments = effective
    order_is_terminal = order.status in (
        "cancelled_by_customer", "cancelled_by_merchant", "refunded",
    )

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
        if order_is_terminal:
            # Cancelled/refunded orders never flip to captured — the money is
            # on the books but the order stays dead (no kitchen, no benefits).
            return
        order.payment_status = "captured"
        # Paid orders advance to the kitchen: pending → confirmed (idempotent —
        # later transitions preparing/ready are staff-driven and never reverted)
        if order.status == "pending":
            order.status = "confirmed"
            order.updated_at = datetime.now(timezone.utc)
        # Loyalty points are granted on capture, not at order creation (idempotent).
        await _credit_order_loyalty_points(db, order)
        # Spend-based lucky draw: grant tickets on capture (idempotent).
        from app.services.lucky_draw import grant_tickets_for_order
        await grant_tickets_for_order(db, order)
    elif total_captured > 0:
        order.payment_status = "initiated"
    else:
        # No captured money on the order. If no payment is still awaiting
        # authorization/capture (e.g. the checkout session expired/was voided),
        # release the order back to 'initiated' so sweeps and the staff Unpaid
        # tab pick it up again — 'pending_authorization' limbo escapes every sweep.
        pending_auth = (
            await db.execute(
                select(Payment.id)
                .where(
                    Payment.order_id == order.id,
                    Payment.status.in_(("pending_authorization", "authorized")),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if pending_auth is None:
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
                logger.debug("Failed to parse HitPay fee", exc_info=True)
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

        "card": (Decimal("1.2"), Decimal("1.0")),
    }
    percent, fixed = fee_schedule.get(payment_type, (Decimal("2.0"), Decimal("0")))
    try:
        amount = to_decimal(data.get("amount", 0))
    except Exception:
        logger.debug("Failed to parse payment amount", exc_info=True)
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
    await _accrue_loyalty_annual_spend(db, payment)

    await db.commit()
    await db.refresh(payment)

    # MyInvois auto-issue on capture (self-gated, failure-swallowing).
    order = await db.get(Order, payment.order_id)
    if order is not None:
        from app.services.einvoice import auto_issue_on_payment
        await auto_issue_on_payment(db, order, payment)
    return payment


async def cancel_payment(db: AsyncSession, payment_id: int, commit: bool = True) -> Payment:
    """Cancel a pending payment.

    Pass ``commit=False`` when the caller manages the surrounding transaction
    (e.g. bulk order cancellation) — the changes are flushed but not committed.
    """
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
    if commit:
        await db.commit()
        await db.refresh(payment)
    else:
        await db.flush()
    return payment


async def cancel_pending_order_payments(db: AsyncSession, order_id: int) -> list[int]:
    """Void every pending Stripe/simulated payment for an order when it is cancelled.

    Locks payment rows in ascending id order — lock discipline across the
    codebase is Payment(s) BEFORE Order (the webhook capture path locks the
    payment first, then the order), so this function must only ever be
    called BEFORE the caller takes the order row lock.
    """
    result = await db.execute(
        select(Payment).where(
            Payment.order_id == order_id,
            Payment.status.in_(["initiated", "pending_authorization", "authorized"]),
        ).order_by(Payment.id).with_for_update()
    )
    payments = result.scalars().all()
    cancelled_ids: list[int] = []
    for payment in payments:
        try:
            await cancel_payment(db, payment.id, commit=False)
            cancelled_ids.append(payment.id)
        except PaymentError:
            logger.warning("Could not cancel payment %s for order %s", payment.id, order_id, exc_info=True)

    # A 'failed' payment's Stripe checkout session stays payable for ~24h —
    # expire it so a customer retry cannot capture onto a cancelled order.
    failed_result = await db.execute(
        select(Payment).where(
            Payment.order_id == order_id,
            Payment.status == "failed",
            Payment.provider == "stripe",
            Payment.provider_transaction_id.startswith("cs_"),
        )
    )
    for payment in failed_result.scalars().all():
        try:
            if await _stripe_enabled(db):
                api_key = await _get_stripe_secret_key(db)
                await _expire_stripe_checkout_session(payment.provider_transaction_id, api_key)
        except PaymentError:
            logger.warning(
                "Could not expire checkout session %s for failed payment %s on order %s",
                payment.provider_transaction_id, payment.id, order_id, exc_info=True,
            )
    return cancelled_ids


async def _reverse_order_benefits_on_refund(
    db: AsyncSession,
    payment: Payment,
    refund_amount: Decimal,
    is_full_refund: bool,
) -> None:
    """Reverse loyalty points, vouchers/rewards, and annual spend for a refund.

    Full refund: claw back all of the order's loyalty points (capped at the
    account's current balance, with ledger entry), release any voucher/reward
    bound to the order, and decrement annual spend by the refunded amount.
    Partial refund: pro-rata points clawback and annual-spend decrement only
    (no voucher/reward release). Stock is never restored on refunds.
    """
    order_result = await db.execute(
        select(Order).where(Order.id == payment.order_id).with_for_update()
    )
    order = order_result.scalar_one_or_none()
    if order is None:
        return

    la = None
    if order.customer_id:
        la_result = await db.execute(
            select(LoyaltyAccount).where(LoyaltyAccount.customer_id == order.customer_id).with_for_update()
        )
        la = la_result.scalar_one_or_none()

    # ── Loyalty points clawback (pro-rata for partial refunds) ──
    points = int(order.loyalty_points_earned or 0)
    if points > 0 and order.customer_id:
        captured = to_decimal(payment.captured_amount or 0)
        if is_full_refund or captured <= 0:
            points_to_claw = points
        else:
            ratio = to_decimal(refund_amount) / captured
            points_to_claw = min(
                points,
                int((Decimal(points) * ratio).to_integral_value(rounding="ROUND_DOWN")),
            )
        if points_to_claw > 0:
            if la:
                clawback = min(points_to_claw, la.points_balance)
                if clawback > 0:
                    from app.models.loyalty import LoyaltyPointsLedger
                    db.add(LoyaltyPointsLedger(
                        loyalty_account_id=la.id,
                        customer_id=order.customer_id,
                        event_type="return_deduction",
                        points_delta=-clawback,
                        running_balance=la.points_balance - clawback,
                        order_id=order.id,
                        description=f"Points reversed for refunded order {order.order_number}",
                    ))
                    la.points_balance -= clawback
                la.lifetime_points_earned = max(0, (la.lifetime_points_earned or 0) - points_to_claw)
                from app.services.commerce import _recalculate_tier
                await _recalculate_tier(db, la)
            order.loyalty_points_earned = max(0, points - points_to_claw)

    # ── Annual spend rollback (minor units, floored at 0) ──
    if la is not None:
        la.annual_spend = max(0, (la.annual_spend or 0) - _to_cents(to_decimal(refund_amount)))

    # ── Voucher / reward release (full refunds only) ──
    if is_full_refund:
        from app.services.order import _release_order_vouchers_and_rewards
        await _release_order_vouchers_and_rewards(db, order)


async def refund_payment(
    db: AsyncSession,
    payment_id: int,
    amount: Decimal | float | str,
    reason: str,
    reason_category: str,
    approved_by: int | None,
    approved_by_staff: int | None = None,
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

    if approved_by is None and approved_by_staff is None:
        raise PaymentError("Refund must be approved by an admin or staff account", 403)

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    refund_amount = to_decimal(amount)

    # Idempotency: reject an identical refund (same payment, amount, reason)
    # created within the last 60s — catches admin double-clicks and retries,
    # which would otherwise create duplicate refunds.
    dup_cutoff = datetime.now(timezone.utc) - timedelta(seconds=60)
    dup_result = await db.execute(
        select(Refund).where(
            Refund.payment_id == payment_id,
            Refund.amount == refund_amount,
            Refund.reason == reason,
            Refund.created_at >= dup_cutoff,
        )
    )
    if dup_result.scalar_one_or_none() is not None:
        raise PaymentError("Duplicate refund request — an identical refund was just created", 409)

    max_refund = money_round(payment.captured_amount - payment.refunded_amount, precision, rounding_mode)
    if refund_amount > max_refund:
        raise PaymentError(f"Refund amount exceeds available balance ({max_refund})", 400)

    provider_refund_id = f"re_sim_{uuid4().hex}"

    # Insert the Refund row FIRST (status "pending") so it has an id before the
    # provider is contacted — a DB failure after a provider refund would strand
    # real money with no local record, and the row id doubles as the provider
    # idempotency key so admin retries cannot double-refund.
    refund = Refund(
        payment_id=payment_id,
        order_id=payment.order_id,
        amount=refund_amount,
        reason=reason,
        reason_category=reason_category,
        approved_by=approved_by,
        approved_by_staff_id=approved_by_staff,
        provider_refund_id=provider_refund_id,
        status="pending",
    )
    db.add(refund)
    await db.flush()
    await db.refresh(refund)

    stripe_enabled = await _stripe_enabled(db)
    is_real_provider = (payment.provider == "stripe" and stripe_enabled) or (
        payment.provider == "hitpay" and await hitpay_enabled(db)
    )
    try:
        if payment.provider == "stripe" and stripe_enabled:
            api_key = await _get_stripe_secret_key(db)
            stripe_refund = await _create_stripe_refund(
                payment, refund_amount, api_key, idempotency_key=f"refund_{refund.id}"
            )
            refund.provider_refund_id = stripe_refund.id
            refund.status = "completed" if stripe_refund.status == "succeeded" else "pending"
        elif payment.provider == "hitpay" and await hitpay_enabled(db):
            hitpay_refund = await create_hitpay_refund(
                db, payment, refund_amount, request_id=f"refund_{refund.id}"
            )
            refund.provider_refund_id = hitpay_refund["id"]
            refund.status = "completed" if hitpay_refund.get("status") == "completed" else "pending"
        elif payment.provider in ("internal_wallet", "cash", "store_credit"):
            # Wallet/store-credit/cash refunds are settled the moment they're
            # recorded — there is no external provider to confirm later (cash is
            # handed back at the counter), so complete them immediately.
            refund.status = "completed"
            refund.completed_at = datetime.now(timezone.utc)
    except Exception:
        # Provider call failed after the local row exists — mark it failed and
        # commit so the failure (and its idempotency key) survives the re-raise.
        refund.status = "failed"
        await db.commit()
        raise

    # Audit trail — refunds are money movement and must be attributable.
    db.add(AuditLog(
        principal_id=approved_by,
        action="create",
        resource_type="refund",
        resource_id=refund.id,
        changes_summary={
            "payment_id": payment_id,
            "order_id": payment.order_id,
            "amount": str(refund_amount),
            "reason": reason,
            "reason_category": reason_category,
            "provider": payment.provider,
            "status": refund.status,
        },
    ))

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

    if payment.provider == "internal_wallet" and refund.status == "completed":
        await _credit_wallet_for_refund(db, payment, refund, refund_amount, precision, rounding_mode)

    await _reverse_order_benefits_on_refund(
        db, payment, refund_amount, is_full_refund=(new_status == "refunded")
    )

    await _sync_order_payment_status(db, payment)
    await db.commit()
    await db.refresh(refund)

    # Transactional notification (savepoint-isolated, never blocks the refund).
    if refund.status == "completed":
        try:
            from app.services.transactional_notifications import notify_event
            order_row = (await db.execute(
                select(Order.customer_id, Order.order_number).where(Order.id == payment.order_id)
            )).first()
            order_number = order_row[1] or "" if order_row else ""
            order_customer_id = order_row[0] if order_row else None
            method_map = {"cash": "cash", "internal_wallet": "your wallet", "store_credit": "store credit"}
            method = method_map.get(payment.provider or "", "your original payment method")
            await notify_event(
                db, "refund_processed", order_customer_id,
                context={
                    "order_number": order_number,
                    "amount": f"{refund_amount:.2f}",
                    "method": method,
                },
                entity_type="refund", entity_id=refund.id,
            )
        except Exception:
            logger.warning("refund_processed notification failed for refund %s", refund.id, exc_info=True)

    # MyInvois refund note (type 04) — self-gated on einvoice.auto_issue,
    # requires the original type-01 doc, swallows all failures.
    from app.services.einvoice import issue_refund_note_for_payment
    await issue_refund_note_for_payment(db, payment, refund)

    return refund


async def _credit_wallet_for_refund(
    db: AsyncSession,
    payment: Payment,
    refund: Refund,
    refund_amount: Decimal,
    precision: int,
    rounding_mode: str,
) -> None:
    """Credit a customer wallet for an internal-wallet refund."""
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


async def _handle_stripe_refund_webhook(
    db: AsyncSession,
    payment: Payment,
    data: dict,
) -> Decimal:
    """Record a Stripe refund from a charge.refunded webhook and update payment/order state.

    Returns the newly recorded refund delta; Decimal(0) when the webhook was a
    replay/dedupe and nothing changed (the caller must skip the status
    transition in that case).
    """
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
        return Decimal(0)

    # Stripe's charge.amount_refunded is the cumulative refunded total on the
    # charge, not the delta of this refund. API-initiated refunds have already
    # incremented payment.refunded_amount, so only record the difference.
    existing_total = payment.refunded_amount or Decimal(0)
    new_total = money_round(max(existing_total, refund_amount), precision, rounding_mode)
    if new_total > payment.captured_amount:
        new_total = payment.captured_amount
    refund_delta = money_round(new_total - existing_total, precision, rounding_mode)
    if refund_delta <= 0:
        return Decimal(0)

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

    # Mirror refund_payment: reverse loyalty points / vouchers / annual spend
    # for refunds initiated outside the API (e.g. Stripe Dashboard).
    is_full = bool(payment.captured_amount) and new_total >= payment.captured_amount
    await _reverse_order_benefits_on_refund(db, payment, refund_delta, is_full)
    return refund_delta


async def _handle_stripe_refund_update_webhook(db: AsyncSession, data: dict) -> None:
    """Resolve a pending provider refund from a charge.refund.updated webhook.

    refund_payment books the refund (payment.refunded_amount, status, benefit
    reversal) at request time while the provider refund is still pending; this
    handler reconciles the outcome. On 'succeeded' the pending row completes.
    On 'failed'/'canceled' the provider never moved the money, so the booked
    amounts are restored and the payment status recomputed. The loyalty /
    voucher / annual-spend reversal applied at request time is NOT rolled back
    automatically (clawbacks were capped and vouchers may have been
    re-consumed) — it is flagged for manual reconciliation instead.
    """
    provider_refund_id = data.get("id")
    refund_status = (data.get("status") or "").lower()
    if not provider_refund_id or refund_status not in ("succeeded", "failed", "canceled"):
        return

    result = await db.execute(
        select(Refund).where(Refund.provider_refund_id == provider_refund_id).with_for_update()
    )
    refund = result.scalar_one_or_none()

    if refund is None:
        # Fallback: match by payment + amount among recent pending refunds.
        payment = None
        for tx_id in (data.get("payment_intent"), data.get("charge")):
            if not tx_id:
                continue
            payment = (
                await db.execute(
                    select(Payment).where(Payment.provider_transaction_id == tx_id).with_for_update()
                )
            ).scalar_one_or_none()
            if payment is not None:
                break
        if payment is None:
            logger.warning("Refund update webhook: no payment found for refund %s", provider_refund_id)
            return
        amount = _from_cents(data.get("amount", 0))
        refund = (
            await db.execute(
                select(Refund)
                .where(
                    Refund.payment_id == payment.id,
                    Refund.amount == amount,
                    Refund.status == "pending",
                )
                .order_by(Refund.id.desc())
                .limit(1)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if refund is None:
            logger.warning(
                "Refund update webhook: no pending refund matching payment %s amount %s (provider refund %s)",
                payment.id, amount, provider_refund_id,
            )
            return
        refund.provider_refund_id = provider_refund_id

    if refund.status != "pending":
        return  # already resolved (e.g. completed at request time) — idempotent

    if refund_status == "succeeded":
        refund.status = "completed"
        refund.completed_at = datetime.now(timezone.utc)
        await db.commit()
        # The refund only completed NOW (it was pending at request time, so
        # refund_payment's refund-note call was skipped) — issue it here.
        payment = await db.get(Payment, refund.payment_id)
        if payment is not None:
            from app.services.einvoice import issue_refund_note_for_payment
            await issue_refund_note_for_payment(db, payment, refund)
        return

    # failed/canceled — the provider did not move the money; restore the books.
    refund.status = "failed"
    payment = (
        await db.execute(
            select(Payment).where(Payment.id == refund.payment_id).with_for_update()
        )
    ).scalar_one_or_none()
    if payment is not None:
        config_service = PlatformConfigService(db)
        precision = await config_service.get_accounting_precision()
        rounding_mode = await config_service.get_accounting_rounding()

        payment.refunded_amount = money_round(
            max(Decimal(0), to_decimal(payment.refunded_amount or 0) - to_decimal(refund.amount)),
            precision,
            rounding_mode,
        )
        payment.refund_count = max(0, (payment.refund_count or 0) - 1)
        old_status = payment.status
        if old_status in ("refunded", "partially_refunded"):
            payment.status = "partially_refunded" if payment.refunded_amount > 0 else "captured"
        payment.extra_metadata = {
            **(payment.extra_metadata or {}),
            "refund_failed_needs_reconciliation": refund.id,
        }
        await _add_payment_event(
            db,
            payment,
            to_status=payment.status,
            from_status=old_status,
            amount=refund.amount,
            provider_response={"action": "refund_failed", "refund_id": refund.id, "provider_refund_id": provider_refund_id},
        )
        await db.flush()
        await _sync_order_payment_status(db, payment)
        logger.warning(
            "Provider refund %s (refund row %s) %s — restored payment %s refunded_amount; "
            "loyalty/voucher/annual-spend reversals booked at request time need MANUAL reconciliation",
            provider_refund_id, refund.id, refund_status, payment.id,
        )
    await db.commit()


async def _complete_wallet_topup(
    db: AsyncSession,
    session: WalletTopupSession,
    description: str,
    provider_session_id: str | None = None,
) -> None:
    """Credit a customer wallet for a completed top-up session (idempotent)."""
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
        description=description,
        reference_type="wallet_topup",
        reference_id=session.id,
    )
    db.add(ledger)
    session.status = "completed"
    session.completed_at = datetime.now(timezone.utc)
    if provider_session_id:
        session.provider_session_id = provider_session_id
    await db.flush()
    # Transactional notification (savepoint-isolated, never blocks the credit).
    from app.services.transactional_notifications import notify_event
    await notify_event(
        db, "wallet_topup", session.customer_id,
        context={"amount": f"{session.amount:.2f}", "balance": f"{new_balance:.2f}"},
        entity_type="wallet_topup_session", entity_id=session.id,
    )
    await db.commit()


async def _handle_wallet_topup_webhook(
    db: AsyncSession,
    session_id: int,
    data: dict,
) -> None:
    """Credit a customer wallet when a wallet top-up checkout session completes."""
    result = await db.execute(
        select(WalletTopupSession).where(WalletTopupSession.id == session_id).with_for_update()
    )
    session = result.scalar_one_or_none()
    if session is None:
        logger.warning("Wallet top-up session %s not found", session_id)
        return
    await _complete_wallet_topup(db, session, "Online top-up via Stripe", data.get("payment_intent"))


async def _reverse_wallet_topup(
    db: AsyncSession,
    session_id: int,
    event_type: str,
) -> None:
    """Reverse a wallet top-up whose async payment failed or the session expired.

    If the wallet was already credited, append a compensating debit ledger
    entry mirroring _complete_wallet_topup's crediting logic.
    """
    result = await db.execute(
        select(WalletTopupSession).where(WalletTopupSession.id == session_id).with_for_update()
    )
    session = result.scalar_one_or_none()
    if session is None:
        logger.warning("Wallet top-up session %s not found", session_id)
        return
    if session.status != "completed":
        if session.status == "pending":
            session.status = "failed"
            await db.commit()
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

    # Compute current balance (mirrors _complete_wallet_topup)
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
    new_balance = money_round(current_balance - session.amount, precision, rounding_mode)

    ledger = WalletLedgerEntry(
        wallet_id=wallet.id,
        entry_type="debit",
        amount=session.amount,
        running_balance=new_balance,
        description=f"Reversal of wallet top-up #{session.id} (Stripe {event_type})",
        reference_type="wallet_topup",
        reference_id=session.id,
    )
    db.add(ledger)
    session.status = "failed"
    await db.commit()


async def _handle_stripe_dispute_webhook(
    db: AsyncSession,
    payment: Payment,
    data: dict,
) -> Decimal:
    """Record a Stripe chargeback/dispute and move the order to disputed status.

    Returns the recorded dispute delta; Decimal(0) for replays/no-ops so the
    caller can skip the status transition (a zero-delta dispute must not
    rewrite an already-refunded payment's status).
    """
    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    dispute_id = data.get("id")
    dispute_amount = _from_cents(data.get("amount", 0))
    if dispute_amount <= 0:
        return Decimal(0)

    # Avoid double-counting if the webhook is replayed.
    existing_total = payment.refunded_amount or Decimal(0)
    new_total = money_round(existing_total + dispute_amount, precision, rounding_mode)
    if new_total > payment.captured_amount:
        new_total = payment.captured_amount
    refund_delta = money_round(new_total - existing_total, precision, rounding_mode)
    if refund_delta <= 0:
        return Decimal(0)

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

    # Mirror _handle_stripe_refund_webhook: disputes withdraw funds like a
    # refund, so reverse loyalty points / vouchers / annual spend too.
    is_full = bool(payment.captured_amount) and new_total >= payment.captured_amount
    await _reverse_order_benefits_on_refund(db, payment, refund_delta, is_full)

    order_result = await db.execute(select(Order).where(Order.id == payment.order_id).with_for_update())
    order = order_result.scalar_one_or_none()
    if order and order.status not in ("cancelled_by_customer", "cancelled_by_merchant", "refunded"):
        order.status = "disputed"
        order.updated_at = datetime.now(timezone.utc)
    return refund_delta


def _cross_check_capture_amount(payment: Payment, provider_currency: str | None) -> None:
    """Flag capture webhooks whose amount/currency disagree with our books.

    The capture is still recorded (the provider moved real money) but the
    payment is visibly flagged for reconciliation.
    """
    issues: list[str] = []
    if payment.captured_amount is not None and payment.amount is not None:
        if abs(to_decimal(payment.captured_amount) - to_decimal(payment.amount)) > Decimal("0.01"):
            issues.append(f"amount {payment.captured_amount} != expected {payment.amount}")
    if provider_currency and payment.currency_code:
        if provider_currency.lower() != payment.currency_code.lower():
            issues.append(f"currency {provider_currency} != expected {payment.currency_code}")
    if issues:
        detail = "; ".join(issues)
        logger.warning("Capture amount/currency mismatch for payment %s: %s", payment.id, detail)
        payment.extra_metadata = {
            **(payment.extra_metadata or {}),
            "capture_amount_mismatch": True,
            "capture_mismatch_detail": detail,
        }


async def process_webhook_event(
    db: AsyncSession,
    provider: str,
    payload: dict,
) -> Payment | None:
    """Process an incoming webhook event from a payment provider."""
    event_type = payload.get("type", payload.get("event_type", "unknown"))

    # Stripe payloads nest the resource under data.object; HitPay uses data directly.
    data_wrapper = payload.get("data", {})
    data = data_wrapper.get("object", data_wrapper)
    transaction_id = data.get("id") or payload.get("transaction_id") or payload.get("session_id")

    # Wallet top-up sessions are identified by metadata and have no Payment row.
    if provider == "stripe" and event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        metadata = data.get("metadata", {})
        wallet_session_id = metadata.get("wallet_topup_session_id")
        if wallet_session_id:
            if event_type == "checkout.session.completed" and data.get("payment_status") != "paid":
                # Delayed-notification methods (fpx) complete with
                # payment_status="unpaid" — wait for async_payment_succeeded.
                logger.info(
                    "Skipping checkout.session.completed with payment_status=%s for wallet top-up %s",
                    data.get("payment_status"),
                    wallet_session_id,
                )
                return None
            await _handle_wallet_topup_webhook(db, int(wallet_session_id), data)
            return None

    # A failed/expired async checkout reverses any wallet credit already made.
    if provider == "stripe" and event_type in ("checkout.session.async_payment_failed", "checkout.session.expired"):
        metadata = data.get("metadata", {})
        wallet_session_id = metadata.get("wallet_topup_session_id")
        if wallet_session_id:
            await _reverse_wallet_topup(db, int(wallet_session_id), event_type)
            return None

    # Money-back events on wallet top-ups (refund/dispute) have no Payment row —
    # route them to the top-up reversal so the wallet credit is clawed back.
    if provider == "stripe" and event_type in (
        "charge.refunded", "charge.dispute.created", "charge.dispute.funds_withdrawn",
    ):
        metadata = data.get("metadata", {})
        wallet_session_id = metadata.get("wallet_topup_session_id")
        if wallet_session_id:
            await _reverse_wallet_topup(db, int(wallet_session_id), event_type)
            return None

    # Stripe disputes reference the charge id, not the PaymentIntent/session id.
    if provider == "stripe" and event_type == "charge.dispute.closed" and data.get("status") == "won":
        # Dispute won — reinstate the money: restore the payment's captured
        # standing and re-sync the order out of 'disputed'.
        charge_id = data.get("charge")
        won_payment = None
        if charge_id:
            won_payment = (
                await db.execute(
                    select(Payment).where(Payment.provider_transaction_id == charge_id).with_for_update()
                )
            ).scalar_one_or_none()
        if won_payment is not None and won_payment.status == "chargeback":
            # Reverse the withdrawal booked at dispute time so _sync recomputes
            # correctly (the dispute refund row is keyed by the dispute id).
            dispute_refund = (
                await db.execute(
                    select(Refund).where(
                        Refund.payment_id == won_payment.id,
                        Refund.provider_refund_id == data.get("id"),
                    )
                )
            ).scalar_one_or_none()
            if dispute_refund is not None:
                won_payment.refunded_amount = max(
                    Decimal(0), to_decimal(won_payment.refunded_amount or 0) - to_decimal(dispute_refund.amount)
                )
                won_payment.refund_count = max(0, (won_payment.refund_count or 0) - 1)
                dispute_refund.status = "failed"  # funds reinstated — never actually refunded
            won_payment.status = "captured"
            await _add_payment_event(
                db,
                won_payment,
                to_status="captured",
                from_status="chargeback",
                amount=won_payment.captured_amount,
                provider_response={"action": "dispute_won", "dispute_id": data.get("id")},
            )
            await db.flush()
            await _sync_order_payment_status(db, won_payment)
            won_order = await db.get(Order, won_payment.order_id)
            if won_order is not None and won_order.status == "disputed":
                won_order.status = "confirmed"
                won_order.updated_at = datetime.now(timezone.utc)
            await db.commit()
        return None

    if provider == "stripe" and event_type in ("charge.dispute.created", "charge.dispute.funds_withdrawn"):
        charge_id = data.get("charge")
        if charge_id:
            result = await db.execute(
                select(Payment).where(Payment.provider_transaction_id == charge_id).with_for_update()
            )
            payment = result.scalar_one_or_none()
            if payment is None:
                # Disputes reference a Charge id, but provider_transaction_id
                # holds a PaymentIntent/Checkout Session id — resolve via
                # payment_intent or metadata before giving up (same fallback as
                # the charge.* branch below).
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
            if payment is None:
                logger.warning("Payment not found for dispute charge_id %s", charge_id)
                return None
            old_status = payment.status
            if old_status == "chargeback":
                return payment
            dispute_delta = await _handle_stripe_dispute_webhook(db, payment, data)
            if dispute_delta <= 0:
                # Replay / zero-delta dispute — nothing recorded, don't rewrite
                # the status of an already-refunded payment.
                return payment
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

    # Stripe refund lifecycle events reference the provider Refund id, not a
    # PaymentIntent/session id — resolve pending refunds booked at request time.
    if provider == "stripe" and event_type == "charge.refund.updated":
        await _handle_stripe_refund_update_webhook(db, data)
        return None

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

    # HitPay wallet top-ups have no Payment row; complete the top-up session instead.
    if payment is None and provider == "hitpay":
        hitpay_status = (data.get("status") or event_type.split(".")[-1]).lower()
        if hitpay_status == "completed" or event_type in ("payment_request.completed", "charge.created"):
            result = await db.execute(
                select(WalletTopupSession)
                .where(WalletTopupSession.provider_session_id == transaction_id)
                .with_for_update()
            )
            topup_session = result.scalar_one_or_none()
            if topup_session is not None:
                await _complete_wallet_topup(db, topup_session, "Online top-up via HitPay")
            else:
                logger.warning("Wallet top-up session not found for HitPay request %s", transaction_id)
            return None

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
            _cross_check_capture_amount(payment, data.get("currency"))
        elif event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            if event_type == "checkout.session.completed" and data.get("payment_status") != "paid":
                # Delayed-notification methods (fpx) complete with
                # payment_status="unpaid" — wait for async_payment_succeeded.
                logger.info(
                    "Skipping checkout.session.completed with payment_status=%s for payment %s",
                    data.get("payment_status"),
                    payment.id,
                )
                return payment
            new_status = "captured"
            payment.captured_amount = _from_cents(data.get("amount_total")) if data.get("amount_total") is not None else payment.amount
            _cross_check_capture_amount(payment, data.get("currency"))
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
            refund_delta = await _handle_stripe_refund_webhook(db, payment, data)
            if refund_delta > 0:
                if payment.refunded_amount and payment.refunded_amount >= payment.captured_amount:
                    new_status = "refunded"
                else:
                    new_status = "partially_refunded"
    elif provider == "gcash":  # gcash placeholder (simulated hosted checkout)
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
            _cross_check_capture_amount(payment, data.get("currency"))
            _record_hitpay_payment_id(payment, data)
            hitpay_fee_amount = _parse_hitpay_fee(data)
        elif hitpay_status == "failed":
            new_status = "failed"
            payment.failure_message = data.get("status", "HitPay payment failed")
        elif hitpay_status in ("expired", "canceled"):
            new_status = "voided"

    # Guard against late capture events reverting terminal states. Exception:
    # voided → captured means Stripe COMPLETED the session before our expire
    # took effect — real money was collected, so record it (flagged for manual
    # review) instead of dropping it from the books.
    if new_status == "captured" and old_status == "voided":
        logger.warning(
            "Capture arrived for voided payment %s (session completed before our expiry) — "
            "recording flagged capture_after_void; manual review required",
            payment.id,
        )
        payment.extra_metadata = {**(payment.extra_metadata or {}), "capture_after_void": True}
    elif new_status == "captured" and old_status in ("refunded", "partially_refunded", "chargeback", "voided"):
        logger.warning(
            "Ignoring late capture event for payment %s (current status: %s)",
            payment.id,
            old_status,
        )
        return payment

    # Guard against late void/failed events erasing captured money — a
    # captured (possibly refunded/charged-back) payment must never revert.
    if new_status in ("failed", "voided") and old_status in ("captured", "partially_refunded", "refunded", "chargeback"):
        logger.warning(
            "Ignoring late %s event for payment %s (current status: %s)",
            new_status,
            payment.id,
            old_status,
        )
        return payment

    if new_status != old_status:
        payment.status = new_status
        fire_einvoice = False

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

            # Safety nets before booking capture side-effects: a capture onto a
            # cancelled/refunded order (late customer retry on an expired-but-
            # still-live session), or a second capture when another payment
            # already fully paid the order (duplicate live sessions). Both are
            # recorded for the books and flagged for manual review — never
            # auto-refunded, never silently booked.
            order_row = (
                await db.execute(
                    select(Order).where(Order.id == payment.order_id).with_for_update()
                )
            ).scalar_one_or_none()
            dead_order = order_row is not None and order_row.status in (
                "cancelled_by_customer", "cancelled_by_merchant", "refunded",
            )
            duplicate_capture = False
            if order_row is not None and not dead_order:
                others = (
                    await db.execute(
                        select(Payment).where(
                            Payment.order_id == payment.order_id,
                            Payment.id != payment.id,
                            Payment.status.in_(("captured", "partially_refunded")),
                        )
                    )
                ).scalars().all()
                already_captured = money_round(
                    sum(to_decimal(p.captured_amount or 0) - to_decimal(p.refunded_amount or 0) for p in others),
                    precision,
                    rounding_mode,
                )
                duplicate_capture = already_captured >= money_round(
                    to_decimal(order_row.total_amount or 0), precision, rounding_mode
                )

            if dead_order:
                logger.warning(
                    "Capture webhook for payment %s landed on %s order %s — recorded for the books, "
                    "capture side-effects (points/annual spend/e-invoice) skipped; needs manual review",
                    payment.id, order_row.status, payment.order_id,
                )
                payment.extra_metadata = {**(payment.extra_metadata or {}), "capture_on_dead_order": True}
            elif duplicate_capture:
                logger.warning(
                    "Duplicate capture: payment %s captured but order %s was already fully paid by "
                    "another payment — recorded and flagged; do NOT auto-refund, manual review required",
                    payment.id, payment.order_id,
                )
                payment.extra_metadata = {**(payment.extra_metadata or {}), "duplicate_capture": True}
            else:
                await _sync_order_payment_status(db, payment)
                await _accrue_loyalty_annual_spend(db, payment)
                fire_einvoice = True
        elif new_status in ("refunded", "partially_refunded"):
            await db.flush()
            await _sync_order_payment_status(db, payment)
        elif new_status in ("failed", "voided"):
            # Any terminal failure/void (session expired, payment failed,
            # request cancelled) re-syncs the order: with no active payments
            # left, _sync_order_payment_status releases it back to 'initiated'.
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

        # MyInvois auto-issue on capture (self-gated on einvoice.auto_issue,
        # all failures swallowed) — never for flagged/dead-order captures.
        if fire_einvoice:
            order = await db.get(Order, payment.order_id)
            if order is not None:
                from app.services.einvoice import auto_issue_on_payment
                await auto_issue_on_payment(db, order, payment)

    return payment
