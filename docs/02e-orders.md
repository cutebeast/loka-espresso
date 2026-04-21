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
| delivery_status | varchar(50) | YES | | Provider-facing delivery lifecycle state |
| delivery_external_id | varchar(255) | YES | | External delivery job id |
| delivery_quote_id | varchar(255) | YES | | External quote id |
| delivery_tracking_url | varchar(500) | YES | | Tracking link from provider |
| delivery_eta_minutes | integer | YES | | Current provider ETA |
| delivery_courier_name | varchar(255) | YES | | Courier display name |
| delivery_courier_phone | varchar(50) | YES | | Courier contact |
| delivery_last_event_at | timestamptz | YES | | Last provider event timestamp |
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
| provider | varchar(50) | YES | | Payment provider label |
| amount | numeric(10,2) | NO | | Amount charged |
| status | varchar(50) | YES | pending | |
| transaction_id | varchar(255) | YES | | Provider transaction ref |
| provider_reference | varchar(255) | YES | | Provider-side reference/id |
| idempotency_key | varchar(255) | YES | | Client/API idempotency key |
| failure_reason | text | YES | | Failure detail if settlement fails |
| settled_at | timestamptz | YES | | When payment was settled |
| created_at | timestamptz | YES | now() | |

**FKs:** order_id → orders(id) (unique)

---

## Order Status Flows

The system enforces different status flows depending on `order_type`.

### Dine In (Flow B — Pay After Eating)

```
pending → confirmed → preparing → ready → [payment] → completed
         ↑                                           ↑
         └─ Customer confirms order                  └─ Customer pays at table
```

1. Customer scans table QR and places order → **pending**
2. Order confirmed (kitchen sees it) → **confirmed**
3. Kitchen prepares food and serves → **preparing**
4. Food served to customer → **ready**
5. Customer makes payment (cash/card/QR at counter) → `payment_status = "paid"`
6. Order completed → **completed**

**Rules:**
- Dine-in can be confirmed directly from `pending` (no payment required first)
- Cannot mark `completed` until `payment_status == "paid"`
- Table is auto-released when order completes or is cancelled

### Pickup (Flow A — Pay First)

```
pending → paid → confirmed → preparing → ready → completed
         ↑                                        ↑
         └─ Customer pays upfront                 └─ Customer picks up
```

1. Customer places order in PWA → **pending**
2. Customer makes payment → **paid**
3. Order confirmed (kitchen sees it) → **confirmed**
4. Kitchen prepares food → **preparing**
5. Food ready for pickup → **ready**
6. Customer picks up → **completed**

**Rules:**
- Must be `paid` before `confirmed`
- `out_for_delivery` is not applicable

### Delivery (Flow A — Pay First)

```
pending → paid → confirmed → preparing → ready → out_for_delivery → completed
         ↑                                                          ↑
         └─ Customer pays upfront                                   └─ Delivery confirmed
```

1. Customer places order in PWA → **pending**
2. Customer makes payment → **paid**
3. Order confirmed (kitchen sees it) → **confirmed**
4. Kitchen prepares food → **preparing**
5. Food ready for driver pickup → **ready**
6. Handed to 3rd-party delivery OR manually entered into delivery system → **out_for_delivery**
7. Delivery confirmed → **completed**

**Rules:**
- Must be `paid` before `confirmed`
- `out_for_delivery` only applicable for delivery orders
- Delivery provider tracking fields populated by 3rd-party integration

### Cancelled

- Valid from any non-terminal state (`pending`, `paid`, `confirmed`, `preparing`, `ready`, `out_for_delivery`)
- Table is auto-released if dine-in order is cancelled

### Status Enum Values

| Status | Description |
|--------|-------------|
| `pending` | Order created, awaiting payment (Flow A) or confirmation (Flow B) |
| `paid` | Payment received |
| `confirmed` | Order accepted by kitchen |
| `preparing` | Kitchen is preparing the order |
| `ready` | Order is ready for serving/pickup/driver |
| `out_for_delivery` | Order handed to delivery provider |
| `completed` | Order fulfilled |
| `cancelled` | Order cancelled |

---

## Seeded Data

| Entity | Count | Details |
|--------|-------|---------|
| Orders | 30 | With 58 order_items |
