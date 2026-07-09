# Admin Portal: Settings

## Pages
- `/settings` — App Settings
- `/settings/payment-gateway` — Payment Gateway
- `/settings/twilio-verify` — Twilio Verify
- `/settings/version-control` — Version Control

## Purpose
Configure platform-wide and store-level application settings.

## App Settings (`/settings`)

### What it shows
General platform configuration.

### Common settings

| Setting | Purpose |
|---------|---------|
| Platform name | Brand name displayed in portals. |
| Default currency | Fallback currency code. |
| Default language | Fallback locale. |
| OTP enforcement | Require OTP for admin/staff login. |
| Marketing opt-out default | Default value for new customer marketing consent. |
| Order polling interval | How often the PWA polls for order updates. |
| Idle timeout minutes | Auto-logout timeout for admin/staff portals. |

### How to change
1. Update the desired field.
2. Click **Save**.
3. Some settings require a portal refresh to take effect.

## Payment Gateway (`/settings/payment-gateway`)

### Supported providers
- **Stripe** — card, FPX, GrabPay, QR payments.
- **HitPay** — QR and payment links.

### Stripe configuration
1. Enable Stripe.
2. Enter publishable key and secret key.
3. Enter webhook secret.
4. Set test mode or live mode.
5. Save.

### HitPay configuration
1. Enable HitPay.
2. Enter API key and webhook secret.
3. Set test mode or live mode.
4. Save.

### Public URL
Set the public-facing URL used for payment redirects and webhooks (e.g., `https://app.loyaltysystem.uk`).

### Customer PWA domain
The Customer PWA reads its canonical domain from the `NEXT_PUBLIC_APP_URL` environment variable at build time. The fallback is `https://app.loyaltysystem.uk`. For production:

1. Set `NEXT_PUBLIC_APP_URL=https://app.loyaltysystem.uk` before building the PWA.
2. Ensure DNS points `app.loyaltysystem.uk` to the PWA hosting origin.
3. If the PWA is rebuilt without the variable, metadata, payment return URLs, and staff POS deep-links still default to the correct production domain.

### Important
- Webhook endpoints must be publicly reachable.
- Use test keys for development and staging.
- Rotate live keys securely.

## Twilio Verify (`/settings/twilio-verify`)

### Purpose
Send OTP codes via SMS for passwordless login and phone verification.

### Configuration
1. Enable Twilio Verify.
2. Enter Account SID, Auth Token, and Verify Service SID.
3. Set test mode or live mode.
4. Save.

### OTP bypass
For development and E2E testing, OTP can be bypassed via platform config. Disable this in production.

## Version Control (`/settings/version-control`)

### What it shows
Current versions of:
- Backend API
- Admin Portal
- Staff Portal
- Customer PWA

### Usage
Use this page to verify all components are on expected versions after a deployment.

## Related
- [Stores — Settings](stores.md)
- [Orders — Refunds](orders-and-refunds.md)
