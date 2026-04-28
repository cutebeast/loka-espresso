from __future__ import annotations

"""ACL models: user_types, roles, role_user_type, user_store_access, permissions, role_permissions"""
from datetime import datetime, timezone
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Text, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.admin_user import AdminUser
    from app.models.store import Store


class UserType(Base):
    __tablename__ = "user_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    typical_user_type_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user_types.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    typical_user_type: Mapped[Optional[UserType]] = relationship("UserType", foreign_keys=[typical_user_type_id])
    permissions: Mapped[List[Permission]] = relationship("Permission", secondary="role_permissions", back_populates="roles")


class RoleUserType(Base):
    __tablename__ = "role_user_type"

    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), primary_key=True)
    user_type_id: Mapped[int] = mapped_column(ForeignKey("user_types.id"), primary_key=True)


class UserStoreAccess(Base):
    __tablename__ = "user_store_access"

    user_id: Mapped[int] = mapped_column(ForeignKey("admin_users.id"), primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), primary_key=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    assigned_by: Mapped[Optional[int]] = mapped_column(ForeignKey("admin_users.id"), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    store: Mapped["Store"] = relationship("Store")
    user: Mapped["AdminUser"] = relationship("AdminUser", foreign_keys=[user_id])


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    resource: Mapped[str] = mapped_column(String(50), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    roles: Mapped[List[Role]] = relationship("Role", secondary="role_permissions", back_populates="permissions")


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), primary_key=True)
    permission_id: Mapped[int] = mapped_column(ForeignKey("permissions.id"), primary_key=True)
