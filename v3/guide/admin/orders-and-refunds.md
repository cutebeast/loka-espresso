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

The Refunds page lists every refund with order number, amount, reason, status, and date. New refunds are created from the **order detail** page, not here.

### Process a refund
1. Open the order from **Orders**.
2. In the payments section, enter the refund **amount** and **reason** on the relevant payment, then confirm.
3. The refund is validated against the remaining refundable balance — over-refunding is rejected with the exact amount left.

### Refund rules
- Only **captured** payments can be refunded (full or partial). Multiple partial refunds are allowed up to the captured total.
- **Duplicate protection**: an identical refund (same payment, amount, and reason) within 60 seconds is rejected as a duplicate — it is safe if you click twice by accident.
- **Every refund is audit-logged** with the approving admin, amount, reason, and payment details.
- The order shows `partially_refunded` or `refunded` once a refund is recorded.

### When the money settles
| Payment method | Refund settlement |
|---|---|
| Cash / wallet / store credit | **Completed immediately** — cash is handed back at the counter; wallet refunds credit the customer's wallet balance straight away (visible with a ledger entry). |
| Stripe / HitPay | Sent to the payment provider; the refund completes when the provider confirms it. |

### Policy: loyalty and lucky draw on refunds
**Points and lucky-draw tickets are NOT clawed back on refunds.** The customer keeps the loyalty points, annual tier spend, and any draw tickets earned from the original order. This is intentional — do not manually deduct points for a refund unless the owner asks for a one-off adjustment (done from the customer's Loyalty account page).

### Limitations
- Refunds depend on the original payment method — gateway methods refund through the gateway; other methods are handled by the manager directly.
- Store-scoped admins can only refund orders from assigned stores.
- No customer notification is sent automatically on refund — let the customer know in person or by message if needed.

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
