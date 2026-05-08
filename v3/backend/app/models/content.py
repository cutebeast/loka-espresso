"""Content Management models."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CHAR,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class ContentBlock(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "content_blocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int | None] = mapped_column(
        ForeignKey("stores.id", ondelete="SET NULL"), nullable=True
    )
    store: Mapped["Store | None"] = relationship("Store", back_populates="content_blocks")
    block_key: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    block_name: Mapped[str] = mapped_column(String(100), nullable=False)
    content_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    subtitle: Mapped[str | None] = mapped_column(String(200), nullable=True)
    body_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    image_gallery_urls: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    cta_text: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cta_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cta_action: Mapped[str | None] = mapped_column(String(50), nullable=True)
    voucher_definition_id: Mapped[int | None] = mapped_column(
        ForeignKey("voucher_definitions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    survey_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    background_color: Mapped[str | None] = mapped_column(CHAR(7), nullable=True)
    text_color: Mapped[str | None] = mapped_column(CHAR(7), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    start_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    end_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    priority: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    is_dismissible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    target_segments: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    target_platforms: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )

    __table_args__ = (
        CheckConstraint(
            "content_type IN ('hero_banner','promo_card','info_card','announcement','story','popup')",
            name="ck_content_blocks_content_type",
        ),
        CheckConstraint(
            "cta_action IN ('open_detail','apply_voucher','open_url','open_survey','share')",
            name="ck_content_blocks_cta_action",
        ),
        CheckConstraint("priority BETWEEN 0 AND 10", name="ck_content_blocks_priority"),
        CheckConstraint("end_date > start_date", name="ck_content_blocks_end_date"),
    )


class SplashScreen(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "splash_screens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int | None] = mapped_column(
        ForeignKey("stores.id", ondelete="SET NULL"), nullable=True
    )
    store: Mapped["Store | None"] = relationship("Store", back_populates="splash_screens")
    screen_name: Mapped[str] = mapped_column(String(100), nullable=False)
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    title: Mapped[str | None] = mapped_column(String(100), nullable=True)
    subtitle: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cta_text: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cta_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    show_frequency: Mapped[str] = mapped_column(
        String(20), nullable=False, default="once_per_session"
    )
    dismissible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    active_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    active_until: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (
        CheckConstraint(
            "show_frequency IN ('once','once_per_session','every_open','once_per_day')",
            name="ck_splash_screens_show_frequency",
        ),
        CheckConstraint(
            "active_until > active_from", name="ck_splash_screens_active_until"
        ),
    )
