# Customer PWA: Wallet & Loyalty

## Pages
- `wallet` — Wallet
- `my-card` — My Card / Loyalty card
- `profile` — Profile (shows points summary)

## Wallet page

### What you see
- Current balance
- Recent transactions
- Top-up button

### Top up wallet

1. Open **Wallet**.
2. Tap **Top Up**.
3. Choose a preset amount or enter a custom amount (minimum shown on screen).
4. Tap **Continue to Pay** and confirm the amount.
5. You are redirected to the secure Stripe Checkout page to complete payment.
6. After payment, you return to the wallet and the balance updates immediately.

> The wallet currently supports online top-up via Stripe. FPX and e-wallet top-up options will be added as backend payment routing expands.

### Saved cards

The **Profile → Payment Methods** page lists cards saved to your account. Adding new cards through the app is not yet supported; the **Add Card** button shows "Coming Soon". You can still pay for orders and top up your wallet using Stripe Checkout without saving a card.

### Wallet transactions

| Type | Description |
|------|-------------|
| credit | Money added. |
| debit | Money spent on an order. |
| refund | Refund credited. |

### Pay with wallet
At checkout, select **Pay with Wallet** if your balance covers the total.

## Loyalty / My Card page

### What you see
- Current tier (Bloom, Origin, Reserve)
- Current points balance
- Points needed for next tier
- Tier benefits
- Loyalty card QR code

### How tiers work

| Tier | Requirement | Multiplier |
|------|-------------|------------|
| Bloom | Entry tier — everyone starts here | 1.0× |
| Origin | RM 500 eligible spend (rolling 12-month window) | 1.2× |
| Reserve | RM 1,500 eligible spend (rolling 12-month window) | 1.5× |

Higher tiers earn more points per order.

### Use loyalty card
1. Open **My Card**.
2. Show the QR code to staff when ordering in-store.
3. Staff scans it to identify your account.

## Points expiry

Points may expire after a configured period of inactivity. Check the expiry policy in **Profile → Settings** or **My Card**.

## Related
- [Promotions & Rewards](promotions-and-rewards.md)
- [Admin — Loyalty](../admin/loyalty.md)
