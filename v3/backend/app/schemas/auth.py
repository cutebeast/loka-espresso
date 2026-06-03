"""Authentication and authorization schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.base import BaseSchema


class TokenPair(BaseSchema):
    """JWT access + refresh token pair."""

    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(..., description="Access token lifetime in seconds")


class TokenPayload(BaseSchema):
    """Decoded JWT payload (internal)."""

    sub: str | int
    type: Literal["access", "refresh"]
    jti: str
    iat: datetime
    exp: datetime
    iss: str | None = None
    aud: str | None = None


class CustomerRegisterRequest(BaseSchema):
    """Customer registration request (passwordless / OTP)."""

    email_address: EmailStr | None = None
    phone_number: str | None = Field(None, pattern=r"^\+?[1-9]\d{7,14}$")
    display_name: str = Field(..., min_length=1, max_length=100)
    device_fingerprint: str | None = Field(None, max_length=64)
    referral_code: str | None = Field(None, max_length=20)

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "phone_number": "+60123456789",
            "display_name": "Ahmad Ibrahim",
        }
    })


class CustomerLoginRequest(BaseSchema):
    """Customer login request (OTP-based)."""

    email_address: EmailStr | None = None
    phone_number: str | None = Field(None, pattern=r"^\+?[1-9]\d{7,14}$")
    device_fingerprint: str | None = Field(None, max_length=64)


class OTPRequest(BaseSchema):
    """Request OTP for phone verification or login."""

    phone_number: str = Field(..., pattern=r"^\+?[1-9]\d{7,14}$")
    purpose: Literal["login", "registration", "password_reset", "verification"] = "login"


class OTPVerifyRequest(BaseSchema):
    """Verify OTP."""

    phone_number: str = Field(..., pattern=r"^\+?[1-9]\d{7,14}$")
    otp: str = Field(..., pattern=r"^\d{6}$")
    purpose: Literal["login", "registration", "password_reset", "verification"] = "login"


class PasswordResetRequest(BaseSchema):
    """Request password reset via email/phone."""

    email_address: EmailStr | None = None
    phone_number: str | None = Field(None, pattern=r"^\+?[1-9]\d{7,14}$")


class PasswordResetConfirm(BaseSchema):
    """Confirm password reset with token."""

    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


class RefreshTokenRequest(BaseSchema):
    """Refresh access token."""

    refresh_token: str


class AdminLoginRequest(BaseSchema):
    """Admin portal login."""

    email: EmailStr
    password: str


class StaffLoginRequest(BaseSchema):
    """Staff portal login."""

    staff_id: str = Field(..., description="Staff identifier or badge number")
    pin: str = Field(..., pattern=r"^\d{4,6}$")
    store_id: int


class AuthResponse(BaseSchema):
    """Unified auth response for all user types."""

    user_type: Literal["customer", "admin", "staff"]
    user_id: int
    tokens: TokenPair
    profile: dict | None = None
    is_new_user: bool = False
