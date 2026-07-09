# Staff Portal: Kitchen Display

## Pages
- `/kitchen` — Kitchen list
- `/kitchen/[id]` — Kitchen order detail

## Purpose
Show incoming orders to kitchen staff and track preparation status.

## Who can use it

`kitchen_staff`, `shift_supervisor`, `store_manager`, and admin users.

## Kitchen list (`/kitchen`)

Orders appear in columns by status:

| Column | Meaning |
|--------|---------|
| Pending | Just sent to the kitchen. |
| Preparing | Being cooked or prepared. |
| Ready | Ready for pickup or service. |

### Order card information
- Order number
- Order type (dine-in, takeaway, delivery)
- Items with modifiers
- Customer notes
- Time since order was placed

### Audio alerts
Enable or disable the speaker icon to play a sound when a new order arrives.

## Kitchen order detail (`/kitchen/[id]`)

1. Tap an order card.
2. View full item list and modifiers.
3. Tap **Start** to move the order to **Preparing**.
4. Tap **Ready** when all items are done.
5. Tap **Served** when the order has been delivered to the table or handed to the customer.

## Status flow

```
pending → confirmed → preparing → ready_for_pickup → delivered
```

For delivery orders, the flow includes `out_for_delivery`.

## Handling special cases

### Cancelled or refunded orders
If an order is cancelled or refunded in the Admin Portal, it disappears from the KDS automatically.

### Late orders
Orders that have been in a status too long are highlighted. Prioritise these.

### Notes
Read customer notes carefully (e.g., "extra hot", "no onions").

## Limitations

- The kitchen page polls for new orders every few seconds.
- Some status updates call admin endpoints. If you see a permission error, ask a shift supervisor or manager to update the status.
- Pure `kitchen_staff` tokens may be rejected for some admin-endpoint actions.

## Related
- [POS Checkout](pos-checkout.md)
- [Orders & Tables](orders-and-tables.md)
- [Admin — Orders & Refunds](../admin/orders-and-refunds.md)
