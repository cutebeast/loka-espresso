# POS Customer Display

The customer-facing display shows order details and payment QR codes to customers at the counter.

## Setup

1. Open the POS page at `staff.loyaltysystem.uk/pos`
2. Tap the **Tools** dropdown → **Display** (or use the Display button in the top bar)
3. The customer display opens in a new window at `staff.loyaltysystem.uk/pos/display?store=1&key=<display_key>`

The display key is per-store and configured in Admin → Stores → Store Settings.

## How It Works

The display receives order state from the POS via two channels:
- **BroadcastChannel**: Same-device (instant) — when the display opens as a popup from the POS
- **Redis polling**: Cross-device (≤2 seconds) — when the display runs on a separate tablet

## Display Phases

| Phase | What Customers See |
|-------|-------------------|
| **Idle** | Store name, live clock, promo banner carousel |
| **Browsing** | Order items with images, quantities, running total |
| **Payment** | QR code to scan for guest-pay (Wallet/Stripe/HitPay) |
| **Paid** | Green checkmark, total paid, order number, e-invoice QR |

## Dedicated Domain

The display also works at `pos-disp.loyaltysystem.uk` for dedicated tablets.

## Connection Status

A dot in the corner shows connection state:
- 🟢 Green: Live (updated within 5 seconds)
- 🟠 Amber: Stale (>5 seconds since last update)
- 🔴 Red: Disconnected (>30 seconds — auto-returns to idle)

## Language

Tap EN / 中文 in the top-left corner of the idle screen to switch the display language.
