from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey, Index
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.acl import UserType, Role, UserStoreAccess
    from app.models.staff import Staff


class AdminUser(Base):
    """Admin/staff users — dashboard access, email+password auth."""
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True, nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # ACL
    user_type_id: Mapped[int] = mapped_column(Integer, ForeignKey("user_types.id", ondelete="RESTRICT"), nullable=False, default=1)
    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False, default=1)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    user_type_rel: Mapped[Optional[UserType]] = relationship("UserType", foreign_keys=[user_type_id])
    role_rel: Mapped[Optional[Role]] = relationship("Role", foreign_keys=[role_id])
    store_access: Mapped[List[UserStoreAccess]] = relationship("UserStoreAccess", foreign_keys="UserStoreAccess.user_id", cascade="all, delete-orphan")
