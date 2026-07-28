# Staff Portal: Hardware Peripherals

## Supported hardware

### Customer-facing display

The POS includes a built-in customer display that runs in a second browser window or on a separate counter tablet.

- **Connection:** Same-origin browser window (no cable required), or a separate tablet polling every 2 seconds with the store's display key (`/pos/display?store=N&key=…` — the POS passes these when you open it).
- **How it works:** The POS broadcasts cart and payment state over `BroadcastChannel` (same device) and Redis (cross-device); the display page listens and renders in real time. Signed payment URLs are stripped from the cross-device channel — the tablet shows a pay prompt instead of the QR.
- **What it shows:** live cart while you build the order, the real order items and totals during checkout, split-bill progress ("RM X of RM Y paid"), the payment QR during QR payments, and a thank-you screen with change — plus the e-invoice validation QR when e-invoicing is active.
- **Setup:** Tap **Open Customer Display** on the POS. Position the window on the customer-facing monitor.
- **Configuration:** Set `pos.customer_display.left` in store config to control the window's X coordinate.

## Self-ordering kiosk (`#kiosk`)

A McDonald's/KFC-style self-ordering kiosk runs inside the customer PWA — a simplified, touch-optimized, guest-only ordering flow.

- **URL:** `https://<app-host>/#kiosk?store=N` (e.g. `…/#kiosk?store=1`) — open it on the counter tablet in fullscreen. It needs no login; the store comes from the `store` parameter.
- **Flow for the customer:** **Tap to Order** → **Dine In** (enters a table number) or **Takeaway** → browse the full menu by category or search → pick modifiers (size, milk, add-ons) → **Cart** → **Checkout** → **Pay Now**.
- **What happens next:** the kiosk places the order as **unpaid** and shows the order number with a **guest-pay QR** — the customer either pays at the counter (staff charge it from the POS **Unpaid** list as usual) or scans the QR to pay from their phone. The order appears in the staff order queue and kitchen display like any other order (dine-in shows the table number).
- **Kiosk behavior:** inactivity returns it to the welcome screen automatically; it requests fullscreen and keeps the screen awake (wake lock) on supported tablets.
- **Menu note:** the kiosk shows the full available menu for the store (all categories). If items look stale, reload the page.

## Coming-soon hardware

The following devices are not yet integrated. Buttons for these actions are disabled in the UI and show a tooltip until backend integrations are available.

| Device | Status | Notes |
|--------|--------|-------|
| Receipt printer | Coming soon | Will likely use `window.print()` or a native printer driver. |
| Cash drawer | Coming soon | Requires a connected receipt printer or dedicated cash-drawer driver. |
| Kitchen ticket printer | Coming soon | Will print kitchen chits from the POS or kitchen display. |

## What to do now

- Use the customer display for live cart and QR payment visibility.
- Set up a counter tablet with the self-ordering kiosk (`#kiosk`) for walk-in customers.
- Print receipts manually from the browser if required (`Ctrl+P` / `Cmd+P`).
- Contact the platform administrator if you need a hardware integration timeline.

## Related
- [POS Checkout](pos-checkout.md)
- [Kitchen Display](kitchen-display.md)
