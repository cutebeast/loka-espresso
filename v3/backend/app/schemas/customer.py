"""Customer domain schemas."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.base import BaseSchema, TimestampedSchema


class CustomerAddressBase(BaseSchema):
    """Base address fields."""

    label: str = Field(..., max_length=50)
    is_default: bool = False
    recipient_name: str | None = Field(None, max_length=100)
    recipient_phone: str | None = Field(None, max_length=20)
    address_line_1: str = Field(..., max_length=255)
    address_line_2: str | None = Field(None, max_length=255)
    city: str = Field(..., max_length=100)
    state_province: str | None = Field(None, max_length=100)
    postal_code: str = Field(..., max_length=20)
    country_code: str = Field(default="MY", max_length=2)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    delivery_instructions: str | None = Field(None, max_length=255)
    location_accuracy: str | None = Field(None, max_length=20)


class CustomerAddressCreate(CustomerAddressBase):
    pass


class CustomerAddressUpdate(BaseSchema):
    label: str | None = Field(None, max_length=50)
    is_default: bool | None = None
    recipient_name: str | None = Field(None, max_length=100)
    recipient_phone: str | None = Field(None, max_length=20)
    address_line_1: str | None = Field(None, max_length=255)
    address_line_2: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state_province: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country_code: str | None = Field(None, max_length=2)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    delivery_instructions: str | None = Field(None, max_length=255)
    location_accuracy: str | None = Field(None, max_length=20)


class CustomerAddressOut(CustomerAddressBase, TimestampedSchema):
    id: int
    customer_id: int
    is_validated: bool
    validated_at: datetime | None


class CustomerDeviceBase(BaseSchema):
    device_fingerprint: str = Field(..., max_length=64)
    push_token: str | None = Field(None, max_length=255)
    platform: Literal["ios", "android", "web", "pwa"] = "web"
    app_version: str | None = Field(None, max_length=20)
    os_version: str | None = Field(None, max_length=20)
    device_model: str | None = Field(None, max_length=50)
    is_active: bool = True


class CustomerDeviceOut(CustomerDeviceBase, TimestampedSchema):
    id: int
    customer_id: int
    last_seen_at: datetime | None


class CustomerConsentBase(BaseSchema):
    consent_type: Literal[
        "marketing_email", "marketing_sms", "marketing_push",
        "data_sharing", "location_tracking", "third_party"
    ]
    status: Literal["pending", "granted", "withdrawn", "expired"] = "pending"
    consent_version: str = Field(default="1.0", max_length=10)
    ip_address: str | None = Field(None, max_length=45)
    user_agent: str | None = Field(None, max_length=255)


class CustomerConsentOut(CustomerConsentBase):
    id: int
    customer_id: int
    granted_at: datetime | None
    withdrawn_at: datetime | None
    created_at: datetime


class CustomerProfileBase(BaseSchema):
    phone_number: str | None = Field(None, pattern=r"^\+?[1-9]\d{7,14}$")
    email_address: EmailStr | None = None
    display_name: str | None = Field(None, max_length=100)
    given_name: str | None = Field(None, max_length=50)
    family_name: str | None = Field(None, max_length=50)
    avatar_url: str | None = Field(None, max_length=500)
    date_of_birth: date | None = None
    preferred_language: str = Field(default="en", max_length=10)


class CustomerProfileCreate(CustomerProfileBase):
    pass


class CustomerProfileUpdate(BaseSchema):
    phone_number: str | None = Field(None, pattern=r"^\+?[1-9]\d{7,14}$")
    email_address: EmailStr | None = None
    display_name: str | None = Field(None, max_length=100)
    given_name: str | None = Field(None, max_length=50)
    family_name: str | None = Field(None, max_length=50)
    avatar_url: str | None = Field(None, max_length=500)
    date_of_birth: date | None = None
    preferred_language: str | None = Field(None, max_length=10)


class CustomerProfileOut(CustomerProfileBase, TimestampedSchema):
    id: int
    phone_verified_at: datetime | None
    email_verified_at: datetime | None
    referral_code: str | None
    referred_by_customer_id: int | None
    referral_count: int
    referral_earnings_total: float
    customer_segment: str | None
    lifetime_value: float
    order_count: int
    last_order_at: datetime | None
    is_active: bool


class CustomerMeOut(BaseSchema):
    """Current customer profile with related data."""

    profile: CustomerProfileOut
    addresses: list[CustomerAddressOut]
    default_address: CustomerAddressOut | None = None
    devices: list[CustomerDeviceOut]
    consents: list[CustomerConsentOut]
    referral_code: str | None = None
