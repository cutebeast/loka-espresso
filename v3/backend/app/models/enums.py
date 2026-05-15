"""SQLAlchemy Enum definitions matching PostgreSQL native ENUMs."""

from sqlalchemy import Enum

OrderType = Enum(
    "dine_in", "takeaway", "delivery", "drive_thru",
    name="order_type",
    native_enum=True,
    create_type=False,
)

OrderChannel = Enum(
    "mobile_app", "web", "kiosk", "pos", "qr_code", "third_party",
    name="order_channel",
    native_enum=True,
    create_type=False,
)

OrderStatus = Enum(
    "pending", "confirmed", "preparing", "ready_for_pickup",
    "out_for_delivery", "delivered", "cancelled_by_customer",
    "cancelled_by_merchant", "refunded", "partially_refunded", "disputed",
    name="order_status",
    native_enum=True,
    create_type=False,
)

PaymentStatus = Enum(
    "initiated", "pending_authorization", "authorized", "captured",
    "failed", "refunded", "partially_refunded", "chargeback", "voided", "settled",
    name="payment_status",
    native_enum=True,
    create_type=False,
)

FulfillmentType = Enum(
    "dine_in_service", "counter_pickup", "curbside_pickup",
    "standard_delivery", "express_delivery", "third_party_delivery",
    name="fulfillment_type",
    native_enum=True,
    create_type=False,
)

FulfillmentStatus = Enum(
    "pending_assignment", "assigned", "in_progress", "ready_for_handoff",
    "in_transit", "arrived", "completed", "failed",
    name="fulfillment_status",
    native_enum=True,
    create_type=False,
)

InventoryMovementType = Enum(
    "in", "out", "adjustment", "waste", "return", "transfer_in", "transfer_out",
    name="inventory_movement_type",
    native_enum=True,
    create_type=False,
)

LoyaltyEventType = Enum(
    "order_earned", "referral_bonus", "birthday_bonus", "welcome_bonus",
    "tier_bonus", "promo_bonus", "social_share", "review_submitted",
    "manual_adjustment", "reward_redemption", "voucher_conversion",
    "points_expired", "return_deduction", "account_merge",
    name="loyalty_event_type",
    native_enum=True,
    create_type=False,
)

NotificationPriority = Enum(
    "critical", "high", "normal", "low",
    name="notification_priority",
    native_enum=True,
    create_type=False,
)

NotificationStatus = Enum(
    "pending", "sent", "delivered", "read", "failed", "bounced",
    name="notification_status",
    native_enum=True,
    create_type=False,
)

PaymentMethodType = Enum(
    "credit_card", "debit_card", "e_wallet", "bank_transfer", "cash", "crypto", "buy_now_pay_later",
    name="payment_method_type",
    native_enum=True,
    create_type=False,
)

PaymentProvider = Enum(
    "stripe", "adyen", "braintree", "paypal", "cash", "store_credit", "internal_wallet",
    "grabpay", "gcash", "alipay", "wechat_pay",
    name="payment_provider",
    native_enum=True,
    create_type=False,
)

DeliveryProvider = Enum(
    "in_house", "uber_direct", "doordash", "grab_express", "lalamove", "deliveroo", "foodpanda", "postmates", "third_party",
    name="delivery_provider",
    native_enum=True,
    create_type=False,
)

ReservationStatus = Enum(
    "requested", "confirmed", "seated", "no_show", "cancelled_by_guest",
    "cancelled_by_merchant", "completed",
    name="reservation_status",
    native_enum=True,
    create_type=False,
)

RewardRedemptionType = Enum(
    "free_item", "percentage_discount", "fixed_discount", "free_delivery",
    "points_multiplier", "bundle_deal", "buy_x_get_y",
    name="reward_redemption_type",
    native_enum=True,
    create_type=False,
)

ShiftEventType = Enum(
    "clock_in", "clock_out", "break_start", "break_end", "overtime_start",
    name="shift_event_type",
    native_enum=True,
    create_type=False,
)

StaffRole = Enum(
    "system_admin", "regional_manager", "store_manager", "shift_supervisor",
    "cashier", "server", "kitchen_staff", "delivery_coordinator", "readonly_analyst",
    name="staff_role",
    native_enum=True,
    create_type=False,
)

VoucherScope = Enum(
    "global", "store_specific", "category_specific", "item_specific", "customer_segment",
    name="voucher_scope",
    native_enum=True,
    create_type=False,
)

VoucherType = Enum(
    "percentage_off", "fixed_amount_off", "free_delivery", "free_item",
    "bundle_offer", "referral_reward", "loyalty_exclusive",
    name="voucher_type",
    native_enum=True,
    create_type=False,
)

AuditAction = Enum(
    "create", "read", "update", "delete", "export", "login", "logout",
    "approve", "reject", "transfer", "void",
    name="audit_action",
    native_enum=True,
    create_type=False,
)

AuditSeverity = Enum(
    "info", "notice", "warning", "critical", "emergency",
    name="audit_severity",
    native_enum=True,
    create_type=False,
)

ConsentType = Enum(
    "marketing_email", "marketing_sms", "marketing_push", "data_sharing",
    "location_tracking", "third_party",
    name="consent_type",
    native_enum=True,
    create_type=False,
)

ConsentStatus = Enum(
    "pending", "granted", "withdrawn", "expired",
    name="consent_status",
    native_enum=True,
    create_type=False,
)

CampaignChannel = Enum(
    "push_notification", "email", "sms", "in_app", "whatsapp",
    name="campaign_channel",
    native_enum=True,
    create_type=False,
)

CampaignStatus = Enum(
    "draft", "review_pending", "scheduled", "active", "paused", "completed", "cancelled",
    name="campaign_status",
    native_enum=True,
    create_type=False,
)
