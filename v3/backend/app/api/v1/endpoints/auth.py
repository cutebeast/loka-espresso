"""Authentication endpoints."""

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.api.v1.deps import DBDependency
from app.core.config import get_settings
from app.models.customer import Customer
from app.schemas.auth import (
    AuthResponse,
    CustomerLoginRequest,
    CustomerRegisterRequest,
    RefreshTokenRequest,
    TokenPair,
)
from app.schemas.customer import CustomerProfileOut
from app.core.rate_limiter import limiter
from app.services.auth import (
    AuthError,
    create_customer_tokens,
    refresh_customer_tokens,
    register_customer,
)
from app.services.platform_config import PlatformConfigService

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def customer_register(db: DBDependency, data: CustomerRegisterRequest):
    """Register a new customer account (passwordless / OTP)."""
    try:
        customer = await register_customer(db, data)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    
    tokens = await create_customer_tokens(customer)
    return AuthResponse(
        user_type="customer",
        user_id=customer.id,
        tokens=tokens,
        profile=CustomerProfileOut.model_validate(customer).model_dump(),
    )


@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
async def customer_login(request: Request, db: DBDependency, data: CustomerLoginRequest):
    """Login with email or phone (OTP-based / passwordless).

    Development: logs warning that OTP is bypassed.
    Production: OTP verification is mandatory. If not yet implemented, the
    endpoint returns 501 so deploy is blocked until OTP is wired up.
    """
    import logging
    logger = logging.getLogger("auth")
    settings = get_settings()

    # ── Production guard: OTP verification must be implemented ──
    if settings.is_production:
        # Check if OTP bypass is explicitly disabled via platform config
        config_svc = PlatformConfigService(db)
        bypass_enabled = await config_svc.get_bool("otp.bypass_enabled", default=False)
        if not bypass_enabled:
            raise HTTPException(
                status_code=501,
                detail="OTP verification required in production. "
                       "Set otp.bypass_enabled=true in platform_config for "
                       "temporary bypass during staged rollout.",
            )
    else:
        logger.warning("OTP verification BYPASSED in non-production environment")

    if data.email_address:
        result = await db.execute(
            select(Customer).where(
                Customer.email_address == data.email_address,
                Customer.deleted_at.is_(None),
            )
        )
    elif data.phone_number:
        result = await db.execute(
            select(Customer).where(
                Customer.phone_number == data.phone_number,
                Customer.deleted_at.is_(None),
            )
        )
    else:
        raise HTTPException(status_code=400, detail="Email or phone required")
    
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=404, detail="Account not found. Please register.")
    
    if not customer.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")
    
    tokens = await create_customer_tokens(customer)
    return AuthResponse(
        user_type="customer",
        user_id=customer.id,
        tokens=tokens,
        profile=CustomerProfileOut.model_validate(customer).model_dump(),
    )


@router.post("/refresh", response_model=TokenPair)
@limiter.limit("10/minute")
async def customer_refresh(request: Request, db: DBDependency, data: RefreshTokenRequest):
    """Refresh access token."""
    try:
        tokens = await refresh_customer_tokens(db, data)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return tokens


@router.post("/logout")
async def customer_logout():
    """Logout endpoint — client-side token invalidation.
    
    In a stateless JWT setup, logout is handled entirely on the client
    by discarding tokens. Server-side token blacklisting can be added
    here for production (Redis/DB token revocation list).
    """
    # Future: add refresh_token to a revocation list
    return {"success": True, "message": "Logged out successfully"}
