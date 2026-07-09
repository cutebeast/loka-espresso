# Staff Portal: POS Checkout

## Page
`/pos`

## Purpose
Create orders, apply vouchers and rewards, take payments, and send orders to the kitchen.

## Order types

| Type | When to use |
|------|-------------|
| Dine-in | Customer eats in the store. Requires a table. |
| Takeaway | Customer picks up the order. |
| Delivery | Order is delivered to the customer. |

## Create an order

1. Tap **POS** from the home screen.
2. Select **Dine-in**, **Takeaway**, or **Delivery**.
3. For dine-in, scan or select a table.
4. Tap menu items to add them to the cart.
5. Tap an item in the cart to edit modifiers or quantity.
6. Apply a voucher or reward if needed.
7. Tap **Charge**.

## Apply a voucher or reward

1. Tap **Add Voucher / Reward**.
2. Scan the customer's voucher QR code or enter the code manually.
3. The discount is applied automatically.
4. To remove, tap the applied voucher and select **Remove**.

## Payment methods

### Cash
1. Tap **Cash**.
2. Enter the amount received from the customer.
3. The system calculates change.
4. Tap **Complete**.
5. Print or skip receipt.

### Stripe QR
1. Tap **Stripe QR**.
2. A QR code appears on the customer-facing display (if enabled) or on the POS screen.
3. Customer scans the code with their phone and pays.
4. The POS polls for payment status.
5. Once paid, the order is confirmed.

## Park / hold an order

1. Build the order.
2. Tap **Park**.
3. The order is saved as unpaid.
4. Recall it later from **Held Orders**.

## Customer-facing display

For stores with a second customer-facing screen:

1. Tap **Open Customer Display** in the POS.
2. A new window opens on the second screen.
3. The display shows:
   - Store name (pulled from **Stores** settings).
   - Order type and table number.
   - Cart items, subtotal, service charge, and tax.
   - Total due and a payment QR code (for Stripe QR payments).
   - A "Thank you" message after payment.

### Configure fees shown on the display

The display reads service charge and tax rate from the store configuration keys:

| Config key | Purpose |
|------------|---------|
| `order.service_charge` | Flat service charge added to the order. |
| `order.tax_rate` | Tax rate applied to the subtotal (e.g. `0.06` for 6%). |

Set these in the admin **Stores** settings or database. Changes take effect on the next order.

### Configure display window position

By default the customer display opens at screen coordinate `left=1920` (the right-hand monitor in a typical dual-screen setup). To change this, set the store configuration key `pos.customer_display.left` to the desired X coordinate.

## POS cart actions

| Action | Purpose |
|--------|---------|
| Clear | Remove all items from the cart. |
| Park | Save the order as unpaid. |
| Charge | Proceed to payment. |
| Add note | Add a customer or kitchen note. |
| Add voucher/reward | Apply discount. |

## Hardware notes

- Receipt printer, cash drawer, and kitchen ticket printer buttons are disabled until the hardware feature flags are enabled and integrations are installed.
- The customer display uses BroadcastChannel and works on any modern browser; no extra drivers are needed.
- See [Hardware Peripherals](hardware-peripherals.md) for details on supported and unsupported devices.

## Refunds and corrections

Most refunds are handled by a manager in the Admin Portal. If you make a mistake before payment, tap **Clear** to reset the cart.

## Related
- [Kitchen Display](kitchen-display.md)
- [Orders & Tables](orders-and-tables.md)
- [Admin — Orders & Refunds](../admin/orders-and-refunds.md)
