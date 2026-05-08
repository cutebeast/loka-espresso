"""Translation and localization models."""

from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    DateTime,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Translation(Base):
    __tablename__ = "translations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    table_name: Mapped[str] = mapped_column(String(50), nullable=False)
    record_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    column_name: Mapped[str] = mapped_column(String(50), nullable=False)
    locale: Mapped[str] = mapped_column(String(5), nullable=False)
    translated_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "table_name", "record_id", "column_name", "locale",
            name="uq_translations"
        ),
    )


class TranslationCache(Base):
    __tablename__ = "translation_cache"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    source_locale: Mapped[str] = mapped_column(String(5), nullable=False)
    target_locale: Mapped[str] = mapped_column(String(5), nullable=False)
    translated_text: Mapped[str] = mapped_column(Text, nullable=False)
    hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
