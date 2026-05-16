"""Identity & Access Management models."""

from datetime import datetime, timezone
from typing import List

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import AuditAction


class IAMPrincipal(Base):
    __tablename__ = "iam_principals"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    principal_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    admin_account: Mapped["AdminAccount"] = relationship(
        "AdminAccount", back_populates="principal", uselist=False
    )
    staff_profile: Mapped["StaffProfile"] = relationship(
        "StaffProfile", back_populates="principal", uselist=False
    )

    __table_args__ = (
        CheckConstraint(
            "principal_type IN ('human','service','api_key')",
            name="ck_iam_principals_principal_type",
        ),
        CheckConstraint(
            "status IN ('active','suspended','terminated','pending_verification')",
            name="ck_iam_principals_status",
        ),
    )


class AdminAccount(Base, SoftDeleteMixin):
    __tablename__ = "admin_accounts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    principal_id: Mapped[int] = mapped_column(
        ForeignKey("iam_principals.id", ondelete="RESTRICT"), nullable=False, unique=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    password_algorithm: Mapped[str] = mapped_column(String(20), nullable=False, default="argon2id")
    password_changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mfa_secret_encrypted: Mapped[bytes | None] = mapped_column(nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_ip: Mapped[str | None] = mapped_column(INET, nullable=True)
    failed_login_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    principal: Mapped["IAMPrincipal"] = relationship("IAMPrincipal", back_populates="admin_account")
    role_assignments: Mapped[List["RoleAssignment"]] = relationship(
        "RoleAssignment", back_populates="assignee", foreign_keys="RoleAssignment.assignee_id"
    )
    store_assignments: Mapped[List["StoreAssignment"]] = relationship(
        "StoreAssignment", back_populates="assignee", foreign_keys="StoreAssignment.assignee_id"
    )

    __table_args__ = (
        CheckConstraint("LENGTH(password_hash) >= 60", name="ck_admin_accounts_password_hash_length"),
        CheckConstraint(
            "password_algorithm IN ('argon2id','bcrypt')",
            name="ck_admin_accounts_password_algorithm",
        ),
        CheckConstraint("failed_login_count >= 0", name="ck_admin_accounts_failed_login_count"),
    )


class IAMRole(Base, TimestampMixin):
    __tablename__ = "iam_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role_key: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    scope_level: Mapped[str] = mapped_column(String(20), nullable=False, default="store")

    permissions: Mapped[List["IAMPermission"]] = relationship(
        "IAMPermission",
        secondary="role_permission",
        back_populates="roles",
    )

    __table_args__ = (
        CheckConstraint(
            "scope_level IN ('global','region','store','department','self')",
            name="ck_iam_roles_scope_level",
        ),
    )


class IAMPermission(Base):
    __tablename__ = "iam_permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    permission_key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    resource: Mapped[str] = mapped_column(String(50), nullable=False)
    action: Mapped[str] = mapped_column(AuditAction, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_dangerous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    roles: Mapped[List["IAMRole"]] = relationship(
        "IAMRole",
        secondary="role_permission",
        back_populates="permissions",
    )


class RolePermission(Base):
    __tablename__ = "role_permission"

    role_id: Mapped[int] = mapped_column(
        ForeignKey("iam_roles.id", ondelete="CASCADE"), primary_key=True
    )
    permission_id: Mapped[int] = mapped_column(
        ForeignKey("iam_permissions.id", ondelete="CASCADE"), primary_key=True
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    granted_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True
    )
    conditions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class RoleAssignment(Base, TimestampMixin):
    __tablename__ = "role_assignments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    assignee_id: Mapped[int] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="CASCADE"), nullable=False
    )
    role_id: Mapped[int] = mapped_column(
        ForeignKey("iam_roles.id", ondelete="CASCADE"), nullable=False
    )
    assigned_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    assignee: Mapped["AdminAccount"] = relationship("AdminAccount", back_populates="role_assignments", foreign_keys="RoleAssignment.assignee_id")
    role: Mapped["IAMRole"] = relationship("IAMRole")


class StoreAssignment(Base, TimestampMixin):
    __tablename__ = "store_assignments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    assignee_id: Mapped[int] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="CASCADE"), nullable=False
    )
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_approve_refunds: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_adjust_inventory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_manage_staff: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    assignee: Mapped["AdminAccount"] = relationship("AdminAccount", back_populates="store_assignments", foreign_keys="StoreAssignment.assignee_id")
    store: Mapped["Store"] = relationship("Store", back_populates="admin_assignments")


class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    jti: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    token_type: Mapped[str] = mapped_column(String(20), nullable=False)
    principal_id: Mapped[int | None] = mapped_column(
        ForeignKey("iam_principals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    revoked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(100), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "token_type IN ('access','refresh')",
            name="ck_token_blacklist_token_type",
        ),
    )


class APICredentials(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "api_credentials"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    principal_id: Mapped[int] = mapped_column(
        ForeignKey("iam_principals.id", ondelete="CASCADE"), nullable=False
    )
    credential_name: Mapped[str] = mapped_column(String(100), nullable=False)
    api_key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    api_key_last_four: Mapped[str | None] = mapped_column(String(4), nullable=True)
    scopes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    rate_limit_rps: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (
        CheckConstraint("rate_limit_rps BETWEEN 1 AND 1000", name="ck_api_credentials_rate_limit_rps"),
    )
