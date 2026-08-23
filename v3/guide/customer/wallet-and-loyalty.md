# Customer PWA: Wallet & Loyalty

## Pages
- `wallet` — Wallet
- `my-card` — My Card / Loyalty card
- `profile` — Profile (shows points summary)

## Wallet page

### What you see
- Current balance (also shown on the dashboard stat strip under the header).
- Quick top-up amounts plus a custom-amount option.
- Recent transactions (credits, debits, refunds).

### Top up online

1. Open **Wallet**.
2. Choose a preset amount or enter a custom amount (must be at least the minimum shown on screen).
3. Tap **Continue to Pay** and confirm the amount.
4. You are redirected to the secure Stripe Checkout page (card / FPX) to complete payment.
5. After payment, you return to the wallet and the balance updates immediately.

> If a top-up payment is interrupted, the pending top-up expires on its own and the balance only moves once the provider confirms the payment.

### Top up at the counter

You can also top up with cash (or card) in-store — ask any cashier:

1. Staff open **Customers** on the staff portal and scan your QR code (My Card) or search your phone number.
2. They tap **Top Up**, enter the amount and the payment method (cash or card).
3. Your balance updates immediately — no app needed.

### Pay with wallet (verified)

At checkout, select **Pay with Wallet** if your balance covers the total. For security, the app asks you to verify with a **one-time OTP** sent to your phone before the wallet can be spent — this proves you own the phone number on the account.

If your balance doesn't cover the total, top up first or choose another payment method.

### Refunds go back to the wallet

When an order paid with the wallet is refunded, the refund is credited straight back to your wallet balance. Refunds for card/FPX payments go back to the card instead.

### Wallet transactions

| Type | Description |
|------|-------------|
| credit | Money added (online top-up or counter top-up). |
| debit | Money spent on an order. |
| refund | Refund credited. |

### Saved cards

The **Profile → Payment Methods** page lists cards saved to your account. Adding new cards through the app is not yet supported; the **Add Card** button shows "Coming Soon". You can still pay for orders and top up your wallet using Stripe Checkout without saving a card.

## Loyalty / My Card page

### What you see
- Current tier (Bloom, Origin, Reserve)
- Current points balance
- Points needed for next tier
- Tier benefits
- Loyalty card QR code

> The full tier details — milestone rail and the complete benefits comparison — live on the **Membership Tiers** page (from the dashboard tier card or your profile).

### How tiers work

Tiers are earned by **eligible spend over a rolling 12-month window**:

| Tier | Eligible spend in 12 months | Multiplier |
|------|------------------------------|------------|
| Bloom | 0 — everyone starts here | 1.0× |
| Origin | RM 500 | 1.2× |
| Reserve | RM 1,500 | 1.5× |

Spend counts each time a payment goes through, and upgrades happen automatically. When a 12-month window closes below the tier's threshold, you move down one tier (Reserve → Origin → Bloom) and a fresh window starts. The **Membership Tiers** page (tap the tier card on the dashboard, or open it from your profile) shows:
- Your current tier and progress to the next milestone.
- The milestone rail (Bloom → Origin → Reserve).
- A side-by-side benefits table — free delivery, priority seating, VIP event access, monthly free item, exclusive menu access, birthday reward, order discounts and welcome bonus points per tier.

### Use loyalty card
1. Open **My Card**.
2. Show the QR code to staff when ordering in-store.
3. Staff scans it to identify your account.

## Points expiry

Points may expire after a configured period of inactivity. When some of your points are due to expire within 30 days, the Rewards page shows a "N points expiring on D" hint. Check the expiry policy in **Profile → Settings** or **My Card**.

## When points are credited

Order points are **estimated at checkout but only credited to your balance when the payment is captured** — an unpaid order earns nothing until it is paid. If a paid order is cancelled or refunded, the points are reversed (proportionally for partial refunds), and the spend stops counting toward your tier window.

## Related
- [Promotions & Rewards](promotions-and-rewards.md)
- [Admin — Loyalty](../admin/loyalty.md)
