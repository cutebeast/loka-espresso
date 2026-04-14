from datetime import timezone, datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, DECIMAL, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    rating = Column(Integer, nullable=False)  # 1-5
    comment = Column(Text, nullable=True)
    tags = Column(JSON, nullable=True)  # e.g. ["slow_service", "great_coffee"]
    is_resolved = Column(Boolean, default=False, nullable=False)
    admin_reply = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    store = relationship("Store")
    user = relationship("User")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=True, index=True)
    action = Column(String(100), nullable=False, index=True)  # LOGIN, LOGOUT, CREATE_ORDER, etc.
    entity_type = Column(String(100), nullable=True)  # order, voucher, menu_item, etc.
    entity_id = Column(Integer, nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)
    status = Column(String(20), default="success")  # success, failed
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    user = relationship("User")
    store = relationship("Store")


class NotificationBroadcast(Base):
    __tablename__ = "notification_broadcasts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    audience = Column(String(50), default="all")  # all, loyalty_members, staff
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=True)  # null = all stores
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    sent_count = Column(Integer, default=0)
    open_count = Column(Integer, default=0)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class PromoBanner(Base):
    __tablename__ = "promo_banners"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    short_description = Column(String(255), nullable=True)
    image_url = Column(String(500), nullable=True)
    position = Column(Integer, default=0)  # Display order
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=True)  # null = all stores
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    terms = Column(JSON, nullable=True)
    how_to_redeem = Column(Text, nullable=True)
    survey_id = Column(Integer, ForeignKey("surveys.id"), nullable=True)
    voucher_id = Column(Integer, ForeignKey("vouchers.id"), nullable=True)
    long_description = Column(Text, nullable=True)
    action_type = Column(String(20), default="detail", nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
