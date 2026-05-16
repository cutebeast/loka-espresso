
Here is the complete, updated implementation plan integrating all F&B operational best practices, mobile ergonomics, and system resilience improvements.
code
Markdown
# Staff Portal v3 — Implementation Plan

**Last updated:** 2026-05-15  
**Status:** Planning — Phase 1 pending  
**Device:** Mobile-first (phone + tablet), portrait + landscape  
**Store Scope:** Staff are assigned to a single store at login. All data (orders, tables, reservations, menu) is scoped to that store. No store switching in-portal.

---

## 1. Design & Ergonomic Philosophy

### Visual Hub vs Bottom Tabs
Bottom tab bars work for consumer apps, but staff use a tablet or phone while moving — they need **one-tap access** without remembering which tab is which. A **grid of large touch-friendly buttons** on the home screen provides instant visual recognition.

### Mobile Ergonomics (One-Handed Operation)
In a fast-paced F&B environment, speed is critical:
*   **Thumb-Zone Actions:** Primary actions (Add to Cart, Pay, Confirm) are restricted to the bottom 30% of the screen.
*   **Large Tap Targets:** All operational buttons (especially `[+] / [-]` quantity modifiers) must be a minimum of **48x48px** to prevent fat-finger errors during a rush.
*   **Gestures Over Buttons:** Use intuitive gestures like "Swipe left to delete" in the cart rather than tiny `[x]` buttons.

---

## 2. Architecture & Resilience

Cafes and restaurants often have Wi-Fi dead zones (e.g., patios, deep corners).
*   **Real-Time Sync:** Replace basic polling with **WebSockets or Server-Sent Events (SSE)** for Kitchen KDS, Table Status, and "86'd" (Out-of-Stock) items. If an item sells out, it grays out instantly on all devices.
*   **Optimistic Offline Cart:** Allow staff to build carts offline. If they hit a dead zone at a table, they can still tap in the order. The app queues the `POST /staff/pos/orders` request and auto-syncs when they walk back into the Wi-Fi zone. (Note: Payment/Checkout strictly requires network connection).

---

## 3. Route Map

```text
/login                    → Login screen (full-screen, no chrome)
/ (home)                  → Grid dashboard (main navigation hub)
/kitchen                  → KDS — incoming orders grid
/kitchen/[id]             → Order detail + status actions
/tables                   → Table status grid
/pos                      → POS — order entry (Menu-first flow)
/wallet                   → Wallet top-up
/reservations             → Reservation management
/time-clock               → Clock in/out + PIN verification
/profile                  → Staff profile
Layout Structure
code
Text
+----------------------------+
|  StoreHeader               |  ← Fixed top: store name, staff name, Wi-Fi status, logout
+----------------------------+
|                            |
|  Page Content              |  ← Scrollable area, flex-grow
|                            |
+----------------------------+
|  [← Back to Home]          |  ← Fixed bottom, only on sub-pages
+----------------------------+
4. Home Screen — Grid Dashboard
7 Grid Buttons
Icon	Label	Badge	Route
UtensilsCrossed	Kitchen	Pending order count	/kitchen
Armchair	Tables	Occupied table count	/tables
CreditCard	POS Terminal	— (primary, highlighted)	/pos
CalendarCheck	Reservations	Today's count	/reservations
Wallet	Wallet Top-Up	—	/wallet
Clock	Time Clock	IN/OUT status	/time-clock
UserCircle	Profile	—	/profile
Live data updates via WebSocket. POS Terminal button is visually prominent with a gold accent border.
5. POS Terminal — Flow & Layouts
Crucial Change: Optimized for speed. Defaults to "Walk-in / Dine-in" with a Menu-First approach. Asking for a phone number before the order slows down the queue. Customer linking is done at checkout.
posState: "menu" | "modifiers" | "cart" | "payment" | "done"
State 1: Menu Browsing (Default Screen)
Portrait: Full-screen menu. Cart is a sticky bottom bar.
Landscape: Menu on left (70%), Cart on right (30%).
code
Text
+----------------------------+
| [≡] Table 5 | Dine-in ▼    |
| +- Categories ------------+|
| |Hot Drinks| Cold | Pastry||
| +-------------------------+|
| [Latte RM12] [Capp RM12]   |
| [Ameri RM10] [Mocha RM14]  |
| [Croissant ] [SOLD OUT  ]  |
|                            |
| ── (Sticky Bottom Bar) ─── |
| [🛒 View Cart (3) RM30.00] |  ← Tapping slides up State 3
+----------------------------+
State 2: Modifier Bottom Sheet (Slide-up Overlay)
Slides up from the bottom for easy thumb access when an item is tapped.
code
Text
+----------------------------+
|                            |
| ╭────────────────────────╮ |
| │ Latte                  │ |
| │ Milk: [Oat +RM2] [Soy] │ |
| │ Temp: [Hot] [Iced +RM1]│ |
| │ Qty:  [-]   1   [+]    │ |
| │ [ Add to Cart - RM14 ] │ |
| ╰────────────────────────╯ |
+----------------------------+
State 3: Cart & Customer Link (Slide-up or Side Panel)
Swipe left on items to remove.
code
Text
+----------------------------+
| ── Cart ────────── [Clear] |
| 1× Latte (Oat)       RM 14 |
| 1× Croissant         RM  9 |
|                            |
| Customer: [🔍 Link Member] | ← Add points/phone here
| Total: RM 23.00            |
| [💰 Proceed to Payment ]   |
+----------------------------+
State 4: Payment (With Quick Cash)
Auto-generates exact and next-highest bill amounts.
code
Text
+----------------------------+
| Total: RM 23.00            |
| Customer: Ali (Gold)       |
|                            |
| ○ Cash  ○ Card  ○ DuitNow  |
|                            |
| [ Exact RM 23.00 ]         |
| [ RM 25.00 ]  [ RM 50.00 ] |
| Custom: [ ______ ]         |
|                            |
| [ ✅ Confirm Payment ]     |
+----------------------------+
State 5: Done / Receipt
code
Text
+----------------------------+
|  ✅ Order Sent to Kitchen   |
|  Order #A-142               |
|  Paid: Cash                 |
|  Change: RM 2.00            |
|  [🆕 New Order]             |
+----------------------------+
6. F&B Operational Rules (System Guardrails)
Printing: The web portal does not handle printing directly. The backend triggers a webhook to a local print node (e.g., counter PC or Raspberry Pi) to print to ESC/POS thermal receipt/kitchen printers.
Out of Stock (86): Visual "Sold Out" badges. No override allowed. Tied to MenuItem.is_available.
Split Bills: Support "Split by Equal Amounts" only at launch.
Discounts & Voids: Service crew only access preset quick discounts (e.g., "Staff Meal 50%"). Custom percentages or voiding items after kitchen submission requires a Manager PIN Overlay.
7. Security: PIN Dialog Integration
Any sensitive action triggers a bottom-sheet numpad for a 4-digit PIN check:
Tap "Clock In" / "Top-Up Wallet" / "Void Order"
PIN entry dialog → POST /staff/auth/verify-pin {pin: "1234"}
Invalid → Shake animation, retry (max 3 attempts).
After 3 failures → 5-minute lockout + audit log.
8. Backend Requirements & Database Checks
New Endpoints Needed
GET /staff/dashboard (Returns WebSocket ticket + daily stats)
GET /staff/customers/search?q=<phone|name|qr>
POST /staff/auth/verify-pin
POST /staff/pos/orders (Validates inventory, resolves prices, computes tax, triggers print webhooks)
Database Constraints Verified
Feature	Columns / Tables Required	Status
POS Order	Order(order_type, order_channel, store_id, ...)	✅
Line Items	OrderLineItem(menu_item_id, unit_price, ...)	✅
Customer Link	Customer(phone_number, display_name, id)	✅
PIN Verification	StaffProfile(pin_hash)	✅
Wallet Top-Up	Wallet, WalletLedgerEntry	✅
Out of Stock	MenuItem(is_available, daily_stock_count)	⚠️ Add
Quick Discounts	StoreConfiguration(quick_discounts_json)	⚠️ Add
9. File Changes
code
Text
DELETE:
  src/components/Sidebar.tsx              → Desktop-only, removed.
  src/components/TopBar.tsx               → Replaced by StoreHeader.
  src/app/menu/page.tsx                   → Merged into /pos.
  src/app/inventory/page.tsx              → Not needed on shift.

RENAME:
  src/app/orders/ → src/app/kitchen/      (KDS terminology)

CREATE:
  src/components/StoreHeader.tsx          → Top bar + Wi-Fi status indicator.
  src/app/pos/page.tsx                    → POS terminal (Menu-first flow).
  src/components/BottomSheet.tsx          → Reusable mobile overlay.
  src/app/wallet/page.tsx                 → Wallet top-up.
  backend/app/api/v1/endpoints/admin/pos.py 

MODIFY:
  src/app/layout.tsx                      → Full-width layout, Auth guard.
  src/app/page.tsx                        → Replace redirect with grid dashboard.
  src/app/time-clock/page.tsx             → Add PIN dialog.
10. Implementation Phases (Est. ~27.5 Hours)
Phase 1: Backend & DB Updates (4.5h)
Add is_available and quick_discounts to schema.
GET /staff/dashboard + GET /staff/customers/search.
POST /staff/auth/verify-pin.
POST /staff/pos/orders (w/ print webhook triggers).
Phase 2: Foundation & Grid (3.5h)
Delete Sidebar, create StoreHeader.
Build responsive grid dashboard with CSS + live badges.
Establish WebSocket/SSE connection for store data.
Phase 3: Cleanup (0.75h)
Rename /orders → /kitchen. Delete old menu/inventory pages.
Phase 4: POS Terminal — Core Mobile Flow (5h)
Refactor POS to Menu-First flow.
Build reusable BottomSheet component.
Menu browser & category pills.
Modifier bottom sheet overlay.
SQLite / Local Storage queue for offline Cart Building.
Phase 5: POS Terminal — Checkout & Polish (6h)
Cart bottom sheet + Swipe-to-delete.
Customer search/link integration.
Quick-cash algorithm & Payment states.
Manager PIN override hooks for voids.
End-to-End Test: Walk-in → Menu → Cart → Pay → Kitchen Sync.
Phase 6: Wallet & Security (4h)
Wallet top-up screen + QR scan logic.
Numpad PIN dialog component (reusable).
Integrate PIN into Time Clock.
Phase 7: F&B Polish (3.5h)
Kitchen KDS — audio alerts, elapsed time colors (Green → Yellow → Red).
Visual "86" Sold Out badges logic.
Rigorous responsive testing (Phone vs Tablet layout shifts).
code
Code
