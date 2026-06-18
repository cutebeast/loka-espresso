"""Order Management models."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import List

from sqlalchemy import (
    BigInteger,
    CHAR,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import (
    DeliveryProvider,
    FulfillmentStatus,
    FulfillmentType,
    OrderChannel,
    OrderStatus,
    OrderType,
    PaymentStatus,
)


class Order(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    dining_table_id: Mapped[int | None] = mapped_column(
        ForeignKey("dining_tables.id", ondelete="SET NULL"), nullable=True, index=True
    )
    order_number: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    order_type: Mapped[str] = mapped_column(OrderType, nullable=False)
    order_channel: Mapped[str] = mapped_column(OrderChannel, nullable=False, default="mobile_app")
    status: Mapped[str] = mapped_column(OrderStatus, nullable=False, default="pending")
    payment_status: Mapped[str] = mapped_column(PaymentStatus, nullable=False, default="initiated")
    fulfillment_type: Mapped[str] = mapped_column(FulfillmentType, nullable=False)
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    items_subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    modifier_subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    delivery_fee: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    service_charge: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    voucher_discount: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    reward_discount: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    addon_discount: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    tip_amount: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    total_amount_currency: Mapped[str] = mapped_column(CHAR(3), nullable=False, default="USD")
    loyalty_points_earned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    loyalty_points_redeemed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    customer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    staff_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_ip: Mapped[str | None] = mapped_column(INET, nullable=True)
    device_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    prepared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cancelled_by: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cancelled_by_staff_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )

    line_items: Mapped[List["OrderLineItem"]] = relationship(
        "OrderLineItem", back_populates="order", cascade="all, delete-orphan"
    )
    status_logs: Mapped[List["OrderStatusLog"]] = relationship(
        "OrderStatusLog", back_populates="order", cascade="all, delete-orphan"
    )
    adjustments: Mapped[List["OrderAdjustment"]] = relationship(
        "OrderAdjustment", back_populates="order", cascade="all, delete-orphan"
    )
    fulfillment: Mapped["OrderFulfillment | None"] = relationship(
        "OrderFulfillment", back_populates="order", uselist=False
    )
    payments: Mapped[List["Payment"]] = relationship(
        "Payment", back_populates="order"
    )
    refunds: Mapped[List["Refund"]] = relationship(
        "Refund", back_populates="order"
    )
    customer: Mapped["Customer"] = relationship("Customer", back_populates="orders")
    store: Mapped["Store"] = relationship("Store", back_populates="orders")
    dining_table: Mapped["DiningTable"] = relationship("DiningTable")
    cancelled_by_staff: Mapped["StaffProfile | None"] = relationship("StaffProfile")
    modification_logs: Mapped[List["OrderModificationLog"]] = relationship(
        "OrderModificationLog", back_populates="order", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "order_type IN ('dine_in','takeaway','delivery','drive_thru')",
            name="ck_orders_order_type",
        ),
        CheckConstraint(
            "order_channel IN ('mobile_app','web','kiosk','pos','qr_code','third_party')",
            name="ck_orders_order_channel",
        ),
        CheckConstraint(
            "status IN ('pending','confirmed','preparing','ready_for_pickup','out_for_delivery','delivered','cancelled_by_customer','cancelled_by_merchant','refunded','partially_refunded','disputed')",
            name="ck_orders_status",
        ),
        CheckConstraint(
            "payment_status IN ('initiated','pending_authorization','authorized','captured','failed','refunded','partially_refunded','chargeback','voided','settled')",
            name="ck_orders_payment_status",
        ),
        CheckConstraint(
            "fulfillment_type IN ('dine_in_service','counter_pickup','curbside_pickup','standard_delivery','express_delivery','third_party_delivery')",
            name="ck_orders_fulfillment_type",
        ),
        CheckConstraint(
            """(
                (order_type = 'dine_in'    AND fulfillment_type = 'dine_in_service') OR
                (order_type = 'takeaway'   AND fulfillment_type IN ('counter_pickup','curbside_pickup')) OR
                (order_type = 'delivery'   AND fulfillment_type IN ('standard_delivery','express_delivery','third_party_delivery')) OR
                (order_type = 'drive_thru' AND fulfillment_type = 'counter_pickup')
            )""",
            name="ck_orders_type_fulfillment_alignment",
        ),
        CheckConstraint("item_count >= 0", name="ck_orders_item_count"),
        CheckConstraint("items_subtotal >= 0", name="ck_orders_items_subtotal"),
        CheckConstraint("modifier_subtotal >= 0", name="ck_orders_modifier_subtotal"),
        CheckConstraint("delivery_fee >= 0", name="ck_orders_delivery_fee"),
        CheckConstraint("service_charge >= 0", name="ck_orders_service_charge"),
        CheckConstraint("tax_amount >= 0", name="ck_orders_tax_amount"),
        CheckConstraint("discount_amount >= 0", name="ck_orders_discount_amount"),
        CheckConstraint("voucher_discount >= 0", name="ck_orders_voucher_discount"),
        CheckConstraint("reward_discount >= 0", name="ck_orders_reward_discount"),
        CheckConstraint("addon_discount >= 0", name="ck_orders_addon_discount"),
        CheckConstraint("tip_amount >= 0", name="ck_orders_tip_amount"),
        CheckConstraint("total_amount >= 0", name="ck_orders_total_amount"),
        CheckConstraint("loyalty_points_earned >= 0", name="ck_orders_loyalty_points_earned"),
        CheckConstraint("loyalty_points_redeemed >= 0", name="ck_orders_loyalty_points_redeemed"),
        CheckConstraint(
            "cancelled_by IN ('customer','merchant','system')",
            name="ck_orders_cancelled_by",
        ),
        Index("idx_orders_deleted_at", "deleted_at", postgresql_where=text("deleted_at IS NULL")),
        Index("idx_orders_device_fingerprint", "device_fingerprint", postgresql_where=text("device_fingerprint IS NOT NULL")),
    )


class OrderLineItem(Base):
    __tablename__ = "order_line_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    menu_item_id: Mapped[int] = mapped_column(
        ForeignKey("menu_items.id", ondelete="RESTRICT"), nullable=False
    )
    menu_variant_id: Mapped[int | None] = mapped_column(
        ForeignKey("menu_variants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    item_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    modifier_total: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    line_total: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    selected_modifiers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    special_instructions: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fulfillment_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    bundle_product_id: Mapped[int | None] = mapped_column(
        ForeignKey("bundle_products.id", ondelete="SET NULL"), nullable=True, index=True
    )
    served_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    served_by: Mapped[int | None] = mapped_column(
        ForeignKey("staff_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    order: Mapped["Order"] = relationship("Order", back_populates="line_items")
    menu_item: Mapped["MenuItem"] = relationship("MenuItem")
    menu_variant: Mapped["MenuVariant"] = relationship("MenuVariant")
    server: Mapped["StaffProfile | None"] = relationship("StaffProfile")
    bundle_product: Mapped["BundleProduct | None"] = relationship("BundleProduct")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_line_items_quantity"),
        CheckConstraint("unit_price >= 0", name="ck_order_line_items_unit_price"),
        CheckConstraint("line_total >= 0", name="ck_order_line_items_line_total"),
        CheckConstraint(
            "fulfillment_status IN ('pending','in_progress','ready','served','cancelled')",
            name="ck_order_line_items_fulfillment_status",
        ),
    )


class OrderStatusLog(Base):
    __tablename__ = "order_status_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    from_status: Mapped[str | None] = mapped_column(OrderStatus, nullable=True)
    to_status: Mapped[str] = mapped_column(OrderStatus, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor_type: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    order: Mapped["Order"] = relationship("Order", back_populates="status_logs")

    __table_args__ = (
        CheckConstraint(
            "from_status IN ('pending','confirmed','preparing','ready_for_pickup','out_for_delivery','delivered','cancelled_by_customer','cancelled_by_merchant','refunded','partially_refunded','disputed')",
            name="ck_order_status_log_from_status",
        ),
        CheckConstraint(
            "to_status IN ('pending','confirmed','preparing','ready_for_pickup','out_for_delivery','delivered','cancelled_by_customer','cancelled_by_merchant','refunded','partially_refunded','disputed')",
            name="ck_order_status_log_to_status",
        ),
        CheckConstraint(
            "actor_type IN ('customer','staff','system','webhook')",
            name="ck_order_status_log_actor_type",
        ),
    )


class OrderAdjustment(Base):
    __tablename__ = "order_adjustments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    adjustment_type: Mapped[str] = mapped_column(String(20), nullable=False)
    amount_delta: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    approved_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    order: Mapped["Order"] = relationship("Order", back_populates="adjustments")
    approver: Mapped["AdminAccount"] = relationship("AdminAccount")

    __table_args__ = (
        CheckConstraint(
            "adjustment_type IN ('refund','add_item','remove_item','tip_addition','discount_override','voucher','reward')",
            name="ck_order_adjustments_adjustment_type",
        ),
    )


class OrderFulfillment(Base, TimestampMixin):
    __tablename__ = "order_fulfillment"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    status: Mapped[str] = mapped_column(FulfillmentStatus, nullable=False, default="pending_assignment")
    customer_address_id: Mapped[int | None] = mapped_column(
        ForeignKey("customer_addresses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    delivery_address_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    recipient_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    recipient_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    estimated_ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estimated_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery_provider: Mapped[str | None] = mapped_column(DeliveryProvider, nullable=True)
    delivery_provider_order_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tracking_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    tracking_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    driver_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    driver_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    driver_vehicle_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pickup_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    assigned_staff_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff_profiles.id", ondelete="SET NULL"), nullable=True
    )
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery_fee_snapshot: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    delivery_distance_km: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    provider_quote_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    webhook_events: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped["Order"] = relationship("Order", back_populates="fulfillment")
    customer_address: Mapped["CustomerAddress"] = relationship("CustomerAddress")
    assigned_staff: Mapped["StaffProfile | None"] = relationship("StaffProfile")

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending_assignment','assigned','in_progress','ready_for_handoff','in_transit','arrived','completed','failed')",
            name="ck_order_fulfillment_status",
        ),
        # PaymentProvider native ENUM enforces valid values
    )
