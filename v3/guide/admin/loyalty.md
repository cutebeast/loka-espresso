# Admin Portal: Loyalty

## Pages
- `/loyalty/tiers` — Loyalty Tiers
- `/loyalty/accounts` — Loyalty Accounts
- `/loyalty/ledger` — Loyalty Ledger
- `/loyalty/settings` — Loyalty Settings

## Purpose
Configure the customer loyalty program: tiers, point earning rules, customer accounts, and transaction history.

## Loyalty Tiers (`/loyalty/tiers`)

### What it shows
Membership levels and their thresholds.

### Create a tier
1. Click **New Tier**.
2. Enter:
   - **Tier name** — e.g., Bronze, Silver, Gold.
   - **Minimum points** — required to reach this tier.
   - **Points multiplier** — points earned per order are multiplied by this value.
   - **Benefits description**.
   - **Color** — used in the PWA.
3. Save.

### Tier example

| Tier | Min points | Multiplier |
|------|------------|------------|
| Bronze | 0 | 1.0x |
| Silver | 1,000 | 1.2x |
| Gold | 3,000 | 1.5x |
| Platinum | 5,000 | 2.0x |

## Loyalty Accounts (`/loyalty/accounts`)

### What it shows
Each customer's current points balance, lifetime points, and tier.

### Actions
- Search by customer name or phone.
- View account detail.
- Manually adjust points (if permitted).

## Loyalty Ledger (`/loyalty/ledger`)

### What it shows
History of points earned and spent.

### Event types

| Event | Description |
|-------|-------------|
| earned | Points earned from an order. |
| redeemed | Points spent on a reward. |
| adjusted | Manual adjustment by admin. |
| expired | Points expired. |
| bonus | Campaign or check-in bonus. |

### Filter
- By event type.
- By customer.
- By date range.

## Loyalty Settings (`/loyalty/settings`)

### Common settings

| Setting | Purpose |
|---------|---------|
| Points per currency unit | Base earning rate (e.g., 1 point per RM1 spent). |
| Points expiry months | How long before unused points expire. |
| Minimum redemption | Minimum points balance to redeem rewards. |
| Welcome bonus | Points given on first registration. |

## How customers earn points

1. Customer places an order while logged in.
2. Order subtotal is calculated.
3. Base points = subtotal × points per currency unit.
4. Tier multiplier is applied.
5. Points are added to the customer's loyalty account.

## How customers redeem rewards

1. Customer opens **My Rewards** in the PWA.
2. Selects an available reward.
3. Redemption code is displayed.
4. At checkout or POS, the reward is applied.
5. Points are deducted from the loyalty account.

## Related
- [Marketing — Rewards](marketing.md)
- [Customer PWA — My Rewards](../customer/promotions-and-rewards.md)
