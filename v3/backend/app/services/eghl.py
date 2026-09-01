"""eGHL payment provider — ADAPTIS (iPay88 NDes) integration.

ADAPTIS is the current eGHL gateway API (the old e-ghl.com IPGSG hosted page
is retired). Three server-to-server operations:

- Client Initiate (ADAPTIS Hosted): POST form → ``{BaseURL}/entry/adaptishosted``
  (web-redirect; the customer picks card/FPX/eWallet on the ADAPTIS page).
  ``BackendUrl`` receives a JSON post for SUCCESS transactions only.
- Merchant Requery: POST JSON → ``{BaseURL}/merchantrequery`` — used when
  neither callback lands (7 requests/day per transaction, within 10 days).
- Refund: POST JSON → ``{BaseURL}/merchantrefund`` (idempotent per unique
  RefNo).

Signatures are HMAC-SHA512 (lowercase hex) over MerchantKey-prefixed
concatenations (see ``build_adaptis_signature``). Amounts are stripped of
dots/commas before signing (1.00 → 100).

NOTE: the system product name remains "eGHL" — ADAPTIS is the iPay88 API
brand behind it. Config keys keep the eghl.* prefix.
"""

import hashlib
import hmac
import logging
from decimal import Decimal

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.models.payment import Payment
from app.models.wallet import WalletTopupSession
from app.services.platform_config import PlatformConfigService

logger = logging.getLogger(__name__)

DEFAULT_PAGE_TIMEOUT = "120"

# ADAPTIS PaymentId catalog (API Specification - PaymentId).
PAYMENT_ID_MAP: dict[str, int] = {
    "card": 2,           # Credit Card (single sale)
    "fpx": 16,           # FPX: all banks
    "boost": 210,        # Boost Wallet Online
    "grabpay": 523,      # GrabPay Online
    "tng": 538,          # Touch 'n Go eWallet
    "maybank_payqr": 542,  # Maybank PayQR Online
    "shopeepay": 801,    # ShopeePay Online
    "setel": 912,        # Setel eWallet
}

# Requery limits (Merchant Requery spec): 7 calls/day per transaction,
# only within 10 days of the transaction.
REQUERY_MAX_PER_DAY = 7
REQUERY_WINDOW_DAYS = 10


class EGHLError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


async def _get_config(db: AsyncSession) -> PlatformConfigService:
    return PlatformConfigService(db)


async def _get_merchant_code(db: AsyncSession) -> str:
    return await (await _get_config(db)).get_str("eghl.merchant_code", default="")


async def _get_merchant_key(db: AsyncSession) -> str:
    return await (await _get_config(db)).get_str("eghl.merchant_key", default="")


async def _get_base_url(db: AsyncSession) -> str:
    """ADAPTIS {BaseURL} (no trailing path — endpoints append their own)."""
    return await (await _get_config(db)).get_str("eghl.base_url", default="")


async def _get_payment_methods(db: AsyncSession) -> list[str]:
    value = await (await _get_config(db)).get("eghl.payment_methods", default=None)
    if isinstance(value, str):
        import json as _json
        try:
            value = _json.loads(value)
        except Exception:
            return []
    if not isinstance(value, list):
        return []
    return [m for m in value if isinstance(m, str) and m in PAYMENT_ID_MAP]


async def _eghl_enabled(db: AsyncSession) -> bool:
    config = await _get_config(db)
    enabled = await config.get_bool("eghl.enabled", default=False)
    merchant_code = await config.get_str("eghl.merchant_code", default="")
    merchant_key = await config.get_str("eghl.merchant_key", default="")
    return bool(enabled and merchant_code and merchant_key)


async def _api_base_url(db: AsyncSession) -> str:
    """Public base for OUR backend endpoints (checkout page / return / callback)."""
    config = await _get_config(db)
    return f"{await config.get_app_public_url()}/api"


# ---------------------------------------------------------------------------
# Signatures (HMAC-SHA512, lowercase hex)
# ---------------------------------------------------------------------------


def build_adaptis_signature(merchant_key: str, *parts: str) -> str:
    """HMAC-SHA512 of MerchantKey + <parts>, keyed by MerchantKey.

    Request / backend-post / requery: MerchantKey + MerchantCode + RefNo +
    Amount(stripped). Refund: MerchantKey + MerchantCode + IpayId + RefNo +
    RefundAmount(stripped) + RefundCurrency.
    """
    raw = "".join(parts).encode("utf-8")
    return hmac.new(merchant_key.encode("utf-8"), raw, hashlib.sha512).hexdigest()


def strip_amount_for_signature(amount: str) -> str:
    """1,278.99 → 127899 (dots and commas removed per the spec)."""
    return amount.replace(".", "").replace(",", "")


def _signature_for_payment_request(merchant_key: str, merchant_code: str, ref_no: str, amount: str) -> str:
    return build_adaptis_signature(
        merchant_key, merchant_key, merchant_code, ref_no, strip_amount_for_signature(amount)
    )


def _signature_for_refund(merchant_key: str, merchant_code: str, ipay_id: str, ref_no: str, refund_amount: str, currency: str) -> str:
    return build_adaptis_signature(
        merchant_key,
        merchant_key,
        merchant_code,
        ipay_id,
        ref_no,
        strip_amount_for_signature(refund_amount),
        currency,
    )


def _fmt_amount(amount: Decimal | str) -> str:
    return f"{Decimal(str(amount)):.2f}"


# ---------------------------------------------------------------------------
# PaymentID mapping (unchanged transport — RefNo is our local identifier)
# ---------------------------------------------------------------------------


def _payment_id_for_order(payment: Payment) -> str:
    return f"EG{payment.id}"


def _payment_id_for_topup(session: WalletTopupSession) -> str:
    return f"EGT{session.id}"


def is_eghl_topup_payment_id(payment_id_str: str) -> bool:
    return payment_id_str.startswith("EGT")


def eghl_checkout_token(payment_id_str: str, merchant_key: str) -> str:
    """Short unguessable token guarding the backend checkout page.

    PaymentIDs are sequential (EG{payment.id}); without this token anyone
    could enumerate /api/payments/eghl/checkout/EG{n} and read the customer
    PII embedded in the auto-submit form.
    """
    return hmac.new(merchant_key.encode("utf-8"), payment_id_str.encode("utf-8"), hashlib.sha256).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Checkout creation (same None-contract as create_hitpay_payment_request)
# ---------------------------------------------------------------------------


async def create_eghl_checkout(
    db: AsyncSession,
    payment: Payment | None,
    order: Order | None,
    customer=None,
    amount: Decimal | None = None,
    currency: str | None = None,
    return_url: str | None = None,
    topup_session: WalletTopupSession | None = None,
) -> dict:
    """Create an eGHL checkout and return its PaymentID + checkout page URL."""
    if not await _eghl_enabled(db):
        raise EGHLError("eGHL is not enabled or merchant_code/merchant_key is missing", 503)

    if payment is None and topup_session is None:
        raise EGHLError("A payment or a wallet top-up session is required", 400)
    if payment is None and (amount is None or not currency):
        raise EGHLError("Amount and currency are required when no payment is provided", 400)

    config_service = PlatformConfigService(db)
    app_public_url = await config_service.get_app_public_url()
    api_base = await _api_base_url(db)
    merchant_key = await _get_merchant_key(db)

    if payment is not None:
        payment_id_str = _payment_id_for_order(payment)
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
        f"?t={eghl_checkout_token(payment_id_str, merchant_key)}"
    )
    return {
        "id": payment_id_str,
        "url": checkout_url,
        "redirect_url": checkout_url,
        "status": "pending",
    }


# ---------------------------------------------------------------------------
# Checkout page rendering (GET /api/payments/eghl/checkout/{id})
# ---------------------------------------------------------------------------


def render_eghl_checkout_html(gateway_url: str, fields: dict) -> str:
    """Render the auto-submitting form that posts the signed fields to ADAPTIS."""
    from html import escape
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

    merchant_code = await _get_merchant_code(db)
    merchant_key = await _get_merchant_key(db)
    base_url = await _get_base_url(db)
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
        from app.models.customer import Customer
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
            from app.models.customer import Customer
            customer = (
                await db.execute(select(Customer).where(Customer.id == order.customer_id))
            ).scalar_one_or_none()

    response_url = f"{api_base}/payments/eghl/return"
    backend_url = f"{api_base}/webhooks/eghl"

    cust_name = ""
    cust_email = ""
    cust_phone = ""
    if customer is not None:
        cust_name = customer.display_name or ""
        cust_email = customer.email_address or ""
        cust_phone = customer.phone_number or ""

    signature = _signature_for_payment_request(merchant_key, merchant_code, payment_id_str, amount)

    fields = {
        "MerchantCode": merchant_code,
        "RefNo": payment_id_str,
        "RequestType": "10",
        "Remark": payment_desc,
        "Language": "UTF-8",
        "Amount": amount,
        "Currency": currency_code,
        "ProdDesc": payment_desc,
        "Customer.Name": cust_name or "-",
        "Customer.Email": cust_email or "customer@example.com",
        "Customer.ContactNumber": cust_phone or "0",
        "ResponseUrl": response_url,
        "BackendUrl": backend_url,
        "SignatureType": "HMACSHA512",
        "Signature": signature,
    }
    return render_eghl_checkout_html(f"{base_url}/entry/adaptishosted", fields)


# ---------------------------------------------------------------------------
# Browser return (UX only — the backend post is authoritative)
# ---------------------------------------------------------------------------


async def resolve_eghl_return_redirect(
    db: AsyncSession,
    payment_id_str: str,
    txn_status: str,
) -> str | None:
    """Resolve the PWA landing URL for an eGHL browser return."""
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
    config_service = PlatformConfigService(db)
    app_public_url = await config_service.get_app_public_url()
    return (
        f"{app_public_url}/#order-detail?orderId={payment.order_id}"
        f"&paymentId={payment.id}&status={status_param}"
    )


# ---------------------------------------------------------------------------
# Backend callback verification (JSON success-only post)
# ---------------------------------------------------------------------------


def verify_eghl_backend_post(payload: dict, merchant_key: str, merchant_code: str) -> tuple[bool, str]:
    """Verify the ADAPTIS backend-post signature.

    Returns (valid, error_reason). The signature covers
    MerchantKey + MerchantCode + RefNo + Amount(stripped).
    """
    ref_no = str(payload.get("RefNo") or "")
    amount = str(payload.get("Amount") or "")
    provided = ""
    verification = payload.get("Verification")
    if isinstance(verification, dict):
        provided = str(verification.get("Signature") or "")
    provided = provided or str(payload.get("Signature") or "")
    if not provided:
        return False, "missing signature"
    if not ref_no or not amount:
        return False, "missing RefNo/Amount"
    expected = _signature_for_payment_request(merchant_key, merchant_code, ref_no, amount)
    return hmac.compare_digest(expected, provided.strip()), "signature mismatch"


# ---------------------------------------------------------------------------
# Merchant Requery
# ---------------------------------------------------------------------------


async def requery_eghl_payment(db: AsyncSession, payment: Payment) -> dict:
    """Ask ADAPTIS for the latest status of a payment (callback fallback).

    Returns {"status": "success"|"failed"|"pending"|"unknown", "trans_id", "raw"}.
    Enforces the 7/day + 10-day limits client-side via extra_metadata.
    """
    if not await _eghl_enabled(db):
        return {"status": "unknown", "raw": None, "reason": "disabled"}
    merchant_code = await _get_merchant_code(db)
    merchant_key = await _get_merchant_key(db)
    base_url = await _get_base_url(db)

    ref_no = payment.provider_transaction_id or _payment_id_for_order(payment)
    amount = _fmt_amount(payment.amount)
    signature = _signature_for_payment_request(merchant_key, merchant_code, ref_no, amount)

    payload = {
        "MerchantCode": merchant_code,
        "RefNo": ref_no,
        "Amount": amount,
        "Verification": {"SignatureType": "HMACSHA512", "Signature": signature},
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(f"{base_url}/merchantrequery", json=payload)
    except Exception as exc:
        logger.warning("eGHL requery network error for %s: %s", ref_no, exc)
        return {"status": "unknown", "raw": None, "reason": str(exc)[:120]}

    if resp.status_code != 200:
        return {"status": "unknown", "raw": resp.text[:300], "reason": f"http {resp.status_code}"}

    data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    status_id = str(data.get("TransactionStatusID") or data.get("TransactionStatusId") or "")
    trans_id = str(data.get("TransID") or data.get("TransId") or "")
    if status_id == "1300":
        result = "success"
    elif status_id == "1400":
        result = "failed"
    else:
        result = "pending" if trans_id else "unknown"
    return {"status": result, "trans_id": trans_id, "raw": data}


# ---------------------------------------------------------------------------
# Refund (gateway call)
# ---------------------------------------------------------------------------


async def refund_eghl_payment(db: AsyncSession, payment: Payment, refund_id: int, refund_amount: Decimal, remark: str) -> dict:
    """Submit a refund to ADAPTIS for a captured eGHL payment.

    Returns {"status": "completed"|"failed"|"pending", "refund_id", "raw"}.
    The RefNo is unique per refund (RF{refund_id}) — ADAPTIS treats a repeat
    POST with the same RefNo idempotently.
    """
    if not await _eghl_enabled(db):
        raise EGHLError("eGHL is not enabled", 503)
    merchant_code = await _get_merchant_code(db)
    merchant_key = await _get_merchant_key(db)
    base_url = await _get_base_url(db)

    trans_id = payment.provider_transaction_id or ""
    if not trans_id:
        raise EGHLError("eGHL transaction id missing on the payment", 400)

    ref_no = f"RF{refund_id}"
    amount = _fmt_amount(refund_amount)
    signature = _signature_for_refund(merchant_key, merchant_code, trans_id, ref_no, amount, "MYR")

    payload = {
        "MerchantCode": merchant_code,
        "RequestType": "10",
        "IpayId": trans_id,
        "RefNo": ref_no,
        "RefundAmount": amount,
        "RefundCurrency": "MYR",
        "Remark": remark or "Refund",
        "Verification": {"SignatureType": "HMACSHA512", "Signature": signature},
    }
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            resp = await client.post(f"{base_url}/merchantrefund", json=payload)
    except Exception as exc:
        logger.warning("eGHL refund network error for %s: %s", trans_id, exc)
        return {"status": "pending", "refund_id": None, "raw": None, "reason": str(exc)[:120]}

    if resp.status_code != 200:
        return {"status": "pending", "refund_id": None, "raw": resp.text[:300], "reason": f"http {resp.status_code}"}

    try:
        data = resp.json()
    except Exception:
        data = {}
    refund_status_id = str(data.get("RefundStatusId") or "")
    gateway_refund_id = str(data.get("RefundId") or "")
    if refund_status_id == "3300":
        result = "completed"
    elif refund_status_id == "3440":
        result = "failed"
    else:
        result = "pending"
    return {"status": result, "refund_id": gateway_refund_id, "raw": data, "reason": data.get("ErrorMessage") or data.get("RefundStatusDesc")}
