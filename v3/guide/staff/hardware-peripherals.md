# Staff Portal: Hardware Peripherals

## Supported hardware

### Customer-facing display

The POS includes a built-in customer display that runs in a second browser window.

- **Connection:** Same-origin browser window (no cable required).
- **How it works:** The POS broadcasts cart and payment state over `BroadcastChannel`; the display page listens and renders in real time.
- **Setup:** Tap **Open Customer Display** on the POS. Position the window on the customer-facing monitor.
- **Configuration:** Set `pos.customer_display.left` in store config to control the window's X coordinate.

## Coming-soon hardware

The following devices are not yet integrated. Buttons for these actions are disabled in the UI and show a tooltip until backend integrations are available.

| Device | Status | Notes |
|--------|--------|-------|
| Receipt printer | Coming soon | Will likely use `window.print()` or a native printer driver. |
| Cash drawer | Coming soon | Requires a connected receipt printer or dedicated cash-drawer driver. |
| Kitchen ticket printer | Coming soon | Will print kitchen chits from the POS or kitchen display. |

## What to do now

- Use the customer display for live cart and QR payment visibility.
- Print receipts manually from the browser if required (`Ctrl+P` / `Cmd+P`).
- Contact the platform administrator if you need a hardware integration timeline.

## Related
- [POS Checkout](pos-checkout.md)
- [Kitchen Display](kitchen-display.md)
