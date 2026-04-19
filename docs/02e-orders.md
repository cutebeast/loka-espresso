# Database Schema — Orders & Payments

> Part of [02-database-schema.md](02-database-schema.md)

Orders, order line items, status history, shopping cart, and payment records.

---

## Tables

### `orders`
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
| voucher_discount | numeric(10,2) | NO | 0.0 | Voucher discount amount applied |
| reward_discount | numeric(10,2) | NO | 0.0 | Reward discount amount applied |
| loyalty_discount | numeric(10,2) | NO | 0.0 | Kept for DB compatibility, always 0 |
| voucher_code | varchar(100) | YES | | Applied voucher code reference |
| reward_redemption_code | varchar(100) | YES | | Applied reward redemption code |
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

**Indexes:** order_number (unique), user_id, store_id, table_id
**FKs:** user_id→users, store_id→stores, table_id→store_tables

### `order_items`
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

### `order_status_history`
Status change timeline for each order.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| order_id | integer | NO | | FK→orders.id |
| status | orderstatus | NO | | New status |
| note | text | YES | | Reason/context |
| created_at | timestamptz | YES | now() | |

**FKs:** order_id → orders(id)

### `cart_items`
Shopping cart. One cart per user. HYBRID. Supports normalized customization options.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| store_id | integer | NO | | FK→stores.id |
| item_id | integer | NO | | FK→menu_items.id |
| quantity | integer | NO | 1 | |
| customizations | json | YES | | Resolved customization details |
| customization_option_ids | integer[] | YES | | FK→customization_options.id (normalized references) |
| unit_price | numeric(10,2) | NO | | Price at add time |
| created_at | timestamptz | YES | now() | |

**FKs:** user_id → users(id), store_id → stores(id), item_id → menu_items(id)

### `payments`
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

**FKs:** order_id → orders(id) (unique)

---

## Seeded Data

| Entity | Count | Details |
|--------|-------|---------|
| Orders | 30 | With 58 order_items |
