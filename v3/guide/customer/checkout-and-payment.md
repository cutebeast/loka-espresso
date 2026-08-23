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

- **Voucher** — enter a voucher code, or pick one from your wallet.
- **Reward** — select a reward from My Rewards.

**One per order** — you can apply EITHER one voucher OR one reward, never both. The discount shows in the order summary before you pay, and only the redemption you selected is consumed with the order.

Discounts are applied before tax and service charge according to store settings. Loyalty points are estimated at checkout and credited to your balance once the payment actually goes through (see [Wallet & Loyalty](wallet-and-loyalty.md)).

## Payment methods

The available methods depend on store configuration.

### Stripe (card / FPX)
1. Select **Pay with Stripe**.
2. Enter card details or select FPX.
3. Complete authentication if required.
4. Payment is processed and order is confirmed.

### Wallet
1. Select **Pay with Wallet** if your balance covers the total.
2. Enter the one-time **OTP** sent to your phone — wallet payments must prove phone ownership.
3. Confirm — the balance is deducted immediately.

If the balance is too low, top up first (see [Wallet & Loyalty](wallet-and-loyalty.md)) or pick another method. Refunds for wallet payments are credited back to the wallet.

### Cash
1. Select **Cash** if available.
2. Pay at the counter on pickup or delivery.

## Guest checkout

Guests can browse the whole app — menu, promotions, events, and workshops — without an account. To **place an order** you must sign in (phone number + one OTP). This keeps vouchers, rewards, loyalty points, and wallet balance tied to your account. In-store, staff can serve you as a walk-in without an app account.

## BYOT (Bring Your Own Tumbler)

Check the eco checkbox at checkout to earn 2x points (Bloom/Origin) or 3x points (Reserve) on your order.

## Guest Pay — Dine-in QR payment (`guest-pay`)

The **Guest Pay** page is a standalone public payment screen for walk-in dine-in customers who scan a table QR code and pay without creating an account.

### How it works
1. A customer sits at a table and scans the table QR code with their phone camera.
2. The PWA opens directly to the Guest Pay page with the order pre-loaded.
3. The page shows the order summary — line items, subtotal, tax, service charge, and total.
4. The customer chooses a payment method:
   - **Stripe** — card, FPX, or QR payments.
   - **HitPay** — payment links and QR payments.
5. After payment, a success screen confirms the order. A receipt is shown on screen with a **Back to Menu** button if the customer wants to order more.
6. No login or registration is required. The order is linked to the table for staff to manage.

### Payment methods on Guest Pay
- **Stripe** — enter card details or select a local payment method. Complete 3D Secure authentication if required.
- **HitPay** — redirected to HitPay's hosted payment page, then returned on success.

### What happens if payment fails
- The page shows an error with the reason.
- Tap **Try Again** to retry with the same method or choose a different one.
- The order remains at the table until paid — staff can also process payment at the POS.

### After payment
- Staff see the order move to `confirmed` status in the POS and Kitchen Display.
- A confirmation screen with the receipt appears on the customer's device.
- The customer can tap **Back to Menu** to continue ordering from the same table without logging in.

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


## Receipts

After payment, you can:
- View the order confirmation in-app (Orders tab)
- Receive SMS receipt (if phone is verified)
- Request e-invoice via the order detail screen
