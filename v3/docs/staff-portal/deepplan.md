markdown
# Staff Portal v3 — Improved Implementation Plan (Mobile POS for F&B)

**Last updated:** 2026-05-15  
**Status:** Planning — Ready for development  
**Device:** Mobile-first (phone + tablet), portrait + landscape  
**Store Scope:** Staff assigned to single store at login. No store switching in-portal.

---

## 1. Core Improvements Over Original

| Area | Original Gap | Improvement |
|------|--------------|-------------|
| Offline | Not planned | **Phase 0: Offline-first** (IndexedDB + sync queue) |
| Split bill | Open question | **Built-in split bill** (UI + backend) |
| Order modification | Missing | **Edit/void items** before payment |
| Wallet top‑up | Crew handles cash | **Replaced with loyalty & discounts** (manager-only top‑up) |
| Table actions | Just status grid | **Quick actions** (+ item, view bill, merge tables) |
| POS flow | Customer first | **Order‑type first** (2 taps saved per order) |
| Kitchen alerts | Only elapsed time | **Visual urgency** (flashing, URGENT badge) |
| Back navigation | Fixed bottom button | **Standard top bar** with back arrow |

---

## 2. Design Philosophy (Refined)

### Grid Dashboard – One‑Tap Access

- **2 columns** on phone portrait, **3 columns** on tablet/landscape
- Buttons: 140–160px tall, icon + label + optional badge
- POS button gets gold accent (primary action)

### Layout Structure (All Pages)
+--------------------------------------------------+
| ← Back Store Name Staff Name 👤 | ← Top bar (back only on sub‑pages)
+--------------------------------------------------+
| |
| Page Content (scrollable, flex‑grow) |
| |
+--------------------------------------------------+

text

- Home page has **no back button** – grid is the navigation.
- Swipe from left edge = back (native gesture supported).

---

## 3. Route Map (Updated)

| Route | Description |
|-------|-------------|
| `/login` | Full‑screen login |
| `/` (home) | Grid dashboard |
| `/kitchen` | KDS – incoming orders + bumps |
| `/kitchen/[id]` | Order detail for kitchen |
| `/tables` | Table status grid + quick actions |
| `/pos` | POS terminal (4 internal states) |
| `/loyalty` | Customer loyalty lookup & discount application |
| `/reservations` | Reservation management |
| `/time-clock` | Clock in/out (PIN only for edge cases) |
| `/profile` | Staff profile |

**Removed:** `/wallet` (crew no longer handles cash top‑ups).  
**Added:** `/loyalty` (replaces wallet for crew‑facing actions).

---

## 4. Home Screen – Grid Dashboard

7 buttons (badges shown where applicable):

| Icon | Label | Badge | Route |
|------|-------|-------|-------|
| UtensilsCrossed | Kitchen | Pending orders | `/kitchen` |
| Armchair | Tables | Occupied tables | `/tables` |
| CreditCard | POS Terminal | – (gold accent) | `/pos` |
| CalendarCheck | Reservations | Today’s count | `/reservations` |
| Gift | Loyalty | – | `/loyalty` |
| Clock | Time Clock | IN/OUT status | `/time-clock` |
| UserCircle | Profile | – | `/profile` |

**Extra feature on home:**  
- **Undo last order** snackbar for 30 seconds after POS completion.  
- Offline indicator: `📡 3 pending sync` when disconnected.

---

## 5. POS Terminal – 4 Internal States (Improved)

All managed within `/pos` via state variable.

### State 0: Order Type Selection (NEW – before customer)
+----------------------------------+
| New Order |
| [🧑‍🍳 Dine-in] [🛍️ Takeaway] [🚚 Delivery] |
| |
| (If dine-in) → show table grid |
| (If takeaway/delivery) → skip to |
| menu (customer optional) |
+----------------------------------+

text

### State 1: Customer Lookup (Optional, can be skipped)
+----------------------------------+
| Customer (optional) |
| 🔍 Search by name / phone / QR |
| Recent: Ali, Sarah, Walk‑in |
| [Skip → Start order] |
+----------------------------------+

text

### State 2: Menu Browsing + Cart
+----------------------------------+
| Table 5 (Dine‑in) [Edit] |
| [Hot] [Cold] [Food] ← scrollable |
| +--------+ +--------+ |
| | Latte | | Capp | |
| | RM 12 | | RM 12 | |
| +--------+ +--------+ |
| ─── Cart ─────────────────────── |
| 1× Latte RM 12 |
| 2× Croissant RM 18 [🗑️] |
| Total: RM 30 |
| [💳 Charge] [➕ Add more] |
+----------------------------------+

text

- **Long‑press cart item** → edit modifiers.  
- **Swipe left** → delete item (undo option).  
- **Void entire order** button (with reason: customer changed mind / duplicate / wrong table).

### State 3: Modifier Sheet (overlay)

Same as original but supports **editing** after item is in cart.

### State 4: Payment + Split Bill
+----------------------------------+
| Total: RM 85.50 |
| Split: [2] ways → RM 42.75 each |
| ─────────────────────────────── |
| ● Even split across all items |
| ○ Assign items per person |
| ─────────────────────────────── |
| Person 1: 1× Latte, 1× Croissant |
| Person 2: 1× Cappuccino |
| [+ Add person] |
| Payment method for Person 1: |
| ○ Cash ○ Card ○ QR |
| [Pay for Person 1] |
+----------------------------------+

text

After each split is paid, the order continues for remaining persons.  
Final split orders are linked to a parent order (kitchen sees combined items).

### State 5: Done / Receipt (per split)
✅ Split 1 of 2 paid – RM 42.75
Order #A‑142‑1
Print receipt? [Yes] [No]
[Next Split] or [New Order]

text

---

## 6. Table Grid with Quick Actions (`/tables`)

Instead of just a status grid:
Table 5 (Occupied · 2 pax · 25 min)
[➕ Add Item] [📄 View Bill] [🔀 Split] [✅ Pay & Clear]

Table 6 (Occupied · 4 pax · 45 min)
[➕ Add Item] [📄 View Bill] [🔀 Split] [✅ Pay & Clear]

text

**Long‑press on a table** → "Merge with Table X" (for large groups).  
**Merge action:** Moves all open orders from source table to target, frees source table.

---

## 7. Loyalty Screen (Replaces Wallet Top‑Up)

Crew **never** handles cash reloads. Instead, they apply loyalty benefits.
+----------------------------------+
| Customer: Ali (Gold) |
| Points: 450 (50 to next reward) |
| Birthday reward available: RM 10 |
| ─────────────────────────────── |
| [Apply 10% Gold discount] |
| [Apply birthday reward] |
| [Check points balance] |
| ─────────────────────────────── |
| Last order: Table 5, RM 45 |
| Points earned: 45 |
+----------------------------------+

text

**Endpoint:**  
`POST /staff/loyalty/apply` → applies discount to current open order (or returns error if no order).

---

## 8. Offline‑First Architecture (Phase 0)

**No offline mode = dealbreaker.** Implement local‑first with sync.

### Local Storage (IndexedDB)
- **Menu** (full catalog, expires after 24h)
- **Customers** (recent 100 + search index)
- **Tables** (layout + status)
- **Pending orders** (queue for sync)

### Sync Strategy
- App syncs on login and every 5 minutes.
- When offline: orders saved to `offline_queue` with timestamp.
- When back online: `POST /staff/pos/orders/batch`  
- Backend returns conflicts (e.g., item discontinued, table now occupied).  
- UI shows conflict resolution dialog.

### Offline UI Indicator
Top bar: `📡 Offline mode – 2 orders waiting` (tap to see queue).

**New endpoint:**
POST /staff/pos/orders/batch
Body: { offline_orders: [...] }
Response: { accepted: [...], conflicts: [...] }

text

---

## 9. Kitchen Display Improvements

Add to `/kitchen`:

- **Flashing red border** for orders >10 minutes.
- **URGENT badge** for any order with `special_instructions` containing "ASAP", "allergy", or flagged by staff.
- **Bump bar** at bottom:  
  `[Mark all ready]  [Recall last 5]`  
  (Recall shows bumped orders in case chef missed them)
- **Sound toggle** (on/off) – default on, staff can mute in noisy times.

---

## 10. Backend – New & Modified Endpoints

### Existing from original (keep)
- `GET /staff/dashboard`
- `GET /staff/customers/search`
- `POST /staff/auth/verify-pin` (used only for high‑risk actions)
- `POST /staff/pos/orders`

### New endpoints (add)

| Endpoint | Purpose |
|----------|---------|
| `POST /staff/pos/orders/{id}/items` | Add item to existing order |
| `PATCH /staff/pos/orders/{id}/items/{item_id}` | Modify quantity/modifiers |
| `DELETE /staff/pos/orders/{id}/items/{item_id}` | Remove item |
| `POST /staff/pos/orders/{id}/split` | Create split orders, return split IDs |
| `POST /staff/pos/orders/batch` | Sync offline orders |
| `POST /staff/tables/{id}/merge` | Merge table into another |
| `POST /staff/loyalty/apply` | Apply discount/reward to current order |
| `POST /staff/pos/orders/{id}/void` | Void entire order (with reason) |

### Idempotency for POS
All `POST /staff/pos/orders` and `.../items` must accept `Idempotency-Key` header to prevent double charging on double‑tap.

---

## 11. File Changes (Updated)
DELETE:
src/app/wallet/page.tsx → replaced by loyalty
src/components/Sidebar.tsx → desktop-only
src/components/TopBar.tsx → replaced by StoreHeader

RENAME:
src/app/orders/ → src/app/kitchen/

CREATE:
src/components/StoreHeader.tsx → top bar with back button
src/app/pos/page.tsx → POS (4 states + split)
src/app/loyalty/page.tsx → loyalty & discounts
src/app/tables/page.tsx → enhanced grid + quick actions
src/lib/offline.ts → IndexedDB + sync queue
src/lib/idempotency.ts → generate idempotency keys
backend/app/api/v1/endpoints/pos.py
backend/app/api/v1/endpoints/loyalty.py
backend/app/api/v1/endpoints/tables.py

MODIFY:
src/app/layout.tsx → full-width, auth guard
src/app/page.tsx → grid dashboard
src/app/kitchen/page.tsx → add visual urgency + recall
src/app/time-clock/page.tsx → PIN only for void/discount
src/lib/api.ts → add new functions
src/styles/utilities.css → grid & button styles
backend/app/api/v1/router.py → register new routers

text

---

## 12. Implementation Phases (Revised)

### Phase 0: Offline Foundation (4h)
- IndexedDB setup (menu, customers, pending orders)
- Service worker for asset caching
- Sync queue manager
- Offline indicator UI

### Phase 1: Backend (8h)
| Task | Est. |
|------|------|
| `GET /staff/dashboard` | 1h |
| `GET /staff/customers/search` | 1h |
| `POST /staff/auth/verify-pin` | 0.5h |
| `POST /staff/pos/orders` (idempotent) | 2h |
| `POST /staff/pos/orders/batch` (offline sync) | 2h |
| `POST /staff/pos/orders/{id}/items` + modifications | 1.5h |

### Phase 2: Core UI Foundation (3h)
- StoreHeader + back navigation
- Home grid dashboard (with badges + undo last order)
- Table status grid (basic)

### Phase 3: POS Terminal – Order‑Type‑First (6h)
| Task | Est. |
|------|------|
| State 0: Order type + table selection | 1h |
| State 1: Customer lookup (optional) | 1h |
| State 2: Menu browser + cart | 2h |
| Modifier sheet (add/edit) | 1.5h |
| Cart item swipe/delete | 0.5h |

### Phase 4: POS – Split Bill & Payment (5h)
| Task | Est. |
|------|------|
| Split UI (even / per‑item) | 2h |
| Payment flow for each split | 1.5h |
| Receipt + next split / new order | 1h |
| Void order flow | 0.5h |

### Phase 5: Table Quick Actions + Merge (3h)
- Add item button (opens POS with table preselected)
- View bill (shows open order summary)
- Merge tables (long‑press)
- Pay & clear

### Phase 6: Loyalty Screen (2h)
- Customer search + display points/tier
- Apply discount/reward to current order
- No wallet top‑up

### Phase 7: Kitchen Upgrades (2h)
- Flashing border for delayed orders
- URGENT badge
- Bump bar (mark all ready, recall last 5)
- Sound toggle

### Phase 8: Offline Sync UI + Testing (4h)
- Show pending sync count
- Conflict resolution dialog
- Manual retry button

### Phase 9: Polish & Responsive (3h)
- Test on phone portrait/landscape, tablet
- Gesture back (swipe)
- Performance tuning (badge polling → WebSocket)

**Total estimated time: 40 hours** (full production‑ready)

---

## 13. Open Questions – Resolved

| # | Original | Decision |
|---|----------|----------|
| 1 | Printing | Auto‑print to kitchen bump bar; customer receipt optional |
| 2 | Offline mode | **Required** – Phase 0 |
| 3 | Split bills | **Yes** – Phase 4 |
| 4 | Discount permissions | Crew can apply loyalty discounts; manager PIN for >10% |
| 5 | Order modification | **Yes** – edit/void before kitchen accepts |
| 6 | Out‑of‑stock | Gray out + "Sold out" – override requires manager PIN |
| 7 | Table merging | **Yes** – long‑press on table grid |

---

## 14. Success Metrics (Post‑Launch)

- Average POS transaction time: **<45 seconds** (from order type to payment)
- Offline order recovery rate: **>99%** (no lost orders)
- Split bill usage: **>20% of dine‑in orders** (indicates feature adoption)
- Kitchen bump‑to‑serve time reduction: **15%** (from visual urgency)

---

*This plan is ready for development. Start with Phase 0 (offline) – everything else depends on it.*