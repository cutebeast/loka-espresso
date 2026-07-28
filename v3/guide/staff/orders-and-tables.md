# Staff Portal: Orders & Tables

## Pages
- `/orders` — Order Queue
- `/tables` — Table Management

## Orders (`/orders`)

### Purpose
View and search the order queue.

### What you see
- Order number
- Customer name
- Order type
- Status
- Payment status
- Total

### Tabs

| Tab | Orders shown |
|-----|--------------|
| Queue | Active orders not yet delivered or cancelled. |
| Unpaid | Orders awaiting payment. |
| All | All orders for the session. |

### Open an order
1. Tap an order row.
2. View details.
3. Depending on your role, you may update status or view payment info.

### Merged orders
If two unpaid orders were combined on the kitchen display (see [Kitchen Display](kitchen-display.md)), the cancelled one shows **"Merged into order X"** as its cancellation reason, and all its items appear on the surviving order.

### Filter
- By status
- By order type
- By payment status

## Tables (`/tables`)

### Purpose
View table status and access table QR codes.

### Table statuses

| Status | Meaning |
|--------|---------|
| Available | No active order. |
| Occupied | Has an active order. |
| Reserved | Booked via reservation. |
| Cleaning | Being cleaned. |

Occupied tables show a **duration badge** — how long the table has been occupied (e.g. "45m"). It turns **amber after 60 minutes** and **red after 120 minutes**, so long-stay tables stand out during a rush. The badge also links to the current order.

### Seat a customer
1. Tap an available table.
2. Optionally create a new POS order linked to that table.

### Generate or view QR code
1. Tap a table row.
2. Tap **Show QR**.
3. Display the QR code so customers can scan it to order dine-in from the PWA.

### Limitations
- Table QR generation requires the store's public URL to be configured.
- Some actions may require admin access.

## Related
- [POS Checkout](pos-checkout.md)
- [Kitchen Display](kitchen-display.md)
- [Reservations](reservations.md)
