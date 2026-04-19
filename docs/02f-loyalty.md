# Database Schema — Loyalty, Rewards, Wallet

> Part of [02-database-schema.md](02-database-schema.md)

Loyalty accounts, point transactions, tier definitions, reward catalog, per-customer reward instances, in-app wallet, wallet transactions, and saved payment methods.

---

## Tables

### `loyalty_accounts`
One account per user. GLOBAL scope. **Tier is based on `total_points_earned` (lifetime cumulative) — does NOT drop when points spent.**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id (unique) |
| points_balance | integer | NO | 0 | Current spendable points |
| tier | varchar(50) | NO | bronze | Current tier name |
| total_points_earned | integer | NO | 0 | Lifetime cumulative points (determines tier) |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**FKs:** user_id → users(id) (unique)

### `loyalty_transactions`
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

**FKs:** user_id → users(id), order_id → orders(id), store_id → stores(id), created_by → users(id)

### `loyalty_tiers`
Tier definitions with thresholds and benefits.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| name | varchar(50) | NO | | Unique tier name |
| min_points | integer | NO | | Points threshold |
| points_multiplier | numeric(3,2) | YES | 1.0 | Earn rate multiplier |
| benefits | json | YES | | Tier benefit details |
| sort_order | integer | YES | 0 | Display ordering (Bronze=0, Silver=1, Gold=2, Platinum=3) |

**Unique:** name

### `rewards`
Loyalty rewards **catalog** (company-wide). Points-based redemption. Supports soft delete. This is the template; `user_rewards` holds per-customer instances.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| name | varchar(255) | NO | | Reward name |
| description | varchar(500) | YES | | |
| points_cost | integer | NO | | Points needed to redeem |
| reward_type | rewardtype | NO | | `free_item`, `discount_voucher`, `custom` |
| item_id | integer | YES | | FK→menu_items.id |
| discount_value | numeric(10,2) | YES | | Discount amount |
| min_spend | numeric(10,2) | NO | 0 | Minimum spend required |
| image_url | varchar(500) | YES | | |
| stock_limit | integer | YES | | Max redemptions |
| total_redeemed | integer | YES | 0 | Redeemed count |
| is_active | boolean | NO | true | |
| code | varchar(50) | YES | | Unique code |
| terms | json | YES | | Terms list |
| how_to_redeem | text | YES | | Instructions |
| short_description | varchar(500) | YES | | PWA card subtitle |
| long_description | text | YES | | PWA detail page |
| validity_days | integer | YES | 30 | Days until instance expires after redemption |
| deleted_at | timestamptz | YES | | Soft delete |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**FKs:** item_id → menu_items(id)
**Unique:** code

### `user_rewards`
Per-customer reward **instances**. One row per redemption. Catalog→Instance pattern.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| reward_id | integer | NO | | FK→rewards.id |
| store_id | integer | YES | | FK→stores.id |
| redeemed_at | timestamptz | YES | now() | When customer redeemed |
| order_id | integer | YES | | FK→orders.id |
| is_used | boolean | NO | false | Legacy boolean flag |
| status | varchar(20) | YES | 'available' | `available`, `used`, `expired`, `cancelled` |
| expires_at | timestamptz | YES | | Per-instance expiry (redeemed_at + validity_days) |
| used_at | timestamptz | YES | | When barista scanned |
| redemption_code | varchar(50) | YES | | Unique scannable code (e.g. RWD-1-A3F2B1) |
| points_spent | integer | YES | | Snapshot of points_cost at redemption time |
| reward_snapshot | json | YES | | Frozen reward details (name, image, etc.) |
| min_spend | numeric(10,2) | YES | | Snapshot of min_spend at redemption time |

**Indexes:** PK(id), UNIQUE(redemption_code), ix_user_rewards_user_id

### `wallets`
In-app wallet. One per user.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id (unique) |
| balance | numeric(10,2) | NO | 0 | Current balance |
| currency | varchar(10) | NO | 'MYR' | Currency code |

**FKs:** user_id → users(id) (unique)

### `wallet_transactions`
Wallet movement log.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| wallet_id | integer | NO | | FK→wallets.id |
| amount | numeric(10,2) | NO | | Transaction amount |
| type | wallettxtype | NO | | `topup`, `payment`, `refund`, `cashback`, `promo_credit`, `admin_adjustment` |
| description | text | YES | | Reason |
| user_id | integer | YES | | FK→users.id |
| balance_after | numeric(10,2) | YES | | Balance after this transaction |
| created_at | timestamptz | YES | now() | |

**FKs:** wallet_id → wallets(id), user_id → users(id)

### `payment_methods`
Saved payment cards/methods.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| type | varchar(50) | YES | | Card/wallet type |
| provider | varchar(50) | YES | | Stripe, GrabPay, etc. |
| last4 | varchar(4) | YES | | Last 4 digits |
| is_default | boolean | YES | false | Default method flag |

**FKs:** user_id → users(id)

---

## Seeded Data

> Last updated: 2026-04-16 — seed steps 05-06 verified

| Entity | Count | Source Script | Details |
|--------|-------|---------------|---------|
| Loyalty Tiers | 4 | `seed_05_config.py` | Bronze (0pts, 1.0x), Silver (1000pts, 1.25x), Gold (3000pts, 1.5x), Platinum (5000pts, 2.0x) |
| Rewards | 8 | `seed_06_rewards.py` | 6 active + 2 inactive (see full codes + min_spend in 02g-marketing.md) |
