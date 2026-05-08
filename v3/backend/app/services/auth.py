"""Authentication service layer."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models.customer import Customer, CustomerDevice
from app.models.iam import AdminAccount
from app.schemas.auth import (
    AdminLoginRequest,
    CustomerRegisterRequest,
    RefreshTokenRequest,
    TokenPair,
)

settings = get_settings()


class AuthError(Exception):
    """Authentication-related error."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


async def register_customer(
    db: AsyncSession,
    data: CustomerRegisterRequest,
) -> Customer:
    """Register a new customer (passwordless / OTP-based)."""
    # Check for existing email
    if data.email_address:
        existing = await db.execute(
            select(Customer).where(Customer.email_address == data.email_address)
        )
        if existing.scalar_one_or_none():
            raise AuthError("Email already registered", 409)
    
    # Check for existing phone
    if data.phone_number:
        existing = await db.execute(
            select(Customer).where(Customer.phone_number == data.phone_number)
        )
        if existing.scalar_one_or_none():
            raise AuthError("Phone number already registered", 409)
    
    # Create customer (no password — OTP auth)
    customer = Customer(
        email_address=data.email_address,
        phone_number=data.phone_number,
        display_name=data.display_name,
        is_active=True,
        order_count=0,
        lifetime_value=0.0,
    )
    db.add(customer)
    await db.flush()  # Get customer.id
    
    # Create device record if fingerprint provided
    if data.device_fingerprint:
        device = CustomerDevice(
            customer_id=customer.id,
            device_fingerprint=data.device_fingerprint,
            platform="web",
            is_active=True,
        )
        db.add(device)
    
    await db.commit()
    await db.refresh(customer)
    return customer


async def create_customer_tokens(customer: Customer) -> TokenPair:
    """Generate JWT token pair for a customer."""
    extra = {
        "customer_id": customer.id,
        "display_name": customer.display_name,
    }
    access = create_access_token(
        subject=str(customer.id),
        extra_claims=extra,
    )
    refresh = create_refresh_token(
        subject=str(customer.id),
        extra_claims=extra,
    )
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.jwt_expire_minutes * 60,
    )


async def refresh_customer_tokens(
    db: AsyncSession,
    data: RefreshTokenRequest,
) -> TokenPair:
    """Refresh access token using refresh token."""
    try:
        payload = decode_token(data.refresh_token)
    except Exception as exc:
        raise AuthError("Invalid refresh token", 401) from exc
    
    if payload.get("type") != "refresh":
        raise AuthError("Invalid token type", 401)
    
    customer_id = int(payload.get("sub", 0))
    result = await db.execute(
        select(Customer).where(Customer.id == customer_id)
    )
    customer = result.scalar_one_or_none()
    
    if customer is None or customer.deleted_at is not None:
        raise AuthError("Customer not found", 401)
    
    return await create_customer_tokens(customer)


async def login_admin(
    db: AsyncSession,
    data: AdminLoginRequest,
) -> AdminAccount:
    """Authenticate admin by email and password."""
    result = await db.execute(
        select(AdminAccount).where(AdminAccount.email == data.email)
    )
    admin = result.scalar_one_or_none()
    
    if admin is None:
        raise AuthError("Invalid email or password", 401)
    
    if admin.deleted_at is not None:
        raise AuthError("Account deactivated", 401)
    
    if admin.locked_until and admin.locked_until > datetime.now(timezone.utc):
        raise AuthError("Account is locked", 403)
    
    if not verify_password(data.password, admin.password_hash):
        admin.failed_login_count += 1
        if admin.failed_login_count >= 5:
            admin.locked_until = datetime.now(timezone.utc) + timedelta(minutes=30)
        await db.commit()
        raise AuthError("Invalid email or password", 401)
    
    # Reset failed login count on success
    admin.failed_login_count = 0
    admin.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(admin)
    return admin


async def create_admin_tokens(admin: AdminAccount) -> TokenPair:
    """Generate JWT token pair for an admin."""
    extra = {
        "admin_id": admin.id,
        "principal_id": admin.principal_id,
        "email": admin.email,
        "display_name": admin.display_name,
    }
    access = create_access_token(
        subject=str(admin.id),
        extra_claims=extra,
    )
    refresh = create_refresh_token(
        subject=str(admin.id),
        extra_claims=extra,
    )
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.jwt_expire_minutes * 60,
    )


async def refresh_admin_tokens(
    db: AsyncSession,
    data: RefreshTokenRequest,
) -> TokenPair:
    """Refresh admin access token using refresh token."""
    try:
        payload = decode_token(data.refresh_token)
    except Exception as exc:
        raise AuthError("Invalid refresh token", 401) from exc
    
    if payload.get("type") != "refresh":
        raise AuthError("Invalid token type", 401)
    
    admin_id = int(payload.get("sub", 0))
    result = await db.execute(
        select(AdminAccount).where(AdminAccount.id == admin_id)
    )
    admin = result.scalar_one_or_none()
    
    if admin is None or admin.deleted_at is not None:
        raise AuthError("Admin not found", 401)
    
    return await create_admin_tokens(admin)
