import enum
from datetime import timezone, datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, DECIMAL, Text, JSON
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
    valid_from = Column(DateTime(timezone=True), nullable=True)
    valid_until = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    # Marketing fields (migrated from promos table)
    title = Column(String(255), nullable=True)
    body = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    promo_type = Column(String(50), nullable=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=True)
    terms = Column(JSON, nullable=True)
    how_to_redeem = Column(Text, nullable=True)
    short_description = Column(String(500), nullable=True)
    long_description = Column(Text, nullable=True)
    validity_days = Column(Integer, default=30, nullable=True)
    max_uses_per_user = Column(Integer, nullable=True, default=1)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class UserVoucher(Base):
    __tablename__ = "user_vouchers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    voucher_id = Column(Integer, ForeignKey("vouchers.id"), nullable=False)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=True)
    applied_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    source = Column(String(30), nullable=True)  # 'survey', 'promo_detail', 'admin_grant', 'loyalty'
    source_id = Column(Integer, nullable=True)  # ID of source entity
    status = Column(String(20), default="available", nullable=True)
    code = Column(String(50), unique=True, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    discount_type = Column(String(20), nullable=True)  # snapshot from voucher catalog
    discount_value = Column(DECIMAL(10, 2), nullable=True)
    min_spend = Column(DECIMAL(10, 2), nullable=True)
