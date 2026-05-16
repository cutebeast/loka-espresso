"""Customer daily check-in model (for loyalty streak tracking)."""
from datetime import datetime, timezone
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class CustomerDailyCheckin(Base):
    __tablename__ = "customer_daily_checkins"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    checkin_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    streak_day: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    points_earned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
