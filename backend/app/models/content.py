"""Pure content/announcement cards for PWA home screen.

InformationCard: General announcements, features, tips - no claiming/action required.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Boolean, DateTime, Text, Integer, ForeignKey
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.store import Store


class InformationCard(Base):
    """Pure content cards displayed on PWA home.
    
    Unlike promotions, these have NO claim/survey action.
    Simple announcements, tips, feature highlights.
    """
    __tablename__ = "information_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    short_description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    long_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    store_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("stores.id"), nullable=True)
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    content_type: Mapped[str] = mapped_column(String(20), default="information", nullable=False)
    gallery_urls: Mapped[Optional[list]] = mapped_column(postgresql.JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    store: Mapped[Optional["Store"]] = relationship("Store")
