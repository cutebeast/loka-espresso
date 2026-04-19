import random
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

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


@router.post("/send-otp", response_model=SendOTPResponse)
async def send_otp(request: Request, req: SendOTPRequest, db: AsyncSession = Depends(get_db)):
    # Manual rate limiting: read otp_rate_limit from app_config
    # If set to 0, rate limiting is disabled
    from app.models.splash import AppConfig
    cfg_result = await db.execute(select(AppConfig).where(AppConfig.key == "otp_rate_limit"))
    cfg = cfg_result.scalar_one_or_none()
    if cfg and cfg.value and cfg.value != "0":
        # Rate limiting enabled — check limit
        try:
            limit_val = int(cfg.value)
        except (ValueError, TypeError):
            limit_val = 5
        from app.core.security import get_remote_address
        client_ip = get_remote_address(request)
        # Simple in-memory rate limiting per IP (for this process)
        if not hasattr(send_otp, "_rate_cache"):
            send_otp._rate_cache = {}
        now = datetime.now(timezone.utc)
        if client_ip not in send_otp._rate_cache:
            send_otp._rate_cache[client_ip] = []
        # Remove entries older than 1 minute
        send_otp._rate_cache[client_ip] = [
            t for t in send_otp._rate_cache[client_ip]
            if (now - t).total_seconds() < 60
        ]
        if len(send_otp._rate_cache[client_ip]) >= limit_val:
            raise HTTPException(status_code=429, detail="Too many OTP requests. Please try again later.")
        send_otp._rate_cache[client_ip].append(now)

    code = f"{random.randint(0, 999999):06d}"
    otp = OTPSession(
        phone=req.phone,
        code=code,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    )
    db.add(otp)
    await db.flush()
    logger.debug(f"OTP generated for {req.phone[:4]}****")
    return SendOTPResponse(message="OTP sent", phone=req.phone)


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(req: VerifyOTPRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(OTPSession)
        .where(OTPSession.phone == req.phone, OTPSession.verified == False)
        .order_by(OTPSession.created_at.desc())
    )
    otp = result.scalar_one_or_none()
    if not otp or otp.code != req.code:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    if ensure_utc(otp.expires_at) < now_utc():
        raise HTTPException(status_code=400, detail="OTP expired")
    otp.verified = True

    result = await db.execute(select(User).where(User.phone == req.phone))
    user = result.scalar_one_or_none()
    if not user:
        user = User(phone=req.phone, user_type_id=UserTypeIDs.CUSTOMER, role_id=RoleIDs.CUSTOMER)
        db.add(user)
        await db.flush()

    access = create_access_token({"sub": str(user.id)})
    refresh = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(access_token=access, refresh_token=refresh)


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
    await log_action(db, action="LOGIN", user_id=user.id, entity_type="user", entity_id=user.id, details={"email": req.email, "role_id": user.role_id}, ip_address=get_client_ip(request))
    access = create_access_token({"sub": str(user.id)})
    refresh = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(req: RefreshRequest):
    from jose import jwt, JWTError
    from app.core.config import get_settings
    settings = get_settings()
    try:
        payload = jwt.decode(req.refresh_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    access = create_access_token({"sub": str(user_id)})
    refresh = create_refresh_token({"sub": str(user_id)})
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/logout")
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Blacklist the current access token so it cannot be reused."""
    token = credentials.credentials
    try:
        payload = jose_jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        jti = payload.get("jti")
        exp = payload.get("exp")
    except Exception as e:
        logger.debug(f"Token decode failed during logout: {e}")
        jti = None
        exp = None

    if jti and exp:
        from datetime import datetime as dt, timezone
        blacklisted = TokenBlacklist(
            jti=jti,
            user_id=user.id,
            expires_at=dt.fromtimestamp(exp, tz=timezone.utc),
        )
        db.add(blacklisted)

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
