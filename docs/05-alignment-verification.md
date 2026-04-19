# FNB Super-App — Alignment Verification

> Last updated: 2026-04-18 | Session 5: All fixes complete, 100% aligned
> Purpose: Ensure models ↔ DB ↔ endpoints are aligned

## Migration History

| Revision | File | Description |
|----------|------|-------------|
| 395b86453379 | initial | Initial schema |
| 8cb8a6633870 | staff_feedback | Staff, feedback, audit, broadcast tables |
| 5c4afbe8e02b | schema_v3 | Order_items, type fixes |
| a1b2c3d4e5f6 | schema_v4 | Consolidate promos, add indexes |
| 6546b42e617a | staff_role | Add assistant_manager to StaffRole enum |
| b7c8d9e0f1a2 | schema_v5 | Delivery provider, soft deletes, occupancy, marketing, customizations |
| c8d9e0f1a2b3 | schema_v6 | token_blacklist, device_tokens.is_active |
| d1e2f3a4b5c6 | schema_v7 | Staff unique constraint, referral timing guard |
| e2f3a4b5c6d7 | schema_v8 | Cart customization_option_ids, pin_attempts |
| (auto) | marketing_group_v1 | Survey tables, reward.code, banner fields |
| (auto) | marketing_terms_v2 | terms/how_to_redeem on rewards, vouchers, banners |
| (auto) | marketing_pwa_v3 | short_description/long_description on rewards, vouchers, banners |
| (auto) | promo_voucher_guards_v4 | voucher_id on banners, max_uses_per_user on vouchers, source/source_id on user_vouchers |
| (auto) | acl_v1 | ACL lookup tables (user_types, roles, role_user_type, user_store_access, permissions, role_permissions), drop PG enum columns from users |
| 5c707f520bda | is_archived_broadcasts | is_archived on broadcasts |
| (auto) | customer_wallet_v5 | Wallet features, validity, codes, snapshots |
| (auto) | inventory_movements_v1 | Inventory movements branch |
| 4f94031ff6af | merge_migration | Merge migration |
| (auto) | inv_cat_hq_staff | Inventory categories, HQ staff |
| (auto) | unified_roles_v1 | Unified role system (pre-ACL) |
| b4c5d6e7f8a9 | discount_columns_orders | Discount columns on orders |
| (auto) | reward_min_order_v1 | min_order on rewards |
| (auto) | rename_min_order_to_min_spend | Rename min_order to min_spend |
| (auto) | add_broadcast_status | status on notification_broadcasts |
| (auto) | add_tier_sort_order | sort_order on loyalty_tiers |
| (auto) | add_paid_out_for_delivery | paid + out_for_delivery enum values |
| (auto) | add_performance_indexes_v1 | 15 performance indexes |

## Model Files vs DB Tables

| Model File | Models | DB Table | Status |
|------------|--------|----------|--------|
| acl.py | UserType | user_types | ✅ NEW (ACL) |
| acl.py | Role | roles | ✅ NEW (ACL) |
| acl.py | RoleUserType | role_user_type | ✅ NEW (ACL) |
| acl.py | UserStoreAccess | user_store_access | ✅ NEW (ACL) |
| acl.py | Permission | permissions | ✅ NEW (ACL) |
| acl.py | RolePermission | role_permissions | ✅ NEW (ACL) |

| Model File | Models | DB Table | Status |
|------------|--------|----------|--------|
| user.py | User | users | ✅ |
| user.py | UserAddress | user_addresses | ✅ |
| user.py | OTPSession | otp_sessions | ✅ |
| user.py | DeviceToken | device_tokens | ✅ |
| user.py | TokenBlacklist | token_blacklist | ✅ |
| store.py | Store | stores | ✅ |
| store.py | StoreTable | store_tables | ✅ |
| menu.py | MenuCategory | menu_categories | ✅ |
| menu.py | MenuItem | menu_items | ✅ |
| menu.py | InventoryItem | inventory_items | ✅ |
| order.py | CartItem | cart_items | ✅ |
| order.py | Order | orders | ✅ |
| order.py | OrderItem | order_items | ✅ |
| order.py | OrderStatusHistory | order_status_history | ✅ |
| order.py | Payment | payments | ✅ |
| loyalty.py | LoyaltyAccount | loyalty_accounts | ✅ |
| loyalty.py | LoyaltyTransaction | loyalty_transactions | ✅ |
| loyalty.py | LoyaltyTier | loyalty_tiers | ✅ |
| reward.py | Reward | rewards | ✅ (validity_days added) |
| reward.py | UserReward | user_rewards | ✅ (status, expires_at, redemption_code, reward_snapshot, points_spent added) |
| voucher.py | Voucher | vouchers | ✅ (validity_days, max_uses_per_user added) |
| voucher.py | UserVoucher | user_vouchers | ✅ (status, code, expires_at, discount_type/value, min_spend, source, source_id added) |
| notification.py | Notification | notifications | ✅ |
| wallet.py | Wallet | wallets | ✅ |
| wallet.py | WalletTransaction | wallet_transactions | ✅ (balance_after added) |
| wallet.py | PaymentMethod | payment_methods | ✅ |
| social.py | Referral | referrals | ✅ |
| social.py | Favorite | favorites | ✅ |
| splash.py | AppConfig | app_config | ✅ |
| splash.py | SplashContent | splash_content | ✅ |
| staff.py | Staff | staff | ✅ |
| staff.py | StaffShift | staff_shifts | ✅ |
| staff.py | PinAttempt | pin_attempts | ✅ |
| admin_extras.py | Feedback | feedback | ✅ |
| admin_extras.py | AuditLog | audit_log | ✅ |
| admin_extras.py | NotificationBroadcast | notification_broadcasts | ✅ |
| admin_extras.py | PromoBanner | promo_banners | ✅ (voucher_id, survey_id, action_type, long_description, terms, how_to_redeem added) |
| marketing.py | CustomizationOption | customization_options | ✅ |
| marketing.py | MarketingCampaign | marketing_campaigns | ✅ |
| marketing.py | TableOccupancySnapshot | table_occupancy_snapshot | ✅ |
| survey.py | Survey | surveys | ✅ NEW |
| survey.py | SurveyQuestion | survey_questions | ✅ NEW |
| survey.py | SurveyResponse | survey_responses | ✅ NEW |
| survey.py | SurveyAnswer | survey_answers | ✅ NEW |

**Total: 52 tables, 52 models, 16 model files — 52 tables confirmed, doc needs updating ⚠️**

## Endpoint Files vs Router Registration

| Endpoint File | Router Prefix | Registered | Purpose |
|---------------|--------------|------------|---------|
| auth.py | `/auth` | ✅ | Login, OTP, device tokens |
| users.py | `/users` | ✅ | Profile, addresses |
| stores.py | `/stores` | ✅ | Store listing |
| menu.py | `/stores/{id}/...` | ✅ | Categories, items, search |
| cart.py | `/cart` | ✅ | Shopping cart |
| orders.py | `/orders` | ✅ | Order CRUD |
| payments.py | `/payments` | ✅ | Payment stubs |
| loyalty.py | `/loyalty` | ✅ | Points balance, tiers |
| rewards.py | `/rewards` | ✅ | PWA rewards catalog + redeem |
| vouchers.py | `/vouchers` | ✅ | PWA voucher wallet + validate + use |
| favorites.py | `/favorites` | ✅ | Favorites |
| notifications.py | `/notifications` | ✅ | Notification management |
| referral.py | `/referral` | ✅ | Referral codes |
| tables.py | `/tables` | ✅ | Table scan |
| wallet.py | `/wallet` | ✅ | Cash wallet |
| promos.py | `/promos` | ✅ | Public promos |
| upload.py | `/upload` | ✅ | Image uploads |
| splash.py | `/splash` | ✅ | Splash screen |
| config.py | — | ✅ | App config |
| inventory.py | `/stores/{id}/inventory` | ✅ | Inventory CRUD |
| admin.py | `/admin` | ✅ | Dashboard, store CRUD, reports |
| admin_rewards.py | `/admin/rewards` | ✅ | Admin reward management |
| admin_vouchers.py | `/admin/vouchers` | ✅ | Admin voucher management |
| admin_surveys.py | `/admin/surveys` | ✅ NEW | Admin survey management |
| reports.py | `/admin/reports` | ✅ | Revenue, sales, loyalty, marketing |
| admin_staff.py | `/admin/stores/{id}/staff` | ✅ | Staff CRUD |
| admin_feedback.py | `/admin/feedback` | ✅ | Feedback management |
| admin_system.py | `/admin/...` | ✅ | Banners, broadcasts, audit log, loyalty tiers |
| admin_customers.py | `/admin/customers` | ✅ | Customer management |
| admin_marketing.py | `/admin/marketing` | ✅ | Marketing campaigns |
| pwa_promos.py | `/promos/banners` | ✅ NEW | PWA banner listing, detail, status, claim |
| pwa_surveys.py | `/surveys` | ✅ NEW | PWA survey detail, submit with auto-grant |
| pwa_wallet.py | `/me` | ✅ NEW | PWA full customer wallet |
| scan_cron.py | `/scan` | ✅ NEW | Barista scan + cron expiry |

**Total: 37 endpoint files, 198 endpoints — ALL REGISTERED ✅**

## Enums: Model vs DB

| Enum | Model Values | DB Values | Status |
|------|-------------|-----------|--------|
| StaffRole | manager, assistant_manager, barista, cashier, delivery | manager, assistant_manager, barista, cashier, delivery | ✅ |
| OrderType | dine_in, pickup, delivery | dine_in, pickup, delivery | ✅ |
| OrderStatus | pending, confirmed, preparing, ready, paid, out_for_delivery, completed, cancelled | pending, confirmed, preparing, ready, paid, out_for_delivery, completed, cancelled | ✅ |
| DiscountType | percent, fixed, free_item | percent, fixed, free_item | ✅ |
| RewardType | free_item, discount_voucher, custom | free_item, discount_voucher, custom | ✅ |
| TxType | earn, redeem, expire | earn, redeem, expire | ✅ |
| WalletTxType | topup, payment, refund, promo_credit, admin_adjustment | topup, payment, refund, promo_credit, admin_adjustment | ✅ |
| MovementType | received, waste, transfer_out, transfer_in, cycle_count, adjustment | received, waste, transfer_out, transfer_in, cycle_count, adjustment | ✅ |

> **Note**: `UserRole`, `UserType` Python enums still exist in `user.py` for backward compat, but the DB now uses integer FKs (`user_type_id` → `user_types`, `role_id` → `roles`). Orphaned PG enum types (`userrole`, `usertype`, `user_role`) have been dropped.

**ALL ENUMS ALIGNED ✅**

## New Schema Columns (Marketing Migrations)

### rewards (new columns)
| Column | Type | Default | Migration |
|--------|------|---------|-----------|
| code | varchar(50) UNIQUE | — | v1 |
| terms | json | — | v2 |
| how_to_redeem | text | — | v2 |
| short_description | varchar(500) | — | v3 |
| long_description | text | — | v3 |
| validity_days | integer | 30 | v5 |

### user_rewards (new columns)
| Column | Type | Default | Migration |
|--------|------|---------|-----------|
| status | varchar(20) | 'available' | v5 |
| expires_at | timestamptz | — | v5 |
| used_at | timestamptz | — | v5 |
| redemption_code | varchar(50) UNIQUE | — | v5 |
| points_spent | integer | — | v5 |
| reward_snapshot | json | — | v5 |

### vouchers (new columns)
| Column | Type | Default | Migration |
|--------|------|---------|-----------|
| terms | json | — | v2 |
| how_to_redeem | text | — | v2 |
| short_description | varchar(500) | — | v3 |
| long_description | text | — | v3 |
| max_uses_per_user | integer | 1 | v4 |
| validity_days | integer | 30 | v5 |

### user_vouchers (new columns)
| Column | Type | Default | Migration |
|--------|------|---------|-----------|
| status | varchar(20) | 'available' | v5 |
| code | varchar(50) UNIQUE | — | v5 |
| expires_at | timestamptz | — | v5 |
| used_at | timestamptz | — | v5 |
| discount_type | varchar(20) | — | v5 |
| discount_value | numeric(10,2) | — | v5 |
| min_spend | numeric(10,2) | — | v5 |
| source | varchar(30) | — | v4 |
| source_id | integer | — | v4 |

### promo_banners (new columns)
| Column | Type | Default | Migration |
|--------|------|---------|-----------|
| survey_id | integer FK | — | v1 |
| action_type | varchar(20) | 'detail' | v1 |
| terms | json | — | v2 |
| how_to_redeem | text | — | v2 |
| long_description | text | — | v3 |
| voucher_id | integer FK | — | v4 |

### wallet_transactions (new columns)
| Column | Type | Default | Migration |
|--------|------|---------|-----------|
| balance_after | numeric(10,2) | — | v5 |

### New Tables
| Table | Migration | Purpose |
|-------|-----------|---------|
| surveys | v1 | Survey forms (company-wide) |
| survey_questions | v1 | Questions within surveys |
| survey_responses | v1 | Customer responses |
| survey_answers | v1 | Individual answers |

## Completed Features Summary

### Marketing Group (Session 3-4)
1. ✅ **6 Admin Pages** — Rewards, Vouchers, Promotions, Feedback, Surveys, Marketing Reports
2. ✅ **5 PWA Endpoint Files** — pwa_promos, pwa_surveys, pwa_wallet, scan_cron, admin_surveys
3. ✅ **5 Migrations** — marketing_group_v1 through customer_wallet_v5 (27 total migrations)
4. ✅ **Catalog→Instance Pattern** — rewards/vouchers use catalog template + per-customer instances
5. ✅ **Per-Instance Codes** — Each user_reward/user_voucher has unique scannable code
6. ✅ **Per-Instance Expiry** — validity_days on catalog → expires_at on instance
7. ✅ **Discount Snapshots** — Frozen discount details on user_voucher at claim time
8. ✅ **Barista Scan** — POST /scan/reward/{code} and /scan/voucher/{code}
9. ✅ **Cron Expiry** — POST /scan/cron/expire marks expired instances
10. ✅ **Repeat Protection** — Guards against duplicate claims, submissions, redemptions
11. ✅ **Source Tracking** — user_vouchers.source tracks origin (survey, promo_detail, admin_grant, loyalty)
12. ✅ **Voucher Auto-Grant** — Survey completion and promo claim auto-grant voucher instances

### Pre-Phase 3 Checklist
1. ✅ Cross-Store Validation at Order Creation
2. ✅ Self-Referral Prevention
3. ✅ Public Endpoint for Customization Options
4. ✅ Token Blacklist Cleanup
5. ✅ Audit Log Hooks (25 log_action calls across 7 files)
6. ✅ Timezone-Aware Datetimes
7. ✅ Feedback Stats API
8. ✅ Reports Date Range Presets

### ACL Migration (Session 15-16)
1. ✅ 6 new ACL lookup tables replacing PG enum columns
2. ✅ 30 `require_role()` calls converted from strings to `RoleIDs` constants
3. ✅ Frontend rewritten for integer-based ACL (StaffPage, Sidebar, MenuPage, InventoryPage)
4. ✅ All 19 API endpoint groups tested and passing
5. ✅ Orphaned PG enums dropped (`userrole`, `usertype`, `user_role`)

### Transaction Consistency (Session 17)
1. ✅ Removed all explicit `await db.commit()` from 22 endpoint files
2. ✅ Standardized on auto-commit via `get_db()` dependency
3. ✅ Fixed voucher unique constraint bug on update (skip unchanged `code` field)
4. ✅ 25/25 API endpoints tested and passing
5. ✅ Documentation updated with transaction pattern rules

### Phase 2 Features
1. ✅ Soft delete filters
2. ✅ Rate limiting (slowapi)
3. ✅ File upload validation
4. ✅ Charts (BarChart/DonutChart/SparkLine)
5. ✅ Customization options integration
6. ✅ delivery_provider
7. ✅ Staff clock-in fix
8. ✅ Customer PWA refactor

## Outstanding Items (Phase 3)

1. **Customer PWA rebuild** — Use new wallet API (GET /me/wallet, rewards catalog, voucher instances, scan)
2. **Stripe payments** — Payment intent integration
3. **Twilio SMS OTP** — Real OTP delivery
4. **WhatsApp notifications** — Business API integration
5. **Firebase FCM** — Push notification delivery
