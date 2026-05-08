"""Payment endpoints."""

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, select

from app.api.v1.deps import ActiveCustomer, CurrentAdmin, DBDependency
from app.models.payment import Payment, Refund
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.payment import (
    PaymentIntentRequest,
    PaymentIntentResponse,
    PaymentOut,
    RefundCreate,
    RefundOut,
)
from app.services.payment import (
    PaymentError,
    cancel_payment,
    capture_payment,
    confirm_payment,
    create_payment_intent,
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
    payment_dict = {c.name: getattr(payment, c.key) for c in Payment.__table__.columns}
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
    customer: ActiveCustomer,
    db: DBDependency,
    data: PaymentIntentRequest,
):
    """Create a payment intent for an order."""
    try:
        payment, provider_response = await create_payment_intent(
            db=db,
            order_id=data.order_id,
            provider=data.provider,
            payment_method_type=data.payment_method_type,
            payment_method_id=data.payment_method_id,
            return_url=data.return_url,
            customer_id=customer.id,
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
    per_page: int = Query(20, ge=1, le=100),
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


# ---------------------------------------------------------------------------
# Webhooks (unprotected)
# ---------------------------------------------------------------------------


@webhook_router.post("/stripe", response_model=APIResponse[dict])
async def stripe_webhook(
    db: DBDependency,
    request: Request,
):
    """Stripe webhook handler."""
    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON") from exc

    # Signature verification would happen here if stripe SDK were available.
    # We accept the payload and process it.
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
    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON") from exc

    try:
        payment = await process_webhook_event(db, "grabpay", payload)
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return APIResponse(data={"received": True, "payment_id": payment.id if payment else None})
