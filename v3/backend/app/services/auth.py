"""Authentication service layer."""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models.customer import Customer, CustomerDevice, ReferralEvent
from app.models.iam import AdminAccount, TokenBlacklist
from app.models.wallet import Wallet
from app.models.loyalty import LoyaltyAccount
from app.schemas.auth import (
    AdminLoginRequest,
    CustomerRegisterRequest,
    RefreshTokenRequest,
    TokenPair,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)

settings = get_settings()

# Precomputed argon2id hash of a dummy password, verified (and discarded) when
# an admin login email is unknown so the response time converges with the
# real-account path — without it, unknown emails return ~10x faster, which is
# a live account-enumeration oracle.
DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=4$o3KG7WdImIqSPHWbpO6v/g$eaUmlioy5OCd+0N6vwr/d3oe8hb+PotHUtrpj9NjKiw"


class AuthError(Exception):
    """Authentication-related error."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


async def _bump_token_version(db: AsyncSession, model, principal_id: int) -> None:
    """Bump a principal's token_version, revoking its whole session family.

    Called when reuse of an already-blacklisted refresh token is detected —
    the token was stolen, so every access/refresh token minted for this
    principal must die, not just the replayed one.
    """
    result = await db.execute(select(model).where(model.id == principal_id))
    principal = result.scalar_one_or_none()
    if principal is not None:
        principal.token_version = (principal.token_version or 0) + 1
        await db.commit()


async def blacklist_refresh_token(
    db: AsyncSession,
    jti: str | None,
    principal_id: int,
    payload: dict,
    reason: str = "refresh_token_reuse",
) -> None:
    """Insert a refresh token JTI into the blacklist. Raises 401 if already blacklisted."""
    if not jti:
        return
    exp_ts = payload.get("exp")
    expires_at = datetime.fromtimestamp(exp_ts, tz=timezone.utc) if exp_ts else datetime.now(timezone.utc) + timedelta(days=7)
    stmt = pg_insert(TokenBlacklist).values(
        jti=jti,
        token_type="refresh",
        principal_id=None,  # avoid FK issues for deleted principals / customers
        expires_at=expires_at,
        reason=reason,
    ).on_conflict_do_nothing(index_elements=["jti"])
    result = await db.execute(stmt)
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=401, detail="Refresh token has already been used")


async def register_customer(
    db: AsyncSession,
    data: CustomerRegisterRequest,
) -> Customer:
    """Register a new customer (passwordless / OTP-based)."""

    import secrets
    referral_code = "LOKA" + secrets.token_hex(3).upper()
    for _ in range(5):
        existing = await db.execute(select(Customer).where(Customer.referral_code == referral_code))
        if not existing.scalar_one_or_none():
            break
        referral_code = "LOKA" + secrets.token_hex(3).upper()

    customer = Customer(
        email_address=data.email_address,
        phone_number=data.phone_number,
        display_name=data.display_name,
        referral_code=referral_code,
        is_active=True,
        order_count=0,
        lifetime_value=0.0,
    )
    db.add(customer)
    await db.flush()  # Get customer.id

    # Record referral if the customer signed up via a referrer's code (?ref=CODE).
    # Unknown codes are ignored — a bad ref link must not block registration.
    if data.referral_code:
        ref_code = data.referral_code.strip().upper()
        referrer_result = await db.execute(
            select(Customer).where(Customer.referral_code == ref_code)
        )
        referrer = referrer_result.scalar_one_or_none()
        if referrer is not None:
            customer.referred_by_customer_id = referrer.id
            db.add(ReferralEvent(
                referrer_customer_id=referrer.id,
                invitee_customer_id=customer.id,
                referral_code=ref_code,
                status="pending",  # converted on the invitee's first paid order
            ))

    # Auto-create wallet for new customer
    from app.models.platform import PlatformConfig
    currency_result = await db.execute(
        select(PlatformConfig.config_value).where(PlatformConfig.config_key == "currency.default")
    )
    currency_row = currency_result.scalar_one_or_none()
    default_currency = str(currency_row) if currency_row else "USD"
    wallet = Wallet(
        customer_id=customer.id,
        currency_code=default_currency,
    )
    db.add(wallet)
    
    # Auto-create loyalty account for new customer (lowest tier)
    from app.models.loyalty import LoyaltyPointsLedger
    from app.services.commerce import get_default_tier_id
    default_tier = await get_default_tier_id(db)
    loyalty = LoyaltyAccount(
        customer_id=customer.id,
        current_tier_id=default_tier,
        points_balance=0,
        lifetime_points_earned=0,
    )
    db.add(loyalty)
    await db.flush()
    
    # Credit welcome reward (config-driven: points and/or voucher)
    try:
        from app.models.platform import PlatformConfig
        result = await db.execute(
            select(PlatformConfig).where(PlatformConfig.config_key.in_([
                "loyalty.welcome_bonus",
                "loyalty.welcome_reward_type",
                "loyalty.welcome_reward_voucher_code",
            ]))
        )
        cfg = {c.config_key: c.config_value for c in result.scalars().all()}
        reward_type = str(cfg.get("loyalty.welcome_reward_type") or "voucher")
        welcome_pts = int(cfg.get("loyalty.welcome_bonus") or 50)
    except Exception:
        reward_type = "voucher"
        welcome_pts = 50

    if reward_type in ("points", "points_and_voucher"):
        ledger = LoyaltyPointsLedger(
            loyalty_account_id=loyalty.id,
            customer_id=customer.id,
            event_type="welcome_bonus",
            points_delta=welcome_pts,
            running_balance=welcome_pts,
            description=f"Welcome bonus: {welcome_pts} points",
        )
        loyalty.points_balance = welcome_pts
        loyalty.lifetime_points_earned = welcome_pts
        db.add(ledger)

    if reward_type in ("voucher", "points_and_voucher"):
        # Welcome reward voucher per program structure (RM5 off first purchase)
        from app.services.commerce import grant_voucher_to_customer
        voucher_code = str(cfg.get("loyalty.welcome_reward_voucher_code") or "WELCOME-RM5")
        await grant_voucher_to_customer(db, customer.id, voucher_code, source="welcome_reward")

    # Day-one discovery: inbox message so the new member actually sees their
    # welcome gift (drives the notification bell badge + inbox card).
    try:
        from app.models.notification import NotificationMessage
        gift_parts: list[str] = []
        if reward_type in ("points", "points_and_voucher"):
            gift_parts.append(f"{welcome_pts} bonus points")
        if reward_type in ("voucher", "points_and_voucher"):
            from app.models.voucher import VoucherDefinition
            vd_result = await db.execute(
                select(VoucherDefinition.display_title).where(
                    VoucherDefinition.voucher_code == voucher_code
                )
            )
            gift_parts.append(vd_result.scalar_one_or_none() or "a welcome voucher")
        if gift_parts:
            db.add(NotificationMessage(
                customer_id=customer.id,
                message_type="loyalty",
                title="Welcome to LOKA Espresso",
                body=f"Your welcome gift is here: {' and '.join(gift_parts)}. Find it in My Rewards.",
                action_url="#my-rewards",
            ))
    except Exception:
        logger.warning("Failed to create welcome notification for customer %s", customer.id, exc_info=True)
    
    # Create device record if fingerprint provided
    if data.device_fingerprint:
        device = CustomerDevice(
            customer_id=customer.id,
            device_fingerprint=data.device_fingerprint,
            platform="web",
            is_active=True,
        )
        db.add(device)
    
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        if data.email_address:
            email_check = await db.execute(select(Customer.id).where(Customer.email_address == data.email_address))
            if email_check.scalar_one_or_none():
                raise AuthError("Email already registered", 409)
        if data.phone_number:
            phone_check = await db.execute(select(Customer.id).where(Customer.phone_number == data.phone_number))
            if phone_check.scalar_one_or_none():
                raise AuthError("Phone number already registered", 409)
        raise AuthError("Duplicate customer", 409)
    await db.refresh(customer)
    return customer


async def create_customer_tokens(customer: Customer) -> TokenPair:
    """Generate JWT token pair for a customer."""
    extra = {
        "customer_id": customer.id,
        "display_name": customer.display_name,
        "token_version": customer.token_version or 0,
    }
    access = create_access_token(
        subject=str(customer.id),
        extra_claims=extra,
    )
    refresh = create_refresh_token(
        subject=str(customer.id),
        extra_claims=extra,
        days=90,  # app-like PWA session; sliding rotation keeps active customers signed in
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
    """Refresh access token using refresh token. One-time use — old token is revoked."""
    try:
        payload = decode_token(data.refresh_token)
    except Exception as exc:
        raise AuthError("Invalid refresh token", 401) from exc
    
    if payload.get("type") != "refresh":
        raise AuthError("Invalid token type", 401)

    # Domain check: only genuine customer refresh tokens carry a customer_id
    # claim. Without this, any admin/staff refresh token (same secret, same
    # type="refresh", sub = admin/staff id) could mint customer tokens for a
    # colliding Customer.id.
    customer_id = int(payload.get("customer_id", 0))
    if not customer_id:
        raise AuthError("Invalid customer refresh token", 401)

    # Check if this refresh token has already been used (replay protection)
    jti = payload.get("jti")
    if jti:
        blacklist_result = await db.execute(
            select(TokenBlacklist).where(TokenBlacklist.jti == jti)
        )
        if blacklist_result.scalar_one_or_none():
            # Reuse of a rotated refresh token means the session family is
            # compromised — revoke every token for this customer.
            await _bump_token_version(db, Customer, customer_id)
            raise AuthError("Refresh token has already been used", 401)

    result = await db.execute(
        select(Customer).where(Customer.id == customer_id)
    )
    customer = result.scalar_one_or_none()

    if customer is None or customer.deleted_at is not None or not customer.is_active:
        raise AuthError("Customer not found or inactive", 401)

    # Session revocation: refresh tokens minted before a credential change
    # carry a stale token_version.
    if int(payload.get("token_version", 0)) != (customer.token_version or 0):
        raise AuthError("Invalid refresh token", 401)

    # Revoke this refresh token so it cannot be reused
    if jti:
        exp_ts = payload.get("exp")
        expires_at = datetime.fromtimestamp(exp_ts, tz=timezone.utc) if exp_ts else datetime.now(timezone.utc) + timedelta(days=7)
        stmt = pg_insert(TokenBlacklist).values(
            jti=jti,
            token_type="refresh",
            principal_id=None,
            expires_at=expires_at,
            reason="refresh_token_reuse",
        ).on_conflict_do_nothing(index_elements=["jti"])
        result = await db.execute(stmt)
        await db.commit()
        if result.rowcount == 0:
            # Lost the race with a concurrent refresh — same reuse response.
            await _bump_token_version(db, Customer, customer_id)
            raise AuthError("Refresh token has already been used", 401)

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
        # Verify against a dummy hash so unknown emails take as long as the
        # real argon2 path — otherwise response time reveals registered emails.
        verify_password(data.password, DUMMY_PASSWORD_HASH)
        raise AuthError("Invalid email or password", 401)

    if admin.deleted_at is not None:
        raise AuthError("Account deactivated", 401)

    if not verify_password(data.password, admin.password_hash):
        admin.failed_login_count += 1
        if admin.failed_login_count >= 5:
            admin.locked_until = datetime.now(timezone.utc) + timedelta(minutes=30)
        await db.commit()
        # Always the same 401 on wrong password — a 403 here would confirm
        # the account exists and signal the lockout took effect.
        raise AuthError("Invalid email or password", 401)

    # Lock state is only revealed to a caller with the correct password.
    if admin.locked_until and admin.locked_until > datetime.now(timezone.utc):
        raise AuthError("Account is locked", 403)

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
        "token_version": admin.token_version or 0,
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
    """Refresh admin access token using refresh token. One-time use."""
    try:
        payload = decode_token(data.refresh_token)
    except Exception as exc:
        raise AuthError("Invalid refresh token", 401) from exc
    
    if payload.get("type") != "refresh":
        raise AuthError("Invalid token type", 401)

    # Domain check: only genuine admin refresh tokens carry an admin_id claim.
    # Without this, any customer/staff refresh token (same secret, same
    # type="refresh", sub = customer/staff id) could mint admin tokens for a
    # colliding AdminAccount.id — full system-admin takeover.
    admin_id = int(payload.get("admin_id", 0))
    if not admin_id:
        raise AuthError("Invalid admin refresh token", 401)

    # Replay protection
    jti = payload.get("jti")
    if jti:
        blacklist_result = await db.execute(
            select(TokenBlacklist).where(TokenBlacklist.jti == jti)
        )
        if blacklist_result.scalar_one_or_none():
            # Reuse of a rotated refresh token means the session family is
            # compromised — revoke every token for this admin.
            await _bump_token_version(db, AdminAccount, admin_id)
            raise AuthError("Refresh token has already been used", 401)

    result = await db.execute(
        select(AdminAccount).where(AdminAccount.id == admin_id)
    )
    admin = result.scalar_one_or_none()

    if admin is None or admin.deleted_at is not None or not admin.is_active:
        raise AuthError("Admin not found", 401)

    # Session revocation: refresh tokens minted before a credential change
    # carry a stale token_version.
    if int(payload.get("token_version", 0)) != (admin.token_version or 0):
        raise AuthError("Invalid refresh token", 401)

    # Revoke old refresh token
    if jti:
        exp_ts = payload.get("exp")
        expires_at = datetime.fromtimestamp(exp_ts, tz=timezone.utc) if exp_ts else datetime.now(timezone.utc) + timedelta(days=7)
        stmt = pg_insert(TokenBlacklist).values(
            jti=jti,
            token_type="refresh",
            principal_id=None,
            expires_at=expires_at,
            reason="refresh_token_reuse",
        ).on_conflict_do_nothing(index_elements=["jti"])
        result = await db.execute(stmt)
        await db.commit()
        if result.rowcount == 0:
            # Lost the race with a concurrent refresh — same reuse response.
            await _bump_token_version(db, AdminAccount, admin_id)
            raise AuthError("Refresh token has already been used", 401)

    return await create_admin_tokens(admin)
