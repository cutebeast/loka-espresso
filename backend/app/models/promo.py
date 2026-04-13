from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, DECIMAL
from app.core.database import Base


class Promo(Base):
    __tablename__ = "promos"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    promo_type = Column(String(50), nullable=True)
    promo_code = Column(String(50), nullable=True)
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())


class Referral(Base):
    __tablename__ = "referrals"

    id = Column(Integer, primary_key=True, index=True)
    referrer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    invitee_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    reward_amount = Column(DECIMAL(10, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())


class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("menu_items.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())
