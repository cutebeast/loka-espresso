# Staff Portal: Reservations

## Page
`/reservations`

## Purpose
View and manage **table reservations** (dine-in bookings) for your store: confirm requests, assign tables, seat guests, and handle no-shows.

## Two different systems — don't mix them up

| | Table reservations | Events & workshops |
|---|---|---|
| What | A table held for a date/time and party size | Paid classes and one-off events (e.g. Coffee Omakase Experience) with limited seats |
| Where customers book | Customer app → Reservations | Customer app → Workshops / Events |
| Where staff manage them | **This page** | Sold at the **POS** (Experiences category); sessions and event content are set up in the **Admin Portal** |

Workshop bookings do **not** appear on this page. A paid workshop seat comes through as a customer **order** (booked in the PWA Workshops page — workshops are PWA-only, not sold at the POS). Session dates and capacity are managed by an admin.

## Where bookings come from

Customers book tables in the customer app (Reservations → pick store, date, time, party size, special requests). New bookings arrive as `requested` and wait for you to confirm them — nothing is auto-confirmed. Each booking carries a planned duration, which the system uses when checking whether a table is free at that time.

## Reservation statuses

| Status | Meaning |
|--------|---------|
| requested | New booking from the app — awaiting staff confirmation. |
| confirmed | Confirmed by staff, table assigned (optional). |
| seated | The party has arrived and been seated. |
| completed | The visit is finished. |
| no_show | The party did not arrive. |
| cancelled_by_guest | Cancelled by the customer in the app. |
| cancelled_by_merchant | Cancelled by staff. |

## Daily workflow

1. Tap **Reservations** from the home screen.
2. The list shows reservations for the selected date (today by default) and refreshes automatically every 30 seconds. Use the date picker to look at other days.
3. Filter by status with the chips (All, Requested, Confirmed, Seated, Completed, No Show, Cancelled). Each chip shows a count.
4. A banner at the top shows how many requests are still pending. Overdue bookings (more than 15 minutes past the reserved time, still not seated) are highlighted in red.
5. Tap **Refresh** any time to reload the list immediately.

## What each row shows

- Guest name and phone number.
- Party size, reservation date and time.
- Assigned table number (or — if none yet).
- The guest's special requests, in italics under the name.
- Current status badge and the actions available for that status.

## Confirm a request

1. Find the **requested** reservation and tap **Confirm**.
2. In the dialog, review the guest name, party size, and time, then pick a table. Only tables that are available and large enough for the party size are offered; you can also choose **No Table** to confirm without assigning one. If no suitable table is free, the dialog says so.
3. Tap **Confirm Reservation**. If the table clashes with another confirmed booking at that time, the system rejects it — pick a different table.

## Workshop and event questions from guests

- A customer's paid workshop booking (made in the PWA Workshops page) shows up as an **order**, not as a reservation — check the orders list if they ask about it.
- Event RSVPs (free or invite-only gatherings) are managed in the Admin Portal under content/events; there is no staff-portal events page.

## Seat a party

1. When the guests arrive, tap **Seat** on the confirmed reservation.
2. To start their order, tap **Order** on the seated reservation — it jumps to the POS. Check that the right table and dine-in type are selected before sending the order.

## Filter notes

- The **Cancelled** chip groups both kinds of cancellation (`cancelled_by_guest` and `cancelled_by_merchant`).
- Status chips show live counts for the selected date, so you can see at a glance how many requests are still waiting.

## Complete, no-show, or cancel

| Action | Available when | Effect |
|--------|----------------|--------|
| Complete | confirmed or seated | Marks the visit finished. |
| No Show | requested or confirmed | Marks the party as not arrived. |
| Cancel (X) | requested or confirmed | Cancels as `cancelled_by_merchant`. |

Customers cancel their own bookings in the app; those show as `cancelled_by_guest`.

Use **No Show** rather than **Cancel** when the party simply didn't arrive — it keeps the record honest for reporting. Once a party is seated, the cancel and no-show actions disappear.

## If a guest calls to book

Take the details (name, phone, date, time, party size) and ask a manager or admin to enter the booking in the Admin Portal, or seat them as a walk-in at the POS if a table is free.

## Limitations

- Staff cannot create reservations from this page — bookings come from the customer app. Phone/walk-in booking edits and deletions are handled in the Admin Portal.
- Reservations are store-scoped: you only see bookings for your assigned store.
- Workshop/session capacity is not managed here — see the Admin Portal (menu item → sessions) for that.

## Tips

- Confirm requests promptly — the guest sees **Pending** in their app until you do.
- Keep an eye on the red overdue rows during service and either seat the party or mark a no-show.
- Checking tomorrow? Switch the date before you leave so the next shift opens the right day.

## Related
- [POS Checkout](pos-checkout.md)
- [Orders & Tables](orders-and-tables.md)
- [Admin — Content](../admin/content.md)


## Reservation Status

| Status | Meaning |
|--------|---------|
| pending | Awaiting staff confirmation |
| confirmed | Confirmed by staff |
| seated | Customer has arrived and been seated |
| cancelled | Cancelled by customer or staff |
| no_show | Customer didn't arrive |

Staff manage reservations from the Tables page or the POS table selector.
