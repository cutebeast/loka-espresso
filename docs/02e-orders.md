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
| pos_synced_at | timestamptz | YES | | When staff manually marked POS re-keyed |
| pos_synced_by | integer | YES | | FK→users.id (staff who marked POS synced) |
| delivery_dispatched_at | timestamptz | YES | | When staff manually marked delivery booked |
| delivery_dispatched_by | integer | YES | | FK→users.id (staff who marked dispatched) |
| staff_notes | text | YES | | Internal staff notes on the order |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**Indexes:** order_number (unique), user_id, store_id, table_id, (store_id, status), (user_id, created_at), (store_id, created_at)
**FKs:** user_id→users, store_id→stores, table_id→store_tables, pos_synced_by→users(id), delivery_dispatched_by→users(id)
**Check constraints:** discount >= 0, delivery_fee >= 0, total >= 0

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
| customizations | json | YES | | Customization shape: `{ options: [{id, name, price_adjustment}], note? }` |
| line_total | numeric(10,2) | NO | | quantity × unit_price + adjustments |
| note | text | YES | | Customer note for this line item |
| created_at | timestamptz | YES | now() | |

**FKs:** order_id→orders(id), menu_item_id→menu_items(id) ON DELETE SET NULL
**Indexes:** (order_id, menu_item_id)
**Check constraints:** quantity > 0, unit_price >= 0

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
| customization_option_ids | json | YES | | Array of customization_option IDs (canonical) |
| customization_hash | varchar(64) | YES | | SHA-256 of sorted option IDs for line identity |
| unit_price | numeric(10,2) | NO | | Price at add time |
| created_at | timestamptz | YES | now() | |

**FKs:** user_id → users(id), store_id → stores(id), item_id → menu_items(id)
**Unique:** `uq_cart_item_identity` on `(user_id, store_id, item_id, customization_hash)`

> **Note on `store_id`:** The `store_id` on `cart_items` and `orders` records the **fulfillment store** (where the customer picks up or receives delivery from). Menu items themselves are **universal** — they have no `store_id` and are identical across all stores.

### `checkout_tokens`
Temporary checkout discount tokens. Created by `POST /checkout`, consumed by `POST /orders`. Expires after 15 minutes.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| token | varchar(64) | NO | | Unique token string |
| user_id | integer | NO | | FK→users.id |
| store_id | integer | NO | | FK→stores.id |
| voucher_code | varchar(100) | YES | | Applied voucher code |
| reward_id | integer | YES | | Applied reward ID |
| discount_type | varchar(20) | YES | | `percent`, `fixed`, `free_item` |
| discount_amount | numeric(10,2) | NO | 0 | Discount value |
| subtotal | numeric(10,2) | NO | | Before discount |
| delivery_fee | numeric(10,2) | NO | 0 | Delivery charge |
| total | numeric(10,2) | NO | | Final amount after discount |
| is_used | boolean | NO | false | Whether token has been consumed |
| expires_at | timestamptz | NO | | Token expiry |
| created_at | timestamptz | YES | now() | |

**FKs:** user_id→users(id), store_id→stores(id)
**Indexes:** token (unique), user_id

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

The system uses **flexible status transitions** that accommodate both pre-paid and pay-later workflows for all order types. Third-party integrations (POS, 3PL, Payment Gateway) are on hold — Scenario B (manual workflows) is the active path.

### Admin Controls

| Action | Endpoint | Description |
|--------|----------|-------------|
| Update status | `PATCH /orders/{id}/status` | Advance order to next status |
| Mark as paid | `PATCH /orders/{id}/payment-status` | Set `payment_status = "paid"` for cash/pay-at-store orders |
| Delivery tracking | `PATCH /admin/orders/{id}/delivery-tracking` | Set courier name/phone, tracking URL, ETA |

### Dine In — Pay at Counter

```
pending → confirmed → preparing → ready → completed
          ↑                                   ↑
          └─ Kitchen confirms order           └─ Customer pays at counter, then marked completed
```

**Payment:** Always "Pay at counter" — no wallet deduction at checkout.
1. Customer scans table QR → places order → **pending**
2. Kitchen confirms → **confirmed**
3. Kitchen prepares → **preparing**
4. Food served → **ready**
5. Customer pays at counter → admin marks **payment_status = "paid"**
6. Order → **completed** (status transition; `payment_status` is tracked separately)

### Pickup — Pay at Store OR Wallet

```
pending → [pay or confirm] → confirmed → preparing → ready → completed
```

**Payment method choice at checkout:**
- **E-Wallet:** Deducted immediately → order goes to `confirmed`
- **Pay at Store:** Not deducted → admin marks paid later via "Mark as Paid"

### Delivery — Cash on Delivery OR Wallet

```
pending → [pay or confirm] → confirmed → preparing → ready → out_for_delivery → completed
                                                                          ↑
                                                    admin enters courier/tracking info
```

**Payment method choice at checkout:**
- **E-Wallet:** Deducted immediately
- **Cash on Delivery:** Paid upon delivery

**Delivery tracking (manual):** Admin fills in courier name, phone, tracking URL, ETA via delivery tracking form on Orders page.

### Order State Machine

| Order Type | Valid Transitions |
|------------|-------------------|
| Pickup | `pending → confirmed → preparing → ready → completed` |
| Delivery | `pending → confirmed → preparing → ready → out_for_delivery → completed` |
| Dine-in | `pending → confirmed → preparing → ready → completed` | Payment marked separately via `payment_status` |

### Kitchen Display

Dedicated page (`/kitchen`) for service crew to manage orders per store:
- **Store selector** — must select a specific store (no "All Stores")
- **Active orders only** — excludes completed/cancelled
- **Auto-refresh** every 30 seconds
- **Quick actions:** Confirm, Start Preparing, Ready, Out for Delivery, Complete, Mark Paid
- **Status summary bar:** pending/confirmed/preparing/ready/out_for_delivery counts
- Accessible to roles: Admin (1), Manager (2), Staff (3)

### Universal Rules

- `pending → confirmed` is allowed for ALL order types
- `completed` requires `payment_status == "paid"` for ALL order types
- "Mark as Paid" button available on Orders page and Kitchen Display for any unpaid order
- Cancel is valid from any non-terminal state
- Table auto-released when dine-in order completes or is cancelled
- Cart notes persist to checkout and order

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
