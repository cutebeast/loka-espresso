"""Payment endpoints."""

import asyncio
import hmac
import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone

import anyio

logger = logging.getLogger(__name__)
import stripe
from stripe._error import SignatureVerificationError, StripeError
from fastapi import APIRouter, Body, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.routes.deps import (
    ActiveCustomer,
    CurrentAdmin,
    DBDependency,
    _get_admin_role_keys,
    require_store_admin,
)
from app.models.order import Order
from app.models.customer import Customer
from app.models.payment import Payment, PaymentMethod, Refund
from app.services.platform_config import PlatformConfigService
from app.schemas.base import APIResponse, PaginatedResponse, BaseSchema
from app.core.security import decode_guest_pay_token, create_guest_pay_token
from app.schemas.payment import (
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    PaymentIntentRequest,
    PaymentIntentResponse,
    PaymentMethodOut,
    PaymentOut,
    RefundCreate,
    RefundOut,
)
from app.services.hitpay import verify_hitpay_signature, create_hitpay_payment_request
from app.core.rate_limiter import limiter
from app.services.webhook import (
    extract_event_id,
    get_provider_secret,
    is_event_processed,
    mark_event_processed,
)
from app.services.payment import (
    PaymentError,
    _add_payment_event,
    _debit_wallet_for_payment,
    cancel_payment,
    capture_payment,
    confirm_payment,
    create_payment_intent,
    create_stripe_checkout_session,
    get_payment_gateway_config,
    get_stripe_webhook_secret,
    process_webhook_event,
    refund_payment,
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

router = APIRouter()
webhook_router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_payment_out(payment: Payment) -> PaymentOut:
    """Build PaymentOut from Payment model, handling column name mappings."""
    from decimal import Decimal

    payment_dict: dict = {}
    for c in Payment.__table__.columns:
        if c.name == "metadata":
            value = payment.extra_metadata
        else:
            value = getattr(payment, c.key)
        if isinstance(value, Decimal):
            value = str(value)
        payment_dict[c.name] = value
    return PaymentOut.model_validate(payment_dict)


def _build_refund_out(refund: Refund) -> RefundOut:
    """Build RefundOut from Refund model."""
    return RefundOut(
        id=refund.id,
        payment_id=refund.payment_id,
        order_id=refund.order_id,
        amount=str(refund.amount),
        reason=refund.reason,
        status=refund.status,
        approved_by=refund.approved_by,
        processed_at=refund.completed_at,
        created_at=refund.created_at,
    )


async def _get_payment_or_404(db, payment_id: int) -> Payment:
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return payment


# ---------------------------------------------------------------------------
# Guest payment (walk-in dine-in customers — no login required)
# ---------------------------------------------------------------------------


async def _validate_guest_token_or_404(order_id: int, token: str, db) -> Order:
    """Validate a guest-pay token and return the order, or 404/403."""
    payload = decode_guest_pay_token(token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired payment link")
    token_oid = int(payload.get("oid", 0))
    if token_oid != order_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Payment link does not match order")
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.line_items),
            selectinload(Order.store),
            selectinload(Order.dining_table),
        )
        .where(Order.id == order_id, Order.deleted_at.is_(None))
    )
    order = result.unique().scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order


@router.get("/guest-pay/{order_id}", response_model=APIResponse[dict])
async def guest_pay_summary(
    order_id: int,
    db: DBDependency,
    token: str = Query(..., description="Guest payment token from QR code"),
):
    """Return an order summary for a walk-in customer scanning a QR code.

    No authentication required — the signed token authorises access to this
    specific order only.  The customer sees items + total and can pay with
    Stripe or HitPay without creating an account.
    """
    order = await _validate_guest_token_or_404(order_id, token, db)
    from decimal import Decimal

    line_items = []
    for li in order.line_items:
        snap = li.item_snapshot or {}
        line_items.append({
            "name": snap.get("item_name") or snap.get("name") or "Item",
            "quantity": li.quantity,
            "unit_price": str(li.unit_price),
            "line_total": str(li.line_total),
            "modifiers_label": snap.get("modifiers_label") or "",
            "image_url": snap.get("image_url"),
        })

    config_service = PlatformConfigService(db)
    stripe_enabled = await config_service.get_bool("stripe.enabled", default=False)
    hitpay_enabled = await config_service.get_bool("hitpay.enabled", default=False)
    wallet_enabled = await config_service.get_bool("wallet.enabled", default=True)

    return APIResponse(data={
        "order_id": order.id,
        "order_number": order.order_number,
        "order_type": order.order_type,
        "table_number": order.dining_table.table_number if order.dining_table else None,
        "status": order.status,
        "payment_status": order.payment_status,
        "total_amount": str(order.total_amount),
        "currency_code": order.total_amount_currency,
        "store_name": order.store.store_name if order.store else None,
        "store_logo": order.store.logo_url if order.store and hasattr(order.store, "logo_url") else None,
        "line_items": line_items,
        "can_pay": order.payment_status not in ("captured", "settled", "paid")
                   and order.status not in ("cancelled_by_customer", "cancelled_by_merchant", "refunded"),
        "stripe_enabled": stripe_enabled,
        "hitpay_enabled": hitpay_enabled,
        "wallet_enabled": wallet_enabled,
    })


class GuestPayRequest(BaseSchema):
    """Schema for guest pay request — defined inline to avoid import cycles."""
    pass


@router.post("/guest-pay/{order_id}", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def guest_pay(
    order_id: int,
    db: DBDependency,
    token: str = Query(..., description="Guest payment token from QR code"),
    provider: str = Query("stripe", pattern="^(stripe|hitpay|wallet)$"),
    phone_number: str | None = Query(None, max_length=20, description="Optional — for loyalty registration"),
):
    """Create a Stripe/HitPay/Wallet payment session for a guest (walk-in) customer.

    No auth required.  The signed token authorises payment for this order only.
    If ``phone_number`` is provided, the customer is registered/linked so they
    earn loyalty points and receive a receipt — but registration is optional.

    For wallet payments, phone_number is REQUIRED to identify the customer's wallet.
    """
    order = await _validate_guest_token_or_404(order_id, token, db)
    from decimal import Decimal

    if order.payment_status in ("captured", "settled", "paid"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Order is already paid")
    if order.status in ("cancelled_by_customer", "cancelled_by_merchant", "refunded"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Order is cancelled/refunded")

    # Optionally link a customer by phone (passwordless — phone only).
    customer_id = order.customer_id
    if phone_number:
        phone = phone_number.strip()
        if phone:
            # Only link orders that are unassigned or sit on the shared
            # walk-in profile — never move an order that already belongs to
            # a registered customer (refunds credit order.customer_id).
            current_customer = None
            if order.customer_id is not None:
                cur = await db.execute(select(Customer).where(Customer.id == order.customer_id))
                current_customer = cur.scalar_one_or_none()
            order_is_unlinked = (
                current_customer is None
                or current_customer.phone_number == "+0000000000"
            )
            if order_is_unlinked:
                existing = await db.execute(select(Customer).where(Customer.phone_number == phone))
                customer = existing.scalar_one_or_none()
                if customer is None:
                    # Register a new passwordless customer. phone_verified_at
                    # stays NULL: the staff-issued guest token proves table
                    # presence, not phone ownership — verification requires OTP.
                    customer = Customer(
                        phone_number=phone,
                        display_name=phone,
                    )
                    db.add(customer)
                    await db.flush()
                    await db.refresh(customer)
                # Link the customer to the order so they earn loyalty + get a receipt.
                order.customer_id = customer.id
                customer_id = customer.id

    config_service = PlatformConfigService(db)
    app_public_url = await config_service.get_app_public_url()
    # Return to a guest-friendly hash page (no login required).
    base_return = f"{app_public_url}/#guest-pay".rstrip("/")
    success_url = f"{base_return}?orderId={order.id}&token={token}&status=success"
    cancel_url = f"{base_return}?orderId={order.id}&token={token}&status=cancel"

    payment = Payment(
        order_id=order.id,
        provider="internal_wallet" if provider == "wallet" else provider,
        payment_method_type="e_wallet" if provider == "wallet" else ("credit_card" if provider == "stripe" else "qr_pay"),
        amount=order.total_amount,
        currency_code=order.total_amount_currency,
        status="pending_authorization",
        net_amount=Decimal(0),
        idempotency_key=f"guest-pay-{order.id}-{uuid.uuid4().hex}",
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment)
    payment_id = payment.id

    redirect_url: str | None = None
    wallet_paid: bool = False
    if provider == "stripe":
        try:
            checkout = await create_stripe_checkout_session(
                db, payment, order, success_url=success_url, cancel_url=cancel_url, customer_id=customer_id,
            )
        except PaymentError as exc:
            await db.rollback()
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        payment.provider_transaction_id = checkout["id"]
        redirect_url = checkout["url"]
    elif provider == "hitpay":
        try:
            resp = await create_hitpay_payment_request(db, payment, order, None, return_url=success_url)
        except Exception as exc:
            await db.rollback()
            logger.exception("HitPay guest-pay payment request creation failed")
            raise HTTPException(status_code=503, detail="HitPay payment session could not be created") from exc
        payment.provider_transaction_id = resp["id"]
        redirect_url = resp.get("redirect_url")
    else:  # wallet
        if not phone_number or not phone_number.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number is required for wallet payments",
            )
        if not customer_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Customer not found — please enter a registered phone number",
            )
        payment.provider_transaction_id = f"wallet-{order.order_number}-{uuid.uuid4().hex[:8]}"
        try:
            config_service = PlatformConfigService(db)
            precision = await config_service.get_accounting_precision()
            rounding_mode = await config_service.get_accounting_rounding()
            await _debit_wallet_for_payment(db, payment, precision, rounding_mode)
            payment.status = "captured"
            payment.captured_amount = order.total_amount
            await _add_payment_event(
                db, payment, to_status="captured", from_status="initiated",
                amount=order.total_amount, provider_response={"guest_pay": True, "provider": "wallet"},
            )
            order.payment_status = "captured"
            # Paid orders advance to the kitchen: pending -> confirmed
            if order.status == "pending":
                order.status = "confirmed"
                order.updated_at = datetime.now(timezone.utc)
            wallet_paid = True
        except PaymentError as exc:
            await db.rollback()
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    if not wallet_paid:
        order.payment_status = "pending_authorization"
        await _add_payment_event(
            db, payment, to_status="pending_authorization", from_status="initiated",
            amount=order.total_amount, provider_response={"guest_pay": True},
        )
    await db.commit()

    return APIResponse(data={
        "payment_id": payment_id,
        "order_id": order.id,
        "redirect_url": redirect_url,
        "provider": provider,
        "wallet_paid": wallet_paid,
    })


# ---------------------------------------------------------------------------
# Customer-facing payment operations
# ---------------------------------------------------------------------------


@router.post("/intent", response_model=APIResponse[PaymentIntentResponse], status_code=status.HTTP_201_CREATED)
async def create_intent(
    request: Request,
    customer: ActiveCustomer,
    db: DBDependency,
    raw_data: dict = Body(...),
):
    """Create a payment intent for an order."""
    # Accept legacy PWA field names
    if "payment_method" in raw_data and "payment_method_type" not in raw_data:
        raw_data["payment_method_type"] = raw_data["payment_method"]
    if "payment_method" in raw_data and "provider" not in raw_data:
        pm = raw_data["payment_method"]
        raw_data["provider"] = {
            "wallet": "internal_wallet",
            "cash": "cash",
            "pay_at_store": "cash",
            "cod": "cash",
            "gateway": "stripe",
            "hitpay": "hitpay",
        }.get(str(pm), str(pm))
    # Map legacy/customer-facing payment method names to valid DB enum values.
    method_type = raw_data.get("payment_method_type") or raw_data.get("payment_method")
    if method_type:
        raw_data["payment_method_type"] = {
            "wallet": "e_wallet",
            "internal_wallet": "e_wallet",
            "cash": "cash",
            "pay_at_store": "cash",
            "cod": "cash",
            "gateway": "credit_card",
            "stripe": "credit_card",
            "card": "credit_card",
            "credit_card": "credit_card",
            "hitpay": "qr_pay",
        }.get(str(method_type), str(method_type))
    idempotency_key = raw_data.get("idempotency_key") or request.headers.get("Idempotency-Key")
    if idempotency_key:
        raw_data["idempotency_key"] = str(idempotency_key).strip()[:255]
    data = PaymentIntentRequest(**raw_data)

    try:
        payment, provider_response = await create_payment_intent(
            db=db,
            order_id=data.order_id,
            provider=data.provider,
            payment_method_type=data.payment_method_type,
            payment_method_id=data.payment_method_id,
            return_url=data.return_url,
            customer_id=customer.id,
            idempotency_key=data.idempotency_key,
        )
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    client_secret = provider_response.get("client_secret")
    redirect_url = provider_response.get("redirect_url")

    return APIResponse(
        data=PaymentIntentResponse(
            payment_id=payment.id,
            client_secret=client_secret,
            redirect_url=redirect_url,
            status=payment.status,
            amount=str(payment.amount),
            currency_code=payment.currency_code,
        )
    )


@router.post("/checkout", response_model=APIResponse[CheckoutSessionResponse], status_code=status.HTTP_201_CREATED)
async def create_checkout_session(
    customer: ActiveCustomer,
    db: DBDependency,
    data: CheckoutSessionRequest,
):
    """Create a Stripe Checkout session for an order (customer-facing redirect flow)."""
    from app.models.order import Order

    order_result = await db.execute(
        select(Order).where(Order.id == data.order_id, Order.deleted_at.is_(None)).with_for_update()
    )
    order = order_result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if order.customer_id != customer.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if order.payment_status in ("captured", "settled", "paid"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Order is already paid")

    from decimal import Decimal

    payment = Payment(
        order_id=order.id,
        provider="stripe",
        payment_method_type="credit_card",
        amount=order.total_amount,
        currency_code=order.total_amount_currency,
        status="pending_authorization",
        net_amount=Decimal(0),
        idempotency_key=f"customer-checkout-{order.id}-{uuid.uuid4().hex}",
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment)

    config_service = PlatformConfigService(db)
    app_public_url = await config_service.get_app_public_url()
    # Use hash-based routing (#order-detail) and camelCase param names matching
    # the PWA's hash router. Include paymentId so OrderDetailPage can confirm/cancel.
    base_return = (data.return_url or f"{app_public_url}/#order-detail").rstrip("/")
    success_url = f"{base_return}?orderId={order.id}&paymentId={payment.id}&status=success"
    cancel_url = f"{base_return}?orderId={order.id}&paymentId={payment.id}&status=cancel"

    try:
        checkout = await create_stripe_checkout_session(db, payment, order, success_url=success_url, cancel_url=cancel_url, customer_id=order.customer_id)
    except PaymentError as exc:
        await db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    payment.provider_transaction_id = checkout["id"]
    order.payment_status = "pending_authorization"
    await _add_payment_event(
        db,
        payment,
        to_status="pending_authorization",
        from_status="initiated",
        provider_response={"checkout_session_id": checkout["id"], "checkout_url": checkout["url"]},
    )
    await db.commit()
    await db.refresh(payment)

    return APIResponse(
        data=CheckoutSessionResponse(
            payment_id=payment.id,
            checkout_url=checkout["url"],
            status=payment.status,
            amount=str(payment.amount),
            currency_code=payment.currency_code,
        )
    )


@router.post("/{payment_id}/confirm", response_model=APIResponse[PaymentOut])
async def confirm(
    customer: ActiveCustomer,
    db: DBDependency,
    payment_id: int,
):
    """Confirm a payment (simulate provider confirmation)."""
    payment = await _get_payment_or_404(db, payment_id)
    # Verify ownership via order
    from app.models.order import Order
    order_result = await db.execute(select(Order).where(Order.id == payment.order_id))
    order = order_result.scalar_one_or_none()
    if order is None or order.customer_id != customer.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Cash-like providers are collected and confirmed by store staff; customers
    # must not be able to mark them paid themselves.
    if payment.provider in ("cash", "store_credit"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This payment method can only be confirmed by store staff",
        )

    try:
        payment = await confirm_payment(db, payment_id)
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return APIResponse(data=_build_payment_out(payment))


@router.post("/{payment_id}/cancel", response_model=APIResponse[PaymentOut])
async def cancel(
    customer: ActiveCustomer,
    db: DBDependency,
    payment_id: int,
):
    """Cancel a pending payment."""
    payment = await _get_payment_or_404(db, payment_id)
    from app.models.order import Order
    order_result = await db.execute(select(Order).where(Order.id == payment.order_id))
    order = order_result.scalar_one_or_none()
    if order is None or order.customer_id != customer.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    try:
        payment = await cancel_payment(db, payment_id)
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return APIResponse(data=_build_payment_out(payment))


# ---------------------------------------------------------------------------
# Customer payment methods (MUST be before /{payment_id} to avoid route clash)
# ---------------------------------------------------------------------------


@router.get("/config", response_model=APIResponse[dict])
async def payment_gateway_config(
    db: DBDependency,
):
    """Return public payment gateway configuration (no secret keys)."""
    return APIResponse(data=await get_payment_gateway_config(db))


def _safe_payment_method_dict(pm: PaymentMethod) -> dict:
    """Return customer-safe payment method fields."""
    return {
        "id": pm.id,
        "customer_id": pm.customer_id,
        "method_type": pm.method_type,
        "provider": pm.provider,
        "display_label": pm.display_label,
        "card_brand": pm.card_brand,
        "card_last_four": pm.card_last_four,
        "card_expiry_month": pm.card_expiry_month,
        "card_expiry_year": pm.card_expiry_year,
        "is_default": pm.is_default,
        "is_active": pm.is_active,
        "billing_address_snapshot": pm.billing_address_snapshot,
        "verified_at": pm.verified_at.isoformat() if pm.verified_at else None,
        "created_at": pm.created_at.isoformat() if pm.created_at else None,
        "updated_at": pm.updated_at.isoformat() if pm.updated_at else None,
    }


@router.get("/methods", response_model=APIResponse[list[dict]])
async def list_payment_methods(
    customer: ActiveCustomer,
    db: DBDependency,
):
    """List customer's saved payment methods."""
    result = await db.execute(
        select(PaymentMethod).where(
            PaymentMethod.customer_id == customer.id,
            PaymentMethod.is_active.is_(True),
        )
    )
    items = result.scalars().all()
    return APIResponse(data=[_safe_payment_method_dict(i) for i in items])


@router.delete("/methods/{method_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment_method(
    customer: ActiveCustomer,
    db: DBDependency,
    method_id: int,
):
    """Soft-delete a payment method."""
    result = await db.execute(
        select(PaymentMethod).where(
            PaymentMethod.id == method_id,
            PaymentMethod.customer_id == customer.id,
        )
    )
    pm = result.scalar_one_or_none()
    if pm is None:
        raise HTTPException(status_code=404, detail="Payment method not found")
    pm.is_active = False
    await db.commit()
    return None


@router.put("/methods/{method_id}/default", response_model=APIResponse[dict])
async def set_default_payment_method(
    customer: ActiveCustomer,
    db: DBDependency,
    method_id: int,
):
    """Set a payment method as default."""
    result = await db.execute(
        select(PaymentMethod).where(
            PaymentMethod.id == method_id,
            PaymentMethod.customer_id == customer.id,
            PaymentMethod.is_active.is_(True),
        )
    )
    pm = result.scalar_one_or_none()
    if pm is None:
        raise HTTPException(status_code=404, detail="Payment method not found")

    # Unset other defaults
    others = await db.execute(
        select(PaymentMethod).where(
            PaymentMethod.customer_id == customer.id,
            PaymentMethod.is_default.is_(True),
        )
    )
    for other in others.scalars().all():
        other.is_default = False

    pm.is_default = True
    await db.commit()
    await db.refresh(pm)
    return APIResponse(data=_safe_payment_method_dict(pm))


@router.post("/methods/setup-intent", response_model=APIResponse[dict])
async def create_setup_intent(
    customer: ActiveCustomer,
    db: DBDependency,
):
    """Create a Stripe SetupIntent for saving a new payment method.

    Returns a client_secret that the frontend uses with Stripe.js
    PaymentElement to collect card details without the card touching our server.
    """
    from app.services.payment import _get_stripe_secret_key as get_stripe_api_key, _get_or_create_stripe_customer

    api_key = await get_stripe_api_key(db)
    if not api_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    # Ensure the customer exists in Stripe
    stripe_customer_id = await _get_or_create_stripe_customer(db, customer.id, api_key)

    try:
        intent = await asyncio.to_thread(
            lambda: stripe.SetupIntent.create(
                customer=stripe_customer_id,
                payment_method_types=["card"],
                usage="off_session",
                api_key=api_key,
                metadata={"customer_id": str(customer.id)},
            )
        )
    except StripeError as exc:
        logger.warning("Stripe API error: %s", exc)
        raise HTTPException(status_code=502, detail="Payment provider error") from exc

    return APIResponse(data={
        "client_secret": intent.client_secret,
        "setup_intent_id": intent.id,
    })


@router.post("/methods", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def save_payment_method(
    customer: ActiveCustomer,
    db: DBDependency,
    data: dict,
):
    """Save a payment method after Stripe SetupIntent confirmation.

    Frontend calls this with the setup_intent_id after Stripe.js confirms
    the SetupIntent. We retrieve the PaymentMethod from Stripe and store it.
    """
    from app.services.payment import _get_stripe_secret_key as get_stripe_api_key

    api_key = await get_stripe_api_key(db)
    if not api_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    setup_intent_id = data.get("setup_intent_id")
    if not setup_intent_id:
        raise HTTPException(status_code=400, detail="setup_intent_id is required")

    try:
        intent = await asyncio.to_thread(
            lambda: stripe.SetupIntent.retrieve(setup_intent_id, api_key=api_key)
        )
    except StripeError as exc:
        logger.warning("Stripe API error: %s", exc)
        raise HTTPException(status_code=502, detail="Payment provider error") from exc

    if intent.status != "succeeded":
        raise HTTPException(
            status_code=400,
            detail=f"SetupIntent status is {intent.status}, expected succeeded",
        )

    pm_id = intent.payment_method
    if not pm_id:
        raise HTTPException(status_code=400, detail="No payment method attached to SetupIntent")

    try:
        pm_obj = await asyncio.to_thread(
            lambda: stripe.PaymentMethod.retrieve(pm_id, api_key=api_key)
        )
    except StripeError as exc:
        logger.warning("Stripe API error: %s", exc)
        raise HTTPException(status_code=502, detail="Payment provider error") from exc

    # Check for duplicates
    existing = await db.execute(
        select(PaymentMethod).where(
            PaymentMethod.customer_id == customer.id,
            PaymentMethod.card_last_four == pm_obj.card.last4,
            PaymentMethod.card_brand == pm_obj.card.brand,
            PaymentMethod.is_active.is_(True),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="This card is already saved")

    # If this is the first payment method, make it default
    count_result = await db.execute(
        select(func.count(PaymentMethod.id)).where(
            PaymentMethod.customer_id == customer.id,
            PaymentMethod.is_active.is_(True),
        )
    )
    is_first = (count_result.scalar() or 0) == 0

    # Encrypt the Stripe payment method token
    import os
    from cryptography.fernet import Fernet
    encryption_key = os.environ.get("PAYMENT_TOKEN_KEY")
    if encryption_key:
        f = Fernet(encryption_key.encode() if isinstance(encryption_key, str) else encryption_key)
        encrypted_token = f.encrypt(pm_id.encode()).decode()
        iv = None
    else:
        encrypted_token = pm_id
        iv = None

    new_pm = PaymentMethod(
        customer_id=customer.id,
        method_type="card",
        provider="stripe",
        display_label=f"{pm_obj.card.brand.title()} •••• {pm_obj.card.last4}",
        card_brand=pm_obj.card.brand,
        card_last_four=pm_obj.card.last4,
        card_expiry_month=int(pm_obj.card.exp_month),
        card_expiry_year=int(pm_obj.card.exp_year),
        provider_token_encrypted=encrypted_token,
        provider_token_iv=iv,
        is_default=is_first,
        is_active=True,
        verified_at=datetime.now(timezone.utc),
    )
    db.add(new_pm)
    await db.commit()
    await db.refresh(new_pm)

    return APIResponse(data=_safe_payment_method_dict(new_pm))


@router.get("/{payment_id}", response_model=APIResponse[PaymentOut])
async def get_payment(
    customer: ActiveCustomer,
    db: DBDependency,
    payment_id: int,
):
    """Get payment details by ID."""
    payment = await _get_payment_or_404(db, payment_id)
    from app.models.order import Order
    order_result = await db.execute(select(Order).where(Order.id == payment.order_id))
    order = order_result.scalar_one_or_none()
    if order is None or order.customer_id != customer.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return APIResponse(data=_build_payment_out(payment))


# ---------------------------------------------------------------------------
# Admin-facing payment operations
# ---------------------------------------------------------------------------


async def _require_payment_money_admin(db, admin, payment_id: int) -> None:
    """Enforce store scoping and read-only role block for money movement."""
    payment = await _get_payment_or_404(db, payment_id)
    order_result = await db.execute(select(Order.store_id).where(Order.id == payment.order_id))
    store_id = order_result.scalar_one_or_none()
    if store_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    await require_store_admin(db, admin, store_id)
    role_keys = await _get_admin_role_keys(db, admin.id, admin_obj=admin)
    if role_keys == {"readonly_analyst"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Read-only admins cannot capture or refund payments",
        )


@router.post("/{payment_id}/capture", response_model=APIResponse[PaymentOut])
async def capture(
    admin: CurrentAdmin,
    db: DBDependency,
    payment_id: int,
):
    """Capture an authorized payment."""
    await _require_payment_money_admin(db, admin, payment_id)
    try:
        payment = await capture_payment(db, payment_id)
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return APIResponse(data=_build_payment_out(payment))


@router.post("/{payment_id}/refund", response_model=APIResponse[RefundOut], status_code=status.HTTP_201_CREATED)
async def request_refund(
    admin: CurrentAdmin,
    db: DBDependency,
    payment_id: int,
    data: RefundCreate,
):
    """Request a refund for a payment."""
    await _require_payment_money_admin(db, admin, payment_id)
    try:
        refund = await refund_payment(
            db=db,
            payment_id=payment_id,
            amount=data.amount,
            reason=data.reason,
            reason_category=data.reason_category,
            approved_by=admin.id,
        )
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return APIResponse(data=_build_refund_out(refund))


@router.get("", response_model=APIResponse[PaginatedResponse[PaymentOut]])
async def list_payments(
    admin: CurrentAdmin,
    db: DBDependency,
    order_id: int | None = Query(None),
    status: str | None = Query(None),
    provider: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List payments (admin only)."""
    base_stmt = select(Payment)
    count_stmt = select(func.count(Payment.id))

    if order_id is not None:
        base_stmt = base_stmt.where(Payment.order_id == order_id)
        count_stmt = count_stmt.where(Payment.order_id == order_id)
    if status is not None:
        base_stmt = base_stmt.where(Payment.status == status)
        count_stmt = count_stmt.where(Payment.status == status)
    if provider is not None:
        base_stmt = base_stmt.where(Payment.provider == provider)
        count_stmt = count_stmt.where(Payment.provider == provider)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(Payment.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    payments = result.scalars().all()
    items = [_build_payment_out(p) for p in payments]

    # Attach split-bill allocations (line-item coverage) per payment, batched.
    payment_ids = [p.id for p in payments]
    if payment_ids:
        from app.models.order import OrderLineItem
        from app.models.payment import PaymentLineAllocation
        from app.schemas.payment import PaymentLineAllocationOut

        alloc_rows = await db.execute(
            select(PaymentLineAllocation, OrderLineItem.item_snapshot)
            .join(OrderLineItem, OrderLineItem.id == PaymentLineAllocation.order_line_item_id)
            .where(PaymentLineAllocation.payment_id.in_(payment_ids))
        )
        by_payment: dict[int, list[PaymentLineAllocationOut]] = {}
        for alloc, snapshot in alloc_rows.all():
            snap = snapshot or {}
            name = snap.get("name") or snap.get("item_name")
            by_payment.setdefault(alloc.payment_id, []).append(
                PaymentLineAllocationOut(
                    order_line_item_id=alloc.order_line_item_id,
                    item_name=name,
                    quantity=str(alloc.quantity),
                )
            )
        for out in items:
            out.allocations = by_payment.get(out.id) or []

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


def _verify_grabpay_signature(payload_bytes: bytes, sig_header: str, secret: str | None) -> bool:
    if not secret:
        return False
    try:
        expected = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, sig_header)
    except Exception:
        logger.debug("Signature verification failed", exc_info=True)
        return False


# ---------------------------------------------------------------------------
# Webhooks
# ---------------------------------------------------------------------------


@webhook_router.post("/stripe", response_model=APIResponse[dict])
@limiter.limit("100/minute")
async def stripe_webhook(
    request: Request,
    db: DBDependency,
):
    """Stripe webhook handler.

    Fails closed: a configured signing secret is required in every environment.
    Set stripe.webhook_secret in platform_config or STRIPE_WEBHOOK_SECRET.
    """
    sig_header = request.headers.get("Stripe-Signature")
    if not sig_header:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe-Signature header")

    payload_bytes = await request.body()
    webhook_secret = await get_stripe_webhook_secret(db)
    if not webhook_secret:
        logger.error("Stripe webhook rejected: signing secret not configured")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Stripe webhook signing secret not configured",
        )

    try:
        event = await anyio.to_thread.run_sync(
            stripe.Webhook.construct_event,
            payload_bytes,
            sig_header,
            webhook_secret,
        )
    except (ValueError, SignatureVerificationError) as exc:
        logger.warning("Stripe webhook rejected: invalid signature")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe signature") from exc

    payload = {"type": event.type, "data": {"object": event.data.object.to_dict()}}
    event_id = extract_event_id("stripe", payload)
    if event_id and await is_event_processed("stripe", event_id):
        logger.info("Stripe webhook duplicate event ignored: %s", event_id)
        return APIResponse(data={"received": True, "duplicate": True, "payment_id": None})

    try:
        payment = await process_webhook_event(db, "stripe", payload)
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    if event_id:
        await mark_event_processed("stripe", event_id)
    logger.info("Stripe webhook processed: event=%s payment_id=%s", event_id, payment.id if payment else None)
    return APIResponse(data={"received": True, "payment_id": payment.id if payment else None})


@webhook_router.post("/grabpay", response_model=APIResponse[dict])
@limiter.limit("100/minute")
async def grabpay_webhook(
    request: Request,
    db: DBDependency,
):
    """GrabPay webhook handler."""
    sig_header = request.headers.get("X-GrabPay-Signature") or request.headers.get("Authorization")
    if not sig_header:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing GrabPay signature header")

    payload_bytes = await request.body()
    secret = await get_provider_secret(db, "grabpay", "grabpay_webhook_secret", "grabpay.webhook_secret")
    if not secret:
        logger.error("GrabPay webhook rejected: signing secret not configured")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GrabPay webhook signing secret not configured")

    if not _verify_grabpay_signature(payload_bytes, sig_header, secret):
        logger.warning("GrabPay webhook rejected: invalid signature")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid GrabPay signature")

    try:
        payload = json.loads(payload_bytes)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON") from exc

    event_id = extract_event_id("grabpay", payload)
    if event_id and await is_event_processed("grabpay", event_id):
        logger.info("GrabPay webhook duplicate event ignored: %s", event_id)
        return APIResponse(data={"received": True, "duplicate": True, "payment_id": None})

    try:
        payment = await process_webhook_event(db, "grabpay", payload)
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    if event_id:
        await mark_event_processed("grabpay", event_id)
    logger.info("GrabPay webhook processed: event=%s payment_id=%s", event_id, payment.id if payment else None)
    return APIResponse(data={"received": True, "payment_id": payment.id if payment else None})


@webhook_router.post("/hitpay", response_model=APIResponse[dict])
@limiter.limit("200/minute")
async def hitpay_webhook(
    request: Request,
    db: DBDependency,
):
    """HitPay v2 webhook handler."""
    sig_header = request.headers.get("Hitpay-Signature")
    if not sig_header:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Hitpay-Signature header")

    payload_bytes = await request.body()
    config_service = PlatformConfigService(db)
    salt = (
        await config_service.get_str("hitpay.salt", default="")
        or await config_service.get_str("hitpay.webhook_secret", default="")
    )
    if not salt:
        logger.error("HitPay webhook rejected: salt/webhook_secret not configured")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HitPay salt/webhook_secret not configured",
        )

    if not verify_hitpay_signature(payload_bytes, sig_header, salt):
        logger.warning("HitPay webhook rejected: invalid signature")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid HitPay signature")

    try:
        body = json.loads(payload_bytes)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON") from exc

    event_type = request.headers.get("Hitpay-Event-Type") or body.get("status", "completed")
    event_object = request.headers.get("Hitpay-Event-Object") or "payment_request"
    if event_type and not event_type.startswith(event_object):
        event_type = f"{event_object}.{event_type}"

    payload = {"type": event_type, "data": {"object": body}}
    raw_event_id = extract_event_id("hitpay", payload)
    event_id = f"{event_type}:{raw_event_id}" if raw_event_id else None
    if event_id and await is_event_processed("hitpay", event_id):
        logger.info("HitPay webhook duplicate event ignored: %s", event_id)
        return APIResponse(data={"received": True, "duplicate": True, "payment_id": None})

    try:
        payment = await process_webhook_event(db, "hitpay", payload)
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    if event_id:
        await mark_event_processed("hitpay", event_id)
    logger.info("HitPay webhook processed: event=%s payment_id=%s", event_id, payment.id if payment else None)
    return APIResponse(data={"received": True, "payment_id": payment.id if payment else None})
