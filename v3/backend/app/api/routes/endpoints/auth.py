"""Authentication endpoints."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.api.routes.deps import DBDependency
from app.models.customer import Customer
from app.schemas.auth import (
    AuthResponse,
    CustomerLoginRequest,
    CustomerRegisterRequest,
    OTPRequest,
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
from app.services.otp import OTPConfigError, TwilioVerifyClient
from app.services.platform_config import PlatformConfigService
from app.core.auth_cookies import (
    clear_customer_auth_cookies,
    get_customer_refresh_token,
    set_customer_auth_cookies,
)

router = APIRouter(prefix="/auth", tags=["authentication"])

logger = logging.getLogger("auth")


async def _require_otp_or_bypass(
    config_svc: PlatformConfigService,
    phone: str,
    otp_code: str | None,
) -> bool:
    """Return True if OTP is satisfied (bypass or Twilio verified).

    If bypass is enabled and no code is supplied, login is allowed (dev/E2E).
    If bypass is enabled and a code is supplied, it must match the bypass code
    or pass Twilio Verify.
    If bypass is disabled, a valid Twilio Verify code is required.
    """
    bypass_enabled = await config_svc.get_bool("otp.bypass_enabled", default=False)
    bypass_code = await config_svc.get_str("otp.bypass_code", default="000000")

    if bypass_enabled and not otp_code:
        # Allow dev/E2E flows that don't send a code when bypass is on.
        return True

    if bypass_enabled and otp_code == bypass_code:
        return True

    if not otp_code:
        return False

    client = TwilioVerifyClient(config_svc)
    if not await client.is_configured():
        raise HTTPException(
            status_code=501,
            detail="OTP provider is not configured. Set otp.bypass_enabled=true for temporary bypass.",
        )

    try:
        result = await client.verify_otp(phone, otp_code)
    except OTPConfigError as exc:
        logger.error("Twilio Verify error during login: %s", exc.message)
        raise HTTPException(
            status_code=500,
            detail="Failed to verify OTP. Please try again later.",
        ) from exc

    return result.get("status") == "approved"


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def customer_register(request: Request, response: Response, db: DBDependency, data: CustomerRegisterRequest):
    """Register a new customer account (passwordless / OTP)."""
    try:
        customer = await register_customer(db, data)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    tokens = await create_customer_tokens(customer)
    set_customer_auth_cookies(response, tokens.access_token, tokens.refresh_token)
    return AuthResponse(
        user_type="customer",
        user_id=customer.id,
        tokens=tokens,
        profile=CustomerProfileOut.model_validate(customer).model_dump(),
    )


@router.post("/login", response_model=AuthResponse)
@limiter.limit("15/minute")
async def customer_login(request: Request, response: Response, db: DBDependency, data: CustomerLoginRequest):
    """Login with phone (OTP-based / passwordless)."""
    config_svc = PlatformConfigService(db)

    if not data.phone_number:
        raise HTTPException(status_code=400, detail="phone_number required")

    result = await db.execute(
        select(Customer).where(
            Customer.phone_number == data.phone_number,
            Customer.deleted_at.is_(None),
        )
    )

    customer = result.scalar_one_or_none()
    is_new = False
    if customer is None and data.phone_number:
        customer = await register_customer(
            db,
            CustomerRegisterRequest(
                phone_number=data.phone_number,
                display_name=data.phone_number,
            ),
        )
        is_new = True
    elif customer is None:
        raise HTTPException(status_code=404, detail="Account not found. Please register.")

    if not customer.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")

    # ── OTP verification for phone login ──
    verified = await _require_otp_or_bypass(config_svc, data.phone_number, data.otp_code)
    if not verified:
        raise HTTPException(status_code=401, detail="Invalid or expired OTP")
    customer.phone_verified_at = datetime.now(timezone.utc)
    await db.commit()

    tokens = await create_customer_tokens(customer)
    set_customer_auth_cookies(response, tokens.access_token, tokens.refresh_token)
    return AuthResponse(
        user_type="customer",
        user_id=customer.id,
        tokens=tokens,
        profile=CustomerProfileOut.model_validate(customer).model_dump(),
        is_new_user=is_new,
    )


@router.post("/refresh", response_model=TokenPair)
@limiter.limit("10/minute")
async def customer_refresh(request: Request, response: Response, db: DBDependency, data: RefreshTokenRequest | None = None):
    """Refresh access token.

    Accepts refresh_token from HttpOnly cookie or request body for backward
    compatibility during the migration away from localStorage tokens.
    """
    cookie_refresh = get_customer_refresh_token(request)
    if cookie_refresh:
        data = RefreshTokenRequest(refresh_token=cookie_refresh)
    elif data is None or not data.refresh_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="refresh_token required")

    try:
        tokens = await refresh_customer_tokens(db, data)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    set_customer_auth_cookies(response, tokens.access_token, tokens.refresh_token)
    return tokens


@router.post("/logout")
async def customer_logout(request: Request, response: Response, db: DBDependency, data: RefreshTokenRequest | None = None):
    """Logout endpoint — blacklists refresh token for server-side revocation.

    In a stateless JWT setup, logout is primarily client-side token
    discard. Server-side blacklisting provides defense-in-depth for
    refresh tokens while they remain valid (up to 7 days).
    """
    refresh_token = (data.refresh_token if data else None) or get_customer_refresh_token(request)
    if refresh_token:
        try:
            from app.core.security import decode_token
            from app.services.auth import blacklist_refresh_token
            payload = decode_token(refresh_token)
            if payload.get("type") != "refresh":
                raise HTTPException(status_code=400, detail="Invalid token type")
            jti = payload.get("jti")
            await blacklist_refresh_token(db, jti, None, payload)
        except HTTPException:
            raise
        except Exception as e:
            logger.warning("Failed to blacklist refresh token: %s", str(e))
    clear_customer_auth_cookies(response)
    return {"success": True, "message": "Logged out successfully"}


@router.post("/send-otp")
@limiter.limit("5/minute")
async def send_otp(request: Request, db: DBDependency, data: OTPRequest):
    """Request an OTP code for phone-based login via Twilio Verify."""
    config_svc = PlatformConfigService(db)
    bypass_enabled = await config_svc.get_bool("otp.bypass_enabled", default=False)

    if bypass_enabled:
        logger.info("OTP send bypassed via platform config")
        return {"success": True, "message": "OTP bypassed"}

    client = TwilioVerifyClient(config_svc)
    if not await client.is_configured():
        raise HTTPException(
            status_code=501,
            detail="OTP provider is not configured. Set otp.bypass_enabled=true for temporary bypass.",
        )

    try:
        await client.send_otp(data.phone_number, channel="sms")
    except OTPConfigError as exc:
        logger.error("Twilio Verify send OTP failed: %s", exc.message)
        raise HTTPException(status_code=500, detail="Failed to send OTP. Please try again later.") from exc

    return {"success": True, "message": "OTP sent"}


@router.post("/resend-otp")
@limiter.limit("3/minute")
async def resend_otp(request: Request, db: DBDependency, data: OTPRequest):
    """Resend an OTP code via Twilio Verify."""
    # Twilio Verify treats resend as a new start request.
    return await send_otp(request, db, data)
