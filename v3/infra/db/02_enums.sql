-- FNB Enterprise v3 — ENUM Types
-- 21 native PostgreSQL ENUMs

CREATE TYPE order_status AS ENUM (
    'pending', 'confirmed', 'preparing', 'ready_for_pickup',
    'out_for_delivery', 'delivered', 'cancelled_by_customer',
    'cancelled_by_merchant', 'refunded', 'partially_refunded', 'disputed'
);

CREATE TYPE order_type AS ENUM ('dine_in', 'takeaway', 'delivery', 'drive_thru');

CREATE TYPE order_channel AS ENUM ('mobile_app', 'web', 'kiosk', 'pos', 'qr_code', 'third_party');

CREATE TYPE payment_status AS ENUM (
    'initiated', 'pending_authorization', 'authorized', 'captured',
    'failed', 'refunded', 'partially_refunded', 'chargeback',
    'voided', 'settled'
);

CREATE TYPE payment_provider AS ENUM (
    'stripe', 'adyen', 'braintree', 'paypal', 'cash', 'store_credit', 'internal_wallet',
    'grabpay', 'gcash', 'alipay', 'wechat_pay'
);

CREATE TYPE payment_method_type AS ENUM (
    'credit_card', 'debit_card', 'e_wallet', 'bank_transfer',
    'cash', 'crypto', 'buy_now_pay_later'
);

CREATE TYPE fulfillment_type AS ENUM (
    'dine_in_service', 'counter_pickup', 'curbside_pickup',
    'standard_delivery', 'express_delivery', 'third_party_delivery'
);

CREATE TYPE fulfillment_status AS ENUM (
    'pending_assignment', 'assigned', 'in_progress',
    'ready_for_handoff', 'in_transit', 'arrived', 'completed', 'failed'
);

CREATE TYPE loyalty_event_type AS ENUM (
    'order_earned', 'referral_bonus', 'birthday_bonus', 'welcome_bonus',
    'tier_bonus', 'promo_bonus', 'social_share', 'review_submitted',
    'manual_adjustment', 'reward_redemption', 'voucher_conversion',
    'points_expired', 'return_deduction', 'account_merge'
);

CREATE TYPE reward_redemption_type AS ENUM (
    'free_item', 'percentage_discount', 'fixed_discount',
    'free_delivery', 'points_multiplier', 'bundle_deal', 'buy_x_get_y'
);

CREATE TYPE voucher_type AS ENUM (
    'percentage_off', 'fixed_amount_off', 'free_delivery',
    'free_item', 'bundle_offer', 'referral_reward', 'loyalty_exclusive'
);

CREATE TYPE voucher_scope AS ENUM (
    'global', 'store_specific', 'category_specific', 'item_specific', 'customer_segment'
);

CREATE TYPE campaign_channel AS ENUM ('push_notification', 'email', 'sms', 'in_app', 'whatsapp');

CREATE TYPE campaign_status AS ENUM ('draft', 'review_pending', 'scheduled', 'active', 'paused', 'completed', 'cancelled');

CREATE TYPE notification_priority AS ENUM ('critical', 'high', 'normal', 'low');

CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed', 'bounced');

CREATE TYPE staff_role AS ENUM (
    'system_admin', 'regional_manager', 'store_manager',
    'shift_supervisor', 'cashier', 'server', 'kitchen_staff',
    'delivery_coordinator', 'readonly_analyst'
);

CREATE TYPE shift_event_type AS ENUM ('clock_in', 'clock_out', 'break_start', 'break_end', 'overtime_start');

CREATE TYPE audit_action AS ENUM (
    'create', 'read', 'update', 'delete', 'export', 'login',
    'logout', 'approve', 'reject', 'transfer', 'void'
);

CREATE TYPE audit_severity AS ENUM ('info', 'notice', 'warning', 'critical', 'emergency');

CREATE TYPE consent_type AS ENUM ('marketing_email', 'marketing_sms', 'marketing_push', 'data_sharing', 'location_tracking', 'third_party');

CREATE TYPE consent_status AS ENUM ('pending', 'granted', 'withdrawn', 'expired');

CREATE TYPE reservation_status AS ENUM (
    'requested', 'confirmed', 'seated', 'no_show',
    'cancelled_by_guest', 'cancelled_by_merchant', 'completed'
);

CREATE TYPE inventory_movement_type AS ENUM (
    'in', 'out', 'adjustment', 'waste', 'return', 'transfer_in', 'transfer_out'
);
