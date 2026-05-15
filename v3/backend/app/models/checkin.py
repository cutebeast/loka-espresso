"""Customer daily check-in model (for loyalty streak tracking)."""
from datetime import datetime, timezone
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class CustomerDailyCheckin(Base):
    __tablename__ = "customer_daily_checkins"
    __table_args__ = (UniqueConstraint("customer_id", "checkin_date", name="uq_customer_checkin_date"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    checkin_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    streak_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    points_earned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    store_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("stores.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
