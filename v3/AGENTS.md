# FNB Super App v3 — Agent Notes

*Last updated: 2026-07-11*

## Active code

All application code lives in `/root/fnb-super-app/v3`. Do not move files to the repository root.

## Test & seed workflow

```bash
# Re-seed baseline (dev server runs ENVIRONMENT=production)
cd /root/fnb-super-app/v3/backend
source .venv/bin/activate
python3 scripts/clear_db.py --all --yes --force-prod
python3 scripts/seed_all.py --yes --force-prod

# Backend unit tests
pytest tests/

# TypeScript strict checks
for dir in admin-portal staff-portal customer-pwa; do
  (cd "/root/fnb-super-app/v3/$dir" && npx tsc --noEmit)
done

# Run full E2E suite
cd /root/fnb-super-app/v3/e2e-tests
source ../backend/.venv/bin/activate
pytest -q
```

## Architecture summary

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL (port 13334) + Redis (port 13335)
- **Admin Portal**: Next.js 16 App Router, port 13830
- **Staff Portal**: Next.js 16 App Router, port 13820
- **Customer PWA**: Next.js 16 hash-based router, port 13810
- **Auth**: HttpOnly cookies (admin_token, staff_token, access_token)
- **Staff portal API**: Uses `/api/staff/*` endpoints (NOT `/api/admin/*`)
- **Customer display**: Redis-backed cross-device polling + BroadcastChannel for same-browser
- **Kiosk mode**: PWA `#kiosk` route, guest mode, fullscreen, wake lock

## Known configuration

- Staff PIN must be exactly 6 digits (all staff PINs = 123456)
- Staff portal `middleware.ts` needs `API_PROXY_URL` env var (not `API_URL`)
- Staff portal `lib/api.ts` `resolveApiBase()` falls back to `API_PROXY_URL` in production
- `next.config.ts` rewrites use plain array (afterFiles), not `beforeFiles`
- Admin portal layout is `"use client"` (client component)
- Staff portal layout is a Server Component with `"use client"` AuthProvider
- Customer PWA `next.config.ts` must NOT throw on missing `API_PROXY_URL`
- Customer PWA `AppShell.tsx` renders kiosk standalone (bypasses auth/nav/data loading)
- Customer PWA `KioskPage.tsx` API response parsing: axios interceptor already unwraps `{success, data}` → `data`, so `catRes.data` is `{categories: [...]}` not `{success, data: {categories: [...]}}`
- Customer PWA build: after rebuilding, pm2 process must be fully deleted and restarted to pick up new chunks. Use `fuser -k 13810/tcp` before starting.
- Staff portal `middleware.ts` at project root checks auth on every request — `getBackendUrl()` must not throw

## Test accounts

| Account | Password | Portal access |
|---------|----------|---------------|
| admin@loyaltysystem.uk | admin123 | Admin (all stores) + Staff (all stores) |
| store@loyaltysystem.uk | store123 | Admin (limited) + Staff (Store 1 + 2) |
| staff1@loyaltysystem.uk | staff123 | Staff (Store 1 only) |
| staff2@loyaltysystem.uk | staff123 | Staff (Store 2 only) |
| demo@lokaespresso.my | +60123456001 | Customer PWA (RM50 wallet) |
| vip@lokaespresso.my | +60123456002 | Customer PWA (RM200 wallet) |

## Help center

- **Admin**: 23 articles covering 130 routes
- **Staff**: 12 articles covering 17 pages + customer display
- **Customer PWA**: 13 articles covering 27 routes + kiosk
- All articles use markdown with table support (custom `renderMarkdown()` in `src/lib/markdown.ts` per portal)
- Admin portal has floating help button on every page (route-aware)

## Domain migration checklist (loyaltysystem.uk → lokaespresso.com)

- Update `v3/backend/.env`: `CORS_ORIGINS`, `TRUSTED_HOSTS`, live Stripe/Hitpay keys, `VAPID_*`
- Update portal `.env.local` files:
  - `v3/admin-portal/.env.local`: `API_URL`, `NEXT_PUBLIC_API_URL`, domain env vars
  - `v3/staff-portal/.env.local`: `API_PROXY_URL`, `NEXT_PUBLIC_API_URL`
  - `v3/customer-pwa/.env.local`: `API_PROXY_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`
- Replace host Caddy configs (`/etc/caddy/sites/fnb-*.conf`)
- Provision TLS certificates for `*.lokaespresso.com`
- On live DB run `alembic upgrade head` and seed with strong admin credentials
- Verify `otp.bypass_enabled=false` and rotate/remove `otp.bypass_code`

## Known quirks

- Backend `ENVIRONMENT=production` on the dev server disables OpenAPI docs
- `otp.bypass_enabled` is seeded `true` by default so dev/E2E can log in without Twilio
- All three portals use HttpOnly cookie auth (not bearer tokens in JS)
- Server-side portal code needs absolute backend URLs via `API_URL` (admin) or `API_PROXY_URL` (staff/customer)
- Staff portal `middleware.ts` at project root checks auth on every request — `getBackendUrl()` must not throw
- Customer display uses Redis for cross-device sync (`pos:display:{store_id}` key, 1-hour TTL)
- Customer PWA Turbopack runtime generates chunks on-demand at runtime; after rebuild, pm2 must be fully deleted and restarted
- Guest-pay `pay_token` is only generated when Stripe is configured (requires live Stripe keys)
- Customer order creation requires `cart_id` (orders are created from carts, not from inline items)
- `order_channel` enum values: `mobile_app`, `web`, `kiosk`, `pos`, `qr_code`, `third_party` (no "pwa")

## What's been done (as of 2026-07-11)

### Admin Portal ✅
- 130 routes across 30 sections, all verified via browser audit
- 23 help articles with source-code-verified content
- Floating help button on every page
- Sidebar UI/UX improved (darker footer, scroll gradient, section labels)
- Branding 401 fix on login page
- Sidebar email display fix
- Markdown renderer with table support

### Staff Portal ✅
- 17 pages + customer display, all verified via browser audit
- 12 help articles with source-code-verified content
- Login loop fixed (middleware.ts getBackendUrl)
- 500 on all pages fixed (lib/api.ts resolveApiBase)
- 10 staff-specific backend endpoints added (menu, tables, orders, reservations, display-state)
- Frontend updated to use /staff/* instead of /admin/*
- Button labels fixed ("Member" → "Wallet & Rewards", "Me" → "Profile")
- Customer display: Redis polling, wallet top-up QR, fullscreen, wake lock, localStorage

### Customer PWA ✅
- 25 pages verified via browser audit (all pass)
- 13 help articles with source-code-verified content
- Full ordering journey verified: menu → cart → order → order detail
- Kiosk mode: welcome → order type → menu browse → cart
- Guest mode: home/menu accessible, wallet/profile blocked
- Production build fixed (next.config.ts no throw)
- Kiosk API response parsing fixed
- Kiosk renders standalone (bypasses AppShell)

### Cross-portal ✅
- Markdown renderer with table support in all 3 portals
- XSS fix in renderMarkdown across all 3 portals
- Decimal → Money serialization fix in backend
- All legacy docs removed, new README.md and AGENTS.md

### Test results
- Backend: 36 passed, 0 failed
- E2E: 199 passed, 16 skipped, 0 failed
- TypeScript strict: All 3 portals pass
