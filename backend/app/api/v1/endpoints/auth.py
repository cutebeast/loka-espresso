import random
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import (
    create_access_token, create_refresh_token, verify_password,
    hash_password, get_current_user,
)
from app.models.user import User, OTPSession, DeviceToken, UserRole
from app.schemas.auth import (
    SendOTPRequest, SendOTPResponse, VerifyOTPRequest, TokenResponse,
    RegisterRequest, LoginPasswordRequest, RefreshRequest, DeviceTokenRequest,
)
from app.schemas.user import UserOut

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/send-otp", response_model=SendOTPResponse)
async def send_otp(req: SendOTPRequest, db: AsyncSession = Depends(get_db)):
    code = f"{random.randint(0, 999999):06d}"
    otp = OTPSession(
        phone=req.phone,
        code=code,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    )
    db.add(otp)
    await db.flush()
    print(f"[OTP] {req.phone} -> {code}")
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
    if otp.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OTP expired")
    otp.verified = True

    result = await db.execute(select(User).where(User.phone == req.phone))
    user = result.scalar_one_or_none()
    if not user:
        user = User(phone=req.phone, role=UserRole.customer)
        db.add(user)
        await db.flush()

    access = create_access_token({"sub": str(user.id)})
    refresh = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/register", response_model=UserOut)
async def register(req: RegisterRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
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
async def login_password(req: LoginPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
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
async def logout(user: User = Depends(get_current_user)):
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
