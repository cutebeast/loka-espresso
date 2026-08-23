"""FNB Enterprise v3 — FastAPI application entrypoint."""
import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)

from app.api.routes.router import api_router
from app.core.config import get_settings
from app.core.database import engine
from app.core.middleware import (
    PublicMutationRateLimitMiddleware,
    RequestBodySizeLimitMiddleware,
    RequestLoggingMiddleware,
    SecurityHeadersMiddleware,
)
from app.core.rate_limiter import limiter, rate_limit_exceeded_handler

settings = get_settings()


class DecimalEncoder:
    @staticmethod
    def default(obj):
        if isinstance(obj, Decimal):
            return float(obj)
        raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


class DecimalSafeJSONResponse(JSONResponse):
    def render(self, content) -> bytes:
        import json
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
            default=DecimalEncoder.default,
        ).encode("utf-8")


async def _sweep_stale_orders() -> None:
    """Cancel stale unpaid prepaid orders via the shared auto-cancel helper.

    Kiosk-channel prepaid orders expire after 15 minutes, all other prepaid
    orders after 2 hours; pay_after_meal open tabs are never swept. Each order
    is cancelled in its own session/transaction so one failure doesn't kill
    the batch. Reverses vouchers/rewards/stock/table locks and voids pending
    payments (auto_cancel_order → reverse_order_effects).
    """
    from sqlalchemy import and_, or_, select

    from app.core.database import AsyncSessionLocal
    from app.models.order import Order
    from app.services.order import auto_cancel_order

    now = datetime.now(timezone.utc)
    kiosk_cutoff = now - timedelta(minutes=15)
    other_cutoff = now - timedelta(hours=2)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Order.id).where(
                Order.payment_status == "initiated",
                # Open tabs (pay after meal) are never auto-cancelled
                Order.payment_flow == "prepaid",
                Order.status == "pending",
                or_(
                    and_(Order.order_channel == "kiosk", Order.created_at < kiosk_cutoff),
                    and_(Order.order_channel != "kiosk", Order.created_at < other_cutoff),
                ),
            )
        )
        order_ids = [row[0] for row in result.all()]

        # Limbo fallback: orders stuck in pending_authorization whose provider
        # session is long dead (Stripe sessions expire after ~24h) but the
        # expiry webhook never arrived — without this they hold stock/voucher/
        # table forever and escape every initiated-only sweep. Prepaid-only:
        # open tabs (pay_after_meal) must never be auto-cancelled.
        limbo_cutoff = now - timedelta(hours=24)
        limbo_result = await db.execute(
            select(Order.id).where(
                Order.payment_status == "pending_authorization",
                Order.payment_flow == "prepaid",
                Order.status == "pending",
                Order.created_at < limbo_cutoff,
            )
        )
        limbo_ids = [row[0] for row in limbo_result.all()]

    for order_id in order_ids:
        try:
            async with AsyncSessionLocal() as db:
                order = await db.get(Order, order_id, with_for_update=True)
                if order is None:
                    continue
                reason = (
                    "Auto-cancelled — unpaid after 15 minutes"
                    if order.order_channel == "kiosk"
                    else "Auto-cancelled — unpaid for >2 hours"
                )
                if await auto_cancel_order(db, order, reason):
                    await db.commit()
        except Exception:
            logger.warning("Auto-cancel sweep failed for order %s", order_id, exc_info=True)

    for order_id in limbo_ids:
        try:
            async with AsyncSessionLocal() as db:
                order = await db.get(Order, order_id, with_for_update=True)
                if order is None:
                    continue
                if await auto_cancel_order(db, order, "Auto-cancelled — payment session expired"):
                    await db.commit()
        except Exception:
            logger.warning("Limbo sweep failed for order %s", order_id, exc_info=True)

    # Expire vouchers/rewards whose validity has lapsed. Rows are granted as
    # 'active' with a future expires_at and nothing else flips them, so without
    # this they linger in every wallet view (PWA, kiosk picker, POS drawer)
    # until the order-time guard rejects them. 'reserved' rows belong to
    # in-flight orders and are owned by the order lifecycle — untouched here.
    from sqlalchemy import update

    from app.models.reward import CustomerReward
    from app.models.voucher import CustomerVoucher

    try:
        async with AsyncSessionLocal() as db:
            for model in (CustomerVoucher, CustomerReward):
                await db.execute(
                    update(model)
                    .where(
                        model.status == "active",
                        model.expires_at.is_not(None),
                        model.expires_at < now,
                    )
                    .values(status="expired")
                )
            await db.commit()
    except Exception:
        logger.warning("Wallet item expiry sweep failed", exc_info=True)


async def _periodic_order_sweep() -> None:
    """Run the stale-order sweep every 5 minutes until cancelled on shutdown."""
    while True:
        await asyncio.sleep(300)
        try:
            await _sweep_stale_orders()
        except Exception:
            logger.warning("Periodic stale order sweep failed", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings.upload_dir.mkdir(parents=True, exist_ok=True)

    # Stale unpaid order sweep (pay-before-food channels) once on startup…
    try:
        await _sweep_stale_orders()
    except Exception:
        logger.warning("Stale order sweep failed on startup", exc_info=True)

    # …then every 5 minutes in the background
    sweep_task = asyncio.create_task(_periodic_order_sweep())

    yield
    # Shutdown
    sweep_task.cancel()
    with suppress(asyncio.CancelledError):
        await sweep_task
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version="3.0.0",
    description="Enterprise F&B platform API",
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    openapi_url="/openapi.json" if settings.is_development else None,
    lifespan=lifespan,
    default_response_class=DecimalSafeJSONResponse,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    """Last-resort guard: turn DB constraint violations into clean 4xx.

    Without this, an unhandled unique/FK/NOT NULL/CHECK violation surfaces as
    a bare 500 (the allergen/survey duplicate-key bug class). Endpoints that
    handle IntegrityError themselves are unaffected — this only fires for
    uncaught ones.
    """
    orig = getattr(exc, "orig", None)
    raw = str(orig or exc)
    raw_l = raw.lower()
    constraint = (re.search(r'constraint "([^"]+)"', raw) or [None, ""])[1]

    # asyncpg's concrete class (UniqueViolationError etc.) only survives in the
    # string form after SQLAlchemy's dialect wrapping — match on the text.
    if "uniqueviolation" in raw_l or "duplicate key" in raw_l:
        status_code, friendly = 409, "A record with this value already exists"
    elif "foreignkeyviolation" in raw_l or "violates foreign key" in raw_l:
        status_code, friendly = 409, "This record is linked to other data, or references a record that does not exist"
    elif "notnullviolation" in raw_l or "not-null constraint" in raw_l or "null value in column" in raw_l:
        status_code, friendly = 400, "A required field is missing"
    elif "checkviolation" in raw_l or "check constraint" in raw_l:
        status_code, friendly = 400, "A value is outside its allowed range"
    else:
        status_code, friendly = 400, "The change violates a database constraint"

    logger.warning(
        "IntegrityError on %s %s: %s",
        request.method, request.url.path, constraint or raw[:200],
    )
    detail = f"{friendly}." + (f" (constraint: {constraint})" if constraint else "")
    return JSONResponse(status_code=status_code, content={"detail": detail})

# Security middleware
# Note: Starlette runs middlewares in reverse registration order — the public
# mutation rate limiter must be registered FIRST so its 429 responses still
# pass through CORS and security headers on the way out.
app.add_middleware(PublicMutationRateLimitMiddleware)
app.add_middleware(RequestBodySizeLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.get_allowed_hosts())
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
)
app.add_middleware(RequestLoggingMiddleware)

# Static files for uploads (directory creation moved to lifespan startup)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

# API routes
app.include_router(api_router, prefix="/api")


@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "ok", "version": "3.0.0", "environment": settings.environment}
