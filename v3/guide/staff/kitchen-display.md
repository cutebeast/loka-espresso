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
| New | Just sent to the kitchen (`pending`). |
| Queued | Accepted (`confirmed`). |
| Preparing | Being cooked or prepared. |
| Done | Ready for pickup or service (`ready_for_pickup`). |

### Station tabs (bar vs kitchen)

The **All / Bar / Kitchen** tabs above the columns route each order's items to the right station:

- **Bar** — drink categories only (specialty coffee, beyond coffee, frappes, juices, bottled drinks, signature drinks).
- **Kitchen** — everything else (food, pastries).
- **All** — the full queue.

A station tab shows **only its items**: an order with a latte and a sandwich appears in both tabs — the Bar tab shows the latte, the Kitchen tab shows the sandwich. Routing comes from the `kds.station_map` platform config, which an admin can edit in **Settings → Kitchen Display (KDS)**.

### Order card information
- Order number
- Order type (dine-in, takeaway)
- Items with modifiers (on station tabs: only that station's items)
- Customer notes
- Time since order was placed

Use the search box, sort selector, and kanban/list toggle in the top bar to change the view.

### Audio alerts
Enable or disable the speaker icon to play a sound when a new order arrives.

## Kitchen order detail (`/kitchen/[id]`)

1. Tap an order card.
2. View full item list and modifiers.
3. Tap **Start** to move the order to **Preparing**.
4. Tap **Ready** when all items are done.
5. Tap **Served** when the order has been delivered to the table or handed to the customer.

### Merge an order into another

Two unpaid orders can be combined — e.g. a couple at one table asked for separate orders and now want one bill:

1. Open the order you want to get rid of (it must be unpaid and not delivered/cancelled).
2. In the **Merge into…** card, tap the target order from the list of other unpaid orders.
3. All items move to the target order and the totals add up. The merged order is cancelled with the note **"Merged into order X"**, which admins can see on the order detail page.

Orders with any payment (even a refunded one) cannot be merged — split-bill records would break. Workshop seats booked on the merged lines move with them and stay reserved.

### E-invoice card

When e-invoicing is active for the store, a paid order shows its LHDN e-invoice here: status badge, document code, and — once validated — a validation link with a QR code the customer can scan to verify the invoice. While the store runs in setup mode the documents are simulated; ask a manager before relying on them for tax purposes.

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


## Display Mode (Wall Screen)

The kitchen wall screen runs in view-only display mode:

`staff.loyaltysystem.uk/kitchen?mode=display`

- Full-height 3-column kanban: **New** (confirmed) → **Preparing** → **Done** (ready_for_pickup)
- No filters, buttons, or search — pure order status
- Live badge + auto-refresh every 3 seconds
- Sound alert on new orders (toggleable on the staff page)

Staff operate orders from the regular `/kitchen` page; the wall screen is read-only.

## Kanban Columns

| Column | Status | Meaning |
|--------|--------|---------|
| New | confirmed | Paid — start cooking |
| Preparing | preparing | In progress |
| Done | ready_for_pickup | Ready to hand over |
