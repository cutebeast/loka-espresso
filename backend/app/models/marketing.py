from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, DECIMAL
from sqlalchemy.orm import relationship
from app.core.database import Base


class CustomizationOption(Base):
    """Normalized customization options for menu items (e.g., Extra Shot, Oat Milk).
    Enables structured reporting on add-on revenue without parsing JSON.
    """
    __tablename__ = "customization_options"

    id = Column(Integer, primary_key=True, index=True)
    menu_item_id = Column(Integer, ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    price_adjustment = Column(DECIMAL(10, 2), default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    display_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())

    menu_item = relationship("MenuItem")


class MarketingCampaign(Base):
    """Track email/SMS/push campaign lifecycle and performance.
    Integrates with external providers like Twilio, Signal, etc.
    """
    __tablename__ = "marketing_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    channel = Column(String(30), default="push", nullable=False)  # push, sms, email
    subject = Column(String(500), nullable=True)
    body = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    cta_url = Column(String(500), nullable=True)
    audience = Column(String(50), default="all", nullable=False)  # all, loyalty_members, new_users, etc.
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=True)  # null = all stores
    status = Column(String(30), default="draft", nullable=False)  # draft, scheduled, sending, sent, failed
    provider = Column(String(50), nullable=True)  # twilio, signal, fcm, etc.
    provider_campaign_id = Column(String(255), nullable=True)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    total_recipients = Column(Integer, default=0)
    sent_count = Column(Integer, default=0)
    delivered_count = Column(Integer, default=0)
    opened_count = Column(Integer, default=0)
    clicked_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    cost = Column(DECIMAL(10, 2), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow(), onupdate=lambda: datetime.utcnow())

    store = relationship("Store")
    creator = relationship("User")


class TableOccupancySnapshot(Base):
    """Denormalized real-time occupancy table.
    Updated via trigger on order status changes — avoids locking orders for reads.
    """
    __tablename__ = "table_occupancy_snapshot"

    table_id = Column(Integer, ForeignKey("store_tables.id", ondelete="CASCADE"), primary_key=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    is_occupied = Column(Boolean, default=False, nullable=False)
    current_order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())

    table = relationship("StoreTable")
    store = relationship("Store")
    current_order = relationship("Order")
