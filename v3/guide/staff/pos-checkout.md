# Staff Portal: POS Checkout

## Page
`/pos`

## Purpose
Create dine-in, takeaway, and delivery orders, sell workshop/experience seats, take payments, and send orders to the kitchen.

## Order types

| Type | When to use |
|------|-------------|
| Dine-in | Customer eats in the store. A table is required — the order cannot be sent without one. |
| Takeaway | Customer picks up the order at the counter. |
| Delivery | Order is delivered to the customer. |

## The two-stage flow

The POS works in two stages:

1. **Build & send** — build the cart and tap **Send to Kitchen**. The order is created as unpaid and appears on the kitchen display immediately.
2. **Charge** — take payment later from the **Unpaid** list. This opens the checkout panel for that order.

This means food preparation never waits for payment.

## Create an order

1. Tap **POS** from the home screen.
2. Select **Dine-in**, **Takeaway**, or **Delivery**.
3. For dine-in, pick a table from the table bar (or tap **Scan Table** and scan the table QR).
4. Tap menu items to add them to the cart. Use the category tabs or the search bar to find items.
5. Items with modifiers (size, milk, add-ons) open a modifier drawer — pick the options and confirm.
6. Bundle/combo products appear in the same grid (badged **Combo** or **Pick N**). Tap one to add the whole set; "pick" bundles open a picker to choose the included items.
7. When a bundle is in the cart, discounted **Add-on Deals** may appear above the cart — tap to add at the deal price.
8. Add an order note or tick the **BYOT** (bring-your-own-tumbler) eco option if applicable.
9. Tap **Send to Kitchen**.

## Attach a customer (optional — except workshops)

Attaching a customer links the order to their loyalty account so they earn points and can pay with wallet, vouchers, and rewards.

1. Type a phone number or name in the customer search box, or tap **Scan Customer** to scan the customer's loyalty QR from their app.
2. Pick the customer from the results. Choose **Walk-in (no customer)** to clear the selection.
3. New customer? Type their phone number, tap **Add new customer by phone**, enter a display name, and confirm. The phone number is the account identity — the display name does not need to be a real name. If the customer later signs up in the app with the same phone number, they take over this profile and keep its history.

Walk-in guests are fine for normal menu orders — no phone needed.

## Selling a workshop / experience seat

Workshop items (e.g. the Coffee Omakase Experience) live in the **Experiences** category and sell seats to dated sessions.

1. Attach a customer **first** — a phone number is **required** for workshop bookings. The customer search box is highlighted with a warning while a workshop line is in the cart without a customer.
2. Tap the workshop item. A session drawer opens listing upcoming sessions with date, start time, location, and seats left. Full sessions are disabled.
3. Pick a session. The item enters the cart linked to that session.
4. Send the order and take payment as usual. Seats are reserved when the order is sent; if the session fills up before you send, the whole order is rejected — pick another session.

If you try to send a workshop order without a customer attached, the POS blocks it with "Customer phone number is required for workshop bookings".

## Park / recall an order

1. Build the order, then tap **Park**.
2. The order is saved **on this device only** (browser storage).
3. Recall it from the **Park** button in the top bar; you can also delete parked orders there.

## Charge an unpaid order

1. Tap **Unpaid** in the top bar to see orders sent but not yet paid.
2. Tap an order to open checkout.
3. (Optional) Scan or search the customer to attach them — needed for vouchers, rewards, and wallet payment.
4. Tap **Apply Discounts & Wallet** to:
   - Apply one of the customer's vouchers or rewards.
   - Take a full or partial **wallet payment** from the customer's balance.
5. (Optional) Apply a staff discount (percentage or fixed amount) and add a tip.
6. Pick a payment method and confirm.

### Payment methods

| Method | How it works |
|--------|--------------|
| Cash | Enter the amount tendered on the keypad; the POS shows the change. Quick-amount buttons round to the total, nearest RM5, or RM10. |
| Card | Customer pays on the card terminal. Confirm in the POS once the terminal approves. |
| QR | Generates a Stripe checkout QR. The customer scans it with their phone and pays on a guest-pay page — no app login needed. The POS confirms automatically when paid. Disabled if Stripe is not configured for the store. |

If the wallet balance (or a 100% discount) covers the whole bill, checkout completes with no further payment.

### After payment

The success screen shows the order number, total, and any change. From there you can start a **New Order**. Receipt print, cash drawer, and kitchen ticket buttons stay disabled until the hardware integrations are enabled — see [Hardware Peripherals](hardware-peripherals.md).

## Loyalty and lucky draw (automatic)

- When a customer is attached, loyalty points are awarded automatically based on the order subtotal and their tier multiplier. Walk-in orders earn nothing.
- Paid amounts count toward the customer's annual spend, which drives tier upgrades (Bloom → Origin → Reserve).
- When a spend-based lucky draw campaign is active, draw tickets are granted automatically once the order is paid (e.g. RM 50 spent = 1 ticket). Nothing for staff to do.

## Customer-facing display

For stores with a second screen:

1. Tap **Customer Screen** in the POS top bar.
2. A new window opens on the second display showing the store name, order type and table, cart, service charge and tax, total, and the payment QR during QR payments.

The display reads service charge and tax from the store configuration keys `order.service_charge` and `order.tax_rate`, and its window position from `pos.customer_display.left` (default `1920`). These are set by an admin in store settings.

## Refunds and corrections

- Before sending: remove items from the cart or start over.
- After sending but before payment: a manager can adjust or cancel the order from the orders list.
- After payment: refunds are handled by a manager in the Admin Portal. See [Admin — Orders & Refunds](../admin/orders-and-refunds.md).

## Related
- [Orders & Tables](orders-and-tables.md)
- [Kitchen Display](kitchen-display.md)
- [Reservations](reservations.md)
- [Hardware Peripherals](hardware-peripherals.md)
