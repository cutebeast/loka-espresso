"""Translation and localization models."""

from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    DateTime,
    Identity,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Translation(Base):
    __tablename__ = "translations"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    namespace: Mapped[str] = mapped_column(String(50), nullable=False, default="admin")
    translation_key: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    locale: Mapped[str] = mapped_column(String(5), nullable=False)
    translated_text: Mapped[str] = mapped_column(Text, nullable=False)
    source_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_auto_translated: Mapped[bool] = mapped_column(default=False)
    table_name: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    record_id: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    column_name: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "translation_key", "locale",
            name="uq_translations_key_locale"
        ),
    )


class TranslationCache(Base):
    __tablename__ = "translation_cache"

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(), primary_key=True,
    )
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    source_locale: Mapped[str] = mapped_column(String(5), nullable=False)
    target_locale: Mapped[str] = mapped_column(String(5), nullable=False)
    translated_text: Mapped[str] = mapped_column(Text, nullable=False)
    hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
