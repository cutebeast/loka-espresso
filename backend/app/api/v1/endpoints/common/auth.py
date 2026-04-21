import random
import logging
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select

from app.core.database import get_db
from app.core.security import (
    create_access_token, create_refresh_token, verify_password,
    hash_password, get_current_user, now_utc, ensure_utc,
)
from app.core.config import get_settings
from app.core.audit import log_action, get_client_ip
from app.models.user import User, OTPSession, DeviceToken, TokenBlacklist, UserTypeIDs, RoleIDs
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt as jose_jwt
from slowapi import Limiter
from slowapi.util import get_remote_address

# Use a module-level limiter — must be the SAME instance registered in main.py
# via app.state.limiter. We create it here and main.py will import and assign it.
limiter = Limiter(key_func=get_remote_address)

logger = logging.getLogger(__name__)
settings = get_settings()
_bearer = HTTPBearer()
from app.schemas.auth import (
    SendOTPRequest, SendOTPResponse, VerifyOTPRequest, TokenResponse,
    RegisterRequest, LoginPasswordRequest, RefreshRequest, DeviceTokenRequest,
)
from app.schemas.user import UserOut

router = APIRouter(prefix="/auth", tags=["Auth"])

OTP_TTL_SECONDS = 300
OTP_RESEND_SECONDS = 60
OTP_MAX_VERIFY_ATTEMPTS = 5
OTP_MAX_SENDS_PER_WINDOW = 3
OTP_WINDOW_MINUTES = 5


def _normalize_phone(phone: str) -> str:
    """Normalize Malaysian phone numbers to +60XXXXXXXXX format."""
    digits = ''.join(c for c in phone if c.isdigit())
    if digits.startswith('600'):
        return '+60' + digits[3:]  # +600102905388 → +60102905388
    if digits.startswith('60'):
        return '+' + digits  # 60102905388 → +60102905388
    if digits.startswith('01'):
        return '+6' + digits  # 0102905388 → +60102905388
    if digits.startswith('1'):
        return '+60' + digits  # 102905388 → +60102905388
    return '+60' + digits


def _validate_phone(phone: str) -> None:
    digits = ''.join(c for c in phone if c.isdigit())
    if not digits.startswith('60') or len(digits) < 10 or len(digits) > 12:
        raise HTTPException(status_code=400, detail="Please enter a valid Malaysian mobile number")


async def _blacklist_token(raw_token: str | None, user_id: int, db: AsyncSession) -> None:
    if not raw_token:
        return
    try:
        payload = jose_jwt.decode(raw_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        jti = payload.get("jti")
        exp = payload.get("exp")
    except Exception as exc:
        logger.debug(f"Token decode failed during blacklist: {exc}")
        return

    if not jti or not exp:
        return

    existing = await db.execute(select(TokenBlacklist).where(TokenBlacklist.jti == jti))
    if existing.scalar_one_or_none():
        return

    db.add(
        TokenBlacklist(
            jti=jti,
            user_id=user_id,
            expires_at=datetime.fromtimestamp(exp, tz=timezone.utc),
        )
    )


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
    otp = OTPSession(
        phone=req.phone,
        session_token=uuid.uuid4().hex,
        code=code,
        send_count=1,
        verify_attempts=0,
        resend_available_at=now + timedelta(seconds=OTP_RESEND_SECONDS),
        expires_at=now + timedelta(seconds=OTP_TTL_SECONDS),
        provider="stub",
        delivery_status="queued",
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
    # ---- OTP bypass (DEV / STAGING ONLY) ----------------------------------
    # Two gates must both be true for the bypass code to be honoured:
    #   1. settings.OTP_BYPASS_ALLOWED  (env-driven – set to false in prod)
    #   2. AppConfig['otp_bypass_enabled'] == 'true' (admin toggle)
    # This means a forgotten admin toggle in production cannot let attackers
    # bypass auth as long as OTP_BYPASS_ALLOWED=false in the prod .env.
    bypass_enabled = False
    bypass_code = None
    if settings.OTP_BYPASS_ALLOWED:
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

    result = await db.execute(select(User).where(User.phone == req.phone))
    user = result.scalar_one_or_none()
    is_new_user = user is None
    if is_new_user:
        user = User(
            phone=req.phone,
            user_type_id=UserTypeIDs.CUSTOMER,
            role_id=RoleIDs.CUSTOMER,
        )
        db.add(user)
        await db.flush()
    # Treat first-time login (no name set yet) as "new user" too, so the
    # profile-setup screen runs even if the User row was pre-created via
    # the admin or a re-installed device.
    elif not user.name:
        is_new_user = True
    user.phone_verified = True

    access = create_access_token({"sub": str(user.id)})
    refresh = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        token=access,
        refreshToken=refresh,
        is_new_user=is_new_user,
    )


@router.post("/register", response_model=UserOut)
async def register(request: Request, req: RegisterRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if req.name:
        user.name = req.name
    if req.email:
        existing = await db.execute(select(User).where(User.email == req.email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")
        user.email = req.email
    await db.flush()
    return user


@router.post("/login-password", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login_password(request: Request, req: LoginPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(req.password, user.password_hash):
        # Log failed login attempt
        if user:
            await log_action(db, action="LOGIN_FAILED", user_id=user.id, entity_type="user", details={"email": req.email}, status="failed", ip_address=get_client_ip(request))
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")
    await log_action(db, action="LOGIN", user_id=user.id, entity_type="user", entity_id=user.id, details={"email": req.email, "role_id": user.role_id}, ip_address=get_client_ip(request))
    access = create_access_token({"sub": str(user.id)})
    refresh = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(access_token=access, refresh_token=refresh, token=access, refreshToken=refresh)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    from jose import jwt, JWTError
    from app.core.config import get_settings
    settings = get_settings()
    try:
        payload = jwt.decode(req.refresh_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = payload.get("sub")
        jti = payload.get("jti")
        exp = payload.get("exp")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if not user_id or not jti or not exp:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    existing = await db.execute(select(TokenBlacklist).where(TokenBlacklist.jti == jti))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")

    user_result = await db.execute(select(User).where(User.id == int(user_id)))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    await _blacklist_token(req.refresh_token, user.id, db)
    access = create_access_token({"sub": str(user_id)})
    refresh = create_refresh_token({"sub": str(user_id)})
    return TokenResponse(access_token=access, refresh_token=refresh, token=access, refreshToken=refresh)


@router.post("/logout")
async def logout(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Blacklist the current access token and optional refresh token."""
    token = credentials.credentials
    await _blacklist_token(token, user.id, db)
    refresh_token = request.headers.get("X-Refresh-Token")
    await _blacklist_token(refresh_token, user.id, db)

    return {"message": "Logged out"}


@router.post("/device-token")
async def register_device_token(req: DeviceTokenRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DeviceToken).where(DeviceToken.user_id == user.id, DeviceToken.token == req.token)
    )
    existing = result.scalar_one_or_none()
    if not existing:
        dt = DeviceToken(user_id=user.id, token=req.token, platform=req.platform)
        db.add(dt)
        await db.flush()
    return {"message": "Device token registered"}


@router.delete("/device-token")
async def unregister_device_token(token: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DeviceToken).where(DeviceToken.user_id == user.id, DeviceToken.token == token)
    )
    dt = result.scalar_one_or_none()
    if dt:
        await db.delete(dt)
        await db.flush()
    return {"message": "Device token removed"}
