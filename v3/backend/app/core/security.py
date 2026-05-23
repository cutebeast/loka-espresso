"""Authentication, authorization, and cryptography."""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import bcrypt
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import get_settings

settings = get_settings()

# Argon2id password hasher
pwd_hasher = PasswordHasher(
    time_cost=settings.argon2_time_cost,
    memory_cost=settings.argon2_memory_cost,
    parallelism=settings.argon2_parallelism,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    return pwd_hasher.hash(password)


def verify_password(password: str, hash_: str) -> bool:
    try:
        pwd_hasher.verify(hash_, password)
        return True
    except VerifyMismatchError:
        return False


def verify_password_staff(password: str, hash_: str) -> bool:
    """Verify password against Argon2id (new) or bcrypt (legacy) hash.

    Staff accounts were originally hashed with bcrypt; this bridge
    allows verification of both formats during migration.
    """
    # Try Argon2id first
    if hash_.startswith("$argon2id$"):
        return verify_password(password, hash_)

    # Fall back to bcrypt for legacy hashes
    try:
        pw_bytes = password.encode()
        hash_bytes = hash_.encode() if isinstance(hash_, str) else hash_
        return bcrypt.checkpw(pw_bytes, hash_bytes)
    except Exception:
        return False


def verify_and_rehash_staff(db, staff_profile, key: str, new_value: str) -> bool:
    """Verify staff password/PIN, re-hashing with Argon2id on success.

    Returns True if verification succeeded; hashes ALWAYS stored with
    Argon2id going forward.
    """
    current_hash = getattr(staff_profile, key, None) or ""
    if not current_hash:
        return False

    if verify_password_staff(new_value, current_hash):
        # Re-hash with Argon2id if currently bcrypt
        if not current_hash.startswith("$argon2id$"):
            setattr(staff_profile, key, hash_password(new_value))
        return True
    return False


def check_password_needs_rehash(hash_: str) -> bool:
    return pwd_hasher.check_needs_rehash(hash_)


def create_access_token(
    subject: str | int,
    token_type: str = "access",
    extra_claims: Optional[Dict[str, Any]] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.jwt_expire_minutes)

    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
        "iss": "fnb-enterprise-v3",
        "aud": "fnb-app",
        "jti": secrets.token_hex(16),
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(
    subject: str | int,
    extra_claims: Optional[Dict[str, Any]] = None,
) -> str:
    expires_delta = timedelta(days=settings.jwt_refresh_expire_days)
    return create_access_token(
        subject,
        token_type="refresh",
        extra_claims=extra_claims,
        expires_delta=expires_delta,
    )


def decode_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer="fnb-enterprise-v3",
            audience="fnb-app",
        )
    except jwt.ExpiredSignatureError:
        raise
    except jwt.InvalidTokenError:
        # Try previous secret if configured (rotation grace period)
        if settings.jwt_secret_previous:
            return jwt.decode(
                token,
                settings.jwt_secret_previous,
                algorithms=[settings.jwt_algorithm],
                issuer="fnb-enterprise-v3",
                audience="fnb-app",
            )
        raise


def generate_otp(length: int = 6) -> str:
    """Cryptographically secure OTP."""
    return "".join(secrets.choice("0123456789") for _ in range(length))


def generate_api_key() -> str:
    """Generate a raw API key (store hash only)."""
    return secrets.token_urlsafe(32)
