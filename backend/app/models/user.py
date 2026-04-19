from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Boolean, DateTime, Text, Integer, ForeignKey, DECIMAL
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.acl import UserType, Role, UserStoreAccess


# Convenience constants for user_type_id and role_id lookups
class UserTypeIDs:
    HQ_MANAGEMENT = 1
    STORE_MANAGEMENT = 2
    STORE = 3
    CUSTOMER = 4


class RoleIDs:
    ADMIN = 1
    BRAND_OWNER = 2
    MANAGER = 3
    ASSISTANT_MANAGER = 4
    STAFF = 5
    CUSTOMER = 6
    HQ_STAFF = 7


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), unique=True, index=True, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True, nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # ACL system: FK to lookup tables
    user_type_id: Mapped[int] = mapped_column(Integer, ForeignKey("user_types.id"), nullable=False, default=4)
    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id"), nullable=False, default=6)

    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    referral_code: Mapped[Optional[str]] = mapped_column(String(50), unique=True, nullable=True)
    referred_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    addresses: Mapped[List[UserAddress]] = relationship("UserAddress", back_populates="user", cascade="all, delete-orphan")
    device_tokens: Mapped[List[DeviceToken]] = relationship("DeviceToken", back_populates="user", cascade="all, delete-orphan")
    user_type_rel: Mapped[Optional[UserType]] = relationship("UserType", foreign_keys=[user_type_id])
    role_rel: Mapped[Optional[Role]] = relationship("Role", foreign_keys=[role_id])
    store_access: Mapped[List[UserStoreAccess]] = relationship("UserStoreAccess", foreign_keys="UserStoreAccess.user_id", cascade="all, delete-orphan")


class UserAddress(Base):
    __tablename__ = "user_addresses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    lat: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 7), nullable=True)
    lng: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 7), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user: Mapped[User] = relationship("User", back_populates="addresses")


class OTPSession(Base):
    __tablename__ = "otp_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(6), nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class DeviceToken(Base):
    __tablename__ = "device_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(500), nullable=False)
    platform: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user: Mapped[User] = relationship("User", back_populates="device_tokens")


class TokenBlacklist(Base):
    """Blacklisted JWT tokens for proper logout."""
    __tablename__ = "token_blacklist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    jti: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
