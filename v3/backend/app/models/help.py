"""Help center / internal wiki articles for admin, staff, and customer portals."""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class HelpArticle(Base):
    __tablename__ = "help_articles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    audience: Mapped[str] = mapped_column(String(20), nullable=False, default="admin")
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    body_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
