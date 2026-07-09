# Admin Portal: Orders & Refunds

## Pages
- `/orders` — Order List
- `/orders/[id]` — Order Detail
- `/refunds` — Refunds
- `/reservations` — Reservations

## Purpose
Monitor, update, refund, and analyse orders across all channels (PWA, POS, delivery). Manage table reservations.

## Order List (`/orders`)

### What it shows
All orders with order number, customer, store, type, status, payment status, and total.

### Filters
- Store
- Status
- Payment status
- Order type (dine-in, takeaway, delivery)
- Date range

### Order types

| Type | Source |
|------|--------|
| dine-in | Customer PWA (table QR) or Staff POS. |
| takeaway | Customer PWA or Staff POS. |
| delivery | Customer PWA or Staff POS. |

### Order statuses

| Status | Meaning |
|--------|---------|
| pending | New order, not yet confirmed. |
| confirmed | Order accepted by the store. |
| preparing | Kitchen is working on it. |
| ready_for_pickup | Ready for customer or server collection. |
| out_for_delivery | With delivery driver. |
| delivered | Completed delivery. |
| cancelled_by_customer | Cancelled by customer. |
| cancelled_by_merchant | Cancelled by staff/admin. |
| refunded / partially_refunded | Refund issued. |
| disputed | Under dispute. |

### Payment statuses

| Status | Meaning |
|--------|---------|
| pending | Awaiting payment. |
| authorized | Payment authorized but not captured. |
| captured | Payment captured successfully. |
| paid | Marked as paid (cash or equivalent). |
| failed | Payment failed. |
| refunded / partially_refunded | Refund processed. |

## Order Detail (`/orders/[id]`)

### What it shows
Full order information:
- Customer and store details.
- Line items with modifiers.
- Subtotal, discounts, tax, delivery fee, tip, and total.
- Payment method and status.
- Status history log.
- Fulfillment details.

### Update order status
1. Open the order detail.
2. Select the new status from the dropdown.
3. Add an optional note.
4. Click **Update Status**.

### Add an adjustment
1. Click **Add Adjustment**.
2. Choose type (discount, surcharge, comp).
3. Enter amount and reason.
4. Save.

### Re-send receipt
1. Click **Send Receipt**.
2. Confirm customer contact method.
3. Send.

## Refunds (`/refunds`)

### Process a refund from order detail
1. Open the order.
2. Click **Refund**.
3. Choose full or partial refund.
4. Enter amount and reason.
5. Select refund method (original payment method where supported).
6. Confirm.

### Refund via Refunds page
1. Go to **Refunds**.
2. Click **New Refund**.
3. Select the original order.
4. Enter refund details.
5. Save.

### Limitations
- Refunds depend on the original payment gateway's capabilities.
- Store-scoped admins can only refund orders from assigned stores.
- Some payment methods may require manual processing outside the system.

## Reservations (`/reservations`)

### What it shows
Table reservations with date, time, party size, and status.

### Reservation statuses

| Status | Meaning |
|--------|---------|
| requested | Awaiting confirmation. |
| confirmed | Confirmed by staff. |
| seated | Customer has been seated. |
| no_show | Customer did not arrive. |
| cancelled_by_guest | Cancelled by customer. |
| cancelled_by_merchant | Cancelled by staff. |
| completed | Finished. |

### Create a reservation
1. Click **New Reservation**.
2. Select store, table, customer, date, time, and party size.
3. Save.

### Confirm or cancel
1. Open the reservation.
2. Select the new status.
3. Save.

## Ordering journey from the admin view

1. Order created in PWA or POS → status `pending`.
2. Staff confirm → `confirmed`.
3. Kitchen prepares → `preparing`.
4. Order ready → `ready_for_pickup` or `out_for_delivery`.
5. Customer receives or order delivered → `delivered`.
6. Payment captured automatically or recorded in POS.
7. If needed, refund issued through order detail or Refunds page.

## Related
- [Staff Portal — POS](../staff/pos-checkout.md)
- [Customer PWA — Checkout](../customer/checkout-and-payment.md)
- [Settings — Payment Gateway](settings.md)
