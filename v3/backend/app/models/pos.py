"""POS (Point of Sale) domain models."""

from datetime import datetime, timezone
from typing import List

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class PosTerminal(Base, TimestampMixin):
    __tablename__ = "pos_terminals"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    terminal_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    location_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    store: Mapped["Store"] = relationship("Store", back_populates="pos_terminals")
    sessions: Mapped[List["PosSession"]] = relationship(
        "PosSession", back_populates="terminal", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("store_id > 0", name="ck_pos_terminals_store_id"),
    )


class PosSession(Base, TimestampMixin):
    __tablename__ = "pos_sessions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    terminal_id: Mapped[int] = mapped_column(
        ForeignKey("pos_terminals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    staff_id: Mapped[int] = mapped_column(
        ForeignKey("staff_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    opening_cash: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    closing_cash: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    expected_cash: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    discrepancy: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    discrepancy_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_sales_cash: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    total_sales_card: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    total_sales_qr: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    order_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    extra_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)

    terminal: Mapped["PosTerminal"] = relationship("PosTerminal", back_populates="sessions")
    staff: Mapped["StaffProfile | None"] = relationship("StaffProfile")

    __table_args__ = (
        CheckConstraint(
            "status IN ('open','closed','paused')",
            name="ck_pos_sessions_status",
        ),
    )


class OrderModificationLog(Base, TimestampMixin):
    __tablename__ = "order_modification_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    staff_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    modification_type: Mapped[str] = mapped_column(String(30), nullable=False)
    line_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("order_line_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    previous_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    reason: Mapped[str | None] = mapped_column(String(200), nullable=True)

    order: Mapped["Order"] = relationship("Order", back_populates="modification_logs")
    staff: Mapped["StaffProfile | None"] = relationship("StaffProfile")
    line_item: Mapped["OrderLineItem | None"] = relationship("OrderLineItem")

    __table_args__ = (
        CheckConstraint(
            "modification_type IN ('add_item','remove_item','update_qty','update_note','apply_discount','remove_discount','update_status')",
            name="ck_order_modification_logs_type",
        ),
    )
