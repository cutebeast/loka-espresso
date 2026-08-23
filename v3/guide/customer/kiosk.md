# Kiosk — Self-Ordering

The self-ordering kiosk lets customers browse the menu, build their order, and pay — without staff assistance.

## Two Modes

| Mode | URL | Flow |
|------|-----|------|
| **Standing LCD** | `kiosk.loyaltysystem.uk/` | Welcome → Order Type → Table Number → Phone → Menu → Cart → Checkout → Payment → Success |
| **Tablet** | `kiosk.loyaltysystem.uk/tablet` | Staff setup (one-time) → Menu → Cart → Checkout → Payment → Success |

## How to Order

1. **Welcome**: Tap "Tap to Order" on the welcome screen. Active promo banners rotate in a carousel every 8 seconds — swipe or wait to see the next one.
2. **Dine In or Takeaway**: Choose your order type
3. **Table Number** (Dine In only): Enter the number printed on your table
4. **Phone** (optional): Enter your phone to earn loyalty points, or skip
5. **Menu**: Browse categories on the left, tap items to customise. A Dine In / Takeaway toggle button with swap icon lets you change order type from the menu without going back.
6. **Bundles**: Combo meals appear in bundle categories — tap to build your combo
7. **Add to Cart**: Customise quantity, modifiers, and variants, then add to cart
8. **Checkout**: Review your order, enter table number (if dine-in), tap Pay Now
9. **Payment Method**: Choose Pay with Card or Pay with Wallet
10. **QR Code**: Scan the QR code with your phone to complete payment
11. **Success**: Your order is being prepared

## What You Can Order

- All menu items (with modifiers and variants)
- Bundle products (Combos, Pair Sets, Meal Deals) — categories with no products are hidden
- Add-on deals (discounted items with bundles)
- All categories are sorted by display order

## What's NOT Available

- Experiences & Workshops — book these on the mobile app
- Events — these are for dine-in/takeaway only

## Payment

- **Pay with Card**: QR code → scan with phone → pay via Stripe (credit/debit) or HitPay (FPX/DuitNow)
- **Pay with Wallet**: QR code → scan with phone → login/signup → pay from your wallet balance

## Vouchers & rewards at the kiosk

Guests who don't sign in **cannot** use vouchers or rewards — trying to redeem without signing in is rejected by the server. On the payment screen, tap **Sign in to use rewards & vouchers**:

1. Enter your phone number and the OTP sent to it.
2. Pick **one** voucher or **one** reward from your active wallet items.
3. The order is placed under your account and the discount is applied to the total.

For safety on a shared screen, the sign-in is wiped automatically when the order finishes or after 60 seconds of inactivity. Entering your phone at the phone step (without the OTP sign-in) only links the order to your profile for loyalty points — it does not unlock redemption.

## Tablet Mode

Tablets at dining tables skip the welcome/order-type screens. Table number is set by staff during setup. The tablet remembers the table number until staff changes it.

## Inactivity

The kiosk auto-resets after 60 seconds of inactivity. On the success screen, the success screen auto-resets after 30 seconds of inactivity.


## Payment Timing

- **Kiosk**: always pay BEFORE food (prepaid). Unpaid kiosk orders auto-cancel after 15 minutes.
- **Table QR / PWA dine-in**: open tab — food is prepared and served, you pay after your meal. Open tabs are never auto-cancelled.
- **PWA takeaway/delivery**: pay before food; unpaid orders auto-cancel after 2 hours.

When an order is cancelled (by you or automatically), everything is released: any voucher or reward used on it returns to your wallet, booked seats and table locks are freed, and stock is restored.
