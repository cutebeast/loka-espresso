# V3 vs Legacy Audit Report

> Comprehensive comparison of v3 implementation against legacy backend documentation.
> Date: 2026-05-07

---

## 1. Executive Summary

| Area | Status | Notes |
|------|--------|-------|
| Identity & Access Management | ✅ Improved | v3 is more normalized (principal pattern) |
| Store Operations | ✅ Improved | More comprehensive, same core entities |
| Customer Management | ✅ Improved | GDPR-ready, better structured |
| Staff Management | ✅ Improved | PIN hashed (legacy was plaintext) |
| Platform/Governance | ✅ Improved | Better audit log, health metrics |
| Order & Payment | ❌ Missing | No models implemented |
| Menu & Inventory | ❌ Missing | No models implemented |
| Cart & Checkout | ❌ Missing | No models implemented |
| Loyalty & Wallet | ❌ Missing | No models implemented |
| Vouchers & Marketing | ❌ Missing | No models implemented |
| Notifications | ❌ Missing | No models implemented |
| Content (info cards, splash) | ❌ Missing | No models implemented |
| Surveys | ❌ Missing | No models implemented |
| Auth Endpoints | ❌ Missing | Only skeleton exists |
| Pydantic Schemas | ❌ Missing | Not started |
| API Routes | ❌ Missing | Only health check |

---

## 2. Architecture Comparison

### 2.1 User Model Split

| Aspect | Legacy | V3 | Assessment |
|--------|--------|-----|------------|
| Customer auth | `customers` table, OTP | `customers` table, OTP | ✅ Compatible |
| Admin auth | `admin_users` table, password | `admin_accounts` + `iam_principals` | ✅ Better |
| Staff auth | `staff` table + `admin_users` FK, PIN plaintext | `staff_profiles` + `iam_principals`, PIN bcrypt | ✅ Much better |
| User polymorphism | `User` base class (all users in one table) | `IAMPrincipal` hub with type discrimination | ✅ Cleaner |

**⚠️ Migration Concern**: Legacy has `users` base table (all user types) + `admin_users` + `customers`. V3 uses `iam_principals` as identity hub. Need migration script to map legacy `users.id` → `iam_principals.id` with correct `principal_type`.

### 2.2 ACL/RBAC

| Aspect | Legacy | V3 | Assessment |
|--------|--------|-----|------------|
| Roles | `roles` (id, name) | `iam_roles` (id, role_key, scope_level) | ✅ Better |
| Permissions | `permissions` (id, name) | `iam_permissions` (resource, action, is_dangerous) | ✅ Better |
| Role-Permission | `role_permissions` (role_id, permission_id) | `role_permission` + `conditions` JSONB | ✅ Supports ABAC |
| User-Role | `users.role_id` (direct FK) | `role_assignments` (temporal validity) | ✅ Supports expiry |
| Store Access | `user_store_access` (user_id, store_id) | `store_assignments` + capability flags | ✅ More granular |

**⚠️ Compatibility Gap**: Legacy tokens contain `user_type` ("admin"/"customer"). V3 should emit same for backward compatibility during migration.

### 2.3 Security

| Aspect | Legacy | V3 | Assessment |
|--------|--------|-----|------------|
| Password hash | bcrypt | Argon2id | ✅ Upgrade |
| PIN hash | plaintext (staff.pin_code) | bcrypt (staff_profiles.pin_hash) | ✅ Critical fix |
| JWT | HS256, jti blacklist | HS256, jti blacklist | ✅ Same |
| Token transport | httpOnly cookies + Bearer | Should match | ⚠️ Not implemented |
| Rate limiting | slowapi (in-memory) | TBD | ⚠️ Not implemented |
| OTP bypass | `app_config` table (key-value) | `platform_config` table (dot-notation) | ✅ Improved |

---

## 3. Domain-by-Domain Gap Analysis

### 3.1 IAM Domain (`iam.py`)

| Legacy Table | V3 Table | Status | Notes |
|--------------|----------|--------|-------|
| `users` | `iam_principals` | ✅ Implemented | V3 more abstract |
| `admin_users` | `admin_accounts` + `iam_principals` | ✅ Implemented | V3 adds MFA, lockout tracking |
| `user_types` | — | ⚠️ Replaced | Legacy had 4 user types; v3 uses principal_type + roles |
| `roles` | `iam_roles` | ✅ Implemented | V3 adds scope_level, is_system |
| `permissions` | `iam_permissions` | ✅ Implemented | V3 adds resource/action/is_dangerous |
| `role_permissions` | `role_permission` | ✅ Implemented | V3 adds conditions JSONB |
| `role_user_type` | — | ⚠️ Replaced | Legacy junction; v3 roles are standalone |
| `user_store_access` | `store_assignments` | ✅ Implemented | V3 adds capability flags |
| `api_keys` | `api_credentials` | ✅ Implemented | V3 adds rate limiting, scopes |

**Missing in V3 IAM:**
- `TokenBlacklist` model (legacy has `token_blacklist` table)
- `OTPSession` model (legacy has `otp_sessions` table)
- `PINAttempt` model (legacy has `pin_attempts` table)

### 3.2 Store Domain (`store.py`)

| Legacy Table | V3 Table | Status | Notes |
|--------------|----------|--------|-------|
| `stores` | `stores` | ✅ Implemented | V3 adds brand_name, tax_registration, delivery radius |
| `store_operating_hours` | `store_operating_hours` | ✅ Implemented | V3 adds last_order_time |
| `store_special_hours` | `store_special_hours` | ✅ Implemented | V3 adds reason field |
| `store_configurations` | `store_configuration` | ✅ Implemented | Same |
| `store_tables` | `dining_tables` | ✅ Implemented | V3 adds qr_code_token, capacity, section |
| `table_occupancy_snapshot` | `table_status_snapshot` | ✅ Implemented | V3 adds server_staff_id |

**Legacy gap**: Legacy `stores` has `lat`/`lng` (Float). V3 has `latitude`/`longitude` (Numeric(10,8)/(11,8)). API responses should maintain same field names for compatibility.

### 3.3 Customer Domain (`customer.py`)

| Legacy Table | V3 Table | Status | Notes |
|--------------|----------|--------|-------|
| `customers` | `customers` | ✅ Implemented | V3 adds GDPR fields (anonymized_at), LTV, referral tree |
| `user_addresses` | `customer_addresses` | ✅ Implemented | V3 more structured (line_1/2, city, etc.) |
| `device_tokens` | `customer_devices` | ✅ Implemented | V3 adds fingerprint, device_model |
| — | `customer_consents` | ✅ New | GDPR consent tracking |

**Legacy compatibility**: Legacy `customers` has `phone_verified` (boolean). V3 has `phone_verified_at` (timestamp). Need to handle this in migration.

### 3.4 Staff Domain (`staff.py`)

| Legacy Table | V3 Table | Status | Notes |
|--------------|----------|--------|-------|
| `staff` | `staff_profiles` | ✅ Implemented | V3: PIN hashed, links to principal |
| `staff_shifts` | `staff_time_events` | ✅ Implemented | V3 adds GPS coords, photo_proof |
| `pin_attempts` | ❌ Missing | ❌ Not implemented | Rate limiting for PIN |
| — | `tip_allocations` | ✅ New | Per-order tip distribution |

**⚠️ Critical**: Legacy `staff.pin_code` is plaintext. V3 uses `pin_hash`. Need migration script to hash all existing PINs or force reset.

### 3.5 Platform Domain (`platform.py`)

| Legacy Table | V3 Table | Status | Notes |
|--------------|----------|--------|-------|
| `app_config` | `platform_config` | ✅ Implemented | V3 uses dot-notation keys, JSONB values |
| `audit_log` | `audit_logs` | ✅ Implemented | V3 adds tamper-evident before/after states |
| — | `scheduled_jobs` | ✅ New | Cron job tracking |
| — | `data_retention_policies` | ✅ New | GDPR auto-purge rules |
| — | `system_health_metrics` | ✅ New | Time-series buckets |

**Legacy compatibility**: Legacy reads `app_config` with flat keys (`otp_bypass_enabled`). V3 uses `otp.bypass_enabled`. Migration script needs to convert keys.

### 3.6 Order Domain — ❌ NOT IMPLEMENTED

| Legacy Table | V3 Table | Status |
|--------------|----------|--------|
| `orders` | ❌ Missing | ❌ |
| `order_items` | ❌ Missing | ❌ |
| `order_status_history` | ❌ Missing | ❌ |
| `cart_items` | ❌ Missing | ❌ |
| `checkout_tokens` | ❌ Missing | ❌ |
| `payments` | ❌ Missing | ❌ |

**Key legacy requirements for v3:**
- Orders have BOTH denormalized `items` JSON AND normalized `order_items`
- Order status enum: `pending`, `paid`, `confirmed`, `preparing`, `ready`, `out_for_delivery`, `completed`, `cancelled`
- Payment status tracked separately from order status
- `pos_synced_at`, `pos_synced_by` for manual POS reconciliation
- `delivery_*` fields for 3PL integration
- `voucher_discount`, `reward_discount` separate fields
- `loyalty_points_earned`
- Check constraints: `discount >= 0`, `delivery_fee >= 0`, `total >= 0`

### 3.7 Menu Domain — ❌ NOT IMPLEMENTED

| Legacy Table | V3 Table | Status |
|--------------|----------|--------|
| `menu_categories` | ❌ Missing | ❌ |
| `menu_items` | ❌ Missing | ❌ |
| `customization_options` | ❌ Missing | ❌ |

**Key legacy requirements:**
- Menu is UNIVERSAL (no store_id on categories/items)
- `menu_items` has `category_id`, `name`, `description`, `price`, `image_url`, `is_available`, `is_featured`, `sort_order`
- `customization_options` links to `menu_items` with `name`, `price_adjustment`, `is_available`

### 3.8 Inventory Domain — ❌ NOT IMPLEMENTED

| Legacy Table | V3 Table | Status |
|--------------|----------|--------|
| `inventory_categories` | ❌ Missing | ❌ |
| `inventory_items` | ❌ Missing | ❌ |
| `inventory_movements` | ❌ Missing | ❌ |

**Key legacy requirements:**
- Inventory is PER-STORE (store_id on categories/items)
- `inventory_items` has `current_stock`, `reorder_level`, `unit`
- `inventory_movements` tracks `received`, `used`, `adjusted`, `wasted`
- Legacy has system endpoint `POST /admin/system/backfill-inventory-ledger`

### 3.9 Loyalty Domain — ❌ NOT IMPLEMENTED

| Legacy Table | V3 Table | Status |
|--------------|----------|--------|
| `loyalty_accounts` | ❌ Missing | ❌ |
| `loyalty_transactions` | ❌ Missing | ❌ |
| `loyalty_tiers` | ❌ Missing | ❌ |
| `rewards` | ❌ Missing | ❌ |
| `user_rewards` | ❌ Missing | ❌ |

**Key legacy requirements:**
- One loyalty account per user, GLOBAL scope
- Tier based on `total_points_earned` (lifetime cumulative, does NOT drop when spent)
- 4 tiers seeded: Bronze (0pts, 1.0x), Silver (1000pts, 1.25x), Gold (3000pts, 1.5x), Platinum (5000pts, 2.0x)
- Rewards catalog (company-wide) with `reward_type`: `free_item`, `discount_voucher`, `custom`
- `user_rewards` is per-customer instance with `redemption_code`, `status` (`available`/`used`/`expired`/`cancelled`)

### 3.10 Wallet Domain — ❌ NOT IMPLEMENTED

| Legacy Table | V3 Table | Status |
|--------------|----------|--------|
| `wallets` | ❌ Missing | ❌ |
| `wallet_transactions` | ❌ Missing | ❌ |
| `payment_methods` | ❌ Missing | ❌ |

**Key legacy requirements:**
- One wallet per user
- `wallet_transactions` types: `topup`, `payment`, `refund`, `promo_credit`, `admin_adjustment`
- `payment_methods` stores saved cards (last4, provider, is_default)

### 3.11 Voucher & Marketing Domain — ❌ NOT IMPLEMENTED

| Legacy Table | V3 Table | Status |
|--------------|----------|--------|
| `vouchers` | ❌ Missing | ❌ |
| `user_vouchers` | ❌ Missing | ❌ |
| `information_cards` | ❌ Missing | ❌ |
| `promo_banners` | ❌ Missing | ❌ |
| `marketing_campaigns` | ❌ Missing | ❌ |
| `notification_broadcasts` | ❌ Missing | ❌ |

**Key legacy requirements:**
- Voucher catalog with `discount_type`: `percent`, `fixed`, `free_item`
- `user_vouchers` per-instance with `source` (survey, promo_detail, admin_grant, loyalty)
- `information_cards` content types: `information`, `product`, `promotion`, `system`
- Promo banners with `action_type`: `detail` or `survey`
- Marketing campaigns track sent/delivered/opened/clicked/failed counts

### 3.12 Survey Domain — ❌ NOT IMPLEMENTED

| Legacy Table | V3 Table | Status |
|--------------|----------|--------|
| `surveys` | ❌ Missing | ❌ |
| `survey_questions` | ❌ Missing | ❌ |
| `survey_responses` | ❌ Missing | ❌ |
| `survey_answers` | ❌ Missing | ❌ |

**Key legacy requirements:**
- Max 5 questions per survey
- Question types: `text`, `single_choice`, `rating`, `dropdown`
- One response per customer per survey (duplicate guard)
- Auto-grant voucher on completion via `reward_voucher_id`

### 3.13 Social Domain — ❌ NOT IMPLEMENTED

| Legacy Table | V3 Table | Status |
|--------------|----------|--------|
| `favorites` | ❌ Missing | ❌ |
| `referrals` | ❌ Missing | ❌ |
| `feedback` | ❌ Missing | ❌ |
| `notifications` | ❌ Missing | ❌ |

### 3.14 System Config — Partially Implemented

| Legacy Table | V3 Table | Status |
|--------------|----------|--------|
| `app_config` | `platform_config` | ✅ Implemented |
| `splash_content` | ❌ Missing | ❌ |
| `audit_log` | `audit_logs` | ✅ Implemented |
| `token_blacklist` | ❌ Missing | ❌ |
| `otp_sessions` | ❌ Missing | ❌ |

---

## 4. API Endpoint Gap Analysis

### 4.1 Auth Endpoints (`/auth/*`)

| Endpoint | Legacy | V3 | Status |
|----------|--------|-----|--------|
| `POST /auth/send-otp` | ✅ | ❌ | Not implemented |
| `POST /auth/verify-otp` | ✅ | ❌ | Not implemented |
| `POST /auth/login-password` | ✅ | ❌ | Not implemented |
| `POST /auth/refresh` | ✅ | ❌ | Not implemented |
| `POST /auth/logout` | ✅ | ❌ | Not implemented |
| `GET /auth/session` | ✅ | ❌ | Not implemented |
| `POST /auth/register` | ✅ | ❌ | Not implemented |
| `POST /auth/device-token` | ✅ | ❌ | Not implemented |
| `DELETE /auth/device-token` | ✅ | ❌ | Not implemented |
| `POST /auth/change-password` | ✅ | ❌ | Not implemented |

**Legacy auth behavior to preserve:**
1. OTP generation: 6-digit code, 300s TTL, 60s resend cooldown, max 3 per 15min window
2. OTP bypass reads from DB config (`app_config` in legacy, `platform_config` in v3)
3. After OTP verify: create customer if new, set `phone_verified=True`
4. First login without name triggers `is_new_user=True` in response
5. Tokens in httpOnly cookies + Bearer header
6. Refresh rotates tokens (blacklists old refresh)
7. Password login for admin users with bcrypt verify
8. Token blacklist on logout

### 4.2 Admin System Endpoints (`/admin/*`)

| Endpoint | Legacy | V3 | Status |
|----------|--------|-----|--------|
| `GET /admin/otps` | ✅ | ❌ | Not implemented |
| `GET /admin/users/{id}` | ✅ | ❌ | Not implemented |
| `GET /admin/audit-log` | ✅ | ❌ | Not implemented |
| `DELETE /admin/system/reset` | ✅ | ❌ | Not implemented |
| `POST /admin/system/init-hq` | ✅ | ❌ | Not implemented |
| `POST /admin/system/backfill-inventory-ledger` | ✅ | ❌ | Not implemented |

### 4.3 Customer Endpoints

| Endpoint | Legacy | V3 | Status |
|----------|--------|-----|--------|
| `GET /users/me` | ✅ | ❌ | Not implemented |
| `PUT /users/me` | ✅ | ❌ | Not implemented |
| `GET /users/addresses` | ✅ | ❌ | Not implemented |
| `POST /users/addresses` | ✅ | ❌ | Not implemented |
| `GET /users/favorites` | ✅ | ❌ | Not implemented |
| `POST /users/favorites` | ✅ | ❌ | Not implemented |
| `GET /users/wallet` | ✅ | ❌ | Not implemented |
| `GET /users/loyalty` | ✅ | ❌ | Not implemented |
| `GET /users/rewards` | ✅ | ❌ | Not implemented |
| `GET /users/vouchers` | ✅ | ❌ | Not implemented |

### 4.4 Store/Menu Endpoints

| Endpoint | Legacy | V3 | Status |
|----------|--------|-----|--------|
| `GET /stores` | ✅ | ❌ | Not implemented |
| `GET /stores/{id}` | ✅ | ❌ | Not implemented |
| `GET /stores/{id}/menu` | ✅ | ❌ | Not implemented |
| `GET /menu/categories` | ✅ | ❌ | Not implemented |
| `GET /menu/items` | ✅ | ❌ | Not implemented |

### 4.5 Order Endpoints

| Endpoint | Legacy | V3 | Status |
|----------|--------|-----|--------|
| `GET /cart` | ✅ | ❌ | Not implemented |
| `POST /cart` | ✅ | ❌ | Not implemented |
| `PUT /cart/{id}` | ✅ | ❌ | Not implemented |
| `DELETE /cart/{id}` | ✅ | ❌ | Not implemented |
| `POST /checkout` | ✅ | ❌ | Not implemented |
| `POST /orders` | ✅ | ❌ | Not implemented |
| `GET /orders` | ✅ | ❌ | Not implemented |
| `GET /orders/{id}` | ✅ | ❌ | Not implemented |
| `PATCH /orders/{id}/status` | ✅ | ❌ | Not implemented |
| `PATCH /orders/{id}/payment-status` | ✅ | ❌ | Not implemented |

### 4.6 Staff/Kitchen Endpoints

| Endpoint | Legacy | V3 | Status |
|----------|--------|-----|--------|
| `POST /staff/clock-in` | ✅ | ❌ | Not implemented |
| `POST /staff/clock-out` | ✅ | ❌ | Not implemented |
| `GET /kitchen/orders` | ✅ | ❌ | Not implemented |

---

## 5. Configuration System Comparison

### 5.1 OTP Bypass

| Aspect | Legacy | V3 |
|--------|--------|-----|
| Table | `app_config` | `platform_config` |
| Enable key | `otp_bypass_enabled` | `otp.bypass_enabled` |
| Code key | `otp_bypass_code` | `otp.bypass_code` |
| Data type | string ("true"/"false") | boolean (JSONB) |

**✅ Assessment**: V3 design is superior. Dot-notation is cleaner, JSONB values are typed. Migration script needs key transformation.

### 5.2 Other Runtime Config

Legacy `app_config` also stores:
- `otp_rate_limit` (int)
- Various feature flags

V3 `platform_config` should support these with typed getters.

---

## 6. Data Type & Field Name Compatibility

### 6.1 Critical Field Name Mismatches

| Legacy | V3 | Impact |
|--------|-----|--------|
| `users.phone` | `customers.phone_number` | API response field name |
| `users.name` | `customers.display_name` | API response field name |
| `users.email` | `customers.email_address` | API response field name |
| `users.avatar_url` | `customers.avatar_url` | ✅ Same |
| `users.is_active` | `customers.is_active` | ✅ Same |
| `users.referral_code` | `customers.referral_code` | ✅ Same |
| `users.phone_verified` | `customers.phone_verified_at` | Boolean vs timestamp |
| `stores.lat` | `stores.latitude` | API response field name |
| `stores.lng` | `stores.longitude` | API response field name |
| `stores.name` | `stores.store_name` | API response field name |

**⚠️ Recommendation**: Pydantic schemas should use `Field(alias=...)` to maintain legacy API contract while using new DB field names internally.

### 6.2 Numeric Precision

| Legacy | V3 |
|--------|-----|
| `numeric(10,2)` for prices | Same pattern in v3 DDL |
| `numeric(3,2)` for multipliers | Same pattern in v3 DDL |
| Float for lat/lng | `Numeric(10,8)` / `Numeric(11,8)` |

**✅ Assessment**: V3 DDL uses appropriate precision.

---

## 7. Enum Comparison

| Legacy Enum | Values | V3 Enum | Status |
|-------------|--------|---------|--------|
| `user_type` | customer, admin, staff, manager | Replaced by `principal_type` | ✅ Better |
| `order_type` | dine_in, pickup, delivery | TBD | ❌ Not implemented |
| `order_status` | pending, paid, confirmed, preparing, ready, out_for_delivery, completed, cancelled | TBD | ❌ Not implemented |
| `staff_role` | manager, assistant_manager, barista, cashier, delivery | TBD | ❌ Not implemented |
| `tx_type` | earn, redeem, expire | TBD | ❌ Not implemented |
| `wallet_tx_type` | topup, payment, refund, promo_credit, admin_adjustment | TBD | ❌ Not implemented |
| `reward_type` | free_item, discount_voucher, custom | TBD | ❌ Not implemented |
| `discount_type` | percent, fixed, free_item | TBD | ❌ Not implemented |
| `inventory_movement_type` | received, used, adjusted, wasted | TBD | ❌ Not implemented |
| `information_card_type` | information, product, promotion, system | TBD | ❌ Not implemented |

---

## 8. Missing Models — Implementation Priority

### Priority 1: Auth & Core (Blocks everything)
1. `OTPSession` — Required for customer login
2. `TokenBlacklist` — Required for logout/refresh
3. `PINAttempt` — Required for staff PIN security

### Priority 2: Menu & Inventory (Blocks orders)
4. `MenuCategory`
5. `MenuItem`
6. `CustomizationOption`
7. `InventoryCategory`
8. `InventoryItem`
9. `InventoryMovement`

### Priority 3: Order & Payment (Core business)
10. `Order`
11. `OrderItem`
12. `OrderStatusHistory`
13. `CartItem`
14. `CheckoutToken`
15. `Payment`

### Priority 4: Customer Features
16. `LoyaltyAccount`
17. `LoyaltyTransaction`
18. `LoyaltyTier`
19. `Reward`
20. `UserReward`
21. `Wallet`
22. `WalletTransaction`
23. `PaymentMethod`

### Priority 5: Marketing & Content
24. `Voucher`
25. `UserVoucher`
26. `InformationCard`
27. `PromoBanner`
28. `Survey`
29. `SurveyQuestion`
30. `SurveyResponse`
31. `SurveyAnswer`
32. `MarketingCampaign`
33. `NotificationBroadcast`

### Priority 6: Social & System
34. `Favorite`
35. `Referral`
36. `Feedback`
37. `Notification`
38. `SplashContent`

---

## 9. Seed Data Gaps

Current v3 seed (`08_seed_data.sql`) has:
- ✅ 9 IAM roles
- ✅ 22 IAM permissions
- ✅ 2 stores with operating hours
- ✅ 1 super admin
- ✅ 4 loyalty tiers
- ✅ platform_config rows (OTP)
- ✅ Data retention policies

**Missing seed data compared to legacy:**
- ❌ Menu categories and items
- ❌ Inventory categories and items
- ❌ Dining tables
- ❌ Rewards (8 items)
- ❌ Vouchers (5 checkout + 3 survey reward)
- ❌ Surveys (3) with questions (10)
- ❌ Promo banners (5)
- ❌ Information cards (3 system + promotions)
- ❌ Marketing campaigns (3)
- ❌ Sample orders (30) with order_items (58)
- ❌ Sample staff (21)

---

## 10. Migration Concerns

### 10.1 Data Migration Script Requirements

1. **User Identity Migration**:
   - Map legacy `users` → `iam_principals` with type detection
   - Map `admin_users` → `admin_accounts` + link to principal
   - Map `customers` → `customers` + link to principal
   - Map `staff` → `staff_profiles` + link to principal

2. **Password Hash Migration**:
   - Admin passwords: bcrypt → Argon2id (re-hash on first login OR batch re-hash)
   - Staff PINs: plaintext → bcrypt (MUST force reset, cannot migrate)

3. **Config Key Migration**:
   - `otp_bypass_enabled` → `otp.bypass_enabled`
   - `otp_bypass_code` → `otp.bypass_code`
   - `otp_rate_limit` → `otp.rate_limit_per_minute`

4. **Field Name Mapping**:
   - `phone_verified` (bool) → `phone_verified_at` (timestamp, set to now() if true)

### 10.2 Backward Compatibility

- API contracts must remain identical during transition
- Pydantic schemas should use `Field(alias=...)` for renamed fields
- JWT token format should remain identical (same claims)
- Cookie names and settings should match legacy

---

## 11. Action Items

### Immediate (This Sprint)

- [ ] Implement missing auth models: `OTPSession`, `TokenBlacklist`, `PINAttempt`
- [ ] Implement auth endpoints: send-otp, verify-otp, login-password, refresh, logout, session
- [ ] Implement `MenuCategory`, `MenuItem`, `CustomizationOption` models
- [ ] Implement `InventoryCategory`, `InventoryItem`, `InventoryMovement` models
- [ ] Implement `Order`, `OrderItem`, `OrderStatusHistory`, `CartItem`, `Payment` models

### Short Term (Next 2 Sprints)

- [ ] Implement Loyalty, Wallet, Reward models
- [ ] Implement Voucher, PromoBanner, InformationCard models
- [ ] Implement Survey models
- [ ] Implement Notification, MarketingCampaign models
- [ ] Implement Social models (Favorites, Feedback, Referrals)
- [ ] Create comprehensive seed data matching legacy
- [ ] Generate Alembic baseline migration

### Medium Term (Before Production)

- [ ] Write data migration scripts from legacy to v3
- [ ] API compatibility testing against legacy frontend
- [ ] Performance testing (indexes, query patterns)
- [ ] Security audit (PIN hashing, JWT rotation, rate limiting)
- [ ] Write tests for all endpoints (per rebuild plan policy)
