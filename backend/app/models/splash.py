from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from app.core.database import Base


class AppConfig(Base):
    __tablename__ = "app_config"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class SplashContent(Base):
    __tablename__ = "splash_content"

    id = Column(Integer, primary_key=True, index=True)
    image_url = Column(String(500), nullable=True)
    title = Column(String(255), nullable=True)
    subtitle = Column(String(255), nullable=True)
    cta_text = Column(String(100), nullable=True)
    cta_url = Column(String(500), nullable=True)
    dismissible = Column(Boolean, default=True, nullable=False)
    active_from = Column(DateTime, nullable=True)
    active_until = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=False, nullable=False)
    fallback_title = Column(String(255), default="Coffee App")
    fallback_subtitle = Column(String(255), default="Coffee \u00b7 Community \u00b7 Culture")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
