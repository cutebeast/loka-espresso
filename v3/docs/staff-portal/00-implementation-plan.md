# Staff Portal v3 — Implementation Plan

**Last updated:** 2026-05-15
**Status:** Planning — Phase 1 pending
**Device:** Mobile-first (phone + tablet), portrait + landscape  
**Store Scope:** Staff are assigned to a single store at login. All data (orders, tables, reservations, menu) is scoped to that store. No store switching in-portal.

---

## 1. Design Philosophy

### Why Grid Buttons Instead of a Bottom Tab Bar

Bottom tab bars work for consumer apps but staff use a tablet or phone while moving — they need **one-tap access** without remembering which tab is which.

A **grid of large touch-friendly buttons** on the home screen gives instant visual recognition:

- 140-160px tall with icon + label
- Responsive grid (2 cols portrait phone, 3 cols landscape/tablet)
- Live counts (pending orders, occupied tables) as badges

### Portrait vs Landscape

```
Phone Portrait (375px)          Tablet Landscape (1024px)
+--------------+                +------------------------------+
| Kitchen  Tab |                | Kitchen    Tables   POS      |
|              |                |   [3]        [5]    [⭐]     |
+--------------+                |                              |
| Tables   POS |                | Reserv.   Time    Wallet     |
|   [5]    [⭐]|                |   [2]     Clock    Top-Up    |
+--------------+                |                              |
| Reserv. Time |                |          Profile             |
|   [2]   Clock|                |                              |
+--------------+                +------------------------------+
|    Wallet    |
|    Top-Up    |
+--------------+
|   Profile    |
+--------------+
```

CSS: `grid-template-columns: repeat(2, 1fr)` → `@media (min-width: 600px) { repeat(3, 1fr) }`

---

## 2. Route Map

```
/login                    → Login screen (full-screen, no chrome)
/ (home)                  → Grid dashboard (main navigation hub)
/kitchen                  → KDS — incoming orders grid
/kitchen/[id]             → Order detail + status actions
/tables                   → Table status grid
/pos                      → POS — order entry (4 internal states)
/wallet                   → Wallet top-up
/reservations             → Reservation management
/time-clock               → Clock in/out + PIN verification
/profile                  → Staff profile
```

### Layout Structure

```
+----------------------------+
|  StoreHeader               |  ← Fixed top: store name, staff name, logout
+----------------------------+
|                            |
|  Page Content              |  ← Scrollable area, flex-grow
|                            |
+----------------------------+
|  [← Back to Home]          |  ← Fixed bottom, only on sub-pages
+----------------------------+
```

Sub-pages have a single "Back to Home" button at bottom. Home page has no bottom bar — the grid IS the navigation.

---

## 3. Home Screen — Grid Dashboard

### 7 Buttons

| Icon | Label | Badge | Route |
|------|-------|-------|-------|
| UtensilsCrossed | Kitchen | Pending order count | /kitchen |
| Armchair | Tables | Occupied table count | /tables |
| CreditCard | POS Terminal | — (primary, highlighted) | /pos |
| CalendarCheck | Reservations | Today's count | /reservations |
| Wallet | Wallet Top-Up | — | /wallet |
| Clock | Time Clock | IN/OUT status | /time-clock |
| UserCircle | Profile | — | /profile |

POS Terminal button is visually prominent — gold accent border, slightly bolder.

### Button Card CSS

```css
.home-grid { display: grid; gap: 12px; padding: 16px; grid-template-columns: repeat(2, 1fr); }
@media (min-width: 600px) { .home-grid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 900px) { .home-grid { max-width: 720px; margin: 0 auto; } }

.home-btn {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 24px 16px; min-height: 144px;
  border-radius: 16px; background: var(--card-bg);
  border: 2px solid var(--border-light); position: relative;
  cursor: pointer; transition: transform 0.1s, box-shadow 0.1s;
  text-decoration: none; color: inherit;
}
.home-btn:active { transform: scale(0.97); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.home-btn--primary { border-color: var(--brand-gold); background: linear-gradient(135deg, #FFFDF8, #F5F0E6); }
.home-btn-icon { font-size: 36px; line-height: 1; }
.home-btn-label { font-size: 14px; font-weight: 600; text-align: center; }
.home-btn-badge {
  position: absolute; top: 8px; right: 8px;
  min-width: 24px; height: 24px; border-radius: 12px;
  background: var(--brand-primary); color: white;
  font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; padding: 0 6px;
}
.home-btn-sub { font-size: 11px; color: var(--text-muted); text-align: center; }
```

### Live Data

```
GET /staff/dashboard
Response: {
  pending_orders: 3, occupied_tables: 5, today_reservations: 2,
  clock_status: "in" | "out" | "break",
  current_shift_start: "2026-05-15T08:00:00Z" | null,
  store_name: "Loka Espresso KLCC",
  staff_name: "Ali"
}
```

Badge counts auto-refresh every 30 seconds via polling. Kitchen screen (`/kitchen`) polls every 5 seconds or uses WebSocket for instant new-order alerts.

---

## 4. POS Terminal — 4 Internal States

No route changes — all managed within `/pos` page via state variable. There are **4 page states** plus **1 overlay**:

`posState: "customer" | "menu" | "payment" | "done"`

- `"customer"` → State 1
- `"menu"` → State 2 (modifier sheet overlays on top, does not change `posState`)
- `"payment"` → State 4
- `"done"` → State 5

### State 1: Customer Selection
```
+----------------------------+
|  New Order                  |
|  🔍 [Search customer...]    |
|  [📷 Scan QR Code]          |
|  Recent Customers:          |
|  +------------------------+ |
|  | Ali (012-345-6789)     | |
|  | Sarah (019-876-5432)   | |
|  | Walk-in Customer       | |
|  +------------------------+ |
|  Order: ○ Dine-in ● Takeaway|
|  Table: [Select ▼]          |  ← only if dine-in
|  [Start Order →]            |
+----------------------------+
```

### State 2: Menu Browsing + Cart
```
+----------------------------+
|  Ali — Table 5              |
|  +- Categories ------------+|
|  |Hot Drinks | Cold | Pastry||  ← horizontally scrollable pills
|  +-------------------------+|
|  +------+ +------+ +------+ |
|  |Latte | | Capp | | Amer | |  ← 2 cols portrait, 3 landscape
|  |RM 12 | |RM 12 | |RM 10 | |
|  +------+ +------+ +------+ |
|  ── Cart (3) ─────────────  |
|  1× Latte          RM 12    |
|  2× Croissant      RM 18    |
|  ─────────────────────────  |
|  Total: RM 30.00            |
|  [💳 Charge RM 30.00]       |
+----------------------------+
```
Tapping an item → modifier sheet if item has modifier groups (size, milk, sweetness).  
Modifiers are defined in the admin portal; staff simply select applicable options. Modifier prices (if any) are added automatically.

### State 3: Modifier Sheet (overlay)
```
+----------------------------+
|  Latte                      |
|  Size: ○ S ● M ○ L         |
|  Milk: ○ Full ● Oat ○ Soy  |
|  Sweet: ○ None ○ Half ○ Full|
|  Qty: [-]  1  [+]          |
|  [Add to Cart — RM 12.00]  |
+----------------------------+
```

### State 4: Payment
```
+----------------------------+
|  Total: RM 30.00            |
|  Payment Method             |
|  ○ Cash  ○ Card  ○ QR       |
|  Amount Tendered: [50.00]   |
|  Change: RM 20.00           |
|  [✅ Confirm Payment]        |
|  [✕ Cancel Order]           |
+----------------------------+
```

### State 5: Done / Receipt
```
+----------------------------+
|  ✅ Order Confirmed         |
|  Order #A-142               |
|  1× Latte          RM 12    |
|  2× Croissant      RM 18    |
|  ─────────────────────────  |
|  Total: RM 30.00            |
|  Paid: Cash                 |
|  Change: RM 20.00           |
|  [🖨️ Print Receipt]         |
|  [🆕 New Order]             |
+----------------------------+
```

Staff can start a new order immediately or return to the grid.

---

## 5. Wallet Top-Up Screen
```
+----------------------------+
|  Wallet Top-Up              |
|  [📷 Scan QR]  or  🔍 Search|
|  ── Customer ────────────── |
|  Ali — Gold Tier            |
|  Current Balance: RM 50.00  |
|  Top-Up: [___20.00___]      |
|  Quick: [RM 20] [50] [100]  |
|  [🔒 Confirm with PIN]      |
+----------------------------+
```

Uses existing `POST /admin/wallets/topup` + PIN verification.

---

## 6. Time Clock — Add PIN Verification

Current: tap button → POST /staff/time-events → done

New flow:
1. Tap "Clock In" → PIN entry dialog
2. Enter 4-digit PIN → `POST /staff/auth/verify-pin {pin: "1234"}`
3. Valid → `POST /staff/time-events` with event_type "clock_in"
4. Invalid → shake animation, retry (max 3 attempts)
5. After 3 failures → 5-minute lockout + audit log entry. Manager must unlock via admin portal.

Same pattern for Clock Out, Start Break, End Break.

---

## 7. Backend — 4 New Endpoints

### 7.1 GET /staff/dashboard
```
Response: { pending_orders, occupied_tables, today_reservations, clock_status, current_shift_start, store_name, staff_name }
```

### 7.2 GET /staff/customers/search?q=<phone|name|qr>
```
Response: { items: [{ id, display_name, phone_number, wallet_balance, loyalty_tier }] }
```

### 7.3 POST /staff/auth/verify-pin
```
Body: { "pin": "1234" }
Response: { "valid": true/false }
```

### 7.4 POST /staff/pos/orders
```
Body: {
  store_id, customer_id, dining_table_id?, order_type,
  line_items: [{ menu_item_id, quantity, modifier_ids[], special_instructions }],
  payment: { method, amount_tendered?, amount }
}
Response (201): { order_id, order_number, status: "confirmed", total, change, created_at }
```

> **Note:** `unit_price` is **not** sent by the frontend. Backend resolves the current price from `menu_item_id` and any modifier surcharges to prevent tampering.

Backend logic:
1. Validate staff active + assigned to store
2. Look up menu items, validate availability, resolve current price + modifier surcharges
3. Sum line items → subtotal
4. Read tax/service charge from store_configuration
5. Compute total = subtotal + tax + service_charge
6. Create Order (order_channel="pos_counter", status="confirmed")
7. Create OrderLineItems + modifiers
8. Create Payment record
9. Return order details + change calculation

### DB Check — All Columns Exist

| Feature | Columns | Status |
|---------|---------|:------:|
| POS order | Order(order_type, order_channel, store_id, customer_id, dining_table_id, line_items...) | ✅ |
| Line items | OrderLineItem(menu_item_id, quantity, unit_price, total_price, modifier_total, special_instructions) | ✅ |
| Payment | Payment(order_id, provider, amount, payment_method_type, status) | ✅ |
| Customer search | Customer(phone_number, display_name, id) | ✅ |
| PIN verify | StaffProfile(pin_hash) | ✅ |
| Wallet top-up | Wallet, WalletLedgerEntry | ✅ |

---

## 5. Table Management Screen (`/tables`)

Grid of all tables for the assigned store:

```
+----------------------------+
|  Tables — Loka Espresso     |
|  +------+ +------+ +------+ |
|  |  1   | |  2   | |  3   | |
|  |Empty | |Occup.| |Reserv| |
|  +------+ +------+ +------+ |
|  +------+ +------+ +------+ |
|  |  4   | |  5   | |  6   | |
|  |Occup.| |Empty | |Empty | |
|  +------+ +------+ +------+ |
+----------------------------+
```

- Tap table → action sheet: **Check-in**, **Mark as Empty**, **Reserve**
- Color coding: Green (empty), Red (occupied), Yellow (reserved), Gray (out of order)
- Data: `GET /staff/tables` — returns tables scoped to staff's assigned store

---

## 6. Reservation Management (`/reservations`)

List view for today's reservations (and upcoming):

```
+----------------------------+
|  Reservations — Today       |
|  ── Upcoming ─────────────  |
|  14:00  Ali (4 pax) Table 3 |
|  16:30  Sarah (2 pax) T-5   |
|  ── Past ─────────────────  |
|  12:00  John (2 pax) ✓      |
+----------------------------+
```

- `GET /staff/reservations?date=today`
- Tap → detail modal: confirm arrival, cancel, or reassign table
- Create walk-in reservation directly from this screen

---

## 7. Kitchen Order Detail (`/kitchen/[id]`)

```
+----------------------------+
|  Order #A-142 — 08:32      |
|  ─────────────────────────  |
|  1× Latte  (Oat, No sugar) |
|  2× Croissant              |
|  ─────────────────────────  |
|  [⏳ Mark Preparing]        |
|  [✅ Mark Ready]            |
|  [🚫 Cancel Item...]       |
+----------------------------+
```

- Actions depend on current status: `pending` → `preparing` → `ready`
- Staff can cancel individual items if not yet prepared
- Elapsed time since order creation shown in header

---

## 8. Profile Screen (`/profile`)

```
+----------------------------+
|  Ali                        |
|  Server — Loka Espresso     |
|  ─────────────────────────  |
|  Shift Started: 08:00       |
|  Hours Today: 4h 32m        |
|  ─────────────────────────  |
|  [🔐 Change PIN]            |
|  [🚪 Logout]                |
+----------------------------+
```

- Read-only staff info. Change PIN triggers current-PIN verification then new-PIN flow.
- Logout clears session + any in-memory POS state.

---

## 9. File Changes — Before/After

```
DELETE:
  src/components/Sidebar.tsx              → desktop-only, not mobile
  src/components/TopBar.tsx               → replaced by StoreHeader
  src/app/menu/page.tsx                   → menu moves into POS
  src/app/inventory/page.tsx              → not needed on shift

RENAME:
  src/app/orders/ → src/app/kitchen/       (KDS, not POS)

CREATE:
  src/components/StoreHeader.tsx           → simplified top bar
  src/app/pos/page.tsx                    → POS terminal (4 states)
  src/app/wallet/page.tsx                 → wallet top-up
  src/styles/pos.css                      → POS-specific CSS
  backend/app/api/v1/endpoints/admin/pos.py → POS order endpoint

MODIFY:
  src/app/layout.tsx                       → remove sidebar, full-width layout
  src/app/page.tsx                         → replace redirect with grid dashboard
  src/app/login/page.tsx                   → keep as-is (already works)
  src/app/kitchen/page.tsx                 → renamed from orders, add sound toggle
  src/app/time-clock/page.tsx              → add PIN dialog
  src/lib/api.ts                           → add new endpoint functions
  src/styles/utilities.css                 → add .home-grid, .home-btn styles
  backend/app/api/v1/router.py             → register new pos.py router
```

---

## 10. Implementation Phases

### Phase 1: Backend (4.5h)
| Task | Where | Est. |
|------|-------|:---:|
| `GET /staff/dashboard` | extend `staff.py` | 1h |
| `GET /staff/customers/search` | extend `customers.py` | 1h |
| `POST /staff/auth/verify-pin` | extend `staff.py` | 30m |
| `POST /staff/pos/orders` | new `pos.py` | 2h |

### Phase 2: Foundation (3.5h)
| Task | Est. |
|------|:---:|
| Delete Sidebar, create StoreHeader | 30m |
| Rewrite layout.tsx (full-width, auth guard) | 1h |
| Add .home-grid CSS to utilities.css | 30m |
| Build home screen grid dashboard with live badges | 1h |
| Create simple back-to-home button for sub-pages | 30m |

### Phase 3: Cleanup (0.75h)
| Task | Est. |
|------|:---:|
| Rename /orders → /kitchen | 30m |
| Delete /menu, /inventory | 15m |

### Phase 4: POS Terminal — Core (6h)
| Task | Est. |
|------|:---:|
| Customer search + recent list (State 1) | 2h |
| Menu browser — categories + items grid (State 2) | 2h |
| Modifier sheet overlay | 1h |
| Cart panel + add/remove | 1h |

### Phase 5: POS Terminal — Checkout + Polish (5h)
| Task | Est. |
|------|:---:|
| Checkout + payment flow (States 4-5) | 2h |
| Cancel order flow + error states | 1h |
| POS CSS + responsive fixes | 1h |
| Test end-to-end: customer → cart → payment → done | 1h |

### Phase 6: Wallet + PIN (4h)
| Task | Est. |
|------|:---:|
| Wallet top-up screen + QR scan | 2h |
| PIN dialog component (reusable) | 1h |
| PIN integration into time-clock | 1h |

### Phase 7: Sub-pages + Navigation (3h)
| Task | Est. |
|------|:---:|
| Table grid + action sheet | 1h |
| Reservation list + detail modal | 1h |
| Kitchen order detail page | 30m |
| Profile screen + change PIN | 30m |

### Phase 8: Polish (3.5h)
| Task | Est. |
|------|:---:|
| Kitchen KDS — sound toggle + elapsed time | 1h |
| Responsive testing — phone + tablet portrait + landscape | 2h |
| Build + deploy to PM2 | 30m |

**Total: ~31 hours**

---

## 11. Open Questions

1. **Printing** — Does cafe use receipt printer? Should POS orders auto-print to kitchen?
2. **Offline mode** — Is offline order-taking needed?
3. **Split bills** — Can 2 customers split payment on one order?
4. **Discount permissions** — Which roles can apply discounts? PIN required?
5. **Order modification** — Can staff modify after kitchen receives?
6. **Out-of-stock items** — Should POS hide unavailable items, gray them out, or allow override?
7. **Table merging** — Can staff merge two occupied tables for one bill?
