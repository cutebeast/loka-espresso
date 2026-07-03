"""HitPay payment gateway service.

Implements the HitPay v1 Payment Request API for Malaysian payment methods that
Stripe does not support (DuitNow QR, Touch 'n Go, Boost, ShopeePay, FPX).

References:
- Create Payment Request: POST /v1/payment-requests
- Webhook v2: JSON payload signed with HMAC-SHA256 using the merchant salt.
- Refund: POST /v1/refund (payment_id + amount)
"""

from __future__ import annotations

import hmac
import hashlib
import logging
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.platform_config import PlatformConfigService
from app.models.customer import Customer
from app.models.order import Order
from app.models.payment import Payment

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.hit-pay.com"
DEFAULT_SANDBOX_BASE_URL = "https://api.sandbox.hit-pay.com"
# Best-effort default method codes for Malaysia. These can be overridden via
# platform_config key `hitpay.payment_method_types`.
DEFAULT_MY_PAYMENT_METHODS = [
    "duitnow",
    "touch_n_go",
    "boost",
    "shopee_pay",
    "grabpay_direct",
    "fpx",
    "card",
]


class HitPayError(Exception):
    """HitPay-specific error."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


async def _get_config(db: AsyncSession) -> PlatformConfigService:
    return PlatformConfigService(db)


async def _hitpay_enabled(db: AsyncSession) -> bool:
    config = await _get_config(db)
    enabled = await config.get_bool("hitpay.enabled", default=False)
    if not enabled:
        return False
    api_key = await config.get_str("hitpay.api_key", default="")
    return bool(api_key)


async def _get_api_key(db: AsyncSession) -> str | None:
    return await (await _get_config(db)).get_str("hitpay.api_key", default="") or None


async def _get_salt(db: AsyncSession) -> str | None:
    config = await _get_config(db)
    return (
        await config.get_str("hitpay.webhook_secret", default="")
        or await config.get_str("hitpay.salt", default="")
        or None
    )


async def _get_base_url(db: AsyncSession) -> str:
    config = await _get_config(db)
    base = (
        await config.get_str("hitpay.api_base_url", default="")
        or await config.get_str("hitpay.base_url", default="")
    )
    if base:
        return base.rstrip("/")
    # If no explicit base URL is configured, infer from the API key prefix.
    key = await _get_api_key(db) or ""
    if key.startswith("sandbox_") or key.startswith("test_"):
        return DEFAULT_SANDBOX_BASE_URL
    return DEFAULT_BASE_URL


async def _get_payment_methods(db: AsyncSession) -> list[str]:
    config = await _get_config(db)
    value = await config.get("hitpay.payment_methods", default=None)
    if not isinstance(value, list):
        value = await config.get("hitpay.payment_method_types", default=None)
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return DEFAULT_MY_PAYMENT_METHODS


def _fmt_amount(amount: Decimal) -> str:
    """Return a two-decimal string as expected by HitPay."""
    return f"{amount:.2f}"


def verify_hitpay_signature(payload_bytes: bytes, signature: str | None, salt: str | None) -> bool:
    """Verify a HitPay v2 webhook signature (HMAC-SHA256 of raw JSON body)."""
    if not signature or not salt:
        return False
    try:
        expected = hmac.new(salt.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)
    except Exception:
        return False


async def _hitpay_client() -> httpx.AsyncClient:
    # Caller is responsible for closing via async context manager.
    return httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0))


async def create_hitpay_payment_request(
    db: AsyncSession,
    payment: Payment,
    order: Order,
    customer: Customer | None,
    return_url: str | None = None,
) -> dict:
    """Create a HitPay Payment Request and return its id + checkout URL."""
    if not await _hitpay_enabled(db):
        raise HitPayError("HitPay is not enabled or API key is missing", 503)

    api_key = await _get_api_key(db)
    base_url = await _get_base_url(db)
    if not api_key:
        raise HitPayError("HitPay API key not configured", 503)

    config_service = PlatformConfigService(db)
    app_public_url = await config_service.get_app_public_url()
    base_return = (return_url or f"{app_public_url}/#order-detail").rstrip("/")
    redirect_url = f"{base_return}?orderId={order.id}&paymentId={payment.id}"

    currency = payment.currency_code.upper()
    payment_methods = await _get_payment_methods(db)
    # Filter methods that are region-locked to a specific currency so the
    # request does not fail when the merchant enables methods for multiple
    # countries (e.g. PayNow for SGD and DuitNow/Touch 'n Go for MYR).
    payment_methods = [
        m for m in payment_methods
        if (m != "paynow_online" or currency == "SGD")
        and (m not in ("duitnow", "touch_n_go") or currency == "MYR")
    ]

    payload: dict = {
        "amount": float(payment.amount),
        "currency": payment.currency_code.upper(),
        "payment_methods": payment_methods,
        "reference_number": f"order-{order.id}-payment-{payment.id}",
        "purpose": f"Order {order.order_number}",
        "redirect_url": redirect_url,
        "allow_repeated_payments": False,
        "expires_after": "5 mins",
        "metadata": {
            "order_id": str(order.id),
            "payment_id": str(payment.id),
            "idempotency_key": payment.idempotency_key,
        },
    }

    if customer:
        if customer.email_address:
            payload["email"] = customer.email_address
        name = customer.display_name or f"{customer.given_name or ''} {customer.family_name or ''}".strip()
        if name:
            payload["name"] = name
        if customer.phone_number:
            payload["phone"] = customer.phone_number

    request_id = str(uuid4())
    headers = {
        "X-BUSINESS-API-KEY": api_key,
        "Content-Type": "application/json",
        "X-REQUEST-ID": request_id,
    }

    try:
        async with await _hitpay_client() as client:
            response = await client.post(
                f"{base_url}/v1/payment-requests",
                json=payload,
                headers=headers,
            )
    except httpx.HTTPError as exc:
        logger.error("HitPay payment request creation failed: network error %s", exc)
        raise HitPayError(f"HitPay network error: {exc}", 502) from exc

    if response.status_code >= 400:
        try:
            error_body = response.json()
            message = error_body.get("message") or error_body.get("error") or response.text
        except Exception:
            message = response.text or f"HTTP {response.status_code}"
        logger.error("HitPay payment request creation failed: %s - %s", response.status_code, message)
        raise HitPayError(f"HitPay error: {message}", 402)

    data = response.json()
    if not data.get("id") or not data.get("url"):
        logger.error("HitPay payment request response missing id/url: %s", data)
        raise HitPayError("Invalid response from HitPay: missing payment request id or url", 502)

    return {
        "id": data["id"],
        "url": data["url"],
        "redirect_url": data["url"],
        "status": data.get("status", "pending"),
        "reference_number": data.get("reference_number"),
        "raw": data,
    }


async def get_hitpay_payment_request(
    db: AsyncSession,
    payment_request_id: str,
) -> dict:
    """Retrieve a HitPay Payment Request by id."""
    if not await _hitpay_enabled(db):
        raise HitPayError("HitPay is not enabled", 503)

    api_key = await _get_api_key(db)
    base_url = await _get_base_url(db)
    if not api_key:
        raise HitPayError("HitPay API key not configured", 503)

    try:
        async with await _hitpay_client() as client:
            response = await client.get(
                f"{base_url}/v1/payment-requests/{payment_request_id}",
                headers={"X-BUSINESS-API-KEY": api_key},
            )
    except httpx.HTTPError as exc:
        raise HitPayError(f"HitPay network error: {exc}", 502) from exc

    if response.status_code >= 400:
        try:
            message = response.json().get("message") or response.text
        except Exception:
            message = response.text or f"HTTP {response.status_code}"
        raise HitPayError(f"HitPay error: {message}", 502)

    return response.json()


async def create_hitpay_refund(
    db: AsyncSession,
    payment: Payment,
    amount: Decimal,
) -> dict:
    """Create a partial or full refund with HitPay.

    Requires the underlying HitPay payment id (from the webhook's
    `payments[0].id`) to be stored in `payment.extra_metadata["hitpay_payment_id"]`.
    """
    if not await _hitpay_enabled(db):
        raise HitPayError("HitPay is not enabled", 503)

    api_key = await _get_api_key(db)
    base_url = await _get_base_url(db)
    if not api_key:
        raise HitPayError("HitPay API key not configured", 503)

    hitpay_payment_id = (payment.extra_metadata or {}).get("hitpay_payment_id")
    if not hitpay_payment_id:
        raise HitPayError(
            "Cannot refund HitPay payment: missing underlying HitPay payment id. "
            "Wait for the payment_request.completed webhook before refunding.",
            400,
        )

    request_id = str(uuid4())
    body = {
        "payment_id": hitpay_payment_id,
        "amount": _fmt_amount(amount),
    }

    try:
        async with await _hitpay_client() as client:
            response = await client.post(
                f"{base_url}/v1/refund",
                data=body,
                headers={
                    "X-BUSINESS-API-KEY": api_key,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-REQUEST-ID": request_id,
                },
            )
    except httpx.HTTPError as exc:
        raise HitPayError(f"HitPay refund network error: {exc}", 502) from exc

    if response.status_code >= 400:
        try:
            message = response.json().get("message") or response.text
        except Exception:
            message = response.text or f"HTTP {response.status_code}"
        logger.error("HitPay refund failed: %s - %s", response.status_code, message)
        raise HitPayError(f"HitPay refund error: {message}", 402)

    data = response.json()
    if not data.get("id"):
        logger.error("HitPay refund response missing id: %s", data)
        raise HitPayError("Invalid refund response from HitPay", 502)

    return {
        "id": data["id"],
        "status": data.get("status", "pending"),
        "raw": data,
    }


async def cancel_hitpay_payment_request(
    db: AsyncSession,
    payment_request_id: str,
) -> bool:
    """Cancel an unpaid HitPay Payment Request if possible.

    HitPay does not expose a universal cancel endpoint for all integrations,
    so this is best-effort. The local Payment row is always voided separately.
    """
    if not await _hitpay_enabled(db):
        return False

    api_key = await _get_api_key(db)
    base_url = await _get_base_url(db)
    if not api_key:
        return False

    try:
        async with await _hitpay_client() as client:
            response = await client.delete(
                f"{base_url}/v1/payment-requests/{payment_request_id}",
                headers={"X-BUSINESS-API-KEY": api_key},
            )
            return response.status_code in (200, 204, 404)
    except httpx.HTTPError as exc:
        logger.warning("HitPay payment request cancel failed: %s", exc)
        return False
