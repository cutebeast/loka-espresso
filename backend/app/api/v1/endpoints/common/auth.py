import random
import logging
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select

from app.core.database import get_db
from app.core.security import (
    create_access_token, create_refresh_token, verify_password,
    hash_password, get_current_user, now_utc, ensure_utc,
)
from app.core.config import get_settings
from app.core.audit import log_action, get_client_ip
from app.models.user import User, OTPSession, TokenBlacklist, UserTypeIDs, RoleIDs
from app.models.customer import CustomerDeviceToken, Customer
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt as pyjwt
from jwt import PyJWTError
from slowapi import Limiter
from slowapi.util import get_remote_address

# Use a module-level limiter — must be the SAME instance registered in main.py
# via app.state.limiter. We create it here and main.py will import and assign it.
limiter = Limiter(key_func=get_remote_address)

logger = logging.getLogger(__name__)
settings = get_settings()
_bearer = HTTPBearer()

# Cookie settings for httpOnly auth tokens
_COOKIE_SECURE = settings.ENVIRONMENT in ("production", "staging")
_COOKIE_SAMESITE = "Strict"
_COOKIE_ACCESS_MAX_AGE = int(settings.JWT_EXPIRE_MINUTES * 60)
_COOKIE_REFRESH_MAX_AGE = 30 * 24 * 60 * 60  # 30 days

def _set_auth_cookies(response: JSONResponse, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite=_COOKIE_SAMESITE,
        max_age=_COOKIE_ACCESS_MAX_AGE,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite=_COOKIE_SAMESITE,
        max_age=_COOKIE_REFRESH_MAX_AGE,
        path="/",
    )

def _clear_auth_cookies(response: JSONResponse) -> None:
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")

from app.schemas.auth import (
    SendOTPRequest, SendOTPResponse, VerifyOTPRequest, TokenResponse,
    RegisterRequest, LoginPasswordRequest, RefreshRequest, DeviceTokenRequest,
)
from app.schemas.user import UserOut

router = APIRouter(prefix="/auth", tags=["Auth"])

OTP_TTL_SECONDS = 300
OTP_RESEND_SECONDS = 60
OTP_WINDOW_MINUTES = 15
OTP_MAX_SENDS_PER_WINDOW = 3
OTP_MAX_VERIFY_ATTEMPTS = 3


def _normalize_phone(phone: str) -> str:
    """Normalize a phone number to E.164 format.
    
    - '+'-prefixed numbers (E.164) pass through as-is (multi-country support).
    - '0'-prefixed numbers are treated as Malaysian local format and
      converted to '+60...' for backward compatibility (frontend country
      selector always sends E.164; this branch covers raw API callers).
    - Plain digit strings get a '+' prefix.
    """
    phone = phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")
    # E.164 — already has country code, pass through
    if phone.startswith('+'):
        return phone
    # Legacy Malaysian local format (0XX...) → +60X...
    if phone.startswith('0'):
        return '+6' + phone
    # Plain digits — prepend '+'
    if phone.isdigit():
        return '+' + phone
    return phone


def _validate_phone(phone: str) -> None:
    """Basic phone validation — raise if clearly invalid."""
    digits = ''.join(c for c in phone if c.isdigit())
    if len(digits) < 8 or len(digits) > 15:
        raise HTTPException(status_code=400, detail="Invalid phone number")


async def _blacklist_token(token: str, user_id: int, db: AsyncSession) -> None:
    """Extract jti from token and insert into token_blacklist. No-op if already blacklisted or decode fails."""
    if not token:
        return
    try:
        payload = pyjwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except PyJWTError:
        return
    jti = payload.get("jti")
    if not jti:
        return
    existing = await db.execute(select(TokenBlacklist).where(TokenBlacklist.jti == jti))
    if existing.scalar_one_or_none():
        return
    user_type: Optional[str] = payload.get("user_type")
    expires_at = payload.get("exp")
    expires_dt = datetime.fromtimestamp(expires_at, tz=timezone.utc) if expires_at else datetime.now(timezone.utc) + timedelta(days=30)
    bl = TokenBlacklist(jti=jti, user_id=user_id, user_type=user_type, expires_at=expires_dt)
    db.add(bl)


@router.get("/session")
async def check_session(request: Request, db: AsyncSession = Depends(get_db)):
    """Soft session check — returns 200 always, never 401. Used by frontend on page load to avoid browser console errors."""
    token = request.cookies.get("access_token")
    if not token:
        return JSONResponse({"authenticated": False})
    try:
        payload = pyjwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            return JSONResponse({"authenticated": False})
        jti = payload.get("jti")
        if jti:
            bl_result = await db.execute(select(TokenBlacklist).where(TokenBlacklist.jti == jti))
            if bl_result.scalar_one_or_none():
                return JSONResponse({"authenticated": False})
        return JSONResponse({"authenticated": True})
    except PyJWTError:
        return JSONResponse({"authenticated": False})


@router.post("/send-otp", response_model=SendOTPResponse)
async def send_otp(request: Request, req: SendOTPRequest, db: AsyncSession = Depends(get_db)):
    req.phone = _normalize_phone(req.phone)
    _validate_phone(req.phone)

    from app.models.splash import AppConfig
    cfg_result = await db.execute(select(AppConfig).where(AppConfig.key == "otp_rate_limit"))
    cfg = cfg_result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if cfg and cfg.value and cfg.value != "0":
        try:
            limit_val = int(cfg.value)
        except (ValueError, TypeError):
            limit_val = 5
        client_ip = request.client.host if request.client else "unknown"
        if not hasattr(send_otp, "_rate_cache"):
            send_otp._rate_cache = {}
        if client_ip not in send_otp._rate_cache:
            send_otp._rate_cache[client_ip] = []
        send_otp._rate_cache[client_ip] = [
            t for t in send_otp._rate_cache[client_ip]
            if (now - t).total_seconds() < 60
        ]
        if len(send_otp._rate_cache[client_ip]) >= limit_val:
            raise HTTPException(status_code=429, detail="Too many OTP requests. Please try again later.")
        send_otp._rate_cache[client_ip].append(now)

    recent_window = now - timedelta(minutes=OTP_WINDOW_MINUTES)
    recent_count_result = await db.execute(
        select(func.count())
        .select_from(OTPSession)
        .where(OTPSession.phone == req.phone, OTPSession.created_at >= recent_window)
    )
    recent_count = recent_count_result.scalar() or 0
    if recent_count >= OTP_MAX_SENDS_PER_WINDOW:
        raise HTTPException(
            status_code=429,
            detail=f"Too many OTP requests for this number. Try again in {OTP_WINDOW_MINUTES} minutes.",
        )

    latest_result = await db.execute(
        select(OTPSession)
        .where(OTPSession.phone == req.phone, OTPSession.verified == False)
        .order_by(OTPSession.created_at.desc())
        .limit(1)
    )
    latest = latest_result.scalar_one_or_none()
    if latest and latest.resend_available_at:
        available_at = latest.resend_available_at
        if available_at.tzinfo is None:
            available_at = available_at.replace(tzinfo=timezone.utc)
        remaining = int((available_at - now).total_seconds())
        if remaining > 0:
            raise HTTPException(status_code=429, detail=f"Please wait {remaining}s before requesting another code")

    code = f"{random.randint(0, 999999):06d}"

    # Send via Twilio if configured
    from app.services.sms import get_sms_service
    sms = get_sms_service()
    sms_result = sms.send_otp(req.phone, code)
    provider = "twilio" if sms_result["sent"] else "stub"
    delivery_status = "sent" if sms_result["sent"] else "queued"
    twilio_sid = sms_result.get("sid")

    otp = OTPSession(
        phone=req.phone,
        session_token=uuid.uuid4().hex,
        code=code,
        send_count=1,
        verify_attempts=0,
        resend_available_at=now + timedelta(seconds=OTP_RESEND_SECONDS),
        expires_at=now + timedelta(seconds=OTP_TTL_SECONDS),
        provider=provider,
        delivery_status=delivery_status,
    )
    db.add(otp)
    await db.flush()
    logger.debug(f"OTP generated for {req.phone[:4]}****")
    return SendOTPResponse(
        message="OTP sent",
        phone=req.phone,
        session_id=otp.session_token,
        retry_after_seconds=OTP_RESEND_SECONDS,
        expires_in_seconds=OTP_TTL_SECONDS,
    )


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(req: VerifyOTPRequest, db: AsyncSession = Depends(get_db)):
    req.phone = _normalize_phone(req.phone)
    _validate_phone(req.phone)
    # ---- OTP bypass (controlled by admin DB toggle) -----------------------
    bypass_enabled = False
    bypass_code = None
    try:
        from app.models.splash import AppConfig
        cfg_result = await db.execute(
            select(AppConfig).where(AppConfig.key == "otp_bypass_enabled")
        )
        cfg = cfg_result.scalar_one_or_none()
        if cfg and cfg.value and cfg.value.strip().lower() == 'true':
            bypass_enabled = True
        cfg_result = await db.execute(
            select(AppConfig).where(AppConfig.key == "otp_bypass_code")
        )
        cfg = cfg_result.scalar_one_or_none()
        if cfg and cfg.value:
            bypass_code = cfg.value.strip()
    except Exception:
        pass

    if bypass_enabled and bypass_code and req.code == bypass_code:
        logger.warning(
            f"OTP bypass used (DEV) for {req.phone[:4]}****"
        )
    else:
        query = (
            select(OTPSession)
            .where(OTPSession.phone == req.phone, OTPSession.verified == False)
            .order_by(OTPSession.created_at.desc())
            .limit(1)
        )
        if req.session_id:
            query = query.where(OTPSession.session_token == req.session_id)
        result = await db.execute(query)
        otp = result.scalar_one_or_none()
        if not otp:
            raise HTTPException(status_code=400, detail="OTP session not found or already used")
        if otp.verify_attempts >= OTP_MAX_VERIFY_ATTEMPTS:
            raise HTTPException(status_code=429, detail="Too many invalid OTP attempts. Please request a new code")
        if ensure_utc(otp.expires_at) < now_utc():
            otp.failure_reason = "expired"
            raise HTTPException(status_code=400, detail="OTP expired")
        if otp.code != req.code:
            otp.verify_attempts += 1
            remaining_attempts = OTP_MAX_VERIFY_ATTEMPTS - otp.verify_attempts
            if remaining_attempts <= 0:
                otp.failure_reason = "max_attempts_exceeded"
                raise HTTPException(status_code=429, detail="Too many invalid OTP attempts. Please request a new code")
            raise HTTPException(status_code=400, detail=f"Invalid OTP. {remaining_attempts} attempt(s) left")
        otp.verified = True
        otp.verified_at = now_utc()
        otp.delivery_status = "verified"
        otp.failure_reason = None

    from app.models.customer import Customer
    result = await db.execute(select(Customer).where(Customer.phone == req.phone))
    user = result.scalar_one_or_none()
    is_new_user = user is None
    if is_new_user:
        user = Customer(phone=req.phone)
        db.add(user)
        await db.flush()
    # Treat first-time login (no name set yet) as "new user" too, so the
    # profile-setup screen runs even if the User row was pre-created via
    # the admin or a re-installed device.
    elif not user.name:
        is_new_user = True
    user.phone_verified = True

    access = create_access_token({"sub": str(user.id), "user_type": "customer"})
    refresh = create_refresh_token({"sub": str(user.id), "user_type": "customer"})
    response = JSONResponse(content={
        "is_new_user": is_new_user,
    })
    _set_auth_cookies(response, access, refresh)
    return response


@router.post("/register", response_model=UserOut)
async def register(request: Request, req: RegisterRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if req.name:
        user.name = req.name
    if req.email:
        from app.models.customer import Customer
        existing = await db.execute(select(Customer).where(Customer.email == req.email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")
        user.email = req.email
    await db.flush()
    return user


@router.post("/login-password", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login_password(request: Request, req: LoginPasswordRequest, db: AsyncSession = Depends(get_db)):
    from app.models.admin_user import AdminUser
    result = await db.execute(select(AdminUser).where(AdminUser.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(req.password, user.password_hash):
        # Log failed login attempt
        if user:
            await log_action(db, action="LOGIN_FAILED", user_id=user.id, entity_type="user", details={"email": req.email}, status="failed", ip_address=get_client_ip(request))
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")
    await log_action(db, action="LOGIN", user_id=user.id, entity_type="user", entity_id=user.id, details={"email": req.email, "role_id": user.role_id}, ip_address=get_client_ip(request))
    access = create_access_token({"sub": str(user.id), "user_type": "admin"})
    refresh = create_refresh_token({"sub": str(user.id), "user_type": "admin"})
    response = JSONResponse(content={"message": "Login successful", "access_token": access, "refresh_token": refresh})
    _set_auth_cookies(response, access, refresh)
    return response


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
async def refresh_token(request: Request, req: RefreshRequest | None = None, db: AsyncSession = Depends(get_db)):
    from app.core.config import get_settings
    settings = get_settings()

    # Accept refresh token from body or httpOnly cookie
    refresh_token_value = req.refresh_token if req else None
    if not refresh_token_value:
        refresh_token_value = request.cookies.get("refresh_token")
    if not refresh_token_value:
        raise HTTPException(status_code=401, detail="Refresh token required")

    try:
        payload = pyjwt.decode(
            refresh_token_value,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            issuer=settings.JWT_ISSUER,
            audience=settings.JWT_AUDIENCE,
        )
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = payload.get("sub")
        user_type = payload.get("user_type")
        jti = payload.get("jti")
        exp = payload.get("exp")
    except PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if not user_id or not jti or not exp:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    existing = await db.execute(select(TokenBlacklist).where(TokenBlacklist.jti == jti))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")

    # Polymorphic lookup
    user = None
    if user_type == "admin":
        from app.models.admin_user import AdminUser
        user_result = await db.execute(select(AdminUser).where(AdminUser.id == int(user_id)))
        user = user_result.scalar_one_or_none()
    elif user_type == "customer":
        from app.models.customer import Customer
        user_result = await db.execute(select(Customer).where(Customer.id == int(user_id)))
        user = user_result.scalar_one_or_none()
    else:
        # Legacy: try admin first
        from app.models.admin_user import AdminUser
        from app.models.customer import Customer
        user_result = await db.execute(select(AdminUser).where(AdminUser.id == int(user_id)))
        user = user_result.scalar_one_or_none()
        if not user:
            user_result = await db.execute(select(Customer).where(Customer.id == int(user_id)))
            user = user_result.scalar_one_or_none()
        user_type = "admin" if hasattr(user, 'password_hash') and user.password_hash else "customer"

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    await _blacklist_token(refresh_token_value, user.id, db)
    access = create_access_token({"sub": str(user_id), "user_type": user_type or "customer"})
    refresh = create_refresh_token({"sub": str(user_id), "user_type": user_type or "customer"})
    response = JSONResponse(content={"message": "Token refreshed"})
    _set_auth_cookies(response, access, refresh)
    return response


@router.post("/logout")
async def logout(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Blacklist the current access token and optional refresh token."""
    token = credentials.credentials if credentials else None
    if not token:
        token = request.cookies.get("access_token")
    await _blacklist_token(token, user.id, db)
    refresh_token = request.headers.get("X-Refresh-Token") or request.cookies.get("refresh_token")
    await _blacklist_token(refresh_token, user.id, db)

    response = JSONResponse(content={"message": "Logged out"})
    _clear_auth_cookies(response)
    return response


@router.post("/device-token")
async def register_device_token(req: DeviceTokenRequest, user: Customer = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CustomerDeviceToken).where(CustomerDeviceToken.customer_id == user.id, CustomerDeviceToken.token == req.token)
    )
    existing = result.scalar_one_or_none()
    if not existing:
        dt = CustomerDeviceToken(customer_id=user.id, token=req.token, platform=req.platform)
        db.add(dt)
        await db.flush()
    return {"message": "Device token registered"}


@router.delete("/device-token")
async def unregister_device_token(token: str, user: Customer = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CustomerDeviceToken).where(CustomerDeviceToken.customer_id == user.id, CustomerDeviceToken.token == token)
    )
    dt = result.scalar_one_or_none()
    if dt:
        await db.delete(dt)
        await db.flush()
    return {"message": "Device token removed"}


from pydantic import BaseModel


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
async def change_password(
    request: Request,
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if len(body.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    if not hasattr(user, 'password_hash') or not user.password_hash:
        raise HTTPException(400, "This account does not use password authentication")
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    ip = get_client_ip(request)
    await log_action(db, action="CHANGE_PASSWORD", user_id=user.id, entity_type="user", entity_id=user.id, details={"ip": ip}, ip_address=ip)
    await db.flush()
    return {"message": "Password changed successfully"}
