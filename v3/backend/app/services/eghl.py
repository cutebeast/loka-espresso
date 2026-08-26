"""eGHL (GHL Systems Malaysia) hosted payment page service.

Unlike Stripe/HitPay, eGHL has no server-side "create payment" API: the
customer's browser form-POSTs directly to the eGHL hosted page. Because the
PWA needs a URL to redirect to (same call-site shape as HitPay), we return the
URL of OUR backend checkout page (`GET /api/payments/eghl/checkout/{payment_id}`),
which renders a tiny auto-submitting HTML form with all signed eGHL fields.

References:
- Hosted page (test): https://test2pay.ghl.com/IPGSG/Payment.aspx
- Hosted page (live): https://pay.e-ghl.com/IPGSG/Payment.aspx
- Request hash: sha256 over the password + a fixed field sequence (see
  build_eghl_request_hash).
- Callback (server-to-server POST to MerchantCallbackURL): HashValue verified
  with build_eghl_callback_hash; TxnStatus "0" = success. eGHL expects a plain
  "OK" 200 response.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from decimal import Decimal
from html import escape

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.platform_config import PlatformConfigService
from app.models.customer import Customer
from app.models.order import Order
from app.models.payment import Payment
from app.models.wallet import WalletTopupSession

logger = logging.getLogger(__name__)

DEFAULT_GATEWAY_URL = "https://test2pay.ghl.com/IPGSG/Payment.aspx"
LIVE_GATEWAY_URL = "https://pay.e-ghl.com/IPGSG/Payment.aspx"
DEFAULT_PAGE_TIMEOUT = "780"
DEFAULT_PAYMENT_METHODS = ["card", "fpx"]


class EGHLError(Exception):
    """eGHL-specific error."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


async def _get_config(db: AsyncSession) -> PlatformConfigService:
    return PlatformConfigService(db)


async def _get_merchant_id(db: AsyncSession) -> str:
    return await (await _get_config(db)).get_str("eghl.merchant_id", default="")


async def _get_password(db: AsyncSession) -> str:
    return await (await _get_config(db)).get_str("eghl.password", default="")


async def _get_gateway_url(db: AsyncSession) -> str:
    base = await (await _get_config(db)).get_str("eghl.api_base_url", default="")
    return (base or DEFAULT_GATEWAY_URL).strip()


async def _get_payment_methods(db: AsyncSession) -> list[str]:
    value = await (await _get_config(db)).get("eghl.payment_methods", default=None)
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return DEFAULT_PAYMENT_METHODS


async def _eghl_enabled(db: AsyncSession) -> bool:
    config = await _get_config(db)
    enabled = await config.get_bool("eghl.enabled", default=False)
    if not enabled:
        return False
    merchant_id = await config.get_str("eghl.merchant_id", default="")
    password = await config.get_str("eghl.password", default="")
    return bool(merchant_id) and bool(password)


async def _api_base_url(db: AsyncSession) -> str:
    """Public base for OUR backend endpoints (checkout page / return / callback).

    Mirrors the Stripe simulator URL pattern: the customer app domain proxies
    /api/* to the backend (see create_wallet_topup_checkout_session), so
    app.public_url + /api reaches these endpoints.
    """
    config = await _get_config(db)
    return f"{await config.get_app_public_url()}/api"


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------


def build_eghl_request_hash(
    *,
    password: str,
    service_id: str,
    payment_id: str,
    merchant_return_url: str,
    merchant_callback_url: str,
    amount: str,
    currency_code: str,
    cust_ip: str,
    page_timeout: str = DEFAULT_PAGE_TIMEOUT,
) -> str:
    """HashValue for the hosted-page request form (lowercase hex sha256).

    Field sequence per the eGHL integration guide:

        password + ServiceID + PaymentID + MerchantReturnURL
        + MerchantCallbackURL + Amount + CurrencyCode + CustIP + PageTimeout

    NOTE: some doc versions insert MerchantApprovalURL between
    MerchantReturnURL and MerchantCallbackURL. If the gateway rejects our
    hashes, add that field here (and pass it in the form) — this helper is the
    single place that defines the exact sequence.
    """
    raw = (
        password
        + service_id
        + payment_id
        + merchant_return_url
        + merchant_callback_url
        + amount
        + currency_code
        + cust_ip
        + page_timeout
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def build_eghl_callback_hash(
    *,
    password: str,
    txn_id: str,
    service_id: str,
    payment_id: str,
    txn_status: str,
    amount: str,
    currency_code: str,
    auth_code: str,
) -> str:
    """Expected HashValue for an eGHL server-to-server callback."""
    raw = (
        password
        + txn_id
        + service_id
        + payment_id
        + txn_status
        + amount
        + currency_code
        + auth_code
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def verify_eghl_callback_hash(fields: dict, password: str) -> bool:
    """Verify the HashValue of an eGHL callback (case-insensitive compare)."""
    provided = (fields.get("HashValue") or "").strip()
    if not provided or not password:
        return False
    expected = build_eghl_callback_hash(
        password=password,
        txn_id=fields.get("TxnID", ""),
        service_id=fields.get("ServiceID", ""),
        payment_id=fields.get("PaymentID", ""),
        txn_status=fields.get("TxnStatus", ""),
        amount=fields.get("Amount", ""),
        currency_code=fields.get("CurrencyCode", ""),
        auth_code=fields.get("AuthCode", ""),
    )
    return hmac.compare_digest(expected.lower(), provided.lower())


def eghl_checkout_token(payment_id_str: str, password: str) -> str:
    """Short unguessable token guarding the backend checkout page.

    PaymentIDs are sequential (EG{payment.id}); without this token anyone
    could enumerate /api/payments/eghl/checkout/EG{n} and read the customer
    PII embedded in the auto-submit form.
    """
    return hmac.new(password.encode("utf-8"), payment_id_str.encode("utf-8"), hashlib.sha256).hexdigest()[:16]


# ---------------------------------------------------------------------------
# PaymentID mapping
# ---------------------------------------------------------------------------
# Order payments:   PaymentID = f"EG{payment.id}"  -> Payment.provider_transaction_id
# Wallet top-ups:   PaymentID = f"EGT{session.id}" -> WalletTopupSession.provider_session_id


def _payment_id_for_order(payment: Payment) -> str:
    return f"EG{payment.id}"


def _payment_id_for_topup(session: WalletTopupSession) -> str:
    return f"EGT{session.id}"


def is_eghl_topup_payment_id(payment_id_str: str) -> bool:
    return payment_id_str.startswith("EGT")


def _fmt_amount(amount: Decimal) -> str:
    """Two-decimal string as expected by eGHL."""
    return f"{amount:.2f}"


# ---------------------------------------------------------------------------
# Checkout creation (mirrors create_hitpay_payment_request's call-site shape)
# ---------------------------------------------------------------------------


async def create_eghl_checkout(
    db: AsyncSession,
    payment: Payment | None,
    order: Order | None,
    customer: Customer | None,
    amount: Decimal | None = None,
    currency: str | None = None,
    return_url: str | None = None,
    topup_session: WalletTopupSession | None = None,
) -> dict:
    """Create an eGHL checkout and return its PaymentID + checkout page URL.

    ``payment``/``order`` are None for wallet top-ups — pass ``amount``,
    ``currency`` and ``topup_session`` in that case (same None-contract as
    create_hitpay_payment_request).

    Nothing is sent to eGHL here; we persist the PaymentID and the final
    browser return URLs, and return the URL of our backend page that renders
    the auto-submitting form.
    """
    if not await _eghl_enabled(db):
        raise EGHLError("eGHL is not enabled or merchant_id/password is missing", 503)

    if payment is None and topup_session is None:
        raise EGHLError("A payment or a wallet top-up session is required", 400)
    if payment is None and (amount is None or not currency):
        raise EGHLError("Amount and currency are required when no payment is provided", 400)

    config_service = PlatformConfigService(db)
    app_public_url = await config_service.get_app_public_url()
    api_base = await _api_base_url(db)
    password = await _get_password(db)

    if payment is not None:
        payment_id_str = _payment_id_for_order(payment)
        # Final PWA landing URLs (the backend /eghl/return endpoint 303s here).
        # When the caller supplies a return_url (e.g. guest-pay), use it as-is;
        # otherwise default to the order-detail hash page with order/payment ids
        # (mirrors how HitPay builds its redirect_url).
        base_return = (return_url or f"{app_public_url}/#order-detail").rstrip("/")
        if return_url is None and order is not None:
            final = f"{base_return}?orderId={order.id}&paymentId={payment.id}"
        else:
            final = base_return
        sep = "&" if "?" in final else "?"
        payment.extra_metadata = {
            **(payment.extra_metadata or {}),
            "eghl_return_success_url": f"{final}{sep}status=success",
            "eghl_return_cancel_url": f"{final}{sep}status=cancel",
        }
        await db.flush()
    else:
        payment_id_str = _payment_id_for_topup(topup_session)

    checkout_url = (
        f"{api_base}/payments/eghl/checkout/{payment_id_str}"
        f"?t={eghl_checkout_token(payment_id_str, password)}"
    )
    return {
        "id": payment_id_str,
        "url": checkout_url,
        "redirect_url": checkout_url,
        "status": "pending",
    }


# ---------------------------------------------------------------------------
# Checkout page rendering (called by GET /api/payments/eghl/checkout/{id})
# ---------------------------------------------------------------------------


def render_eghl_checkout_html(gateway_url: str, fields: dict) -> str:
    """Render the auto-submitting form that posts the signed fields to eGHL."""
    inputs = "\n".join(
        f'      <input type="hidden" name="{escape(str(k), quote=True)}" value="{escape(str(v), quote=True)}">'
        for k, v in fields.items()
    )
    action = escape(gateway_url, quote=True)
    return f"""<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Redirecting to eGHL…</title></head>
  <body onload="document.forms[0].submit()">
    <p style="font-family:sans-serif;text-align:center;margin-top:40px">Redirecting to the secure payment page…</p>
    <form method="post" action="{action}">
{inputs}
      <noscript><button type="submit">Continue to payment</button></noscript>
    </form>
  </body>
</html>"""


async def build_eghl_checkout_page(
    db: AsyncSession,
    payment_id_str: str,
    cust_ip: str,
) -> str | None:
    """Build the auto-submit HTML page for a PaymentID, or None if unknown."""
    if not await _eghl_enabled(db):
        raise EGHLError("eGHL is not enabled", 503)

    merchant_id = await _get_merchant_id(db)
    password = await _get_password(db)
    gateway_url = await _get_gateway_url(db)
    api_base = await _api_base_url(db)

    if is_eghl_topup_payment_id(payment_id_str):
        result = await db.execute(
            select(WalletTopupSession).where(WalletTopupSession.provider_session_id == payment_id_str)
        )
        session = result.scalar_one_or_none()
        if session is None or session.status != "pending":
            return None
        amount = _fmt_amount(session.amount)
        currency_code = (session.currency_code or "MYR").upper()
        order_number = f"TOPUP-{session.id}"
        payment_desc = "Wallet Top-up"
        customer = (
            await db.execute(select(Customer).where(Customer.id == session.customer_id))
        ).scalar_one_or_none()
    else:
        result = await db.execute(
            select(Payment).where(Payment.provider_transaction_id == payment_id_str)
        )
        payment = result.scalar_one_or_none()
        if payment is None or payment.status not in ("initiated", "pending_authorization"):
            return None
        order = (
            await db.execute(select(Order).where(Order.id == payment.order_id))
        ).scalar_one_or_none()
        amount = _fmt_amount(payment.amount)
        currency_code = (payment.currency_code or "MYR").upper()
        order_number = order.order_number if order else f"ORDER-{payment.order_id}"
        payment_desc = f"Order {order_number}"
        customer = None
        if order is not None and order.customer_id is not None:
            customer = (
                await db.execute(select(Customer).where(Customer.id == order.customer_id))
            ).scalar_one_or_none()

    merchant_return_url = f"{api_base}/payments/eghl/return"
    merchant_callback_url = f"{api_base}/webhooks/eghl"

    cust_name = ""
    cust_email = ""
    cust_phone = ""
    if customer is not None:
        cust_name = customer.display_name or f"{customer.given_name or ''} {customer.family_name or ''}".strip()
        cust_email = customer.email_address or ""
        cust_phone = customer.phone_number or ""

    hash_value = build_eghl_request_hash(
        password=password,
        service_id=merchant_id,
        payment_id=payment_id_str,
        merchant_return_url=merchant_return_url,
        merchant_callback_url=merchant_callback_url,
        amount=amount,
        currency_code=currency_code,
        cust_ip=cust_ip,
        page_timeout=DEFAULT_PAGE_TIMEOUT,
    )

    fields = {
        "TransactionType": "SALE",
        "PymtMethod": "ANY",
        "ServiceID": merchant_id,
        "PaymentID": payment_id_str,
        "OrderNumber": order_number,
        "PaymentDesc": payment_desc,
        "MerchantReturnURL": merchant_return_url,
        "MerchantCallbackURL": merchant_callback_url,
        "Amount": amount,
        "CurrencyCode": currency_code,
        "CustIP": cust_ip,
        "CustName": cust_name,
        "CustEmail": cust_email,
        "CustPhone": cust_phone,
        "PageTimeout": DEFAULT_PAGE_TIMEOUT,
        "HashValue": hash_value,
    }
    return render_eghl_checkout_html(gateway_url, fields)


# ---------------------------------------------------------------------------
# Browser return (UX only — the callback is authoritative)
# ---------------------------------------------------------------------------


async def resolve_eghl_return_redirect(
    db: AsyncSession,
    payment_id_str: str,
    txn_status: str,
) -> str | None:
    """Resolve the PWA landing URL for an eGHL browser return.

    Returns a success/cancel URL, or None when the PaymentID is unknown.
    """
    status_param = "success" if txn_status.strip() == "0" else "cancel"

    if is_eghl_topup_payment_id(payment_id_str):
        result = await db.execute(
            select(WalletTopupSession).where(WalletTopupSession.provider_session_id == payment_id_str)
        )
        session = result.scalar_one_or_none()
        if session is None:
            return None
        config_service = PlatformConfigService(db)
        app_public_url = await config_service.get_app_public_url()
        return f"{app_public_url}/#wallet?topup_session={session.id}&status={status_param}"

    result = await db.execute(
        select(Payment).where(Payment.provider_transaction_id == payment_id_str)
    )
    payment = result.scalar_one_or_none()
    if payment is None:
        return None
    metadata = payment.extra_metadata or {}
    url = metadata.get("eghl_return_success_url" if status_param == "success" else "eghl_return_cancel_url")
    if url:
        return url
    # Fallback for rows created before the return URLs were persisted.
    config_service = PlatformConfigService(db)
    app_public_url = await config_service.get_app_public_url()
    return (
        f"{app_public_url}/#order-detail?orderId={payment.order_id}"
        f"&paymentId={payment.id}&status={status_param}"
    )
