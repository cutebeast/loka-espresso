"""Customer Management models."""

from datetime import date, datetime, timezone
from typing import List

from sqlalchemy import (
    BigInteger,
    Boolean,
    CHAR,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin
from app.models.enums import ConsentStatus, ConsentType


class Customer(Base, SoftDeleteMixin):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True)
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    email_address: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    given_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    family_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    preferred_language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    referral_code: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True)
    referred_by_customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True
    )
    referral_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    referral_earnings_total: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    customer_segment: Mapped[str | None] = mapped_column(String(50), nullable=True)
    lifetime_value: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    order_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_order_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    anonymized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    addresses: Mapped[List["CustomerAddress"]] = relationship(
        "CustomerAddress", back_populates="customer", cascade="all, delete-orphan"
    )
    devices: Mapped[List["CustomerDevice"]] = relationship(
        "CustomerDevice", back_populates="customer", cascade="all, delete-orphan"
    )
    consents: Mapped[List["CustomerConsent"]] = relationship(
        "CustomerConsent", back_populates="customer", cascade="all, delete-orphan"
    )
    carts: Mapped[List["CustomerCart"]] = relationship(
        "CustomerCart", back_populates="customer"
    )
    payment_methods: Mapped[List["PaymentMethod"]] = relationship(
        "PaymentMethod", back_populates="customer"
    )
    wallet: Mapped["Wallet | None"] = relationship(
        "Wallet", back_populates="customer", uselist=False
    )
    loyalty_account: Mapped["LoyaltyAccount | None"] = relationship(
        "LoyaltyAccount", back_populates="customer", uselist=False
    )
    customer_rewards: Mapped[List["CustomerReward"]] = relationship(
        "CustomerReward", back_populates="customer"
    )
    customer_vouchers: Mapped[List["CustomerVoucher"]] = relationship(
        "CustomerVoucher", back_populates="customer"
    )
    orders: Mapped[List["Order"]] = relationship(
        "Order", back_populates="customer"
    )
    notifications: Mapped[List["NotificationMessage"]] = relationship(
        "NotificationMessage", back_populates="customer"
    )
    notification_preferences: Mapped[List["NotificationPreference"]] = relationship(
        "NotificationPreference", back_populates="customer"
    )
    referrals_made: Mapped[List["ReferralEvent"]] = relationship(
        "ReferralEvent",
        foreign_keys="ReferralEvent.referrer_customer_id",
        back_populates="referrer",
    )
    referral_received: Mapped["ReferralEvent | None"] = relationship(
        "ReferralEvent",
        foreign_keys="ReferralEvent.invitee_customer_id",
        back_populates="invitee",
        uselist=False,
    )
    reservations: Mapped[List["Reservation"]] = relationship(
        "Reservation", back_populates="customer"
    )

    __table_args__ = (
        # Regex CHECK constraints add overhead during batch imports — consider
        # deferring validation to application layer for high-volume CSV / ETL loads.
        CheckConstraint("phone_number ~ '^[+0-9]{7,20}$'", name="ck_customers_phone_number"),
        CheckConstraint("preferred_language ~ '^[a-z]{2}(-[A-Z]{2})?$'", name="ck_customers_preferred_language"),
        CheckConstraint("referral_count >= 0", name="ck_customers_referral_count"),
        CheckConstraint("referral_earnings_total >= 0", name="ck_customers_referral_earnings_total"),
        CheckConstraint("lifetime_value >= 0", name="ck_customers_lifetime_value"),
        CheckConstraint("order_count >= 0", name="ck_customers_order_count"),
        CheckConstraint(
            "date_of_birth > '1900-01-01' AND date_of_birth < CURRENT_DATE",
            name="ck_customers_date_of_birth",
        ),
    )


class CustomerConsent(Base):
    __tablename__ = "customer_consents"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    consent_type: Mapped[str] = mapped_column(ConsentType, nullable=False)
    status: Mapped[str] = mapped_column(ConsentStatus, nullable=False, default="pending")
    granted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    consent_version: Mapped[str] = mapped_column(String(10), nullable=False, default="1.0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    customer: Mapped["Customer"] = relationship("Customer", back_populates="consents")

    __table_args__ = (
        CheckConstraint(
            "consent_type IN ('marketing_email','marketing_sms','marketing_push','data_sharing','location_tracking','third_party')",
            name="ck_customer_consents_consent_type",
        ),
        CheckConstraint(
            "status IN ('pending','granted','withdrawn','expired')",
            name="ck_customer_consents_status",
        ),
    )


class CustomerAddress(Base, SoftDeleteMixin):
    __tablename__ = "customer_addresses"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    recipient_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    recipient_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address_line_1: Mapped[str] = mapped_column(String(255), nullable=False)
    address_line_2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state_province: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str] = mapped_column(String(20), nullable=False)
    country_code: Mapped[str] = mapped_column(CHAR(2), nullable=False)
    latitude: Mapped[float | None] = mapped_column(Numeric(10, 8), nullable=True)
    longitude: Mapped[float | None] = mapped_column(Numeric(11, 8), nullable=True)
    delivery_instructions: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location_accuracy: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_validated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    customer: Mapped["Customer"] = relationship("Customer", back_populates="addresses")

    __table_args__ = (
        CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_customer_addresses_latitude"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_customer_addresses_longitude"),
    )


class ReferralEvent(Base):
    __tablename__ = "referral_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    referrer_customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    invitee_customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    referral_code: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reward_issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reward_wallet_entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("wallet_ledger_entries.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    referrer: Mapped["Customer"] = relationship(
        "Customer", foreign_keys=[referrer_customer_id], back_populates="referrals_made"
    )
    invitee: Mapped["Customer"] = relationship(
        "Customer", foreign_keys=[invitee_customer_id], back_populates="referral_received"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','converted','expired','rewarded')",
            name="ck_referral_events_status",
        ),
    )


class CustomerDevice(Base, SoftDeleteMixin):
    __tablename__ = "customer_devices"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    device_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    push_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    platform: Mapped[str] = mapped_column(String(20), nullable=False)
    app_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    os_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    device_model: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    customer: Mapped["Customer"] = relationship("Customer", back_populates="devices")

    __table_args__ = (
        CheckConstraint(
            "platform IN ('ios','android','web','pwa')",
            name="ck_customer_devices_platform",
        ),
    )
