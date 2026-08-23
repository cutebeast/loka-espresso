# Admin Portal: Loyalty

## Pages
- `/loyalty/tiers` — Loyalty Tiers
- `/loyalty/accounts` — Loyalty Accounts
- `/loyalty/ledger` — Loyalty Ledger
- `/loyalty/settings` — Loyalty Settings

## Purpose
Run the Loka Espresso loyalty program: the Bloom → Origin → Reserve tier ladder, point earning rules, customer point balances, and the full points transaction history.

## Loyalty Tiers (`/loyalty/tiers`)

### What it shows
The three membership tiers with their thresholds, multipliers, and active status. Tier names are brand names and stay in English in every locale.

| Tier | Qualification | Points multiplier | Notes |
|------|---------------|-------------------|-------|
| Bloom | Entry tier — every customer starts here | 1.0× | Never expires, never reviewed. |
| Origin | RM 500 eligible spend within a rolling 12-month window | 1.2× | Birthday perk: complimentary drink upgrade. |
| Reserve | RM 1,500 eligible spend within a rolling 12-month window | 1.5× | Birthday perk: exclusive gift; priority support. |

### How tiers are earned
- Qualification is **spend-based**, not points-based. Eligible spend accrues on the customer's rolling 12-month window each time a payment is captured.
- Upgrades are automatic: as soon as windowed spend crosses RM 500 (Origin) or RM 1,500 (Reserve), the customer is promoted — no manual action needed.
- The tier record also stores a color (shown in the PWA), a benefits config, and a sort order.

### The 12-month review
- Origin and Reserve memberships are reviewed when their 12-month window completes.
- Windowed spend meets the tier threshold → renewed, and a fresh 12-month window starts.
- Below threshold → **downgrade one tier** (Reserve → Origin, Origin → Bloom) and a fresh window starts.
- Bloom has no validity period and is never reviewed.

| Tier | Validity | Renewal spend | On missed renewal |
|------|----------|---------------|-------------------|
| Bloom | None | — | Never reviewed. |
| Origin | 12 months | RM 500 in the window | Downgraded to Bloom. |
| Reserve | 12 months | RM 1,500 in the window | Downgraded to Origin. |

### Other tier-linked perks
- **Birthday month double points** — all tiers earn 2× points during the customer's birthday month, on top of the normal multiplier.
- **Birthday perk voucher** — Origin and Reserve members automatically receive a birthday voucher (`BDAY-UPGRADE` / `BDAY-GIFT`) once per calendar year, valid until the end of their birthday month.
- **BYOT eco campaign** — a bring-your-own-tumbler order replaces the tier multiplier with 2× points (Bloom and Origin) or 3× (Reserve).

### Editing tiers
Tiers can be created, edited, and deactivated from this page (multiplier, color, benefits config, spend thresholds, active flag). The seeded Bloom/Origin/Reserve structure is what the PWA, POS, and rewards catalog expect — prefer adjusting values over adding or removing tiers.

## Loyalty Accounts (`/loyalty/accounts`)

### What it shows
One row per customer: current points balance, lifetime points earned and redeemed, current tier, and the annual-spend window used for tier qualification and reviews.

### Actions
- Filter by customer or by tier.
- Open an account to inspect balances and tier status.
- Points changes should normally happen through business flows (orders, rewards, referrals, check-ins); every change lands in the ledger.

### Account fields
- **Points balance** — spendable points right now.
- **Lifetime points earned / redeemed** — cumulative totals since registration.
- **Annual spend and window start** — the rolling 12-month spend counter that drives tier qualification and renewal reviews.
- **Last tier change** — when the customer was last promoted or downgraded.

## Loyalty Ledger (`/loyalty/ledger`)

### What it shows
Every points movement on every account: the delta, running balance, linked order or reward where relevant, a description, and when it happened.

### Event types

| Event | Meaning |
|-------|---------|
| `order_earned` | Points earned from a paid order. |
| `welcome_bonus` | Welcome points at registration (when the welcome reward includes points). |
| `referral_bonus` | Referral reward credited to a referrer. |
| `birthday_bonus` / `tier_bonus` | Birthday or tier-related bonus points. |
| `promo_bonus` | Promotional points — includes daily check-in awards. |
| `social_share` / `review_submitted` | Engagement bonuses. |
| `reward_redemption` | Points spent in the Rewards Marketplace. |
| `voucher_conversion` | Points converted to a voucher. |
| `points_expired` | Expired points removed. |
| `return_deduction` | Points clawed back on a refund/return. |
| `manual_adjustment` | Admin adjustment. |
| `account_merge` | Balance moved during an account merge. |

### Filtering
Filter by customer, account, or event type. The event-type filter also accepts broad categories that map to groups of events:

| Category | Includes |
|----------|----------|
| `earn` | All earning events (orders, referrals, bonuses, engagement). |
| `redeem` | Reward redemptions and voucher conversions. |
| `expire` | Points expiry. |
| `adjustment` | Manual adjustments and return deductions. |

## Loyalty Settings (`/loyalty/settings`)

Settings stored in platform configuration (`loyalty.*` keys). Edit a value and save the row; changes take effect immediately.

| Setting | Default | Purpose |
|---------|---------|---------|
| `loyalty.points_per_currency` | 1 | Base earning rate — points per RM 1 of eligible order spend. |
| `loyalty.welcome_bonus` | 50 | Welcome points credited at registration (when the reward type includes points). |
| `loyalty.welcome_reward_type` | `voucher` | What new customers receive: `points`, `voucher`, or `points_and_voucher`. |
| `loyalty.welcome_reward_voucher_code` | `WELCOME-RM5 (must exist in Marketing → Vouchers)` | Voucher definition issued on first registration when the type is `voucher` (or `points_and_voucher`). |

> The welcome voucher code must match an existing voucher definition — create it under **Marketing → Vouchers** first. Referral reward points live under **Marketing → Referral Settings** (`loyalty.referral_reward_points`), not on this page.

### Changing a setting
1. Edit the value in the settings table — numeric settings use number inputs, and the welcome reward type is a dropdown (`points`, `voucher`, `points_and_voucher`).
2. Save the row. Changes are read at request time and apply to the next registration or order — no restart needed.

## How customers earn and spend points

1. Customer pays for an order while logged in → base points = eligible amount × points-per-currency × tier multiplier. Points are **estimated at order creation and credited when the payment is captured**; refunds claw them back proportionally. A BYOT (bring-your-own-tumbler) order replaces the tier multiplier with 2× (3× for Reserve), and the birthday month doubles the result on top.
2. Extra points come from check-ins, referrals, and bonuses — all visible in the ledger.
3. Points are spent in the Rewards Marketplace (see [Marketing](marketing.md)); redemptions deduct from the balance immediately.

### Worked example
A Reserve member (1.5×) spends RM 40 in their birthday month with their own tumbler:
- Base: 40 × 1 point = 40 points
- BYOT replaces the tier multiplier: 40 × 3 = 120 points
- Birthday month doubles it: **240 points**

## Common questions

**A customer says their points are wrong — where do I look?**
Open **Loyalty → Accounts**, find the customer, then check **Loyalty → Ledger** filtered to that customer. Every change is there with a reason.

**Can I give or remove points manually?**
Yes — from the customer's profile under **Customers**, award (positive) or deduct (negative) points with a reason. Deductions can't exceed the current balance. Every adjustment is recorded as a `manual_adjustment` ledger entry and written to the audit log.

**Why did a customer drop from Reserve to Origin?**
Their 12-month window completed with less than RM 1,500 of eligible spend — the renewal review downgraded them one tier. The window has restarted, so new spend counts toward re-qualifying.

**Do points expire?**
The ledger supports expiry (`points_expired` events and a pending-expiry counter on accounts). Check the ledger if a customer's balance dropped without a redemption.

## How redemptions work

When a customer redeems a reward in the PWA:

1. The system checks the reward is active, the redemption cap (if any) is not reached, the customer meets the minimum tier, and the balance covers the points cost.
2. Points are deducted immediately and a `reward_redemption` ledger entry is written with a snapshot of the reward.
3. A redemption with a unique code is created in the customer's name, valid for the reward's validity period (default 30 days).
4. The reward is then **used on an order** — the customer applies it at app checkout or staff apply it at the POS checkout drawer. One voucher OR one reward per order, never both; cancelling the order releases it back to the customer. Expired rewards are hidden from the wallet automatically.

Redemption totals per reward are visible under **Marketing → Rewards Marketplace**.

## Related
- [Marketing — Rewards Marketplace](marketing.md)
- [Settings](settings.md)
