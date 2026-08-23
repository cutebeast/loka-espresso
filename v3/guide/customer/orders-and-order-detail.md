# Customer PWA: Orders & Order Detail

## Pages
- `orders` — Order history
- `order-detail` — Order detail

## Orders page

### What you see
A list of your orders with:
- Order number
- Store
- Date and time
- Status
- Total

### Active orders
Active orders (pending, confirmed, preparing, ready_for_pickup, out_for_delivery) appear at the top.

### Past orders
Completed, cancelled, and refunded orders appear below.

### Pull to refresh
Swipe down to refresh the order list.

## Order statuses

| Status | Meaning |
|--------|---------|
| pending | Order received, waiting for confirmation. |
| confirmed | Store has accepted the order. |
| preparing | Kitchen is preparing your order. |
| ready_for_pickup | Order is ready for collection. |
| out_for_delivery | Order is on the way. |
| delivered | Order has been delivered. |
| cancelled | Order was cancelled. |
| refunded | Refund processed. |

## Order detail page

### Open an order
1. Tap an order in the list.
2. The detail page opens.

### What you see
- Items ordered with modifiers
- Pricing breakdown
- Order type and table/address
- Status progress bar
- Payment method and status
- Reorder button

### Reorder
1. Open a past order.
2. Tap **Reorder**.
3. Items are added to your cart.
4. Proceed to checkout.

### Pay for an unpaid order
1. Open the order detail.
2. Tap **Pay Now** if payment is pending.
3. Complete payment.

### Cancel an order
1. Open the order detail.
2. Tap **Cancel Order** while the order is still pending and unpaid.
3. Confirm.

Cancelling releases everything on the order: any voucher or reward used on it goes back to your wallet (active again), booked seats and table locks are freed, and stock is restored. Orders that have been paid can't be cancelled this way — ask staff for a refund.

### Unpaid orders auto-cancel
Unpaid pay-before-food orders cancel themselves after a while: kiosk orders after **15 minutes**, all others after **2 hours** (a background sweep runs every few minutes). Dine-in open tabs (pay after your meal) are never auto-cancelled. An auto-cancelled order gets the same full release as a manual cancel.

### Points arrive with the payment
Loyalty points for an order are estimated at checkout and credited to your balance when the payment is captured. Pay for an unpaid order from the order detail ("Pay Now") and the points follow the payment.

## Deep links

Orders can be opened via deep link from SMS, email, or QR codes. The format uses the order ID:
```
#order-detail?orderId=123
```

## Related
- [Checkout & Payment](checkout-and-payment.md)
- [Menu & Ordering](menu-and-ordering.md)


## Workshop Orders

Workshop bookings appear separately from menu orders. They include:
- Session date and time
- Number of seats booked
- Venue details (Google Maps link)
- Cancel/refund policy

Workshop items cannot be ordered from the kiosk — mobile app only.


## Open Tab (Dine-in)

Dine-in orders placed via table QR are open tabs: the kitchen prepares your food immediately and you pay after your meal — from the PWA or at the counter.
