from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class AppConfig(Base):
    __tablename__ = "app_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class SplashContent(Base):
    __tablename__ = "splash_content"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    subtitle: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cta_text: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    cta_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    dismissible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    active_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    active_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fallback_title: Mapped[str] = mapped_column(String(255), default="Coffee App")
    fallback_subtitle: Mapped[str] = mapped_column(String(255), default="Coffee \u00b7 Community \u00b7 Culture")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
