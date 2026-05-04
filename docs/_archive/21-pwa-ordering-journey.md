# PWA Ordering Journey

> **Last Updated:** 2026-04-26 | **Location:** `customer-app/` | **Framework:** Next.js 16 PWA

---

## Order Types

The customer PWA supports three order types, each with a distinct flow:

| Type | Payment Timing | Fulfillment |
|------|---------------|-------------|
| **Dine-in** | At counter (after food served) | Table service |
| **Pickup** | At checkout or pay-at-store | Customer picks up |
| **Delivery** | At checkout or cash-on-delivery | 3PL courier |

---

## Dine-in Flow

```
QR scan → Table session → Menu browse → Cart → Checkout → Kitchen → Tracking → Pay at counter
```

### Step-by-Step

1. **QR Scan** — Customer scans table QR code (format: `https://app.loyaltysystem.uk/?table={id}#menu`)
   - QR scanner opens from Home header or `ScanFAB` component
   - `table_id` captured from URL params, stored in `uiStore`
   - Store context derived from table assignment

2. **Table Session** — Active table session created
   - `table_id` attached to all subsequent cart items and checkout
   - Table locked to this customer's session
   - Auto-released on order completion or cancellation

3. **Menu Browse** — Universal menu displayed
   - Categories via `GET /menu/categories`
   - Items via `GET /menu/items`
   - Dietary filtering (JSONB parameterized query)
   - Category nav with scroll-spy

4. **Cart** — Items added with customizations
   - `CartItem` stored in Zustand persist (`loka-cart` key)
   - Customization options: `customization_option_ids` (array) + `customization_hash` (SHA-256)
   - Unique constraint: `(user_id, store_id, item_id, customization_hash)`
   - Cart notes persist to checkout and order

5. **Checkout** — Order submitted (no payment)
   - `POST /checkout` — creates checkout token with pricing snapshot
   - `POST /orders` — creates order from checkout token
   - Dine-in orders: no wallet deduction, payment happens at counter
   - Order type: `dine_in`

6. **Kitchen** — Order enters kitchen queue
   - Status: `pending → confirmed → preparing → ready`
   - Kitchen display auto-refreshes every 30s

7. **Tracking** — Customer sees live status
   - `GET /orders/{id}` polled every 60s
   - Status chips: pending, confirmed, preparing, ready, completed

8. **Payment** — Customer pays at counter
   - Staff marks `payment_status = "paid"` via admin
   - Order → `completed`
   - Table auto-released

---

## Pickup Flow

```
Store select → Menu browse → Cart → Checkout → Order placed → Ready notification → Pickup
```

### Step-by-Step

1. **Store Select** — Customer selects pickup store
   - `StorePickerModal` shows available stores
   - `selectedStore` stored in `uiStore`
   - `store_id` attached to cart items and order

2. **Menu Browse** — Same universal menu as dine-in

3. **Cart** — Same cart mechanism as dine-in

4. **Checkout** — Payment method selection
   - **E-Wallet:** Deducted immediately via `POST /wallet/deduct`
     - Order created with `payment_status = "paid"`, status = `confirmed`
   - **Pay at Store:** No deduction
     - Order created with `payment_status = "pending"`, status = `pending`
     - Staff marks paid later

5. **Order Placed** — Confirmation screen
   - Order number displayed (format: `ORD-XXXXXXXX`)
   - Estimated pickup time shown

6. **Ready Notification** — Push notification when order is ready
   - Status: `ready`
   - Service worker push handler displays notification

7. **Pickup** — Customer collects order
   - Staff marks `completed`

---

## Delivery Flow

```
Store select → Menu browse → Cart → Checkout → Order placed → Courier tracking → Delivered
```

### Step-by-Step

1. **Store Select** — Customer selects delivery store
   - Delivery zones validated against address
   - Minimum order amount enforced

2. **Menu Browse** — Same universal menu

3. **Cart** — Same cart mechanism

4. **Checkout** — Delivery address + payment
   - Delivery address captured (`DeliveryAddressCard` component)
   - Delivery fee calculated and added to total
   - **E-Wallet:** Deducted immediately
   - **Cash on Delivery:** Paid upon delivery
   - Time slot picker for scheduled delivery (`TimeSlotPicker` component)

5. **Order Placed** — Confirmation with delivery ETA

6. **Courier Tracking** — Live tracking when available
   - Admin enters courier name, phone, tracking URL, ETA
   - `delivery_status` field tracks provider lifecycle
   - Customer sees tracking info on order detail page

7. **Delivered** — Order completed
   - Status: `out_for_delivery → completed`

---

## Voucher / Reservation Pattern

### Reserved → Used Lifecycle

Vouchers use a **reservation pattern** to prevent double-apply during checkout:

```
checkout_start → voucher RESERVED (locked to this checkout token)
checkout_complete → voucher USED (applied to order)
checkout_cancel/expire → voucher RELEASED (available again)
```

- `POST /checkout` — If voucher applied, `user_vouchers.status` set to `reserved`
- `POST /orders` — Voucher status transitions to `used`
- Checkout token expiry (15 min) — Voucher auto-released if checkout abandoned
- Prevents: customer opening two tabs and applying same voucher twice

### Reward Redemption

Similar pattern for rewards:
- `POST /checkout` with `reward_id` — creates checkout token with reward snapshot
- `POST /orders` — marks `user_rewards.status = "redeemed"`
- Redemption code generated: `REWARD-{8-char-hex}`

---

## Cart Sync Mechanism

### Storage

- **Zustand persist** with `loka-cart` key (IndexedDB/localStorage)
- Cart survives app closure and tab refresh
- Cart cleared on: successful order placement, manual clear, logout

### Sync Flow

1. Customer adds item → `cartStore.addItem()` updates Zustand
2. Zustand persist auto-saves to IndexedDB
3. On checkout, cart items sent to `POST /checkout` for server-side pricing validation
4. Server recalculates prices (handles price changes since add-to-cart)
5. Checkout token captures final pricing snapshot

### Uniqueness

Cart items are uniquely identified by:
```
(user_id, store_id, item_id, customization_hash)
```

Adding same item with same customizations increments quantity rather than creating duplicate.

---

## Payment Failure Rollback

### E-Wallet Payment Failure

```
POST /orders (wallet deduction fails)
  → Order NOT created
  → Wallet balance unchanged
  → Cart preserved (items remain)
  → Error toast shown to customer
  → Customer can retry checkout
```

### Checkout Token Expiry

```
POST /checkout (creates token)
  → 15 minutes pass without POST /orders
  → Token expires (is_used remains false)
  → Voucher/reward auto-released
  → Cart preserved
  → Customer must re-enter checkout
```

### Server-Side Validation Failure

```
POST /orders
  → Price mismatch detected (item price changed since checkout)
  → Order rejected with error
  → Checkout token invalidated
  → Cart preserved
  → Customer shown updated prices
```

---

## Status Enum Reference

| Status | Description | Customer Visible |
|--------|-------------|-----------------|
| `pending` | Order created, awaiting confirmation | Yes |
| `paid` | Payment received (wallet orders) | Yes |
| `confirmed` | Kitchen accepted order | Yes |
| `preparing` | Kitchen preparing | Yes |
| `ready` | Ready for pickup/serving | Yes |
| `out_for_delivery` | Handed to courier | Yes (delivery only) |
| `completed` | Order fulfilled | Yes |
| `cancelled` | Order cancelled | Yes |

---

## Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `AppShell.tsx` | `src/components/` | Root shell, routing, auth gate |
| `AuthFlow.tsx` | `src/components/` | Splash → Phone → OTP → Profile |
| `BottomNav.tsx` | `src/components/` | 5-tab bottom navigation |
| `StorePickerModal.tsx` | `src/components/` | Store selection for pickup/delivery |
| `MenuPage.tsx` | `src/components/` | Menu browsing with category nav |
| `CartPage.tsx` | `src/components/` | Cart review and editing |
| `CheckoutPage.tsx` | `src/components/` | Payment method, delivery address, submit |
| `OrdersPage.tsx` | `src/components/` | Order history list |
| `OrderDetailPage.tsx` | `src/components/` | Single order tracking and detail |
| `ItemCustomizeSheet.tsx` | `src/components/menu/` | Bottom sheet for item customization |
| `FloatingCartBar.tsx` | `src/components/menu/` | Persistent cart bar on menu page |
| `QRScanner.tsx` | `src/components/` | Camera QR code scanner |
