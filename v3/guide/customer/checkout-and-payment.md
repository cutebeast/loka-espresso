# Customer PWA: Checkout & Payment

## Page
`checkout`

## Purpose
Finalise the order, select order type and details, choose payment method, and pay.

## Order type selection

### Dine-in
1. Select **Dine-in**.
2. Scan the table QR code or select a table manually.
3. The table number is saved with the order.

### Takeaway
1. Select **Takeaway**.
2. Choose preferred pickup time (now or scheduled).
3. Confirm.

### Delivery
1. Select **Delivery**.
2. Choose or add a delivery address.
3. The delivery fee is calculated based on distance and store settings.

## Delivery address

### Add a new address
1. Tap **Add Address**.
2. Enter address line, postcode, city, and notes.
3. Save.

### Select existing address
1. Tap **Saved Addresses**.
2. Choose the address.

## Apply discounts

- **Voucher** — enter a voucher code.
- **Reward** — select a reward from My Rewards.

Discounts are applied before tax and service charge according to store settings.

## Payment methods

The available methods depend on store configuration.

### Stripe (card / FPX / e-wallet)
1. Select **Pay with Stripe**.
2. Enter card details or select FPX/e-wallet.
3. Complete authentication if required.
4. Payment is processed and order is confirmed.

### Wallet
1. Select **Pay with Wallet** if balance is sufficient.
2. Confirm.
3. Balance is deducted immediately.

### Cash
1. Select **Cash** if available.
2. Pay at the counter on pickup or delivery.

## Guest checkout

1. If not logged in, tap **Checkout as Guest**.
2. Enter phone number.
3. Complete payment.
4. Order details are sent via SMS or email for tracking.

## After payment

1. Order confirmation screen appears.
2. Order appears in **Orders** with status `pending`.
3. Push notifications update you as the order progresses.

## Failed payments

If payment fails:
1. Return to checkout.
2. Check payment details.
3. Try again or select a different method.
4. If the problem persists, contact support.

## Related
- [Orders & Order Detail](orders-and-order-detail.md)
- [Wallet & Loyalty](wallet-and-loyalty.md)
- [Admin — Payment Gateway](../admin/settings.md)
