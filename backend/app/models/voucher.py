import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, DECIMAL
from app.core.database import Base


class DiscountType(str, enum.Enum):
    percent = "percent"
    fixed = "fixed"
    free_item = "free_item"


class Voucher(Base):
    __tablename__ = "vouchers"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(String(500), nullable=True)
    discount_type = Column(Enum(DiscountType), nullable=False)
    discount_value = Column(DECIMAL(10, 2), nullable=False)
    min_order = Column(DECIMAL(10, 2), default=0)
    max_uses = Column(Integer, nullable=True)
    used_count = Column(Integer, default=0)
    valid_from = Column(DateTime, nullable=True)
    valid_until = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class UserVoucher(Base):
    __tablename__ = "user_vouchers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    voucher_id = Column(Integer, ForeignKey("vouchers.id"), nullable=False)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=True)
    applied_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
