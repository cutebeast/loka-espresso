"""Information cards — product info, events, system content, popups."""

from datetime import datetime, timezone
from typing import List

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin


class InformationCard(Base):
    __tablename__ = "information_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(255), unique=True)
    short_description: Mapped[str | None] = mapped_column(String(500))
    long_description: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str | None] = mapped_column(String(50))
    image_url: Mapped[str | None] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(20), nullable=False, default="information")
    action_url: Mapped[str | None] = mapped_column(String(500))
    action_type: Mapped[str | None] = mapped_column(String(20))
    action_label: Mapped[str | None] = mapped_column(String(100))
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    image_gallery_urls: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    gallery_video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

class SystemPage(Base):
    __tablename__ = "system_pages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    page_key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body_text: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class ProductCard(Base):
    __tablename__ = "product_cards"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(255), unique=True)
    short_description: Mapped[str | None] = mapped_column(String(500))
    long_description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    action_url: Mapped[str | None] = mapped_column(String(500))
    action_label: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    image_gallery_urls: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    gallery_video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class EventCard(Base):
    __tablename__ = "event_cards"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(255), unique=True)
    short_description: Mapped[str | None] = mapped_column(String(500))
    long_description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    action_url: Mapped[str | None] = mapped_column(String(500))
    action_label: Mapped[str | None] = mapped_column(String(100))
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    location: Mapped[str | None] = mapped_column(String(255))
    event_datetime: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rsvp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rsvp_max_capacity: Mapped[int | None] = mapped_column(Integer)
    rsvp_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    image_gallery_urls: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    gallery_video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    rsvps: Mapped[List["EventRsvp"]] = relationship("EventRsvp", back_populates="event", cascade="all, delete-orphan")


class EventRsvp(Base):
    __tablename__ = "event_rsvps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("event_cards.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    event: Mapped["EventCard"] = relationship("EventCard", back_populates="rsvps")


class PromoBanner(Base):
    __tablename__ = "promo_banners"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    short_description: Mapped[str | None] = mapped_column(String(500))
    long_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500))
    action_type: Mapped[str | None] = mapped_column(String(20))
    action_url: Mapped[str | None] = mapped_column(String(500))
    voucher_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("voucher_definitions.id", ondelete="SET NULL"))
    survey_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("survey_definitions.id", ondelete="SET NULL"))
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    image_gallery_urls: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    gallery_video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    voucher: Mapped["VoucherDefinition | None"] = relationship("VoucherDefinition")
    survey: Mapped["SurveyDefinition | None"] = relationship("SurveyDefinition")


class ContentSection(Base):
    __tablename__ = "content_sections"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    content_type: Mapped[str] = mapped_column(String(30), nullable=False)
    content_id: Mapped[int] = mapped_column(Integer, nullable=False)
    section_title: Mapped[str | None] = mapped_column(String(255))
    section_body: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class SplashScreen(Base, SoftDeleteMixin):
    __tablename__ = "splash_screens"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    screen_name: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str | None] = mapped_column(String(100))
    subtitle: Mapped[str | None] = mapped_column(String(200))
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    cta_text: Mapped[str | None] = mapped_column(String(50))
    cta_url: Mapped[str | None] = mapped_column(String(500))
    show_frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="once_per_session")
    dismissible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    image_gallery_urls: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    gallery_video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
