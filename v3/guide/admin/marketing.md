# Admin Portal: Marketing

## Pages
- `/rewards` — Rewards Marketplace
- `/promotions` — Promo Banners
- `/vouchers` — Vouchers
- `/vouchers/report` — Voucher Report
- `/surveys` — Surveys
- `/surveys/report` — Survey Report
- `/referrals` — Referrals
- `/referrals/settings` — Referral Settings
- `/checkins` — Daily Check-ins
- `/checkins/settings` — Check-in Settings
- `/marketing/campaigns` — Campaigns
- `/marketing/campaigns/settings` — Campaign Settings
- `/marketing/lucky-draw` — Lucky Draw

## Purpose
Create and manage everything customers earn, claim, or receive: point rewards, promo banners, vouchers, surveys, the referral program, daily check-ins, notification campaigns, and the spin-the-wheel lucky draw.

## Rewards Marketplace (`/rewards`)

### What it shows
The point-redemption catalog customers browse in the PWA. Each reward costs loyalty points; redeeming deducts points from the customer's loyalty account and records a `reward_redemption` ledger entry.

### Create a reward
1. Click **New Reward**.
2. Enter:
   - **Reward name** and **reward key** — customer-facing name and a unique internal key.
   - **Reward type** — what the redemption gives (see table).
   - **Points cost** — points deducted on redemption.
   - **Description / short description**, **terms and conditions**, **how to redeem**.
   - **Image** — shown in the PWA catalog.
   - **Minimum tier** — restrict the reward to Origin or Reserve members (optional).
   - **Validity days** — how long the redemption stays usable (default 30).
   - **Maximum redemptions** — global cap (optional).
3. Save.

### Reward types

| Type | Effect |
|------|--------|
| Free item | A specific menu item free (optionally linked to the item). |
| Percentage / fixed discount | Discount on an order, with optional discount cap and minimum order value. |
| Free delivery | Delivery fee waived. |
| Points multiplier | Bonus points multiplier. |
| Bundle deal / Buy X get Y | Bundle-style offers. |

> Some catalog entries (e.g. brewing gear, workshops) are tier-gated — customers below the minimum tier see but cannot redeem them.

## Promo Banners (`/promotions`)

### What it shows
The promotional banners shown in the Customer PWA. Every banner carries a reward: a linked **voucher definition** (required when creating a banner).

### Action types

| Action type | Customer flow |
|-------------|---------------|
| Read & Claim | Read the banner, tap claim, voucher is issued. |
| Visit Link & Claim | Banner opens a URL; voucher can still be claimed. |
| Survey & Claim | Customer completes the linked survey in the PWA first — the claim is blocked until a completed survey response exists for that customer. |

### Create a banner
1. Click **New Promotion**.
2. Enter title, short/long descriptions, and upload an image.
3. Choose the **action type** and link the **reward voucher**.
4. For Survey & Claim, also link the **survey**.
5. Set start/end dates and position; save.

### How claiming works
- Claiming issues the customer a unique voucher code (the definition's code plus a random suffix) into their voucher wallet in the PWA.
- One active claim per customer per voucher — repeat claims return the existing code.
- Survey-gated banners return an error ("Please complete the survey first") until the survey is finished.

## Vouchers (`/vouchers`)

### What it shows
Voucher definitions — the templates behind every voucher a customer holds. Customer-facing vouchers are always issued from a definition (via promo banners, the lucky draw, the welcome reward, birthday perks, or admin flows).

### Create a voucher definition
1. Click **New Voucher**.
2. Enter:
   - **Voucher code** — unique code (e.g. `WELCOME-RM5`).
   - **Display title** and description.
   - **Discount type** — `percentage_off`, `fixed_amount_off`, `free_delivery`, or `free_item`.
   - **Discount value**, **maximum discount** cap, **minimum order value**.
   - **Scope** — global, store-, category-, or item-specific, or customer segment.
   - **Usage limits** — max global uses and max uses per customer.
   - **Valid from / until** and optional validity days.
   - **First order only** and **stackable** flags.
   - **Minimum tier** — restrict to a loyalty tier (optional).
3. Save.

### Voucher Report (`/vouchers/report`)
Per-definition usage: discount value, times used vs. max uses, and status.

## Surveys (`/surveys`)

### What it shows
Survey definitions with their questions and response counts.

### Create a survey
1. Click **New Survey**.
2. Enter survey key, name, description, and optional welcome/thank-you messages.
3. Add up to **5 questions**. Question types: single choice, multiple choice, rating scale, open text, NPS, yes/no, dropdown, ranking, date, file upload.
4. Mark questions required, set display order, and add answer options (options are auto-translated to all locales).
5. Save and set **Active**.

### How customers answer
Customers answer surveys in the PWA — typically through a Survey & Claim promo banner that rewards completion with a voucher (see above).

### Survey Report (`/surveys/report`)
View individual responses. The survey detail page also exports all responses as a JSON file.

## Referrals (`/referrals`)

### How it works
Every customer has a personal referral code (shared from the PWA referral page). When a new customer joins with the code, a referral event is recorded.

### What it shows
Referral events with referrer, invitee, status, and date. Filter by referrer, status, or date range.

### Fulfilling a referral
- Events move from `converted` to `rewarded`.
- Clicking **Fulfill** on a converted event credits the referrer's loyalty account with the configured points (ledger entry `referral_bonus`) and stamps the reward date.

### Referral Settings (`/referrals/settings`)
- **Referral reward points** (`loyalty.referral_reward_points`, default 50) — points the referrer receives per fulfilled referral.

## Daily Check-ins (`/checkins`)

### What it shows
Every customer check-in (date, streak day, points earned) plus stats: today's check-ins, this week's unique customers, and total check-ins. Customers check in from the PWA check-in page, once per day.

### How points are calculated
- Points = **daily base** + (streak day − 1) × **streak increment**.
- Checking in on day 7 of a streak adds the **7-day bonus**.
- A missed day resets the streak to zero; after **max streak days** the streak restarts at day 1.
- Points post to the customer's loyalty account immediately (ledger entry `promo_bonus`).

### Check-in Settings (`/checkins/settings`)

| Key | Default | Purpose |
|-----|---------|---------|
| `checkin.daily_base_points` | 10 | Points for a day-1 check-in. |
| `checkin.streak_increment` | 2 | Extra points per consecutive streak day. |
| `checkin.streak_7day_bonus` | 20 | Bonus on every 7th streak day. |
| `checkin.max_streak_days` | 7 | Streak length before it restarts. |

## Campaigns (`/marketing/campaigns`)

### What it shows
One-off notification campaigns sent to customer segments, with per-campaign delivery analytics (audience size, sent/failed counts).

### Create and send a campaign
1. Click **New Campaign**.
2. Choose a channel:
   - **Push notification** or **in-app** inbox message
   - **SMS** (Twilio)
   - **WhatsApp** (Twilio)
   - **Email** (Resend)
3. Write the title and body.
4. Pick an audience segment (see table).
5. Send now from the campaign detail page.

### Audience segments

| Segment | Who is included |
|---------|-----------------|
| All customers | Every active customer who has not opted out. |
| `new_users` | Registered in the last 30 days. |
| `loyal_customers` | 5 or more orders. |
| `inactive_users` | No order in the last 60 days (or never ordered). |
| Top tier | Customers on the highest active loyalty tier (Reserve). |
| `tier:<key>` | Any specific tier, e.g. `tier:origin`. |

> Customers with marketing opt-out are always excluded, in every segment.

### Campaign Settings (`/marketing/campaigns/settings`)

Credentials that power campaign delivery and translation:

- **Twilio SMS & WhatsApp** — Account SID, Auth Token, SMS From Number, WhatsApp sender, plus a full **test credential set** and a **Use Test Credentials** toggle. WhatsApp senders must be approved in the Twilio console.
- **Resend Email** — API key and verified From Email, plus a test set and toggle.
- **DeepSeek translation** — API key and model, used to translate campaign content into other locales.

Sensitive values (tokens, API keys) are stored masked (`***`) — type a new value to rotate. Send a test campaign after changing credentials.

## Lucky Draw (`/marketing/lucky-draw`)

### What it shows
The spin-the-wheel campaign customers play in the PWA at `/#lucky-draw`. There is **one campaign** — the page edits it directly (or creates it on first use). Below the campaign form: wheel segments, ticket KPI cards (ticket campaigns), and a recent-spins report.

### Campaign settings
- **Title / description**, **active** toggle, optional start/end dates.
- **Draw type** — see below.
- **Max segments** — wheel size, 2–12 (default 8).

### Draw types

| Type | How customers get spins |
|------|-------------------------|
| `free_daily` | N free spins (`spins_per_day`, default 1) per rolling interval of `spin_interval_days` days — 1 = daily, 7 = weekly, 30 = monthly. The window rolls from the customer's last spin. |
| `ticket_spend` | Customers earn draw tickets from spending: every full `spend_per_ticket` of a **paid** order (default RM 50) = 1 ticket, computed as `floor(order total ÷ spend per ticket)`. Tickets are granted when payment is captured (POS at sale, PWA online on capture). Each spin consumes one ticket. Refunds do **not** claw tickets back. |

### Wheel segments
Each segment has:
- **Label** — text shown on the wheel.
- **Voucher definition** — the prize; every segment must link one.
- **Weight** — win chance = segment weight ÷ total weight of all **active** segments.
- **Color** and **sort order** — wheel appearance.
- **Active** toggle — inactive segments are excluded from spins and odds.

### Results and reporting
- Winning a spin immediately issues the segment's voucher into the customer's voucher wallet in the PWA.
- For ticket campaigns, KPI cards show **tickets issued / consumed / available / customers holding**.
- The spins report lists recent spins (customer, segment won, voucher code, time), newest first.

## Related
- [Loyalty](loyalty.md)
- [Settings](settings.md)
- [Translations](translations.md)
- [Customer PWA — Promotions & Rewards](../customer/promotions-and-rewards.md)
