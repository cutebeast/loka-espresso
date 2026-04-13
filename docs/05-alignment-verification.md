# FNB Super-App — Alignment Verification

> Last updated: 2026-04-13
> Purpose: Ensure models ↔ DB ↔ endpoints are aligned before backend testing

## Migration History

| Revision | Description |
|----------|-------------|
| 395b86453379 | Initial schema |
| 8cb8a6633870 | Staff, feedback, audit, broadcast tables |
| 5c4afbe8e02b | Schema v3: order_items, type fixes |
| a1b2c3d4e5f6 | Schema v4: consolidate promos, add indexes |
| 6546b42e617a | Add assistant_manager to StaffRole enum |
| b7c8d9e0f1a2 | Schema v5: delivery provider, soft deletes, occupancy, marketing, customizations |
| c8d9e0f1a2b3 | Schema v6: token_blacklist, device_tokens.is_active |
| d1e2f3a4b5c6 | Schema v7: staff unique constraint (store_id, user_id), referral timing guard |

**Current head:** `d1e2f3a4b5c6`

## Model Files vs DB Tables

| Model File | Models | DB Table | Status |
|------------|--------|----------|--------|
| user.py | User | users | ✅ Aligned (phone_verified added) |
| user.py | UserAddress | user_addresses | ✅ Aligned |
| user.py | OTPSession | otp_sessions | ✅ Aligned |
| user.py | DeviceToken | device_tokens | ✅ Aligned (is_active added) |
| user.py | TokenBlacklist | token_blacklist | ✅ New table (v6) |
| store.py | Store | stores | ✅ Aligned |
| store.py | StoreTable | store_tables | ✅ Aligned (is_occupied added) |
| menu.py | MenuCategory | menu_categories | ✅ Aligned |
| menu.py | MenuItem | menu_items | ✅ Aligned (deleted_at added) |
| menu.py | InventoryItem | inventory_items | ✅ Aligned |
| order.py | CartItem | cart_items | ✅ Aligned |
| order.py | Order | orders | ✅ Aligned (delivery_provider added) |
| order.py | OrderItem | order_items | ✅ Aligned (ON DELETE SET NULL) |
| order.py | OrderStatusHistory | order_status_history | ✅ Aligned |
| order.py | Payment | payments | ✅ Aligned |
| loyalty.py | LoyaltyAccount | loyalty_accounts | ✅ Aligned |
| loyalty.py | LoyaltyTransaction | loyalty_transactions | ✅ Aligned (created_by added) |
| loyalty.py | LoyaltyTier | loyalty_tiers | ✅ Aligned |
| reward.py | Reward | rewards | ✅ Aligned (deleted_at added) |
| reward.py | UserReward | user_rewards | ✅ Aligned |
| voucher.py | Voucher | vouchers | ✅ Aligned (deleted_at added) |
| voucher.py | UserVoucher | user_vouchers | ✅ Aligned |
| notification.py | Notification | notifications | ✅ Aligned |
| wallet.py | Wallet | wallets | ✅ Aligned |
| wallet.py | WalletTransaction | wallet_transactions | ✅ Aligned |
| wallet.py | PaymentMethod | payment_methods | ✅ Aligned |
| social.py | Referral | referrals | ✅ Aligned |
| social.py | Favorite | favorites | ✅ Aligned |
| splash.py | AppConfig | app_config | ✅ Aligned |
| splash.py | SplashContent | splash_content | ✅ Aligned |
| staff.py | Staff | staff | ✅ Aligned (unique: store_id+user_id partial index) |
| staff.py | StaffShift | staff_shifts | ✅ Aligned |
| admin_extras.py | Feedback | feedback | ✅ Aligned |
| admin_extras.py | AuditLog | audit_log | ✅ Aligned |
| admin_extras.py | NotificationBroadcast | notification_broadcasts | ✅ Aligned |
| admin_extras.py | PromoBanner | promo_banners | ✅ Aligned |
| marketing.py | CustomizationOption | customization_options | ✅ New table |
| marketing.py | MarketingCampaign | marketing_campaigns | ✅ New table |
| marketing.py | TableOccupancySnapshot | table_occupancy_snapshot | ✅ New table |

**Total: 39 tables, 39 models, 15 model files — ALL ALIGNED ✅**

## Endpoint Files vs Router Registration

| Endpoint File | Router Prefix | Registered | ACL |
|---------------|--------------|------------|-----|
| auth.py | `/auth` | ✅ | Public |
| users.py | `/users` | ✅ | customer |
| stores.py | `/stores` | ✅ | Public + require_store_access |
| menu.py | `/stores/{id}/categories`, `/stores/{id}/items` | ✅ | Public |
| cart.py | `/cart` | ✅ | customer |
| orders.py | `/orders` | ✅ | customer + inline staff check |
| payments.py | `/payments` | ✅ | customer |
| loyalty.py | `/loyalty` | ✅ | customer |
| rewards.py | `/rewards` | ✅ | customer |
| vouchers.py | `/vouchers` | ✅ | customer |
| favorites.py | `/favorites` | ✅ | customer |
| notifications.py | `/notifications` | ✅ | customer |
| referral.py | `/referral` | ✅ | customer |
| tables.py | `/tables` | ✅ | Public/customer |
| wallet.py | `/wallet` | ✅ | customer |
| promos.py | `/promos` | ✅ | Public |
| upload.py | `/upload` | ✅ | admin, store_owner |
| splash.py | `/splash` | ✅ | Public GET / admin PUT |
| config.py | `/config` | ✅ | Public GET / admin PUT |
| inventory.py | `/stores/{id}/inventory` | ✅ | require_store_access |
| admin.py | `/admin` | ✅ | require_role + require_store_access |
| admin_customers.py | `/admin/customers` | ✅ | admin |
| admin_feedback.py | `/admin/feedback` | ✅ | admin |
| admin_rewards.py | `/admin/rewards` | ✅ | admin |
| admin_staff.py | `/admin/stores/{id}/staff` | ✅ | require_store_access(manager/asst_mgr) |
| admin_system.py | `/admin/audit-log, broadcasts, banners, tiers` | ✅ | admin |
| admin_vouchers.py | `/admin/vouchers` | ✅ | admin |
| admin_marketing.py | `/admin/marketing` | ✅ | admin |
| reports.py | `/admin/reports` | ✅ | admin, store_owner |

**Total: 29 endpoint files, 112 endpoints — ALL REGISTERED ✅**

## Enums: Model vs DB

| Enum | Model Values | DB Values | Status |
|------|-------------|-----------|--------|
| UserRole | customer, store_owner, admin | customer, store_owner, admin | ✅ |
| StaffRole | manager, assistant_manager, barista, cashier, delivery | manager, assistant_manager, barista, cashier, delivery | ✅ |
| OrderType | dine_in, pickup, delivery | dine_in, pickup, delivery | ✅ |
| OrderStatus | pending→completed, cancelled | pending→completed, cancelled | ✅ |
| DiscountType | percent, fixed, free_item | percent, fixed, free_item | ✅ |
| RewardType | free_item, discount_voucher, custom | free_item, discount_voucher, custom | ✅ |
| TxType | earn, redeem, expire | earn, redeem, expire | ✅ |
| WalletTxType | topup, payment, refund | topup, payment, refund | ✅ |

**ALL ENUMS ALIGNED ✅**

## FK Constraints: Model vs DB

| Table | Column | References | ON DELETE | Status |
|-------|--------|-----------|-----------|--------|
| order_items | menu_item_id | menu_items(id) | SET NULL | ✅ v5 fix |
| table_occupancy_snapshot | table_id | store_tables(id) | CASCADE | ✅ |
| table_occupancy_snapshot | current_order_id | orders(id) | SET NULL | ✅ |
| customization_options | menu_item_id | menu_items(id) | CASCADE | ✅ |
| All other FKs | — | — | RESTRICT (default) | ✅ |

## Unique Constraints

| Table | Constraint | Type | Status |
|-------|-----------|------|--------|
| staff | (store_id, user_id) WHERE user_id IS NOT NULL | Partial unique index | ✅ v7 fix |
| users | email | Unique | ✅ |
| vouchers | code | Unique | ✅ |
| loyalty_accounts | user_id | Unique | ✅ |
| device_tokens | token | Unique | ✅ |
| referrals | code | Unique | ✅ |

## Soft Delete Implementation

| Table | Column | Delete Endpoint | Implementation |
|-------|--------|----------------|----------------|
| menu_items | deleted_at | DELETE /admin/stores/{id}/items/{id} | Sets deleted_at = now() + is_available=false ✅ |
| vouchers | deleted_at | DELETE /admin/vouchers/{id} | Sets deleted_at + is_active=false ✅ |
| rewards | deleted_at | DELETE /admin/rewards/{id} | Sets deleted_at + is_active=false ✅ |

**Note:** GET endpoints now filter `WHERE deleted_at IS NULL` by default (Phase 2 fix). Admin endpoints accept `?include_deleted=true` to see all records. Public endpoints always exclude soft-deleted items.

## Triggers

| Trigger | Function | Table | Events | Status |
|---------|----------|-------|--------|--------|
| trg_order_status_occupancy | fn_update_table_occupancy() | orders | AFTER INSERT OR UPDATE OF status | ✅ Active |

## Indexes Added in v4+v5

| Index | Table | Columns | Purpose |
|-------|-------|---------|---------|
| ix_orders_table_id | orders | table_id | Dine-in order lookup |
| ix_table_occupancy_store_occupied | table_occupancy_snapshot | store_id, is_occupied | Find free tables per store |
| 15 composite indexes (v4) | Various | Various | Scalability for 100k+ users |

## Outstanding Items (Phase 3 — External Integrations)

1. **Wallet pre-top-up** — Integration with Stripe payment gateway
2. **SMS OTP** — Integration with Twilio/Signal (currently prints to console)
3. **WhatsApp notifications** — Integration with WhatsApp Business API (currently stub)
4. **Push notifications** — Integration with Firebase Cloud Messaging (currently stub)

## Completed Phase 2 Features

1. ✅ **Soft delete filter** — Admin GET endpoints now exclude `deleted_at IS NOT NULL` by default; `?include_deleted=true` shows all
2. ✅ **Rate limiting on auth** — slowapi with shared Limiter instance: send-otp 5/min, register 5/min, login 10/min
3. ✅ **File upload validation** — 5MB max size, only JPEG/PNG/WebP/GIF MIME types allowed
4. ✅ **Charts in merchant dashboard** — SVG-based BarChart, DonutChart, SparkLine components on reports page
5. ✅ **Customization options integration** — Cart validates `customization_option_ids` against DB, resolves names + prices
6. ✅ **delivery_provider population** — Order creation sets delivery_provider for delivery orders (defaults to "internal")
7. ✅ **Staff clock-in fix** — StaffShift now correctly includes store_id from staff record
8. ✅ **Customer PWA refactor** — Monolithic 660-line page broken into 10 components with shared React Context

## Completed Security Features (Phase 1)

1. ✅ **JWT Token Blacklist** — Logout invalidates tokens via JTI
2. ✅ **PIN Rate Limiting** — 5 attempts per 5 minutes per staff member
3. ✅ **Order Cancel Loyalty Rollback** — Reverses points on cancellation
4. ✅ **created_by on loyalty_transactions** — Manual adjustments tracked
5. ✅ **Menu soft delete** — Sets both deleted_at and is_available=false
6. ✅ **Admin can cancel any order** — Not just own orders
7. ✅ **DeviceToken.is_active** — Model aligned with DB schema
8. ✅ **Cross-Store Cart Guard** — Returns 400 when adding items from different store
9. ✅ **Staff Unique Constraint** — Partial unique index (store_id, user_id) WHERE user_id IS NOT NULL
10. ✅ **Referral Code Timing Guard** — Only applicable within 7 days of account creation, one-time only
