"""Promotional banners and campaigns for PWA.

PromoBanner: Marketing promotions with claimable rewards (vouchers) or surveys.
Always has an action for user: claim voucher or complete survey.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Boolean, DateTime, Text, Integer, ForeignKey, JSON
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.store import Store
    from app.models.voucher import Voucher


class PromoBanner(Base):
    """Promotional banner with claimable action.
    
    action_type:
    - 'detail': Show details + claim voucher button
    - 'survey': Open survey, auto-reward on completion
    
    Always linked to either:
    - voucher_id (for direct claim)
    - survey_id (for survey completion reward)
    """
    __tablename__ = "promo_banners"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    short_description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    long_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    action_type: Mapped[Optional[str]] = mapped_column(String(20), default="detail", nullable=True)
    terms: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    how_to_redeem: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    voucher_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True)
    survey_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("surveys.id", ondelete="SET NULL"), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    store_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("stores.id", ondelete="SET NULL"), nullable=True)
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    store: Mapped[Optional["Store"]] = relationship("Store")
    voucher: Mapped[Optional["Voucher"]] = relationship("Voucher", foreign_keys=[voucher_id])
