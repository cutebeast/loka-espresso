# FNB Super App v3 — Agent Notes

*Last updated: 2026-07-20*

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
npm run typecheck  # admin-portal, staff-portal, customer-pwa
# or:
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
- Admin/staff `next.config.ts` rewrites use plain array (afterFiles); Customer PWA uses `beforeFiles` to intercept API calls before static file serving
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
- Rotate per-store `display_key` values if any were exposed pre-migration
- Force-change default staff PINs (all seeded PINs are 123456; `must_change_pin` enforcement is active)
- Regenerate `infra/db/09_schema_sync.sql` (`v3/scripts/dump_schema_sql.py`) if models changed after 2026-07-20

## Known quirks

- Backend `ENVIRONMENT=production` on the dev server disables OpenAPI docs
- `otp.bypass_enabled` is seeded `true` by default so dev/E2E can log in without Twilio (INTENTIONAL until lokaespresso.com go-live — disable then)
- Customer registration happens only AFTER OTP verification succeeds (login = verify-first, register-second)
- All three portals use HttpOnly cookie auth (not bearer tokens in JS)
- Server-side portal code needs absolute backend URLs via `API_URL` (admin) or `API_PROXY_URL` (staff/customer)
- Staff portal `middleware.ts` at project root checks auth on every request — `getBackendUrl()` must not throw
- Customer display uses Redis for cross-device sync (`pos:display:{store_id}` key, 1-hour TTL)
- `GET /staff/pos/display-state` is public but REQUIRES `?key=<store.display_key>` (per-store hex key; authenticated staff get it from `GET /api/staff/store` → `data.display_key`). Polled state has payment URLs/tokens stripped (`payment_pending: true` instead); same-browser BroadcastChannel still carries the QR URLs
- Table scan (`POST /stores/tables/scan`) REQUIRES `qr_token` (400/403 otherwise); printed table QR tokens never expire
- Customer PWA Turbopack runtime generates chunks on-demand at runtime; after rebuild, pm2 must be fully deleted and restarted
- Guest-pay `pay_token` is only generated when Stripe is configured (requires live Stripe keys)
- Customer order creation requires `cart_id` (orders are created from carts, not from inline items)
- `order_channel` enum values: `mobile_app`, `web`, `kiosk`, `pos`, `qr_code`, `third_party` (no "pwa")
- Rate limiting keys on `X-Forwarded-For` (first IP) when the peer is loopback (Caddy), else direct IP. Public mutation endpoints are rate-limited: `/kiosk/orders` 10/min, `/stores/tables/scan` 20/min, `/feedback` 5/min, `/vouchers/validate` + `/payments/guest-pay/*` 10/min (via `PublicMutationRateLimitMiddleware`)
- Staff money endpoints (wallet top-up, order payment, voucher/reward apply/redeem, item modify, cancel) require role cashier/server/shift_supervisor/store_manager via `RequireStaffRole`; kitchen/delivery/readonly get 403. Admin-context staff tokens pass via admin override
- `GET/PUT /admin/config` is system_admin-only; `is_sensitive` values are masked as `********`; PUT ignores the mask placeholder
- Wallet payments (`internal_wallet`) debit the wallet (row-locked, ledger entry) on confirm; customers cannot self-confirm `cash`/`store_credit` payments (staff-only capture)
- Order cancellation reverses everything via `reverse_order_effects()` (points clawback + ledger, voucher/reward release, stock restore); customer self-cancel is limited to pending/unpaid orders; staff/admin cancel of orders with CAPTURED payments is blocked (400 — refund first)
- Voucher eligibility is enforced server-side: `max_global_uses`, `max_uses_per_customer`, `first_order_only`, `stackable`, store/item/category scope
- Loyalty tier `points_multiplier` is applied on order points (customer + POS paths); `annual_spend` accrues on payment capture. Tier validity/downgrade EVALUATION job does not exist yet (fields are stored only)
- Staff with `pin_last_changed_at IS NULL` are blocked (`403 must_change_pin`) on all staff endpoints except auth/me, change-pin/password, refresh, logout — E2E conftest rotates the Test Staff PIN (123456→654321→123456) to clear it
- Alembic head: `a1b2c3d4e5f7`. Fresh docker deploys: `infra/db/01-07` + generated `09_schema_sync.sql` + `10_seed_data.sql`; regenerate 09 with `v3/scripts/dump_schema_sql.py` after model changes; `Dockerfile.backend` also runs `alembic upgrade head` on boot

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

### Round 31 — final gaps closed ✅
- **Admin portal**: removed production `throw` violations in `middleware.ts`, `next.config.ts`, `lib/api.ts`, and auth route handlers; all fall back to `http://127.0.0.1:13800/api`
- **Help center**: added 5 missing admin articles (`admin-equipment`, `admin-hygiene`, `admin-help-articles`, `admin-profile`, `admin-admins`); `scripts/clear_db.py` now covers `help_articles`
- **Customer PWA**: added public `POST /vouchers/validate`; kiosk orders now use the new public `POST /kiosk/orders` endpoint with table-number resolution
- **Staff portal**: added staff-scoped backend endpoints for order payment / voucher / reward / wallet / item modifications / cancel, customer search / detail / wallet / top-up / reward & voucher use, QR scan, and table QR generation; updated `staff-portal/src/lib/api.ts` to call `/staff/*` instead of `/admin/*`
- **Staff backend fixes**: `/staff/menu/items` returns full POS shape (modifiers, variants, allergens); `/staff/orders` and `/staff/orders/{id}` return `total_amount`, `customer_name`, `table_number`; `/staff/reservations` returns `dining_table_id`/`table_number`; change-password/PIN endpoints read the `staff_token` cookie
- **Database**: fixed Alembic migration drift (`alembic check` now passes) and applied new index-alignment migration
- **Runtime**: backend + all three portals rebuilt/restarted and responding 200

### Test results
- Backend: 36 passed, 0 failed
- E2E: 199 passed, 16 skipped, 0 failed
- TypeScript strict: All 3 portals pass

## Round 32 additions (2026-07-11)

- Kiosk mode now supports modifiers and variants (modifier drawer UI + backend pricing)
- Public `/menu/items` endpoint returns modifier_groups and variants arrays
- `GET /admin/inventory/low-stock` endpoint for reorder alerts
- `POST /wallets/topup/checkout` supports HitPay (provider field: stripe|hitpay)
- `POST /vouchers/validate` is now truly public (no ActiveCustomer required)
- `POST /feedback` is now truly public (guests can submit without login)
- `feedback_entries.customer_id` is now nullable in DB
- Staff pages have role guards (POS, Kitchen, Ops pages check role before rendering)
- `useStaffRole.tsx` (note: .tsx not .ts) exports RoleGuard component
- Tests: 36 backend, 199 E2E (16 skipped), TS strict all 3 portals

## Round 32 — go-live audit & hardening (2026-07-20)

Full-system audit (~60 findings, each verified in code before fixing; false positives dropped). Summary of what changed:

### Backend — money & security
- **Wallet payments now debit the wallet** on confirm (row-locked + ledger entry); refunds of wallet payments correctly reverse a real debit (was: free orders + mint-on-refund)
- **Customer registration moved after OTP verification** (was: account + 50 welcome points committed before OTP check)
- **Customers can no longer self-confirm `cash`/`store_credit` payments**; `/payments/intent` rejects already-paid/cancelled orders
- **HitPay wallet top-up fixed end-to-end** (service signature, `provider_session_id`, webhook completion shared with Stripe path); HitPay guest-pay now stores `provider_transaction_id`
- **Order cancellation fully reverses** via `reverse_order_effects()`: points clawback + ledger, voucher/reward release, stock restore; customer self-cancel limited to pending/unpaid orders
- **Staff money endpoints role-gated** (`RequireStaffRole`: cashier/server/shift_supervisor/store_manager) across `staff/orders.py` + `staff/customer_ops.py`
- **`/admin/config` system_admin-only + sensitive values masked**; admin register can no longer escalate privileges (role/store grants limited to what the creator holds); `/admin/auth/users` system_admin-only
- **Admin payment capture/refund store-scoped**; readonly_analyst blocked from money movement
- **Stripe `charge.refunded` webhook no longer double-counts** API-initiated refunds (cumulative semantics)
- **Rate limiting fixed**: keys on X-Forwarded-For behind the Caddy loopback peer; public mutations limited (`/kiosk/orders`, table scan, `/feedback`, `/vouchers/validate`, guest-pay)
- **Public endpoint hardening**: table scan requires `qr_token`; display-state requires per-store `display_key` and strips pay tokens/URLs (new `stores.display_key` column, migration `f33d496b3c87`); kiosk orders validate modifier min/max + availability and lock the walk-in cart; avatar upload gets full validation; `.svg` uploads rejected everywhere
- **Voucher eligibility enforced** (max uses global/per-customer, first-order-only, stackable, store/item/category scope); reward redemption hardened (is_active, caps, tier, ledger entry)
- **Reservations**: customer create can no longer self-confirm (new `CustomerReservationCreate` schema); table double-booking blocked (409 on overlap)
- Loyalty: tier `points_multiplier` applied (customer + POS), `annual_spend` accrues on capture (downgrade/renewal evaluation job NOT built — fields stored only)
- Fixes: `StripeError` import, voucher redemptions endpoint 500, discount double-subtraction on item modify (4 places), tip dropped from recompute, check-in race, staff top-up race, checkins serialization, `is_read` filter on `/notifications/me`, device delete by fingerprint, audience segments accept `tier:<key>`, admin-context staff refresh returns rotated token in body, `/staff/auth/admin-store` accepts admin-context staff tokens

### Admin portal
- Reward create/edit fixed (customer_segments array↔dict; was 422/crash — verified live)
- Campaign create fixed (campaign_key input, `scheduled_at` null-out, removed invalid `announcement` type)
- Systemic empty-string-datetime 422s fixed across vouchers/notifications/events/info-cards/pwa-splash/equipment forms; voucher dates marked required
- Voucher forms fetch real loyalty tiers (was hardcoded wrong ids); edit page gained `minimum_tier_id`
- Idle timeout now calls real logout (was a no-op cookie delete); forms surface human-readable 422s via `parseApiError`; settings page no longer round-trips the `********` mask; CSP dev connect-src fixed

### Staff portal
- Role guards no longer crash (rules-of-hooks fix; `RoleGuard` now actually used on 7 pages); wallet + kitchen detail pages guarded
- Customer display passes `?store=` + `&key=` (was hardcoded store 1) and shows a payment-pending prompt when URLs are stripped
- Admin store switcher added (`StoreHeader` + `/auth/admin-store` proxy route)
- PIN UI consistently requires 6 digits; POS customer scan resolves real customer (was "Customer #N" stub); reservations filter/overdue fixed; QR 30-min-expiry fiction removed; login open-redirect closed

### Customer PWA
- **Saved-card flow fixed** (missing `stripe.confirmSetup`; publishable-key race)
- Checkout: percentage vouchers use `calculated_discount`; saved vouchers/rewards appear (status `active`); reward code reads `code`
- Kiosk: cart lines keyed by item+variant+modifiers; modifier requirements enforced client-side; correct `order_id` field
- Guest-pay handles HitPay `status=completed` (double-charge risk closed); wallet top-up uses `payment_gateway_provider` from bootstrap
- Tier progress uses `lifetime_points`; 'Bronze'→'Bloom' fallbacks; `?promo=` deep link fixed; notification badge/toast use real unread count; CSP allows all Stripe hosts; service worker badge + cache-version fixes; guest gating for settings/checkin made consistent

### Infra & tests
- `infra/db` schema regenerated from models (`v3/scripts/dump_schema_sql.py` → `09_schema_sync.sql`; seed moved to `10_seed_data.sql`, aligned with Python seeders); `Dockerfile.backend` runs `alembic upgrade head`; Caddyfile defaults now `*.lokaespresso.com`
- E2E conftest: fixed tier payload, store codes, and rotates Test Staff PIN to clear `must_change_pin`
- Known pre-existing gaps left (documented, not blocking): `03/04` legacy drift vs models; support tickets carry a neutral rating 3 (feedback rating is required); tier validity/downgrade evaluation job not built

### Final verification (2026-07-20)
- Backend: 36 passed, 0 failed
- E2E: 199 passed, 16 skipped, 0 failed (conftest dedupes "Test Staff" and clears `must_change_pin` via PIN rotation)
- TypeScript strict: all 3 portals pass; all 3 portals rebuilt and live behind Caddy (admin/staff 307→login, app 200, api 200)

## Round 32 — re-audit fixes (2026-07-20, second pass)

A second audit of the uncommitted diff caught and fixed:

- `09_schema_sync.sql` was stale (regenerate with `dump_schema_sql.py` after ANY model change): missing `tier:<key>` CHECK relaxation and `feedback_entries.customer_id` nullable — fresh docker inits would have broken both features
- `07_rls_policies.sql` aborted fresh docker inits (`app_user`/`admin_user` roles didn't exist) — now creates NOLOGIN placeholder roles; full 01→10 replay verified against a scratch DB (107 tables, correct alembic stamp)
- Staff/admin cancellation of an order with CAPTURED payments is now blocked (400 "issue a refund first") — previously points/vouchers were clawed back while money stayed captured
- POS payments (cash + wallet) now accrue `annual_spend` (previously only gateway captures did)
- Rate-limit 429s now pass through CORS/security headers (`PublicMutationRateLimitMiddleware` registered first — Starlette runs middleware in reverse registration order)
- Service worker `install` now awaits `versionReady` (precache was being discarded on every install)
- POS QR scanner: stale `scannerRef` cleared after stop (scanner couldn't be reopened after one scan)
- Saved-card `StripeCardInput` no longer remounts on every keystroke (stable `useCallback` prop)
- Reward-selected banner shows the reward name instead of the raw id
- `seed_loyalty.py`/`seed_stores.py` deactivate legacy tiers/stores not in the current seed set (stale rows otherwise survive re-seeds); `seed_stores.py` no longer prints `display_key` to logs

### Ops notes
- DBs that were SQL-initialized WITHOUT an alembic stamp need a one-time `alembic stamp a1b2c3d4e5f7` before running an image whose entrypoint runs `alembic upgrade head` (else baseline migrations try to recreate tables)
- OTP bypass divergence: Python seeder sets `otp.bypass_enabled=true` (dev/E2E), `infra/db/10_seed_data.sql` sets `false` (prod-safe). Both intentional.

## Menu & inventory data reset (2026-07-20)

All fake demo menu/inventory data was intentionally cleared — the real Loka Espresso menu will be imported separately. Store info (PKL-001, KLIA1-001), loyalty tiers, customers, vouchers/rewards, staff and platform config were kept.

- **Live DB cleared**: menu_items (90), menu_categories, modifiers/variants, menu_item_recipes, bundle products, inventory_items/stock/movements, purchase_orders, suppliers, PLUS all orders/payments/refunds and customer carts (FK `order_line_items.menu_item_id` is RESTRICT — menu items can't be deleted while orders reference them). Kept: `allergens`, `dietary_tags`, `tax_categories`, `inventory_categories` (standard reference data, not fake items).
- **Seed scripts emptied** (structure kept as template): `seed_menu.py` (CATEGORIES/MENU_ITEMS/MODIFIER_GROUPS/RECIPES/BUNDLES), `seed_inventory.py` (ITEMS/STOCK_LEVELS; CATEGORIES kept), `seed_orders.py` (ORDER_SEED — no more sample orders). All three run cleanly as no-ops.
- **E2E impact**: 23 menu-dependent tests (ordering, bundles, kiosk, inventory, POS, refunds…) FAIL until real menu data is loaded — expected, not a regression (167 pass / 25 skipped). Backend unit tests (36) unaffected.

## Real menu imported (2026-07-21)

The boss-confirmed menu from `/root/menu-item` is now the seed of record:

- **Data**: `backend/scripts/seed_menu_data.py` — 21 categories, 160 items, hot/cold variants (+RM 2), drink customisation modifiers (Extra Shot/Single Origin/Oat/Soy), Pulled Chicken add-on, per-item allergens (9 allergen rows incl. new tree_nuts/eggs/soy/sesame/fish) and dietary tags (everything tagged `halal`; vegetarian/vegan/gluten_free where applicable), 15 boss-confirmed recipes with 60 inventory ingredients + starter stock (1000/store, unit_cost 0 — update via Admin → Inventory).
- **Images**: `backend/seed-assets/menu-images/<category>/*.jpg` (5.5 MB, copied into the repo); the seeder installs them to `uploads/images/menu/...` and sets `image_url`.
- **Seeder**: `backend/scripts/seed_menu.py` (idempotent upsert by item_code; rebuilds variants/modifiers/allergens/dietary/recipes per item). Run: `python3 scripts/seed_menu.py --yes --force-prod`.
- **Baklava pricing**: base RM 9/pc with variant "Per 100g" +RM 27; sets are separate items.
- **Halal status (owner-confirmed 2026-07-21)**: all sausage items are chicken sausage (Sausage Bun described accordingly); Truffle Gold Potato uses **chicken bacon bits** (ingredient `ING-CHICKEN-BACON`) instead of pork bacon bits. No pork/ham anywhere on the menu.
- **E2E**: suite green again (199 passed / 16 skipped). Test-side fixes: recipe-list test uses per_page=200, bundle test re-fetches detail after create, tips test uses real item code CSC-ESPRESSO + RM20 tender. E2E artifacts (E2E-* items/categories/bundles, orders) were cleaned from the DB afterwards.
