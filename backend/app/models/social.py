from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, DECIMAL, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base


class Referral(Base):
    __tablename__ = "referrals"

    id = Column(Integer, primary_key=True, index=True)
    referrer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    invitee_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    reward_amount = Column(DECIMAL(10, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())

    referrer = relationship("User", foreign_keys=[referrer_id])
    invitee = relationship("User", foreign_keys=[invitee_id])


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "item_id", name="uq_favorites_user_item"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("menu_items.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())

    user = relationship("User")
    menu_item = relationship("MenuItem")
