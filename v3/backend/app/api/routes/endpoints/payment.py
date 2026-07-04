"""Payment endpoints."""

import hmac
import hashlib
import json
import logging
import uuid

import anyio

logger = logging.getLogger(__name__)
import stripe
from stripe._error import SignatureVerificationError
from fastapi import APIRouter, Body, HTTPException, Query, Request, status
from sqlalchemy import func, select

from app.api.routes.deps import ActiveCustomer, CurrentAdmin, DBDependency
from app.models.payment import Payment, PaymentMethod, Refund
from app.services.platform_config import PlatformConfigService
from app.schemas.base import APIResponse, PaginatedResponse
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
from app.services.hitpay import verify_hitpay_signature
from app.services.payment import (
    PaymentError,
    cancel_payment,
    capture_payment,
    confirm_payment,
    create_payment_intent,
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
            value = float(value)
        payment_dict[c.name] = value
    return PaymentOut.model_validate(payment_dict)


def _build_refund_out(refund: Refund) -> RefundOut:
    """Build RefundOut from Refund model."""
    return RefundOut(
        id=refund.id,
        payment_id=refund.payment_id,
        order_id=refund.order_id,
        amount=float(refund.amount),
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
            amount=float(payment.amount),
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
    base_return = (data.return_url or f"{app_public_url}/order-detail").rstrip("/")
    success_url = f"{base_return}?order_id={order.id}&status=success"
    cancel_url = f"{base_return}?order_id={order.id}&status=cancel"

    try:
        checkout = await create_stripe_checkout_session(db, payment, order, success_url=success_url, cancel_url=cancel_url, customer_id=order.customer_id)
    except PaymentError as exc:
        await db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    payment.provider_transaction_id = checkout["id"]
    order.payment_status = "pending_authorization"
    await db.commit()
    await db.refresh(payment)

    return APIResponse(
        data=CheckoutSessionResponse(
            payment_id=payment.id,
            checkout_url=checkout["url"],
            status=payment.status,
            amount=float(payment.amount),
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


@router.post("/{payment_id}/capture", response_model=APIResponse[PaymentOut])
async def capture(
    admin: CurrentAdmin,
    db: DBDependency,
    payment_id: int,
):
    """Capture an authorized payment."""
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
    items = [_build_payment_out(p) for p in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


def _verify_grabpay_signature(payload_bytes: bytes, sig_header: str, secret: str) -> bool:
    if not secret:
        from app.core.config import get_settings
        settings = get_settings()
        if settings.is_production or settings.webhook_verify_in_dev:
            import logging
            logger.critical("GrabPay webhook signing secret not configured")
            return False
        return True
    try:
        expected = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, sig_header)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Webhooks (unprotected)
# ---------------------------------------------------------------------------


@webhook_router.post("/stripe", response_model=APIResponse[dict])
async def stripe_webhook(
    db: DBDependency,
    request: Request,
):
    """Stripe webhook handler."""
    from app.core.config import get_settings
    settings = get_settings()

    sig_header = request.headers.get("Stripe-Signature")
    if not sig_header:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe-Signature header")

    payload_bytes = await request.body()
    webhook_secret = await get_stripe_webhook_secret(db)

    if webhook_secret:
        try:
            event = await anyio.to_thread.run_sync(
                stripe.Webhook.construct_event,
                payload_bytes,
                sig_header,
                webhook_secret,
            )
        except (ValueError, SignatureVerificationError) as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe signature") from exc
        payload = {"type": event.type, "data": {"object": event.data.object.to_dict()}}
    else:
        if settings.is_production or settings.webhook_verify_in_dev:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Stripe webhook signing secret not configured",
            )
        stripe_secret = settings.stripe_webhook_secret
        if not stripe_secret:
            # In dev, without a signing secret, still require a syntactically valid header.
            if settings.is_production or settings.webhook_verify_in_dev:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Stripe webhook signing secret not configured",
                )
            # Development-only: accept the event but log a warning.
            logger.warning("Stripe webhook accepted in dev without signature verification")
        else:
            try:
                event = await anyio.to_thread.run_sync(
                    stripe.Webhook.construct_event,
                    payload_bytes,
                    sig_header,
                    stripe_secret,
                )
            except (ValueError, SignatureVerificationError) as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe signature") from exc
            payload = {"type": event.type, "data": {"object": event.data.object.to_dict()}}
            try:
                payment = await process_webhook_event(db, "stripe", payload)
            except PaymentError as exc:
                raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
            return APIResponse(data={"received": True, "payment_id": payment.id if payment else None})
        try:
            payload = json.loads(payload_bytes)
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON") from exc

    try:
        payment = await process_webhook_event(db, "stripe", payload)
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return APIResponse(data={"received": True, "payment_id": payment.id if payment else None})


@webhook_router.post("/grabpay", response_model=APIResponse[dict])
async def grabpay_webhook(
    db: DBDependency,
    request: Request,
):
    """GrabPay webhook handler."""
    from app.core.config import get_settings
    settings = get_settings()

    sig_header = request.headers.get("X-GrabPay-Signature") or request.headers.get("Authorization")
    if not sig_header:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing GrabPay signature header")

    payload_bytes = await request.body()
    if not _verify_grabpay_signature(payload_bytes, sig_header, settings.webhook_signing_secret):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid GrabPay signature")

    try:
        payload = json.loads(payload_bytes)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON") from exc

    try:
        payment = await process_webhook_event(db, "grabpay", payload)
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return APIResponse(data={"received": True, "payment_id": payment.id if payment else None})


@webhook_router.post("/hitpay", response_model=APIResponse[dict])
async def hitpay_webhook(
    db: DBDependency,
    request: Request,
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HitPay salt/webhook_secret not configured",
        )

    if not verify_hitpay_signature(payload_bytes, sig_header, salt):
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

    try:
        payment = await process_webhook_event(db, "hitpay", payload)
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return APIResponse(data={"received": True, "payment_id": payment.id if payment else None})
