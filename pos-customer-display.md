# POS Customer-Facing Display — Feature Documentation

## Overview

The customer-facing display is a second screen that shows the customer what
the staff is ringing up on the POS. It runs on a separate browser window/tab
and syncs in real-time with the POS via the **BroadcastChannel API** — no
backend round-trip needed, everything is same-origin and instant.

## How it works

```
┌─────────────────────┐     BroadcastChannel      ┌─────────────────────┐
│   POS (staff side)  │ ─────────────────────────▶│  Display (customer) │
│   /pos              │     "pos-display" channel  │  /pos/display       │
│                     │                            │                     │
│  • Add items        │  broadcast(state)          │  • Show items       │
│  • Select table     │ ──────────────────────▶   │  • Show total       │
│  • Send to kitchen  │                            │  • Show QR          │
│  • Initiate payment │                            │  • Show thank-you   │
└─────────────────────┘                            └─────────────────────┘
```

The POS page broadcasts the current state (cart, total, payment phase) on
every change. The display page listens and re-renders instantly.

## Setup (for restaurant staff)

1. Staff opens the POS at `https://staff.loyaltysystem.uk/pos` on their
   tablet/monitor.
2. Click the **"Display"** button in the POS toolbar — this opens
   `/pos/display` in a new browser window.
3. Drag the display window to the customer-facing monitor (second screen).
4. Press **F11** to fullscreen the display window.
5. The display now shows a welcome screen. As the staff adds items to the
   cart, the display updates in real-time.

## Customer flow (payment via PWA)

1. Staff adds items to cart → display shows items + running total.
2. Staff clicks "Send to Kitchen" → display shows order confirmation.
3. Staff selects **Stripe QR** payment → display shows a **QR code**.
4. Customer **scans the QR** with their phone → opens the **PWA**
   (`app.loyaltysystem.uk/order-detail?order_id=X`).
5. Customer pays on their phone via Stripe Checkout.
6. POS polls order status → detects payment → display shows **"Thank you!"**
   with the order number, total, and change.

## Display screens

### 1. Welcome (idle)
- Store name (LOKA Espresso)
- Live clock
- "Your order will appear here" hint

### 2. Browsing (cart building)
- Store name + order type badge (Dine-in · Table T5 / Takeaway / Delivery)
- Order Summary: item name, qty, modifiers, price
- Running total (subtotal, service charge, tax, total due)

### 3. Payment QR
- "Scan to Pay" heading
- QR code (links to PWA `app.loyaltysystem.uk/order-detail?order_id=X`)
- Total amount
- "Scan with your phone to pay" hint
- Order number

### 4. Payment in progress (cash/card)
- "Payment in progress" message
- Total amount
- Spinner

### 5. Thank you (paid)
- Green checkmark
- "Thank you!" message
- Order number (#POS-0708-XXXX)
- Total paid
- Change (if cash)
- Payment method

## Technical details

### Files
| File | Purpose |
|------|---------|
| `src/app/pos/display/page.tsx` | Customer-facing display page (standalone, no auth) |
| `src/components/pos/usePosBroadcast.ts` | BroadcastChannel bridge (broadcast/subscribe/open) |
| `src/app/pos/page.tsx` | POS page — broadcasts state on every change |
| `src/components/AuthProvider.tsx` | Skips auth for /pos/display (customer-facing) |
| `middleware.ts` | /pos/display added to PUBLIC_PATHS (no auth redirect) |
| `src/lib/translations.ts` | 7 new display translation keys (en) |

### BroadcastChannel API
- Channel name: `"pos-display"`
- POS broadcasts `{ type: "state", state: DisplayState }` on every cart/payment change
- POS broadcasts `{ type: "reset" }` on new order
- Display subscribes and renders the state

### PWA deep-link
When the POS initiates Stripe QR payment, the display generates a QR linking to:
```
https://app.loyaltysystem.uk/order-detail?order_id=ORDER_ID
```
The customer scans this QR → opens the PWA on their phone → sees the order
detail → pays via Stripe Checkout. The POS polls `getOrderById` to detect
payment completion and broadcasts the "paid" state to the display.

### Auth
The display page is **public** (no staff_token required) — it's customer-facing.
The middleware and AuthProvider both skip auth for `/pos/display`. The page
works even if the customer opens the URL directly (though normally the staff
opens it via the "Display" button).

### Translations
7 new keys seeded in the `staff-ui` namespace (en):
- `pos.display_customer_screen` → "Display"
- `pos.display_open_customer_screen` → "Open customer display screen"
- `pos.display_welcome` → "Welcome to our store"
- `pos.display_scan_to_order_hint` → "Your order will appear here"
- `pos.display_scan_with_phone` → "Scan with your phone to pay"
- `pos.display_payment_in_progress` → "Payment in progress"
- `pos.display_thank_you` → "Thank you!"

Other locales (ms/zh/ta/tr) need these keys translated via the Admin Portal
translations manager.

## Verified
- Display page loads standalone (200, no auth) ✓
- Cart syncs in real-time via BroadcastChannel ✓
- Shows items, prices, running total ✓
- Shows order type badge (Dine-in/Takeaway/Delivery) ✓
- Resets to welcome on New Order ✓
- "Display" button present on POS toolbar ✓
- Order confirmation shows after Send to Kitchen ✓
- Payment QR generates from PWA deep-link ✓
- Thank-you screen shows order #, total, change ✓
