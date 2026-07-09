# Admin Portal: Marketing

## Pages
- `/rewards` — Rewards Catalog
- `/promotions` — Promotions
- `/vouchers` — Vouchers
- `/vouchers/report` — Voucher Report
- `/surveys` — Surveys
- `/surveys/report` — Survey Report
- `/referrals` — Referrals
- `/referrals/settings` — Referral Settings
- `/checkins` — Check-ins
- `/checkins/settings` — Check-in Settings
- `/marketing/campaigns` — Marketing Campaigns
- `/marketing/campaigns/settings` — Campaign Settings

## Purpose
Create and manage offers, rewards, vouchers, surveys, referral programs, check-in campaigns, and customer communications.

## Rewards (`/rewards`)

### What it shows
The catalog of loyalty rewards customers can redeem with points.

### Create a reward
1. Click **New Reward**.
2. Enter:
   - **Reward name** — customer-facing name.
   - **Points cost** — points required to redeem.
   - **Description** — what the reward gives.
   - **Customer segments** — who can see it.
   - **Terms and conditions**.
   - **How to redeem** instructions.
3. Set active dates and availability.
4. Save.

### Reward types

| Type | Description |
|------|-------------|
| Free item | Customer gets a specific menu item free. |
| Discount | Percentage or fixed amount off an order. |
| Exclusive access | Early access to products or events. |

## Promotions (`/promotions`)

### Create a promotion
1. Click **New Promotion**.
2. Choose promotion type:
   - Buy X Get Y
   - Percentage off
   - Fixed amount off
   - Happy hour
3. Set eligibility rules (items, categories, customer segments).
4. Set start/end dates.
5. Save.

### Promotion stacking
Promotions can be configured to stack with vouchers or exclude other promotions.

## Vouchers (`/vouchers`)

### Create a voucher
1. Click **New Voucher**.
2. Enter:
   - **Voucher code** — unique code customers enter.
   - **Display title** — customer-facing name.
   - **Discount type** — percentage off, fixed amount off, free item.
   - **Discount value**.
   - **Minimum order value**.
   - **Maximum discount**.
   - **Usage limits** — global and per-customer.
3. Set validity dates.
4. Save.

### Voucher Report (`/vouchers/report`)
View voucher usage, redemptions, and revenue impact.

## Surveys (`/surveys`)

### Create a survey
1. Click **New Survey**.
2. Enter name and description.
3. Add questions (single choice, multi choice, text, rating).
4. Set active dates.
5. Save.

### Survey Report (`/surveys/report`)
View responses, aggregate ratings, and individual answers.

## Referrals (`/referrals`)

### How it works
Existing customers share a referral code. New customers who sign up with the code receive a reward; the referrer also receives a reward.

### Configure
1. Go to **Referrals → Settings**.
2. Set referrer reward and referee reward.
3. Set campaign active dates.
4. Save.

## Check-ins (`/checkins`)

### How it works
Customers check in via the PWA to earn bonus points or streak rewards.

### Configure
1. Go to **Check-ins → Settings**.
2. Set points per check-in.
3. Set streak bonuses.
4. Save.

## Marketing Campaigns (`/marketing/campaigns`)

### Create a campaign
1. Click **New Campaign**.
2. Choose channel:
   - Push notification
   - Email (via Resend)
   - In-app banner
3. Write title and body content.
4. Select audience segment:
   - All customers
   - Loyalty tier
   - Last order date
   - Total spend
   - Marketing opt-in only
5. Schedule or send immediately.
6. Launch.

> Customers with `marketing_opt_out = true` are automatically excluded.

### Campaign results
Open the campaign detail to view delivery stats, open rates, and conversions.

### Campaign Settings (`/marketing/campaigns/settings`)

Configure the API credentials that power campaign delivery:

- **Twilio SMS & WhatsApp** — sends SMS and WhatsApp campaigns. Requires Account SID, Auth Token, and a verified From Number. Toggle between test and live credentials.
- **Resend Email** — sends email campaigns. Requires an API key and a verified From Email. Toggle between test and live credentials.
- **Translation APIs** — DeepL API key and DeepSeek API key for auto-translating campaign content into other locales.

#### How to use
1. Navigate to **Marketing → Campaign Settings**.
2. Enter the API credentials for each provider you use.
3. Toggle `Use Test Credentials` ON during development; switch to OFF for production.
4. Click **Save** on each row.
5. **Always send a test campaign** after updating credentials to verify delivery works.

> Sensitive fields (Auth Tokens, API keys) are stored as `***` in the database after first save. If you need to rotate a key, replace the value and save again.

## Related
- [Loyalty](loyalty.md)
- [Customer PWA — Promotions & Rewards](../customer/promotions-and-rewards.md)
- [Settings — Payment Gateway](settings.md)
