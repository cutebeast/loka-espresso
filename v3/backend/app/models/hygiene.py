"""Hygiene reporting models — grease trap and garbage disposal tracking."""

from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class HygieneReport(Base):
    __tablename__ = "hygiene_reports"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    report_type: Mapped[str] = mapped_column(String(30), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    image_urls: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    submitted_by: Mapped[str] = mapped_column(String(100), nullable=False)
    verified_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    store: Mapped["Store"] = relationship("Store")

    __table_args__ = (
        CheckConstraint(
            "report_type IN ('grease_trap','garbage_disposal')",
            name="ck_hygiene_reports_report_type",
        ),
        CheckConstraint(
            "status IN ('pending','verified','flagged')",
            name="ck_hygiene_reports_status",
        ),
    )
