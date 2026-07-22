"""Class session model — dated, capacity-limited slots for experience items.

Each experience/workshop menu item (EX-*) can have sessions; customers pick a
session when booking. Seats are checked and consumed at order creation and
restored on cancellation.
"""

from __future__ import annotations

from datetime import date, time
from typing import List

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ClassSession(Base, TimestampMixin):
    __tablename__ = "class_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    menu_item_id: Mapped[int] = mapped_column(
        ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    booked_pax: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    menu_item: Mapped["MenuItem"] = relationship("MenuItem")

    __table_args__ = (
        CheckConstraint("capacity > 0", name="ck_class_sessions_capacity"),
        CheckConstraint("booked_pax >= 0", name="ck_class_sessions_booked_pax"),
        CheckConstraint("booked_pax <= capacity", name="ck_class_sessions_within_capacity"),
    )
