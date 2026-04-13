# FNB Super-App — Database Schema

> Last updated: 2026-04-13 | PostgreSQL 16 | Database: `fnb` | 41 tables | 60+ FKs | 1 trigger

## Enums

| Enum | Values |
|------|--------|
| `userrole` | `customer`, `store_owner`, `admin` |
| `staffrole` | `manager`, `assistant_manager`, `barista`, `cashier`, `delivery` |
| `ordertype` | `dine_in`, `pickup`, `delivery` |
| `orderstatus` | `pending`, `confirmed`, `preparing`, `ready`, `completed`, `cancelled` |
| `discounttype` | `percent`, `fixed`, `free_item` |
| `rewardtype` | `free_item`, `discount_voucher`, `custom` |
| `txtype` | `earn`, `redeem`, `expire` |
| `wallettxtype` | `topup`, `payment`, `refund` |

## Triggers

| Trigger | Table | Event | Purpose |
|---------|-------|-------|---------|
| `trg_order_status_occupancy` | `orders` | AFTER INSERT OR UPDATE OF status | Auto-updates `table_occupancy_snapshot` when dine-in orders become active/completed |

---

## Tables by Domain

### User Management

#### `users`
Core user accounts. All authenticated users (customers, store owners, admins).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | Primary key |
| phone | varchar | YES | | Phone number (used for OTP login) |
| email | varchar | YES | | Email (used for password login) |
| name | varchar | YES | | Display name |
| password_hash | varchar | YES | | bcrypt hash |
| role | userrole | NO | | `customer`, `store_owner`, `admin` |
| avatar_url | varchar | YES | | Profile image |
| referral_code | varchar | YES | | Unique referral code |
| referred_by | integer | YES | | FK→users.id |
| is_active | boolean | NO | true | Account status |
| phone_verified | boolean | NO | false | Whether phone was verified via OTP |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**FKs:** referred_by → users(id)

#### `user_addresses`
Saved delivery addresses for customers.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| label | varchar | NO | | "Home", "Office", etc. |
| address | text | NO | | Full address string |
| lat | numeric | YES | | Latitude |
| lng | numeric | YES | | Longitude |
| is_default | boolean | NO | | Default address flag |
| created_at | timestamptz | YES | now() | |

**FKs:** user_id → users(id)

#### `device_tokens`
Push notification tokens (FCM/APNs).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| token | varchar | NO | | Device push token |
| platform | varchar | YES | | `ios`, `android`, `web` |
| is_active | boolean | NO | true | Active token flag |
| created_at | timestamptz | YES | now() | |

#### `token_blacklist`
Revoked JWT tokens for proper logout. Checked on every authenticated request.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| jti | varchar | NO | | JWT ID claim (unique) |
| user_id | integer | YES | | FK→users.id |
| expires_at | timestamptz | NO | | When the token naturally expires |
| created_at | timestamptz | YES | now() | When blacklisted |

#### `otp_sessions`
OTP codes for phone-based authentication.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| phone | varchar | NO | | Target phone number |
| code | varchar | NO | | 6-digit OTP code |
| verified | boolean | NO | false | Whether OTP was verified |
| expires_at | timestamptz | NO | | Expiry timestamp |
| created_at | timestamptz | YES | now() | |

---

### Store Management

#### `stores`
Physical store/outlet locations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| name | varchar(255) | NO | | Store display name |
| slug | varchar(100) | NO | | URL-safe identifier (unique) |
| address | text | YES | | Physical address |
| lat | numeric(10,7) | YES | | Latitude |
| lng | numeric(10,7) | YES | | Longitude |
| phone | varchar(20) | YES | | Store phone |
| image_url | varchar(500) | YES | | Store photo |
| opening_hours | json | YES | | `{"mon": "08:00-22:00", ...}` |
| pickup_lead_minutes | integer | YES | 15 | Minimum lead time for pickup |
| delivery_radius_km | numeric(5,2) | YES | 5.0 | Max delivery distance |
| is_active | boolean | NO | true | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

#### `store_tables`
Dine-in tables with QR codes. PER-STORE.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| store_id | integer | NO | | FK→stores.id |
| table_number | varchar(20) | NO | | "A1", "B2", etc. |
| qr_code_url | varchar(500) | YES | | QR code URL |
| capacity | integer | YES | 4 | Seats |
| is_active | boolean | NO | true | |
| is_occupied | boolean | NO | false | Real-time occupancy flag |

**FKs:** store_id → stores(id)

#### `table_occupancy_snapshot`
Denormalized real-time occupancy. Auto-updated by trigger.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| table_id | integer | NO | | PK, FK→store_tables.id |
| store_id | integer | NO | | FK→stores.id |
| is_occupied | boolean | NO | false | Current occupancy |
| current_order_id | integer | YES | | FK→orders.id (ON DELETE SET NULL) |
| updated_at | timestamptz | YES | now() | |

**Indexes:** (store_id, is_occupied)
**Trigger-updated** by `trg_order_status_occupancy`:
- On order status → `confirmed`/`preparing`: sets `is_occupied=TRUE`
- On order status → `completed`/`cancelled`: sets `is_occupied=FALSE`

---

### Menu Management

#### `menu_categories`
Menu sections (Coffee, Non-Coffee, Food). PER-STORE.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| store_id | integer | NO | | FK→stores.id |
| name | varchar(255) | NO | | Category name |
| slug | varchar(100) | YES | | URL-safe slug |
| display_order | integer | YES | 0 | Sort order |
| is_active | boolean | NO | true | |

**FKs:** store_id → stores(id)

#### `menu_items`
Individual menu items. PER-STORE. Supports soft delete.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| store_id | integer | NO | | FK→stores.id |
| category_id | integer | NO | | FK→menu_categories.id |
| name | varchar(255) | NO | | Item name |
| description | text | YES | | Description |
| base_price | numeric(10,2) | NO | | Base price in RM |
| image_url | varchar(500) | YES | | Item photo |
| customization_options | json | YES | | Legacy JSON add-ons |
| is_available | boolean | NO | true | Currently available |
| display_order | integer | YES | 0 | Sort order |
| popularity | integer | YES | 0 | Order count |
| deleted_at | timestamptz | YES | | Soft delete timestamp |

**FKs:** store_id → stores(id), category_id → menu_categories(id)

#### `customization_options`
Normalized add-ons for menu items. Enables "revenue from add-ons" reporting.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| menu_item_id | integer | NO | | FK→menu_items.id (ON DELETE CASCADE) |
| name | varchar(100) | NO | | "Extra Shot", "Oat Milk" |
| price_adjustment | numeric(10,2) | NO | 0 | Additional cost |
| is_active | boolean | NO | true | |
| display_order | integer | YES | 0 | Sort order |
| created_at | timestamptz | YES | now() | |

**FKs:** menu_item_id → menu_items(id) ON DELETE CASCADE

#### `inventory_items`
Stock levels for ingredients/supplies. PER-STORE.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| store_id | integer | NO | | FK→stores.id |
| name | varchar(255) | NO | | "Arabica Beans" |
| current_stock | numeric(10,2) | YES | 0 | Current quantity |
| unit | varchar(50) | YES | | "kg", "litre", "pcs" |
| reorder_level | numeric(10,2) | YES | 0 | Threshold for reorder alert |
| cost_per_unit | numeric(10,2) | YES | | Cost price |
| updated_at | timestamptz | YES | now() | |

**FKs:** store_id → stores(id)

---

### Ordering

#### `orders`
Main order table. HYBRID scope (user + store).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| store_id | integer | NO | | FK→stores.id |
| table_id | integer | YES | | FK→store_tables.id (dine-in only) |
| order_number | varchar(50) | NO | | Unique: "ORD-XXXXXXXX" |
| order_type | ordertype | NO | | `dine_in`, `pickup`, `delivery` |
| items | json | NO | | Denormalized line items (legacy) |
| subtotal | numeric(10,2) | NO | | Before fees/discounts |
| delivery_fee | numeric(10,2) | YES | 0 | Delivery charge |
| discount | numeric(10,2) | YES | 0 | Discount amount |
| total | numeric(10,2) | NO | | Final amount |
| status | orderstatus | NO | pending | Current status |
| pickup_time | timestamptz | YES | | Scheduled pickup time |
| delivery_address | json | YES | | Delivery address details |
| payment_method | varchar(50) | YES | | Payment method used |
| payment_status | varchar(50) | YES | pending | Payment state |
| loyalty_points_earned | integer | YES | 0 | Points earned on this order |
| notes | text | YES | | Customer notes |
| delivery_provider | varchar(50) | YES | | `grab`, `panda`, `internal` |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**Indexes:** order_number (unique), user_id, store_id, table_id (ix_orders_table_id)
**FKs:** user_id→users, store_id→stores, table_id→store_tables

#### `order_items`
Normalized line items for structured queries.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| order_id | integer | NO | | FK→orders.id |
| menu_item_id | integer | YES | | FK→menu_items.id (**ON DELETE SET NULL**) |
| name | varchar(255) | NO | | Item name at time of order |
| quantity | integer | NO | | |
| unit_price | numeric(10,2) | NO | | Price per unit |
| customizations | json | YES | | Customization details |
| line_total | numeric(10,2) | NO | | quantity × unit_price + adjustments |
| created_at | timestamptz | YES | now() | |

**FKs:** order_id→orders(id), menu_item_id→menu_items(id) ON DELETE SET NULL

#### `order_status_history`
Status change timeline for each order.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| order_id | integer | NO | | FK→orders.id |
| status | orderstatus | NO | | New status |
| note | text | YES | | Reason/context |
| created_at | timestamptz | YES | now() | |

#### `cart_items`
Shopping cart. One cart per user. HYBRID. Supports normalized customization options.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| store_id | integer | NO | | FK→stores.id |
| item_id | integer | NO | | FK→menu_items.id |
| quantity | integer | NO | 1 | |
| customizations | json | YES | | Resolved customization details (name + price_adjustment) |
| customization_option_ids | integer[] | YES | | FK→customization_options.id (normalized references) |
| unit_price | numeric(10,2) | NO | | Price at add time |
| created_at | timestamptz | YES | now() | |

#### `payments`
Payment records. One per order.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| order_id | integer | NO | | FK→orders.id (unique) |
| method | varchar(50) | YES | | Payment method |
| amount | numeric(10,2) | NO | | Amount charged |
| status | varchar(50) | YES | pending | |
| transaction_id | varchar(255) | YES | | Provider transaction ref |
| created_at | timestamptz | YES | now() | |

---

### Loyalty & Rewards

#### `loyalty_accounts`
One account per user. GLOBAL scope.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id (unique) |
| points_balance | integer | NO | 0 | Current points |
| tier | varchar(50) | NO | bronze | Current tier name |
| total_points_earned | integer | NO | 0 | Lifetime points |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

#### `loyalty_transactions`
Points movement log. `created_by` tracks who issued manual adjustments.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| order_id | integer | YES | | FK→orders.id (null for manual) |
| store_id | integer | YES | | FK→stores.id |
| points | integer | NO | | Points amount |
| type | txtype | NO | | `earn`, `redeem`, `expire` |
| description | text | YES | | Reason for transaction |
| created_by | integer | YES | | FK→users.id (who issued, null=auto) |
| created_at | timestamptz | YES | now() | |

#### `loyalty_tiers`
Tier definitions with thresholds and benefits.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| name | varchar(50) | NO | | Unique tier name |
| min_points | integer | NO | | Points threshold |
| points_multiplier | numeric(3,2) | YES | 1.0 | Earn rate multiplier |
| benefits | json | YES | | Tier benefit details |

#### `rewards`
Loyalty rewards catalog. Points-based redemption. Supports soft delete.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| name | varchar(255) | NO | | Reward name |
| description | varchar(500) | YES | | |
| points_cost | integer | NO | | Points needed to redeem |
| reward_type | rewardtype | NO | | `free_item`, `discount_voucher`, `custom` |
| item_id | integer | YES | | FK→menu_items.id |
| discount_value | numeric(10,2) | YES | | Discount amount |
| image_url | varchar(500) | YES | | |
| stock_limit | integer | YES | | Max redemptions |
| total_redeemed | integer | YES | 0 | Redeemed count |
| is_active | boolean | NO | true | |
| deleted_at | timestamptz | YES | | Soft delete |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

#### `user_rewards`
Reward redemption records.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| reward_id | integer | NO | | FK→rewards.id |
| store_id | integer | YES | | FK→stores.id |
| redeemed_at | timestamptz | YES | now() | |
| order_id | integer | YES | | FK→orders.id |
| is_used | boolean | NO | false | |

---

### Vouchers & Promotions

#### `vouchers`
Promo codes + marketing campaigns. Supports soft delete.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| code | varchar(50) | NO | | Unique promo code |
| description | varchar(500) | YES | | Internal description |
| discount_type | discounttype | NO | | `percent`, `fixed`, `free_item` |
| discount_value | numeric(10,2) | NO | | Discount amount/percentage |
| min_order | numeric(10,2) | YES | 0 | Minimum order amount |
| max_uses | integer | YES | | Total use limit |
| used_count | integer | YES | 0 | Current use count |
| valid_from | timestamptz | YES | | Start date |
| valid_until | timestamptz | YES | | End date |
| is_active | boolean | NO | true | |
| title | varchar(255) | YES | | Marketing display title |
| body | text | YES | | Marketing body text |
| image_url | varchar(500) | YES | | Banner image |
| promo_type | varchar(50) | YES | | Campaign classification |
| store_id | integer | YES | | FK→stores.id (null=all stores) |
| deleted_at | timestamptz | YES | | Soft delete |
| created_at | timestamptz | YES | now() | |

#### `user_vouchers`
Voucher application/redemption records.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| voucher_id | integer | NO | | FK→vouchers.id |
| store_id | integer | YES | | FK→stores.id |
| applied_at | timestamptz | YES | now() | |
| order_id | integer | YES | | FK→orders.id |

#### `promo_banners`
In-app promotional banners. Displayed on customer app.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| title | varchar(255) | NO | | Banner headline |
| subtitle | varchar(255) | YES | | Sub-text |
| image_url | varchar(500) | YES | | Banner image |
| target_url | varchar(500) | YES | | Click-through URL |
| position | integer | YES | 0 | Display order |
| store_id | integer | YES | | FK→stores.id (null=all) |
| start_date | timestamptz | YES | | Campaign start |
| end_date | timestamptz | YES | | Campaign end |
| is_active | boolean | NO | true | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

---

### Wallet & Payments

#### `wallets`
In-app wallet. One per user.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id (unique) |
| balance | numeric(10,2) | NO | 0 | Current balance |
| currency | varchar | NO | | Currency code |

#### `wallet_transactions`
Wallet movement log.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| wallet_id | integer | NO | | FK→wallets.id |
| amount | numeric(10,2) | NO | | Transaction amount |
| type | wallettxtype | NO | | `topup`, `payment`, `refund` |
| description | text | YES | | Reason |
| user_id | integer | YES | | FK→users.id |
| created_at | timestamptz | YES | now() | |

#### `payment_methods`
Saved payment cards/methods.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| type | varchar | YES | | Card/wallet type |
| provider | varchar | YES | | Stripe, GrabPay, etc. |
| last4 | varchar | YES | | Last 4 digits |
| is_default | boolean | YES | | Default method flag |

---

### Staff Management

#### `staff`
Staff members at stores. PER-STORE. Same user can have records at multiple stores.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | YES | | FK→users.id (null if no dashboard access) |
| store_id | integer | NO | | FK→stores.id |
| name | varchar | NO | | Staff name |
| email | varchar | YES | | Staff email |
| phone | varchar | YES | | Staff phone |
| role | staffrole | NO | | `manager`, `assistant_manager`, `barista`, `cashier`, `delivery` |
| is_active | boolean | NO | true | |
| pin_code | varchar | YES | | PIN for clock-in/out |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**Unique:** (store_id, user_id) WHERE user_id IS NOT NULL — partial unique index prevents duplicate staff records at the same store. NULL user_id rows (PIN-only staff) are exempt.
**Indexes:** user_id, store_id

#### `staff_shifts`
Clock-in/out records.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| staff_id | integer | NO | | FK→staff.id |
| store_id | integer | NO | | FK→stores.id |
| clock_in | timestamptz | NO | | Clock-in time |
| clock_out | timestamptz | YES | | Clock-out time (null = still on shift) |
| notes | text | YES | | Shift notes |
| created_at | timestamptz | YES | now() | |

#### `pin_attempts`
Database-backed PIN rate limiting. Persists across process restarts.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| staff_id | integer | NO | | FK→staff.id (ON DELETE CASCADE) |
| attempted_at | timestamptz | NO | now() | When the attempt occurred |

**Rate limit rule:** Max 5 attempts per 5 minutes per staff_id. Enforced in `admin_staff.py:_check_pin_rate_limit()`.

---

### Marketing

#### `marketing_campaigns`
Track email/SMS/push campaigns. Integrates with Twilio, Signal, FCM.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| name | varchar(255) | NO | | Campaign name |
| channel | varchar(30) | NO | push | `push`, `sms`, `email` |
| subject | varchar(500) | YES | | Email/push subject |
| body | text | YES | | Message body |
| image_url | varchar(500) | YES | | Campaign image |
| cta_url | varchar(500) | YES | | Call-to-action URL |
| audience | varchar(50) | NO | all | Target audience |
| store_id | integer | YES | | FK→stores.id (null=all stores) |
| status | varchar(30) | NO | draft | `draft`, `scheduled`, `sending`, `sent`, `failed` |
| provider | varchar(50) | YES | | `twilio`, `signal`, `fcm` |
| provider_campaign_id | varchar(255) | YES | | External campaign ID |
| scheduled_at | timestamptz | YES | | Scheduled send time |
| sent_at | timestamptz | YES | | Actual send time |
| completed_at | timestamptz | YES | | Completion time |
| total_recipients | integer | NO | 0 | |
| sent_count | integer | NO | 0 | |
| delivered_count | integer | NO | 0 | |
| opened_count | integer | NO | 0 | |
| clicked_count | integer | NO | 0 | |
| failed_count | integer | NO | 0 | |
| cost | numeric(10,2) | YES | | Campaign cost |
| created_by | integer | YES | | FK→users.id |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

---

### Social & Content

#### `favorites`
Customer favorite items. GLOBAL.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| item_id | integer | NO | | FK→menu_items.id |
| created_at | timestamptz | YES | now() | |

**Unique:** (user_id, item_id)

#### `referrals`
Referral tracking.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| referrer_id | integer | NO | | FK→users.id |
| invitee_id | integer | YES | | FK→users.id |
| code | varchar | NO | | Referral code |
| reward_amount | numeric(10,2) | YES | | Bonus amount |
| created_at | timestamptz | YES | now() | |

#### `feedback`
Customer feedback on orders/stores.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | YES | | FK→users.id |
| store_id | integer | NO | | FK→stores.id |
| order_id | integer | YES | | FK→orders.id |
| rating | integer | NO | | 1-5 stars |
| comment | text | YES | | Text feedback |
| tags | json | YES | | ["slow_service", "great_coffee"] |
| is_resolved | boolean | NO | false | |
| admin_reply | text | YES | | Manager response |
| created_at | timestamptz | YES | now() | |

#### `notifications`
Push notifications to users.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| title | varchar | NO | | Notification title |
| body | text | YES | | Notification body |
| type | varchar | YES | | `order`, `promo`, `system` |
| is_read | boolean | NO | false | |
| created_at | timestamptz | YES | now() | |

#### `notification_broadcasts`
Admin-sent broadcast notifications.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| title | varchar(255) | NO | | Broadcast title |
| body | text | YES | | Message body |
| audience | varchar(50) | YES | all | Target: all, loyalty_members, staff |
| store_id | integer | YES | | FK→stores.id (null=all) |
| scheduled_at | timestamptz | YES | | |
| sent_at | timestamptz | YES | | |
| sent_count | integer | YES | 0 | |
| open_count | integer | YES | 0 | |
| created_by | integer | YES | | FK→users.id |
| created_at | timestamptz | YES | now() | |

---

### System Configuration

#### `app_config`
Key-value runtime configuration.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| key | varchar(100) | NO | | Unique config key |
| value | text | YES | | Config value (JSON for complex) |
| updated_at | timestamptz | YES | | |

**Unique:** key

#### `splash_content`
App splash screen configuration.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| image_url | varchar | YES | | Splash image |
| title | varchar | YES | | Splash title |
| subtitle | varchar | YES | | Sub-text |
| cta_text | varchar | YES | | Button text |
| cta_url | varchar | YES | | Button URL |
| dismissible | boolean | NO | | Can be dismissed |
| active_from | timestamptz | YES | | Start showing |
| active_until | timestamptz | YES | | Stop showing |
| is_active | boolean | NO | | |
| fallback_title | varchar | YES | | Fallback when inactive |
| fallback_subtitle | varchar | YES | | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

#### `audit_log`
Immutable audit trail for all significant actions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | YES | | FK→users.id |
| store_id | integer | YES | | FK→stores.id |
| action | varchar(100) | NO | | Action name (e.g., ORDER_STATUS_CHANGE) |
| entity_type | varchar(100) | YES | | Entity type (order, voucher, etc.) |
| entity_id | integer | YES | | Entity ID |
| details | json | YES | | Additional details |
| ip_address | varchar(45) | YES | | Client IP |
| status | varchar(20) | YES | success | Action result |
| created_at | timestamptz | YES | now() | |

---

## Seed Data Summary

| Entity | Count | Details |
|--------|-------|---------|
| Stores | 3 | ZUS Coffee KLCC, KLCC Park, Cheras |
| Users | 11 | 1 admin, 1 store_owner, 5 customers, 4 staff users |
| Staff | 9 | Multi-store manager (Amirul @ stores 1+2), single-store managers, assistant manager |
| Tables | 25 | 10 + 10 + 5 across 3 stores |
| Categories | 6 | 2 per store |
| Menu Items | 22 | ~7 per store |
| Orders | 21 | With 42 order_items |
| Loyalty Tiers | 4 | Bronze, Silver, Gold, Platinum |
| Customization Options | 5 | Extra Shot, Oat Milk, Whipped Cream, Extra Syrup |
| Marketing Campaigns | 3 | Push (sent), SMS (draft), Email (scheduled) |
| Table Occupancy Snapshots | 25 | One per table |
