# Admin Portal: Settings

## Pages
- `/settings` — App Settings
- `/settings/payment-gateway` — Payment Gateway
- `/settings/twilio-verify` — Twilio Verify
- `/settings/version-control` — Version Control

## Purpose
Platform-wide configuration. All values are stored in the platform configuration table and read by the backend at request time — changes take effect immediately, with no restart or redeploy.

## App Settings (`/settings`)

### What it shows
Configuration keys grouped into sections. A section only appears when it has keys to show:

| Section | Key prefix | Covers |
|---------|-----------|--------|
| App | `app.` | Platform name, public URLs, general behavior. |
| OTP | `otp.` | Login-code behavior (see below). |
| Orders | `order.` | Order flow rules. |
| Notifications | `notifications.` | Push/notification behavior. |
| Uploads | `upload.` | Image upload limits. |
| Reservation | `reservation.` | Table reservation rules. |
| Payments | `stripe.` | Core Stripe options (full setup on the Payment Gateway page). |
| Kitchen Display (KDS) | `kds.` | Station routing — which menu categories go to the Bar vs Kitchen tabs. |
| E-Invoice | `einvoice.` | LHDN MyInvois connection and supplier identity. |

Each row shows the key (without its prefix), the current value, its value type, and a Save button where applicable.

### Typical keys

| Section | Example keys |
|---------|--------------|
| App | `name` (LOKA Espresso), `currency` (MYR), `currency_symbol` (RM), `support_phone`, `support_email`. |
| OTP | See the OTP table below. |
| Orders | `auto_confirm` (accept new orders automatically), `preparation_time_minutes`. |
| Notifications | `retention_days` — how long notifications are kept. |
| Uploads | `max_size_mb` — maximum image upload size. |
| Reservation | Reservation rules (appears when keys are configured). |
| Payments | Core `stripe.*` options mirrored from the Payment Gateway page, plus `stripe.payment_method_types` / `hitpay.payment_methods` (JSON lists edited on the Payment Gateway page). |
| HitPay | `enabled`, `api_key` (masked), `salt` (masked), `api_base_url`. |
| Web Push | `vapid.public_key`, `vapid.private_key` (masked), `vapid.subject` — browser push for the customer PWA. |
| Integrations | DeepSeek translation, Resend email (`api_key` masked, `webhook_secret`), and Twilio SMS/WhatsApp credentials (`account_sid`, `auth_token` masked, `from_number`, `whatsapp_number`). |
| Kitchen Display (KDS) | `station_map` — JSON map of station → category slugs, e.g. `{"bar": ["cafe-specialty-coffee", …], "kitchen": ["*"]}`. `"*"` means every category not claimed by another station. Edit with care — invalid JSON is rejected. |
| E-Invoice | `enabled` (real MyInvois submissions — until then they are simulated), `auto_issue` (generate an e-invoice on every captured payment), `base_url` (preprod vs production API), `client_id` / `client_secret` (masked), `tin` / `brn` / `msic` / `sst_number` / `supplier_name` (supplier identity on the UBL document), `default_classification`. |

Exact keys vary as features ship — the page renders whatever is configured.

### How editing works
- **Boolean values** render as a checkbox with an **Enabled / Disabled** label and save the moment you toggle them.
- **Text and numeric values** save on blur, on Enter, or via the row's **Save** button.
- **Sensitive values** (secrets, tokens) arrive masked — the input starts empty with a `••••••••` placeholder. The stored secret is only replaced when you type a new value; leaving it empty keeps the current one. An untouched sensitive row is never submitted.
- **Non-editable keys** are shown read-only.
- A confirmation appears after each save; if a save fails, the original value is restored on screen.

### OTP section — read before go-live

| Key | Default | Purpose |
|-----|---------|---------|
| `otp.bypass_enabled` | `true` in development | When ON, logins succeed without an SMS code (or with the bypass code) — no SMS is sent. |
| `otp.bypass_code` | `000000` | The fixed login code accepted while bypass is ON. Stored as a sensitive value. |
| `otp.expiry_minutes` | 5 | How long a sent code stays valid. |
| `otp.max_send_per_hour` | 5 | Send rate limit per phone number. |

**Go-live checklist:**
1. Configure live Twilio Verify credentials (see the Twilio Verify page).
2. Test a real login — an actual SMS arrives and the code works.
3. Set `otp.bypass_enabled` to `false`. The change takes effect immediately.

> Order matters: with bypass OFF, logins require a working Twilio Verify service. If the credentials are missing or wrong, logins fail with a 503 "OTP service is temporarily unavailable" error — for every user, including you.

### How sign-in OTP works
- Customer registration and login are passwordless: the app sends an SMS code through Twilio Verify, and the code must be verified within `otp.expiry_minutes`.
- The send rate limit (`otp.max_send_per_hour`) protects against SMS abuse.
- With bypass ON, the app skips the SMS step — logins succeed with no code at all, or with the fixed bypass code. This exists for development and end-to-end testing only.

## Payment Gateway (`/settings/payment-gateway`)

Two providers are supported: **Stripe** (cards and local payment methods) and **HitPay**. Keys are validated when you enable a provider, so fill in the credentials first, then toggle it on.

### Stripe
- **Enabled** toggle — requires the fields below plus at least one payment method type.
- **Secret key**, **Publishable key**, **Webhook secret** — sensitive; shown as `***` once saved.
- **Automatic tax** toggle.
- **Checkout success / cancel URLs** — where customers return after paying.
- **Payment method types** — at least one must be selected.

### HitPay
- **Enabled** toggle — requires API key, salt, base URL, and at least one payment method.
- **API key**, **Salt** (sensitive), **API base URL**.
- **Payment methods**.

### Public URLs
- **App public URL** — the customer-facing site used in payment redirects and webhooks.
- **Admin public URL** and **Staff public URL**.

### Important
- Webhook endpoints must be publicly reachable or payment-capture callbacks never arrive and orders stay unpaid.
- Enabling a provider without its required fields fails validation — nothing is half-saved.
- Rotate live keys by typing the new value over the masked field and saving.

## Twilio Verify (`/settings/twilio-verify`)

Credentials for the OTP SMS service used by customer and staff login. Twilio Verify generates and checks the codes; you get the credentials from the Twilio Console.

| Setting | Purpose |
|---------|---------|
| Account SID | Twilio account identifier. |
| Auth Token | Sensitive — masked after saving. |
| Verify Service SID | The Twilio Verify service that generates and checks codes. |
| Use Test Credentials | Boolean toggle — route OTP through the test credential set instead of the live one. |
| Test Account SID / Test Auth Token | Separate credential set for development and staging. |

### Usage
1. Enter the live Account SID, Auth Token, and Verify Service SID from the Twilio console.
2. During development, fill the test set and enable **Use Test Credentials**; switch it off for production.
3. Save each row. Auth tokens are stored masked and are only used server-side.
4. Verify with a real login before disabling OTP bypass (see the go-live checklist above).

## Tips

- Configuration keys are environment-scoped; the values you see here apply to all environments unless a key was deliberately set for a specific one.
- Rotate secrets regularly: type the new value over the masked field, save, then verify the affected flow (a test payment, a test login).
- After changing payment or OTP settings, run one real end-to-end flow before announcing anything — these pages save successfully even when the external credentials themselves are wrong.
- Masked values cannot be read back in the UI — keep your own secure record of live keys.

## New-environment setup order

When bringing up a fresh deployment, configure in this order — each step depends on the previous one:

1. **App Settings** — platform name, currency, support contacts, public URLs.
2. **Twilio Verify** — live credentials, verified with a real SMS login.
3. **Payment Gateway** — provider keys and webhooks, verified with a real test order.
4. **App Settings → OTP** — disable the OTP bypass only now.
5. **Version Control** — confirm every component reports the expected build.

## Version Control (`/settings/version-control`)

### What it shows
One card per deployed component:

| Card | Source | Fields shown |
|------|--------|--------------|
| Backend API | Read live from the server | Version, git commit (short hash), branch, commit date, build time. |
| Admin Portal | Its build metadata file | Version, build time. |
| Staff Portal | Its build metadata (when configured) | Version, build time. |
| Customer PWA | Its build metadata (when configured) | Version, build time. |

Commit dates are also shown as relative time (`3h ago`, `2d ago`). A card that cannot reach its component shows "unable to fetch" instead of a version — treat that as a signal the component is down or unreachable, not just a display glitch.

### Usage
- After every deployment, confirm each component shows the expected commit — a stale card means that component did not actually update.
- After a translation sync or PWA rebuild, check the Customer PWA card: its build timestamp is bumped on every sync, which is what forces customer devices to refresh their cached translations.
- When reporting a bug, include the version and commit from the affected component's card.

## Related
- [Marketing — Campaign Settings](marketing.md)
- [Loyalty — Settings](loyalty.md)
- [Stores](stores.md)


## Staff Meal

- `staffmeal.discount_type`: percentage | fixed
- `staffmeal.discount_value`: Discount amount (e.g. 50 = 50% / RM 50)

Staff apply the meal discount from the POS checkout screen.

## Wastage

- `wastage.reason_required`: Whether staff must provide a reason
- `wastage.photo_required`: Whether photo evidence is mandatory
