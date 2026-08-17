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


## Customer Search

Search customers by phone number from the POS header. The search is debounced (300ms) and returns up to 5 results. Click a result to attach the customer to the current order.

If no customer is found with 3+ digits entered, a "Quick Add" button appears — create a new customer with the entered phone number.


## Order Queue Tabs

The Orders page has three tabs with sensible defaults:

| Tab | Shows | Window |
|-----|-------|--------|
| **Queue** | Live orders only — no pending, no cancelled | Last 24 hours |
| **Unpaid** | Problem orders — unpaid for 30+ minutes | Last 24 hours |
| **History** | Delivered + cancelled orders | All time |

Queue cards open the POS checkout screen (for payment and status changes), not the kitchen detail.

## Table Locking

When a dine-in order is created — from POS, kiosk, or PWA — the table is marked **occupied** in `table_status_snapshot`. The table shows as occupied on the Tables page until the order is delivered or cancelled.


## Payment Flow (prepaid vs pay-after-meal)

Every order carries a `payment_flow` discriminator:

| payment_flow | Meaning | Channels | Auto-cancel |
|--------------|---------|----------|-------------|
| **prepaid** | Pay BEFORE food | Kiosk, PWA takeaway/delivery, POS cash-now | Kiosk 15 min · others 2h unpaid |
| **pay_after_meal** | Open tab — pay AFTER eating (Malaysia table service) | PWA/QR dine-in, POS two-stage | Never |

The Unpaid tab splits by this: amber "pay after meal" = open tabs (normal — customer still eating), red "do not hand over" = prepaid problem orders. Paid orders always advance `pending → confirmed` automatically so they reach the kitchen.

## Delivery orders — key into the delivery system

Delivery orders are dispatched **manually** until a delivery-provider API is integrated:

1. Create the booking in your delivery system (Lalamove, GrabExpress, etc.).
2. On the Orders page, find the delivery order and tap **Key Delivery**.
3. Pick the provider and enter the **booking reference** (e.g. `LAL-1234567`), then **Mark dispatched**.
4. The order advances to **out for delivery** automatically and shows a badge like `lalamove · LAL-1234567`.
5. Rebooked? Tap **Update Delivery** to change the provider/reference.

Cancelled or delivered orders cannot be dispatched.
