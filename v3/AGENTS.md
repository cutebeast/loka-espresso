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
| Kitchen Staff (kitchen@loyaltysystem.uk) | kitchen123, PIN 654321 | Staff — kitchen display, wastage, inventory, hygiene (Store 1) |
| Store Manager (manager@loyaltysystem.uk) | manager123, PIN 654321 | Staff — all ops pages incl. staff mgmt (Store 1) |
| demo@lokaespresso.my | +60123456001 | Customer PWA (RM50 wallet) |
| vip@lokaespresso.my | +60123456002 | Customer PWA (RM200 wallet) |

(Kitchen Staff + Store Manager seeded 2026-07-25 via `seed_staff.py` EMP004/EMP005 for role-gated page testing; PINs pre-rotated through the change-pin flow so no first-login PIN wall. Other seeded staff still get the `must_change_pin` flow on first login.)

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

### Pre-go-live open items (noted 2026-07-25)

Pending decisions / tasks before switching to `*.lokaespresso.com` (see checklist above for the mechanical steps):

1. **Deploy strategy — ON HOLD per owner 2026-07-26: do NOT touch the live server** until dev is declared fully ready; continue hardening the dev server only. When migration resumes: (A) fresh v3 deploy on `84.247.148.238` with old app data archived, or (B) migrate old app data (customers/wallets/loyalty balances) into v3. Old app at `/opt/fnb-super-app` (docker, 54 tables) is 3 months stale. SSH access confirmed working (key auth + root password reset by owner — password NOT recorded here intentionally).
2. **OTP bypass**: `otp.bypass_enabled=true` is INTENTIONAL on dev. Set to `false` at go-live — and before that, confirm the live SMS provider (Twilio) credentials actually deliver, since real OTP depends on it. **Toggle verified live 2026-07-26**: flipping via Settings takes effect on the very next request (PlatformConfigService reads DB fresh, NO cache/restart needed). Full flow tested: bypass ON → send-otp short-circuits ("OTP bypassed", no SMS burned), login with 000000 → 200, no-code → 200; bypass OFF → both → 401; restore ON → 200. Only customer PWA register/login use OTP — staff (name+PIN / email+password) and admin (email+password) are unaffected. Settings page displays the flag correctly (is_sensitive=false; `otp.bypass_code` stays masked).
3. **Rsync `backend/uploads/` to live** — the directory is gitignored and contains all menu images, 7 AI-generated promo banner images, and the 25 images migrated from the live server. Git clone alone will NOT carry them.
4. **3 product cards missing prices** (owner to supply): Cocinare Essence Duo grinder, Cocinare Essence Go grinder, Loveramics cups — cards render price-less until then.
5. **Reinstall translation crons on live** (currently on dev only): menu review Sun 03:17, content fill daily 04:23, admin-ui review 1st-of-month 04:47, sync-to-JSON+PWA-rebuild Sun 05:41.
6. **DeepSeek API key** must be set in live DB `platform_config.integration.deepseek_api_key` (DB-seeded, not in env/repo).
7. **Live payment keys** (Stripe/Hitpay) into `v3/backend/.env` — dev keys must not go live.
8. **pm2 process set + `pm2 save`** on live (v3-backend, admin/staff/customer frontends) and Caddy sites for `admin./staff./app.lokaespresso.com`.

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
- Alembic head: `9e63748a26c8` (lucky draw tables; previously `b6729f513c8f`). Fresh docker deploys: `infra/db/01-07` + generated `09_schema_sync.sql` + `10_seed_data.sql`; regenerate 09 with `v3/scripts/dump_schema_sql.py` after model changes; `Dockerfile.backend` also runs `alembic upgrade head` on boot

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

### Recipe ↔ inventory coupling (verified 2026-07-21)
- Items WITHOUT recipes sell normally — no stock involvement (proven live: POS order for Espresso).
- Items WITH recipes deduct stock at order creation (qty × waste_factor 1.05) and restock on cancellation. Variant orders fall back to the item-level (NULL-variant) recipe.
- A recipe referencing an unstocked ingredient BLOCKS the order with a clean 400 ("Insufficient stock for X") — fixed a POS-path gap where `OrderError` escaped as a 500 (`staff_ops.py` now catches it). The starter stock (1000/store) exists precisely so this never triggers for seeded recipes.
- A recipe referencing a deleted/missing inventory item is silently skipped (no deduction, no error).
- Allergen/dietary framework: 9 allergens (peanuts, tree_nuts, gluten, dairy, eggs, soy, sesame, fish, shellfish) — aligned with common F&B labelling (FDA big-9 / Malaysian Food Act style). EU-14 extras (celery, mustard, sulphites, lupin, molluscs) don't occur in this menu; add them to `seed_menu_data.py ALLERGENS` if a future menu needs them.

### Inventory cleared — menu runs standalone (2026-07-21)
Per owner decision, the menu must work before inventory management begins:
- **Live DB**: all recipes, ingredients, stock, movement logs, POs cleared. Menu items (160) are untouched and fully sellable — no stock checks apply to anything.
- **Seeder**: recipe/ingredient/stock seeding is now OPT-IN — `python3 scripts/seed_menu.py --with-recipes` (default run skips it). Recipe data stays in `seed_menu_data.py` (INGREDIENTS/RECIPES) ready for when inventory work starts.
- **E2E**: recipe-list and inventory-list tests skip gracefully while inventory is empty (195 passed / 20 skipped).

### Loyalty program — aligned to CRM structure PDF (2026-07-21)
Source of truth: `/root/CRM_Loyalty Program Structure.pdf`. Implementation status:

- **Tiers**: Bloom (sign-up) / Origin (RM500 rolling 12-mo spend) / Reserve (RM1,500) ✓
- **Points**: RM1 = 1 / 1.2 / 1.5 pts by tier, applied on customer orders AND POS ✓
- **Qualification**: now SPEND-based (was lifetime-points). `_recalculate_tier` upgrades on `annual_spend` (sen) vs `renewal_annual_spend` × 100, promote-only ✓
- **Validity/renewal/downgrade**: `_evaluate_tier_renewal()` (commerce.py) — after `validity_months`, spend ≥ requirement → renew (new window), else downgrade ONE tier (Bloom: no expiry, never reviewed). Runs on every payment capture (`_accrue_loyalty_annual_spend`) and lazily on `GET /loyalty/me` ✓
- **Birthday double points**: all tiers, birthday month ×2 on order points (both order + POS paths; ledger notes it). `_birthday_points_multiplier()` ✓
- **POS spend accrual**: POS inline cash/card captures now accrue annual spend too (was missing — the main spend channel) ✓
- Verified with scripted end-to-end checks (upgrade at RM500/RM1500, renewal keep, Reserve→Origin→Bloom downgrades, birthday ×2) + E2E 195 passed.

**Not implemented (program-level, needs product decision)**:
- Monthly drink upgrade, early access, priority reservation, skip-the-queue, member events/omakase, hidden app content, annual appreciation gift, exclusive merchandise — marketing/ops features, no software support yet

**Implemented 2026-07-21 (second pass)**:
- **Welcome reward (voucher)**: config-driven — `loyalty.welcome_reward_type` = `points` | `voucher` | `points_and_voucher` (default `voucher` per PDF), `loyalty.welcome_reward_voucher_code` (default `WELCOME-RM5`). Registration grants a WELCOME-RM5 customer voucher (RM5 off first purchase, first_order_only, 30-day validity). Editable in Admin → Loyalty → Settings.
- **Birthday perks**: first order in the birthday month grants a perk voucher once per calendar year — Origin → `BDAY-UPGRADE` (complimentary drink upgrade, RM5), Reserve → `BDAY-GIFT` (RM30 gift credit). Bloom: double points only. `grant_birthday_perk()` in commerce.py, hooked into both award paths.
- **Eco-campaign (BYOT)**: `orders.is_byot` flag (migration `b6729f513c8f`) — customer PWA checkout checkbox + staff POS toggle; BYOT orders earn **2x points (Bloom/Origin) / 3x (Reserve)** replacing the tier multiplier, noted in the ledger. Accepted in OrderCreate + POS create.
- **Marketing section cleared & re-seeded properly**: old WELCOME10/FLAT5/fake campaign/banner removed; now 3 PDF-aligned voucher definitions (WELCOME-RM5, BDAY-UPGRADE, BDAY-GIFT), 3 marketplace rewards, Eco-Campaign (BYOT) as an active marketing campaign, 2 real promo banners (welcome + BYOT). Shared helper: `grant_voucher_to_customer()` in commerce.py.
- Verified live: welcome voucher on registration (0 pts, voucher type), birthday perk grant + once-per-year guard + tier mapping, BYOT POS order RM24 → 48 pts (2x). E2E 195 passed.

### Experiences & Workshops — paid classes (2026-07-22)

Per `/root/Private booking charges & lucky draw.xlsx` (lucky draw is a SEPARATE feature, not built). Decision: **paid classes live as menu items** (checkout payment works today) and **event cards are marketing/discovery** (no payment, `action_url=#menu`, RSVP off).

- New menu category **Experiences & Workshops** (order 17, baklava+ shifted to 18–22):
  - `EX-COFFEE-OMAKASE` Coffee Omakase Experience — variants: 4 Pax RM299/pax · 2 Pax RM399/pax (+100) · 1 Pax VIP RM488/pax (+189); perks per package in description
  - `EX-TURKISH-SAND-BREW` Turkish Sand Brew Workshop — RM199/pax (4-pax)
  - `EX-ROASTERY-WORKSHOP` Roastery Workshop — RM199/pax (4-pax)
  - All exclude taxes (SST 0% currently). Placeholder images (kahve-i-turk/gozleme/espresso) — replace with real photos later.
- 3 event cards seeded in `seed_content.py` (EVENT_CARDS) promoting the classes with pricing + reward-redemption note (Omakase 5,980 pts, Sand Brew 3,980 pts — matches the rewards table).
- Ties together: customers can PAY for a class via checkout OR Reserve members REDEEM it with points (rewards table).
- Translated to all 4 locales (menu + event cards). E2E 195 passed.

### Bookings, marketing fixes & lucky draw (2026-07-22)

**Two separate booking tracks, both now working:**
- **Table reservations**: `/staff/reservations` was completely broken (500 — referenced nonexistent `table_id`/`customer_name`/`notes` model attrs). Rewritten against the real model (`dining_table_id`, Customer join, `special_requests`), added `status` filter; PATCH status now validates via `ReservationStatusUpdate`, persists table assignment (was silently dropped), and runs the admin overlap check. Staff portal reservations page works end-to-end.
- **Workshop/class bookings** (EX-* items): `GET /admin/orders?category_slug=experiences` filters orders by live menu category; admin orders page has a Category dropdown. Order `search` also matches customer phone now.

**Marketing audit fixes** (all verified live):
- DANGEROUS: campaign `tier:<key>` audience fell through to ALL customers — now resolves against loyalty tiers (400 on unknown tier).
- `in_app` campaign channel did nothing — now creates inbox NotificationMessages like the notifications path.
- `GET /promos/banners/{id}/status` was a hardcoded placeholder — returns real per-customer state (action_type, survey_completed, voucher_claimed/used, voucher_code).
- Referral chain: signup accepts `referral_code` (PWA captures `?ref=` to localStorage via new `src/lib/referral.ts`, sends on register), first order auto-marks the event `converted` (in `create_order_from_cart`, also increments the never-maintained `Customer.order_count`), `credit_referral_points` updates `referral_count`/`referral_earnings_total`, POST /referrals blocks self/wrong codes.
- Known follow-ups: campaign scheduler, transactional notifications (order/reservation events), real web-push delivery, delivery-log writes, bulk voucher issuance, content_sections is dead code.

**Lucky draw (spin wheel)** — new feature, end-to-end:
- Backend: `lucky_draw_campaigns`/`_segments`/`_spins` (migration `9e63748a26c8`, current head). Public `GET /lucky-draw/active` (404 when none; `spins_remaining` when authed), `POST /lucky-draw/spin` (ActiveCustomer, weighted pick over active segments, issues a real voucher via `grant_voucher_to_customer(source="lucky_draw")`, daily limit per campaign → 429 with next-spin time). Admin `/admin/lucky-draw`: campaign GET/POST/PUT, segment CRUD (voucher_definition_id + label + color_hex + probability_weight + sort_order + is_active), paginated spins report.
- PWA `#lucky-draw`: SVG wheel with segment colors/labels, server-first spin then animated landing (5 turns + offset, 4.5s ease-out), result modal with voucher + "View in Wallet", guest-viewable (spin prompts sign-in), 429 → "come back tomorrow". Home banner appears only when a campaign is live. 15 locale keys × 5 languages.
- Admin `/marketing/lucky-draw`: campaign card (create/edit), segment table with voucher dropdown + live chance % + color picker, recent spins table. Sidebar entry under Marketing.
- Verified live end-to-end: created "Daily Lucky Spin" (kept active: WELCOME-RM5 70% / BDAY-UPGRADE 30%), spin won a real RM5 voucher, second spin 429'd.
- E2E: 195 passed / 20 skipped.

### Translation system overhaul (2026-07-22)

The translations admin page (`/translations`, tabs PWA/Staff/Admin) showed big gaps in `admin-ui`:
- **Problem**: `admin-ui/en` had 2,440 seed keys — 223 in-use keys missing (new pages/features) and 805 stale keys from the old hardcoded seed; `zh` partially translated (1,966, with 607 stale); **`ms`/`ta`/`tr` completely empty**.
- **Sync**: `v3/scripts/sync_admin_ui_translations.py` scans the portal source for `t()` calls and inserts missing en keys (inline default or humanized text). Idempotent; `--prune` deletes stale auto-seeded keys. Run after any admin portal change. Pruned 696 obsolete seed keys (kept `admin.common.*`/`admin.nav.*` shared keys deliberately — dynamic usage).
- **Locale fill**: `v3/scripts/fill_admin_ui_locales.py` batch-translates missing keys per locale via DeepSeek (`--locale`, `--batch`, idempotent). Filled zh (+608 → aligned to 1,967 after stale prune), then ms/ta/tr to full 1,967 keys each.
- Weekly `review_translations.py` cron only covers the `menu` namespace; admin-ui UI strings are covered by the fill script on demand.
- Content namespaces (menu/allergens/dietary/reward/voucher/event/bundle/campaign) are fully translated from the DeepSeek work in previous rounds.

### Auto-translation for ALL content + schedule (2026-07-22, second pass)

Root cause found in audit: only API-created content auto-translated (admin endpoints call `auto_translate_record`) — **SQL-seeded content (stores, loyalty tiers, promo banners, vouchers, bundles) never got translations**, and `bundle_products` wasn't even in `TRANSLATABLE_ENTITIES` (its API hook was a silent no-op).

- **Fixed**: `bundle_products` added to `TRANSLATABLE_ENTITIES` (title, description) + `TABLE_TO_NAMESPACE` (`bundle`). Also fixed a latent cache bug: identical texts across fields/records crashed the `translation_cache` insert on its unique hash (now deduped).
- **`backend/scripts/translate_missing_content.py`**: iterates ALL translatable tables, auto-translates every record's texts into all 4 locales (cache-cheap on re-runs — only new/changed text hits the API), and purges translation rows pointing at deleted records. First full run wrote 2,508 translations (stores, tiers, banners, bundles, help articles, surveys…).
- **Schedule**: cron **daily 04:23** (`crontab -l`): `... translate_missing_content.py --yes --force-prod >> logs/translate_missing_cron.log 2>&1`. Any content seeded or created later is translated within 24h. Weekly `review_translations.py` (Sun 03:17) still quality-reviews the `menu` namespace.

### Class sessions with capacity (2026-07-22)

Experience items (EX-*) now have dated, seat-limited sessions — booking consumes seats, cancellation restores them:

- **Model**: `class_sessions` (menu_item_id, session_date, start_time, capacity, booked_pax, location, notes, is_active; capacity ≥ booked CHECK) + `class_session_id` FK on cart_line_items and order_line_items. Migration `3f36206b0cbd` (current head).
- **Enforcement** (`create_order_from_cart`): session row locked, must be active/future/matching item, `booked + qty ≤ capacity` else 400 "Not enough seats left (N of C remaining)". `reverse_order_effects` restores seats on any cancel path.
- **Endpoints**: public `GET /menu/items/{id}/sessions` (active, future, with `remaining`); admin `GET/POST /admin/menu/items/{id}/sessions`, `PUT/DELETE /admin/class-sessions/{id}` (capacity can't go below booked; delete blocked when booked).
- **PWA**: customize sheet for EX items shows a required session picker (date · time · location + seats left; full sessions disabled; Add button blocked until picked) → `class_session_id` through cart → order. Cart lines key on session id too.
- **Admin** (Events & Classes → Classes & Workshops): per-class session manager — list with booked/capacity badge, activate/deactivate toggle, delete (unbooked only), inline add form (date/time/seats/location).
- Verified live end-to-end: session cap 4 → 3-pax booking consumed (booked=3) → 2-pax attempt 400 "1 of 4 remaining" → cancel restored to 0.
- One test session left seeded for demo: Turkish Sand Brew Workshop, 2026-07-23 10:00, 4 seats at PKL.
- E2E: 195 passed / 20 skipped.

### PWA variant selection (2026-07-22)

The customer PWA previously had NO variant support (kiosk had it since round 32) — drinks defaulted to Hot and Omakase to the 4-pax price, and variant-only items (no modifiers) never opened the customize sheet at all. Fixed:
- `ItemCustomizeSheet`: variant picker section (Hot/Cold, pax packages…) above modifier groups; price = base + variant + modifiers; opens for items with variants even without modifier groups.
- Cart identity includes `variant_id` (Hot and Cold of the same drink are separate lines); cart lines show the variant name.
- `cartSync` sends `menu_variant_id` (server-side variant pricing was already correct).
- Verified live: Omakase VIP RM488 + Cold Latté RM20 → order total RM508.
- New `menu.variant` locale key (5 languages).

### PWA event → payment flow (2026-07-22)

No special page needed — the event page carries information, the menu carries payment:
- **Event card detail** (PWA `#events`) now renders the card's `action_url`/`action_label` as a "Book Now" button, hides the date/time block when `event_datetime` is null, and shows `long_description` properly.
- **Deep link**: action URL `#menu?cat=experiences` is parsed by EventsPage → navigates to the menu with the Experiences & Workshops category pre-selected and scrolled into view (`selectedCategoryId` in uiStore, honored by MenuPage).
- Customer flow: Events → tap class → Book Now → menu opens at Experiences → pick package variant → checkout (wallet/Stripe/HitPay/cash). Seed: `seed_content.py` EVENT_CARDS uses `#menu?cat=experiences` + "Book Now".

### Rewards marketplace — boss's redemption table (2026-07-22)

Reward catalog replaced per `/root/Point redemption Loka Espresso crm.xlsx` (1 pt = RM0.05 retail value, 5% return on spend). Old placeholder rewards (free_delivery / 10% off / RM5 off) removed. 13 rewards, all `free_item` type, tier-gated via `minimum_tier_id` (redeem check is hierarchical by tier id):

- **All tiers (Bloom+)**: Espresso Shot/Syrup Add-on 50pts · Single-Origin Bean Upgrade 100 · Signature Sandwich 500 · Signature Pasta Meal 700 · Loka Drip Coffee Bags 560
- **Origin & Reserve**: House Blend Beans 250g 900 · Ceramic Eco-Tumbler 1,400 · Concinare Hand Grinder 12,600 · Muvna Brewing Set 13,760
- **Reserve only**: Concinare Signature Kettle 19,800 · Kesu Travel Pack 31,400 · Manual Brewing & Sand Workshop 3,980 · Coffee Omakase 5,980

Seeded in `seed_loyalty.py` (REWARDS, upsert by reward_key); names/descriptions translated to all 4 locales (52 translations). E2E 195 passed after replacement.

### Bundle products (2026-07-21)

4 bundles seeded from the real menu via `scripts/seed_bundles.py` (idempotent by title; rebuilds groups/components). All are `multi_course` type with pick-groups (the engine's `combo` type requires EVERY component present — group picks only work as `multi_course`; single-item mandatory groups replace "fixed" components):

| Bundle | Price | Groups |
|---|---|---|
| Loka Pair Set | RM 39 | Pick 1 food (4 gourmet sandwiches) + pick 1 drink (6 specialty coffees) |
| Main & Treat | RM 45 | Pick 1 main (7 mains/pasta/pide) + pick 1 treat (drink OR dessert OR pastry, 10 items) |
| Tea Time for Two | RM 55 | Pick 2 drinks + pick 2 pastries (duplicates allowed) |
| Breakfast Duo | RM 39 | Turkish Mixed Bread (mandatory single-item group) + pick 2 drinks |

Prices are SUGGESTIONS pending owner confirmation. Verified live: Pair Set RM48→39, Breakfast Duo RM56→39, Tea Time RM64→55 (discounts computed at order creation, not cart).

- Admin menu items page (`/menu/items`) now shows image thumbnails (new `menu_items.image` admin-ui translation) and fetches per_page=200 (was 100 — silently truncated the 160-item menu).

### Session lifetimes (2026-07-22, verified live)

| Portal | Access token | Cookie | Refresh token | Refresh cookie | Notes |
|---|---|---|---|---|---|
| Admin | 8h | 8h | 7 days | 7 days | Plus 30-min idle timeout (deliberate). Was broken: portal set a 15-min cookie (fixed) |
| Staff | 8h | 24h | **30 days** | **30 days** | Rotates on every refresh (sliding) |
| Customer PWA | 8h | 8h | **90 days** | **90 days** | Rotates on every refresh — active customers effectively never re-login |

- `create_refresh_token(..., days=N)` per-type lifetimes; cookie ages in `auth_cookies.py` (`CUSTOMER_REFRESH_MAX_AGE` 90d, `STAFF_REFRESH_MAX_AGE` 30d, admin stays 7d for security).
- Refresh rotation is atomic with replay protection (old token 401s on reuse) — verified live on all 3 portals.

### Migration & seed hygiene (verified 2026-07-21)
- **Alembic**: single linear chain, live DB at head `9e63748a26c8`, `alembic check` reports no drift. `clear_db --all` preserves `alembic_version`.
- **Full re-seed workflow verified end-to-end** (`clear_db --all` → `seed_all`): every part runs clean, no fake data reintroduced.
- **seed_operational.py**: fake demo suppliers/POs removed (SUPPLIERS/PURCHASE_ORDERS emptied); shift templates (Morning/Evening/Night) kept.
- **seed_orders.py**: skips quietly when ORDER_SEED is empty (no more "run seed_menu.py first" confusion — it used to probe the old fake ESP/LAT codes).
- **seed_staff.py**: now seeds all 3 documented staff accounts with per-store assignment — Test Staff (PKL, cashier, E2E), Staff One staff1@loyaltysystem.uk (PKL, server), Staff Two staff2@loyaltysystem.uk (KLIA1, server).
- **Translations (superseded — see "Translation service — DeepSeek live" below)**: all stale/E2E/English-placeholder content in `menu`/`campaign`/`voucher` namespaces was deleted; the menu has since been fully translated into ms/zh/ta/tr via DeepSeek.
- **E2E residue cleaned** from DB: test campaigns, E2E vouchers, E2E menu items/categories, orders. `seed_staff_ui_translations.py` is legacy (staff portal uses static `src/lib/translations.ts`, nothing reads the `staff-ui` namespace) — kept for reference, not wired into `seed_all`.

### Translation service — DeepSeek live (2026-07-21)
- **DeepL removed entirely** (service, seeds, admin settings page, DB config rows). DeepSeek is the only provider: `deepseek-v4-flash` primary → `deepseek-v4-pro` fallback (those are the only model names the account's API accepts).
- **Key stored** in `platform_config.integration.deepseek_api_key` (sensitive, masked in GET /admin/config).
- **Pre-existing bug fixed**: `_fetch_translation`/`_call_deepseek` never received the DB session, so credentials always loaded empty and every auto-translate silently fell back to English (this is why old "translations" were English copies). The db session is now threaded through; concurrent batch calls prime the creds cache first to avoid sharing the AsyncSession.
- **`translate_menu_response` None-list fix** (was 500 on `?locale=` requests).
- **`translation_cache` truncated** once — it was full of English-fallback entries from the broken period.
- **Menu fully translated**: `scripts/translate_menu.py` (kept for future menu changes; idempotent) wrote 1,864 translations — all 160 items (name+description), 21 categories, 22 modifier groups, 82 options × ms/zh/ta/tr. Public menu API serves localized content (`/menu/stores/1?locale=ms` etc.). One manual correction: "Single Origin Bean" ms → "Biji Single Origin" (DeepSeek had "Kacang Asal Tunggal"); any translation is editable via Admin → Translations.
- **Weekly AI translation review**: `scripts/review_translations.py` audits auto-translations with `deepseek-v4-pro` (F&B-aware prompt, JSON verdicts) and applies explicit fixes only. Only `is_auto_translated=true` rows are reviewed — manual edits (`is_auto_translated=false`) are never touched. Supports `--dry-run`, `--limit`, `--batch`, `--model`, `--namespace`. Runs via cron **Sunday 03:17** (`crontab -l`): `... review_translations.py --yes --force-prod --batch 40 >> logs/translation_review_cron.log 2>&1`; per-run logs in `backend/logs/translation_review_<timestamp>.log`. To manage it, edit root's crontab.

### Allergen/dietary seed-ordering fix (2026-07-21)
- **Bug**: `seed_content.py` seeds the original 4 allergens + 4 dietary tags, but `seed_all` runs `content` AFTER `menu` — on a fresh re-seed those rows didn't exist when `seed_menu` linked items, so all gluten/dairy/peanut/shellfish allergen links and ALL dietary tag links were silently skipped (only the 5 new allergens got linked).
- **Fix**: `seed_menu_data.py` now defines ALL 9 allergens + 4 dietary tags and `seed_menu.py` upserts them itself (self-sufficient, order-independent). Re-seeded and verified: dairy 104, gluten 93, eggs 68, tree_nuts 24, soy 8, sesame 7, peanuts 3, fish 2, shellfish 2; halal 160 (all items), vegetarian 97, gluten_free 61, vegan 43. No unused allergens or dietary tags exist — nothing needed removing.
- Allergen + dietary tag display names translated to all 4 locales (88 translations via `auto_translate_record`); `merge_translations` now skips non-dict entries (menu list endpoint emits dietary tags as plain tag-key strings — those localize client-side).
- **Seeder id-stability fix**: `seed_menu.py` previously deleted and re-inserted variants/modifier groups/options on every run, rotating their ids — and since translations are keyed by record id, every re-seed silently orphaned modifier translations. Variants are now upserted by `variant_sku`, groups by (menu_item_id, group_name), options by (group_id, option_name); stale children are pruned by name. Verified ids stable across 3 consecutive runs. Modifier translations re-generated (416) after the fix; "Single Origin Bean" ms correction re-applied (`Biji Single Origin`, flagged manual).
- Purged orphaned translations (refs to deleted records) from the `menu` namespace. Current state: 160 items + 21 categories + 104 modifier rows fully translated × 4 locales; allergens (9) and dietary tags (4) all in use, nothing unused.

### Promo banner images complete (2026-07-25)
- All 7 promo banners now have real images (AI-generated via OpenRouter `google/gemini-3.1-flash-image`, stored in `backend/uploads/promos/` — note: `uploads/` is gitignored, so these files must be rsynced to the live server at deploy time, same as the 25 live-server images already migrated):
  - `promo-survey.jpg` — Take Our Survey & Get RM5 Off
  - `promo-eco-byot.jpg` — Eco-Campaign: BYOT & Earn (bamboo tumbler + latte art)
  - `promo-welcome-reward.jpg` — Welcome Reward — RM5 Off (kraft gift box + latte)
  - `promo-new-menu.jpg` — New Menu — Vote & Save 10%
  - `promo-store-review.jpg` — Store Review — Free Coffee!
  - `promo-56-summer.jpg` — Summer Promo (date-expired, not served)
  - Holiday Deal (Expired) — intentionally image-less; date-expired so the public API never returns it (`GET /api/promos/banners` filters `start_date`/`end_date` against now)
- Verified: public API serves all 5 active banners with correct `image_url` over `https://app.loyaltysystem.uk`, image files return HTTP 200, and the PWA home Promotions carousel renders them (screenshot-verified in guest mode).

### Events section unified under /events (2026-07-25)
- Admin portal routes moved: `/menu/experiences` → `/events/workshops`, `/content/events` (+`/new`, `/[id]`, `/report`) → `/events` (+same children). Sidebar "Events & Classes" group now lands on `/events`. 308 redirects in `admin-portal/next.config.ts` cover the old paths (incl. `/content/events/:id`).
- **Why two surfaces exist** (by design, keep both): `/events/workshops` = PAID classes — menu items in the `experiences` category + class_sessions (date/capacity) + paid booking orders. `/events/report` = FREE RSVP sign-ups on content event cards (`/admin/event-cards` API). Paid bookings and free RSVPs are different systems; only the admin UI routes were split, the nav already grouped them.
- Untouched on purpose: public API `GET /api/content/events` (backend endpoint, not a UI route — e2e `test_content.py` hits it), translation keys (`content_events*` / `menu_experiences*` names are just identifiers, fetched as one `admin-ui` blob — no folder coupling).
- Translation polish fixed live: JSX concatenations `{n}{t(...)}` rendered "3events" / "0events with RSVP ·0total sign-ups" — code now owns the separators (`{n} {t(...)} · {m} {t(...)}`), DB values stripped of padding/`·` (marked `is_auto_translated=false` so the weekly DeepSeek review skips them). `content_events.pos` was "Pos" (uppercased to "POS" by table CSS — read as point-of-sale) → "Display Order" ×5 locales.
- **Pattern to avoid**: never rely on leading/trailing spaces inside translation values — translators (human or AI) strip them. Put separators in code.

### Event types — public / invite-only / paid (2026-07-25)
- **3 event types** per owner spec: `paid` (Omakase etc. — informational card, booking via the workshop/class flow, RSVP rejected with 400), `invite_only` (free but restricted — RSVP 403 unless on the invite list), `public` (open RSVP, unchanged default).
- **Schema** (alembic `a1b2c3d4e5f6`): `event_cards.event_type` (default `public`) + new `event_invites` table (`event_id`+`customer_id` unique, cascades on card delete). The 3 seeded workshop cards are `paid` (seeder `seed_content.py` sets it too).
- **Admin**: `/events` list has a Type badge column; edit page has an Event Type selector (RSVP fields hidden for `paid`) and, for `invite_only`, an **Invite List manager** — customer search (`/admin/customers?search=`), add/remove, per-invitee RSVP status. New-event page has the same selector (invites managed after create).
- **API**: `GET/POST/DELETE /admin/event-cards/{id}/invites`; public event detail adds `is_invited` (cookie or bearer) for invite_only events so the PWA unlocks the button. **Gotcha fixed**: `_get_optional_customer` has a `Depends` default — when calling it directly (not via DI), resolve the bearer yourself: `await _optional_bearer(request)`, else `'Depends' object has no attribute 'credentials'` 500s.
- **PWA**: list shows 🔒 Invite Only / 🎫 Paid Event badges; invite-only detail shows the lock note and a disabled Invite Only button unless `is_invited`; paid events keep the "Book Now" action into the experiences menu.
- **E2E**: `test_invite_only_event_rsvp_flow` (403→invite→200, dup-invite 409, is_invited flips), `test_paid_event_rejects_rsvp`. Full suite 197 passed / 20 skipped.

### Translation sync — bracket-key gap fixed (2026-07-25)
- **Systemic bug found**: `scripts/sync_admin_ui_translations.py` regexes rejected every key containing `[`/`]`, so all dynamic-route namespaces (`content_events_[id].*`, `vouchers_[id].*`, … — 696 keys, ~27% of the portal) never reached the DB and rendered as RAW KEYS on the UI (masked on some machines by stale localStorage cache). Root cause detail: KEY_RE required a dot before each segment, but folder-joined keys have none before the bracket (`content_events_[id].title`).
- Fix: CALL_RE/DEFAULT_RE/KEY_RE allow `[`/`]` in any segment; `humanize()` now uppercases known acronyms (RSVP/OTP/POS/SKU/QR/URL/API/ID/PDF/CSV/PWA/BYOT/SST/RM/KDS + locale codes). Sync added the 683 missing EN keys (auto-seeded, so the monthly DeepSeek review can refine); locale fill (ms/zh/ta/tr) via `fill_admin_ui_locales.py` — idempotent, safe to re-run after interruptions.
- **Verification habit**: after touching admin translations, screenshot the page in a FRESH browser/profile (or clear `localStorage` keys containing `admin-ui`) — the cache hides missing keys.

### Event attendee messaging (2026-07-25)
- **Question that triggered it**: "can admin send a message to customers who RSVP'd?" — answer was NO; the RSVP report was read-only and the notification system only supported static segments + `tier:<key>`.
- **New audience segment** `event:<event_card_id>` on admin notifications/templates (alembic `b2c3d4e5f6a7` — both `*_audience` check constraints recreated; model constraints updated to match). `send_notification` resolves it to customers in `event_rsvps`; unknown event id → 400 at send time (create still allowed).
- **Attendees endpoint**: `GET /admin/event-cards/{id}/attendees` — customer name/phone/email/segment + RSVP time (works for ALL event types, not just invite_only).
- **Admin RSVP report** (`/events/report`): per-row 👥 Attendees modal (full list) and ✉️ Message Attendees modal (title + body → creates `AdminNotification(audience_segment=event:<id>, notification_type=event)` → sends → shows delivered count; Send disabled when 0 sign-ups). Messages land in the customer's PWA inbox (`/notifications/me`) — verified end-to-end.
- **E2E**: `test_event_attendee_messaging` (attendee list, delivered_count=1, inbox contains message, bad event id 400). Content suite 17 passed; notification/marketing/content sweep 44 passed.
- Pattern note: `api.post` in the admin portal unwraps `data` — `created.id`, `sent.delivered_count` directly.

### Notification channels — push / SMS / WhatsApp fan-out (2026-07-25)
- **Design**: ONE pipeline — `AdminNotification.channels` (JSONB, default `["in_app"]`; alembic `c3d4e5f6a7b8`). `send_notification` still creates the PWA inbox rows, then fans out to the extra channels per customer. Everything (segments incl. `event:<id>`, stats, templates) stays in the notification system — campaigns remain the marketing-side bulk sender.
- **Shared service**: Twilio helpers extracted from `admin/marketing.py` into `app/services/messaging.py` (`get_twilio_credentials`, `send_sms_via_twilio`, `send_whatsapp_via_twilio` — WA adds the `whatsapp:` prefix to the recipient). marketing.py now imports from the service (campaign lifecycle e2e re-verified).
- **Gating per send**: customer `NotificationPreference(channel, is_enabled=false)` opt-outs are honored (default enabled); SMS/WA skip when no phone or Twilio not configured (`integration.twilio_*` / test toggle); push skips when the customer has no active `customer_devices.web_push_subscription` (VAPID payload `{title, body, url}` — what `public/sw.js` renders). Skips never fail the send.
- **Every attempt logged** to `notification_delivery_log` (channel/device/address/provider/status/error) — the table existed but was unused until now. Response gains `channel_stats: {channel: {sent, failed, skipped}}` (inbox count stays in `delivered_count`).
- **Admin UI**: the RSVP report Message modal has channel checkboxes (Inbox always-on; Push/SMS/WhatsApp optional) and shows per-channel stats after send — on dev, SMS/WA report "skipped (not configured)" because live Twilio creds aren't set there.
- **Go-live note**: SMS/WhatsApp need live `integration.twilio_account_sid/auth_token/from_number/whatsapp_from` in platform_config (or the test toggle for Twilio test creds); push needs `VAPID_*` env (already on the domain-migration checklist).
- **E2E**: `test_event_attendee_messaging` extended — channels array echoed, `channel_stats` covers all 3 extra channels, inbox unaffected. Content suite 17 passed.

### Workshops page — list view + pagination (2026-07-25)
- `/events/workshops` classes switched from card grid (tall cards, one sessions API call each, no pagination — silently truncated past 50) to a **compact table**: thumbnail+name+code, price (single or min–max variant range), availability, next-session summary (`date time · booked/capacity`, `+N more`), actions. Sessions management (add/toggle/delete) moved into an **expandable row** per class — same controls as before, one class expanded at a time.
- **Pagination**: classes now paginate at 12/page (`classPage`, uses `total` from `/admin/menu/items`); bookings table was already paginated at 10/page. Subtitle uses `classesTotal` (was page-size-capped `items.length`).

### Workshop-aware menu item editor (2026-07-25)
- Workshops are menu items in the `experiences` category, so the generic editor showed food-only fields and allowed category moves that would silently break the workshops page + event cards. Fixed in both `/menu/items/[id]` and `/menu/items/new`:
  - **Category locked** when the item is in `experiences` (disabled select + hint; new page locks when opened as `/menu/items/new?cat=experiences` — the Workshops "Add Class" button now links there and preselects).
  - **Food-only fields hidden** for experience items: allergens, dietary tags, calories, prep time, bundle eligibility, add-on deals, recipe/inventory components. Everything else stays (pricing, variants/modifiers for pax packages, minimum tier for Reserve redemption, availability, featured).
- **Backend guard**: `PATCH /admin/menu/items/{id}` → 400 "Workshop items must stay in the Experiences category" when moving an `experiences` item elsewhere (same-category saves and normal food-item moves unaffected — verified all 3 paths live).
- Verified: workshop editor clean + locked, new-class form preselected + locked, Espresso (food) shows every field as before. E2E menu/content/bundle sweep 73 passed.

### Experiences category sealed both ways (2026-07-25)
- Follow-up to the workshop-aware editor: the `experiences` category is now fully sealed.
  - **Dropdowns**: food items never see "Experiences & Workshops" in the category options (`/menu/items/[id]` and `/menu/items/new`); workshop items see only that option (locked). `?cat=experiences` on the new page remains the Add Class path.
  - **Backend**: `PATCH /admin/menu/items/{id}` now also 400s when moving a NON-experiences item INTO the category ("Only workshop items can use the Experiences category — create classes from Events & Classes → Workshops"), on top of the earlier out-direction guard. POST create into experiences stays allowed (Add Class flow).
- Verified: all 3 backend paths via curl; dropdown option lists checked in-browser for food edit / workshop edit / plain new / ?cat=experiences.

### Experiences leak audit — bundles / POS / kiosk / cart / order (2026-07-25)
Full sweep beyond the category seal, per "make sure you don't miss it out from bundle etc":
- **Bundles**: admin picker already filtered by `is_bundle_eligible` (all 3 workshops are `false` ✓, and the checkbox is now hidden on the workshop editor). Backend had NO check — `_validate_bundle_component_items` now 400s `Workshop items cannot be bundle components: [ids]` (joins category, after the existing exists/available checks). 102 existing components audited: zero linked to workshops.
- **Cart** (`services/cart.py add_line_item`): 400 `"<name>" is a class — please select a session first` when adding an experiences item without `class_session_id` (PWA picker already enforced this in UI; this is the backend guarantee).
- **Order creation** (`services/order.py`): same requirement enforced again before seat consumption (defense for any client that reaches checkout with a session-less workshop line). Seat consume (locked, capacity-checked) and release-on-cancel were already correct.
- **Staff POS** (`/staff/menu/categories` + `/staff/menu/items`): experiences category EXCLUDED — POS has no session picker and would bypass capacity. Workshops are customer-self-booking on PWA only (a deliberate product decision; revisit if counter class-booking is needed — would need a POS session picker).
- **Kiosk checkout**: 400 `"<name>" is a class — please book it on the mobile app` (kiosk has no session concept either).
- **PWA public menu unchanged** — experiences category + workshops + future sessions still served (that's the intended booking path).
- Verified live: bundle reject + normal bundle create OK; cart reject; POS menu 0 workshops / 22 cats; bundle e2e 18 passed; order flows 25 passed.
- Pre-existing issue spotted (not fixed, low priority): invalid `bundle_type` (e.g. "fixed") passes the pydantic schema but violates `ck_bundle_products_bundle_type` → unhandled IntegrityError 500 instead of a clean 422. Valid: combo, value_meal, family_meal, breakfast_set, promotional, pick_x, multi_course.

### POS workshop sales with phone-identified customers (2026-07-25)
- Owner call: staff CAN sell workshops at POS, but every workshop booking needs an identified customer — phone is the identity anchor (passwordless login), name can be informal ("must have name but don't need actual name").
- **Find-or-create** `POST /staff/customers/find-or-create` (cashier+ roles): normalizes MY phone formats (012…/012-345 6789/6012…/+6012…), finds or creates a minimal profile — **no OTP** (staff face the customer; when the customer later registers with the same phone via OTP they take over the same profile, bookings/loyalty intact). Placeholder names ("Walk-in"/phone) get upgraded with the collected name. **Archived (soft-deleted) profiles are REVIVED** on reuse (`revived: true`) — without this the unique phone constraint 500s. Commits properly (an earlier flush-only version rolled back — watch for that).
- **POS order guards** (`/staff/pos/orders`): workshop lines require `class_session_id` (400) AND a real attached customer (400 — the anonymous +0000000000 walk-in profile can't hold bookings). Seats consumed via the new shared helper `services/class_sessions.consume_session_seats` (locked row; active/match/not-past/capacity) — now also used by the customer order engine (single source of truth). Cancel already releases via `reverse_order_effects` (verified).
- **POS UI**: experiences category back in the POS menu (was briefly excluded); workshop tap → session drawer (`PosSessionDrawer`, seats-left/full states) → cart line shows `Class · Jul 28 10:00`; customer search row gained **"New customer by phone"** quick-add (name input → find-or-create → attached). Checkout blocked with `pos.workshop_customer_required` when a workshop line has no customer. Cart qty/remove are session-aware (same class, two sessions = distinct lines).
- **Caught**: `getMenuItems(perPage=100)` silently truncated the 163-item menu — workshops (highest category id) never reached the POS grid. Default now 500.
- **E2E** `test_pos_workshops.py`: find-or-create (formats, dedupe, bad phone), all 4 guard paths, seat consume/release. Sweep 44 passed. Test customers/orders/sessions cleaned after each run (conftest `_get_database_url` pattern, not shell psql).

### Dedicated workshops endpoint + PWA workshops page + POS phone UX (2026-07-25)
- **`GET /api/menu/workshops`** — one-call class catalog for booking layouts: every available experiences item with variants (pax packages), minimum tier, and upcoming sessions with remaining seats + `total_remaining`. Localized via `merge_translations` (NOT `translate_menu_response` — that one expects the full menu dict shape and 500s on a bare list).
- **PWA `#workshops` page** (`WorkshopsPage.tsx`): class cards (image, description, price or variant range, upcoming session chips with seats-left/full, Book Now disabled when no sessions) → opens the existing `ItemCustomizeSheet` (which enforces session selection itself for EX- items) → adds to cart with variant+session. Entry: paid event cards now point `action_url='#workshops'` (DB + `seed_content.py` updated — the EventsPage generic `#<page>` handler routes it).
- **Page registration trap**: adding a PWA page needs SIX lists updated, not two — `api.ts PageId`, `uiStore.validPages`, `usePageRouter.VALID_PAGES` + `SUB_PAGES`, `useAuthFlow.PUBLIC_PAGES` (guests allowed, same as events), `BottomNav` tab mapping, plus AppShell lazy map + case. Missing any → hash nav silently ignores the page.
- **POS phone UX** (owner feedback "many issue on using customer phone"): guide early instead of erroring at the end — session drawer shows a yellow "customer phone required" hint when no customer attached; the customer search box gets an amber outline + helper text whenever a workshop line sits in the cart without a customer. The hard guards stay (400s, checkout block) — these are just affordances.
- **Caught earlier**: `getMenuItems(perPage=100)` truncated the POS menu; default now 500.
- E2E: `test_workshops_endpoint` (shape, remaining math, ms localization). Sweep 26 passed.

### POS health check + Decimal-string crash sweep (2026-07-25)
Full counter-flow audit (owner rules: phone OPTIONAL for F&B, REQUIRED for workshops):
- **Verified working (API + UI)**: walk-in F&B orders (no customer → system Walk-in +0000000000), cash with change (RM 50 tendered → change RM 10), order embedded payment, dine-in table guard ("Please assign a table"), mixed food+workshop rules (400 without customer, 201 with customer+session, seats tracked), wallet-payment graceful failure ("Customer has no wallet"), modifier drawer (Extra Shot RM 4.00 etc.), kitchen send → success screen.
- **Bug family fixed**: backend serializes money Decimals as STRINGS ("40.00") but POS code called `.toFixed()` / summed them raw → crashes `*.toFixed is not a function` and string-concat prices. Sites fixed: `PosModifierDrawer` (option price + modifier sum), `usePosCart` (modifier sum), `PosSuccessScreen` (total + change, plus missing space "Kitchen notifiedTotal RM"), `PosQrPaymentScreen` (total). Rule: **always `Number(...)` API money before `.toFixed()`/math** — JS only auto-coerces strings in `-`, `*`, `/`, never in `.toFixed()` or `+`.
- E2E sweep 22 passed; test orders/customers/sessions cleaned (residue 0).

### Staff portal full audit (2026-07-25)
- **Crashes fixed**: `/shifts` — `statusBadge` called `status.replace` on shifts with null status (guard: `(status || "scheduled")`). Customer display (`pos/display`) — `fmt()` called `.toFixed` on potentially string totals (broadcast/API money is string-typed) → guarded with `Number()` at the formatter (covers all usages on the customer-facing screen).
- **Endpoint smoke (staff token)**: orders, tables, reservations, shifts/me, time-events/me, tasks/me, inventory, equipment, store, hygiene uploads — all healthy. (`notifications/me` 401 with staff token is expected — customer endpoint; staff portal has no notifications page.)
- **Page smoke**: orders (58 in queue), tables (6), time-clock, shifts, reservations, tasks, help, profile, wallet — all load. kitchen/wastage/inventory/equipment/grease-trap/garbage show Access Denied for a CASHIER account — **intentional role gates** (`useStaffRole`: kitchen = kitchen_staff/supervisor/manager; ops = supervisor/manager/kitchen_staff). NOTE: no kitchen_staff/shift_supervisor/store_manager account is seeded — only cashier (Test Staff) + servers (Staff One/Two). If staff need kitchen display at the outlet, create a kitchen_staff account or adjust KITCHEN_ROLES.
- E2E: shifts/POS/quick-ops 10 passed.

### Reward catalog images + public catalog (2026-07-25)
- All 13 rewards now have `image_url`: 10 reuse real assets (product-card merchandise photos for grinder/kettle/muvna/kesu/loveramics, menu photos for espresso/sandwich/pasta/workshops) and 3 are AI-generated via OpenRouter (`backend/uploads/rewards/`: single-origin-beans, drip-coffee-bags, house-blend-beans — textless, café-styled). Seeder `seed_loyalty.py` carries `image_url` per reward (upsert preserves it; fresh DBs get images too). Reward edit form already supports image upload.
- **Admin rendering bug**: `/rewards` used Next `<Image>` — the optimizer fetches server-side where `/uploads` doesn't exist (Caddy serves it, not the Next server) → all thumbnails broken. Switched to plain `<img>` like every other admin page. Rule: **never use next/image for `/uploads` paths in these portals**.
- **`/api/rewards/catalog` is now PUBLIC** (was `ActiveCustomer` — guests got "Failed to load rewards" on the PWA rewards page, which is guest-allowed). Browsing the catalog needs no account; redemption still requires auth. Verified: guest sees all 13 rewards with images on PWA.

### Marketing section audit + E2E residue root fix (2026-07-25)
- **Residue found & cleaned**: 5 "E2E Campaign" + 3 "E2E Test Voucher" rows (all active) from test runs.
- **Root fix 1**: campaign DELETE failed with `NotNullViolationError` on `campaign_analytics.campaign_id` — the ORM NULL-ed the FK before the DB `ON DELETE CASCADE` could fire. Relationship now `cascade="all, delete-orphan", passive_deletes=True` (`models/marketing.py`) — delete works and cascades. The e2e test (which had deletion deliberately omitted with a comment) now deletes + asserts analytics gone.
- **Root fix 2**: `test_customer_voucher_reward.py` never deleted its voucher definition → wrapped in try/finally with `DELETE /admin/vouchers/{id}` (skip paths still clean up). Verified: both tests pass and leave ZERO residue.
- **Promo Banners admin list**: thumbnails added (plain `<img>`, same `/uploads` rule as rewards) and the status badge is now date-aware — date-expired banners show red "Expired" instead of a misleading green "Active" (PWA already filtered them out by date; this was admin-display only).
- Other marketing pages verified healthy: vouchers (+report), surveys (+report), referrals (+settings), check-ins (+settings), campaigns (+settings), lucky draw (segments 70/30 weights, spin history) — no crashes, no broken images.
- Sweep: 14 passed (marketing/voucher/promo/reward).

### Check-in rewards config seeded + stats fix (2026-07-25)
- The 4 check-in config keys existed only as code defaults (admin settings page had nothing to read/write). Seeded into `platform_config` via `seed_platform.py`: `checkin.daily_base_points=10`, `checkin.streak_increment=2`, `checkin.streak_7day_bonus=20`, `checkin.max_streak_days=7` (≈RM0.50/day, RM2.10 on day 7 at 1pt=RM0.05; a perfect 7-day week = 132 pts ≈ RM6.60).
- **Flow verified live**: day 1 → 10 pts; day 7 (seeded 6-day history) → 42 pts (10+12+20); day 8 → resets to streak 1 (10 pts); duplicate same-day → 409; loyalty balance/ledger updated; status endpoint echoes config + state.
- **Bug fixed**: admin check-in stats "today" compared full timestamp to a bare date (`checkin_date == today`) — only check-ins exactly at 00:00:00 counted, so Today always showed 0. Now `func.date(checkin_date) == today` (verified 0 → correct count).
- Admin pages verified: Daily Check-ins list + KPIs, Check-in Settings shows seeded values (editable). E2E checkin suite 3 passed; verification customers cleaned.

### PWA check-in + lucky draw verified live (2026-07-25)
- **Check-in PWA page**: renders streak progress (D1–D7 dots), reward tiers from the seeded config (10/2/20/7), "Check In Now" → "✅ You're checked in! +10 points earned" → streak advances to 1/7. Verified logged in as demo customer.
- **Lucky draw PWA page**: wheel renders both segments (RM5 Off 70% / Free Drink Upgrade 30%), guest view prompts "Sign in to spin", logged-in full flow verified with a fresh customer: SPIN → wheel animation → "You won!" modal with real voucher code (WELCOME-EA129259, 70% segment) → voucher active in wallet → "0 spins left — come back tomorrow" state correctly locks the button. Admin Lucky Draw page shows the win in Recent Spins (cleaned after verification).
- The "internal error" reported during this round was most plausibly a transient 502/500 while the backend was restarting mid-fix (several restarts happened today). No persistent error found anywhere: all PWA pages + both flows pass.
- E2E checkin+lucky sweep 3 passed.

### Lucky draw draw types + segment cap (2026-07-25)
- **Campaign fields** (alembic `d4e5f6a7b8c9`): `draw_type` (`free_daily` default / `ticket_spend`), `spend_per_ticket_cents` (default 5000 = RM 50), `max_segments` (2–12, default 8 — segment creation 400s past the cap).
- **Type 1 free_daily**: unchanged (N free spins/customer/day).
- **Type 2 ticket_spend**: tickets earned from spending — per-order floor (`floor(total_amount / spend_per_ticket)`), granted **on payment captured** via 3 hooks: `services/payment._sync_order_payment_status` (PWA online + webhooks), POS order create (cash/card), POS order payment update (incl. wallet). Grants idempotent via `uq(campaign,order,seq)` (pg insert on-conflict-do-nothing). Refunds do NOT claw tickets back. Tickets campaign-scoped (die with campaign).
- **Spin**: type 2 consumes oldest ticket (row lock; race-safe rollback → 429). NOTE: app runs `autoflush=False` — post-consumption counts must derive from pre-checked values, not re-queries (fixed a `tickets_remaining` off-by-one that way).
- **Admin** (`/marketing/lucky-draw`): Draw Type select with conditional fields (spins/day ↔ spend-per-ticket RM), max segments input, ticket KPIs (issued/consumed/available/holders via `GET /admin/lucky-draw/campaigns/{id}/ticket-stats`), segment "x of N" counter, Add disabled at cap.
- **PWA** (`#lucky-draw`): type 2 shows "🎟️ Spend RM50 = 1 draw ticket" explainer (guests too), "N draw tickets left", "Earn tickets by spending" empty state; type 1 unchanged. Verified live: guest view, authed spin (2→1 tickets), win modal, wallet voucher.
- **E2E** `test_lucky_draw.py`: free_daily regression, max_segments 400, full ticket flow (order→2 tickets→2 spins→429→stats), all cleanup via conftest DSN.

### Translation: manual-edit protection + F&B prompt context (2026-07-26)
- **Root cause of "edit reverts overnight"**: admin translation edits (PUT `/admin/translations/{id}` and `/upsert`) never flipped `is_auto_translated` off, so the weekly DeepSeek review (which only touches auto rows) re-translated human edits back. Both endpoints now set `is_auto_translated=false` when `translated_text` changes — admin edits are now protected. (The Translations UI's per-record editor on menu/event pages already had this via a different path; the generic endpoints were the gap.)
- **F&B context in DeepSeek prompts**: the shared service prompt (`services/translation._call_deepseek` — funnels ALL content translation: menu, categories, event cards, allergens, bundles) had zero context and produced literal traps ("Beyond Coffee" → 咖啡之外/"outside coffee"). New `FNB_CONTEXT` block: halal Turkish coffee house in Pavilion KL, F&B menu vocabulary, keep brand + Turkish dish names (Gozleme/Pide/Baklava/Kahve/Meze/Shakshuka/Simit), "Beyond Coffee" = non-coffee beverages category, beans ≠ nuts, shot = espresso shot. Review prompt (`review_translations.py`) strengthened with the same rules. Verified live: zh → 非咖啡饮品, ms → Minuman Bukan Kopi, ta/tr also correct.
- **`translation_cache` TRUNCATEd once** (5,495 rows) — it served stale pre-improvement translations; cache rebuilds on demand. Rule: after prompt changes, purge the cache or old answers shadow the new prompt.
- Restored the user's manual fix (`menu_categories.2` zh = 非咖啡饮品, marked manual).

### Full translation audit ×4 locales + PWA menu locale bug (2026-07-26)
- **AI review ran across the menu** (453 rows × 4 locales, F&B prompt): 53 fixes — zh 5 (煎蕊 cendol, Nutella kept, Omakase kept), ms 14 (Ayam Suwir→Carik, Pilihan→Kustomisasi everywhere), ta 18, tr 16.
- **Manual consistency pass** (row-by-row review can't judge cross-row consistency — all marked manual/protected):
  - Beyond Coffee: zh 非咖啡饮品 (user's, protected), ms Minuman Bukan Kopi, ta காபி அல்லாத பானங்கள், tr Kahve Dışı İçecekler (review) — all 4 correct now.
  - Baklava normalized per locale: zh 巴克拉瓦N件装 (was 果仁蜜饼/巴克拉瓦 mixed), ta பாக்லாவா (was 2 transliterations), tr "Baklava Seti N Adet" (was 4 order/casing styles incl. 6'lı/8'li), ms lowercase "keping".
  - Add-ons & Customizations zh: 附加组件与自定义设置 (software terms!) → 加料与定制; Single Origin Bean zh ×21 rows: 单品豆 → 单品咖啡豆.
  - User's older manual ms fix ("Biji Single Origin") was overwritten by a *better* value ("Biji Kopi Asal Tunggal") before manual protection existed — kept; manual edits are protected now.
- **MAJOR bug found**: global `/menu/categories` + `/menu/items` accepted `locale` but never translated — the PWA MenuPage uses those, so customers NEVER saw menu translations (only `/menu/stores/{id}` translated). Both endpoints now merge translations (categories, items, modifier groups + options). ALSO `/menu/items` defaulted `limit=20` — PWA showed only 20 of 163 items alphabetically. Cap raised to 500 and MenuPage fetches `limit=500`. Verified live: full 163-item menu renders in zh end-to-end (categories + items + descriptions + modifiers localized).
- Content namespace review running (help/product/allergens 11/promo 7 fixed so far); admin-ui/pwa-ui/staff-ui reviews chained behind it (background, ~3h — idempotent, only applies fixes).
- **Content prompt added to review script**: menu → F&B menu prompt, admin-ui/staff-ui/pwa-ui → dashboard prompt, all other namespaces (events/promos/cards/vouchers/rewards/help/content) → new customer-facing content prompt (F&B marketing rules).

### Survey promo flow fixed end-to-end (2026-07-26)
- **Was broken in 3 places**: all 3 survey-type promo banners had `survey_id=NULL` and `voucher_id=NULL` (PWA never loaded questions, claim 400'd "No voucher linked"), and the claim endpoint didn't gate on survey completion at all (anyone could claim without answering).
- **Fixed**: created 2 surveys (new-menu-vote, store-review; Post-Order Feedback existed) with questions ×4 locales; created 3 voucher definitions (SURVEY-RM5 RM5 off, NEWMENU-10 10% off, REVIEW-FREEDRINK RM18 off); linked banners 38/39/40. Claim now 400s "Please complete the survey first" for survey banners until the customer has a SurveyResponse. Verified full flow: status → gate blocks → submit → claim → voucher active in wallet → status flips.
- **Backend bug**: `POST /admin/surveys/{id}/questions` 500'd on EVERY create — the schema's `options` convenience field isn't a model column but got dumped into `SurveyQuestion(**dump)`. Now excluded + folded into answer_options.
- **Seeder consistency**: `seed_content.py` PROMO_BANNERS now carry survey_key+voucher_code and resolve both; SURVEYS includes all 3; `_upsert_survey` auto-translates questions after its delete+reinsert (was orphaning translation rows to deleted question ids on every re-seed). seed_loyalty.py seeds the 3 survey vouchers. All idempotent (verified re-run).
- E2E survey+promo sweep 7 passed.

### Lucky draw spin interval — free grant cadence (2026-07-26)
- Owner request: the free grant shouldn't be fixed at 1/day — make it per-interval (1 ticket per day / per week).
- `lucky_draw_campaigns.spin_interval_days` (alembic `e5f6a7b8c9d0`, default 1, >= 1): the free_daily type now grants `spins_per_day` free spins per ROLLING window of N days (1 = daily, 7 = weekly, 30 = monthly). Counting is a rolling window (`created_at >= now - interval`), not calendar-day — `next_spin_at` on 429 = last spin + interval.
- Admin form: "Free spins per interval" + "Days per interval" (1 = daily, 7 = weekly, 30 = monthly) — shown only for free_daily. PWA empty state is interval-aware ("come back tomorrow" vs "come back later" when interval > 1).
- NOTE: spins_per_interval can't be 0 (grant must be ≥1 — 0 would be ambiguous: unlimited vs none; to stop free spins use is_active=false or ticket_spend type).
- Verified live: set 1/week → fresh customer 1 remaining → spin ok → 429 with next_spin_at exactly +7d → restored to daily. E2E 3 passed.
- ticket_spend recap (user asked "linked to purchase $$ = how many tickets"): every RM X of PAID purchase = floor(total/X) tickets, X = campaign spend_per_ticket (default RM 50). RM 120 order → 2 tickets.

### Reports / audit-log / settings / admin-user audit (2026-07-26)
- **Reports page silently ignored its date range**: the frontend sent `date_from`/`date_to` but the endpoint only reads `from_date`/`to_date`, so every "custom range" showed the same daily numbers. Fixed param names, and the summary cards now use the ranged fields (`total_revenue`/`total_orders`) when dates are set, daily fields otherwise. Backend revenue sums now count `payment_status='captured'` only (was including pending/failed). Verified live: 07-25→07-26 = RM 36.00 / 73 orders / AOV 0.49.
- **Audit Log page**: verified working (20 entries, clean table) — no changes.
- **Admin Users**: `store_assignments` had duplicate rows (store1 assigned 4× to the same principal) — deduped in DB, and `seed_staff.py` now links the admin principal's stores OUTSIDE the staff loop with a `WHERE NOT EXISTS` guard (re-run verified idempotent). Store name typo fixed: "Loka Loka Cafe (KLIA1)" → "Loka Cafe (KLIA1)" in DB + `seed_stores.py`. Subtitle "1accounts · 9roles" → "1 accounts · 9 roles" (separators live in JSX, not in translation values); `admins.accounts`/`admins.roles` values cleaned to bare words in all 5 locales.
- **Settings — the "bypass shows Disabled" bug had TWO causes**: (1) `otp.bypass_enabled` was seeded `is_sensitive=true`, so the API masked its value; set to false in DB + `seed_platform.py` (bypass itself stays ON for dev on purpose — only disabled at go-live). (2) The real root cause for ALL booleans: `config_value` is JSONB and the API returns typed values (`true`, `5`, `"MYR"`), but the page declared `string | null` and compared `editValue === "true"` — every true boolean rendered "Disabled" (auto_confirm too), and non-editable booleans rendered blank. New `normalizeConfigs()` stringifies values on both fetch paths in `settings/page.tsx`. Verified: bypass_enabled + auto_confirm now show Enabled.
- **Settings section headers** rendered raw `settings.section_*` keys — added the 14 missing keys (EN direct + DeepSeek fill ms/zh/ta/tr).
- **PWA outage found during audit**: `customer-pwa/.next` had no BUILD_ID and pm2 was crash-looping (2700+ restarts) — app.loyaltysystem.uk was 502. Root cause: the lucky-draw interval commit left `spin_interval_days` missing from the `LuckyDrawCampaign` interface in `LuckyDrawPage.tsx`; the next `next build` wiped `.next` then failed type-check, leaving no production build. Type fixed, rebuilt + restarted, back online. Lesson: after ANY frontend edit, run the build to green before walking away — a failed build leaves the site down, not just stale.

### UI translation review completed — all 3 apps (2026-07-26)
- Full DeepSeek review sweep finished: **admin-ui 404 fixes, pwa-ui 246, staff-ui 144** (~800 total across ms/zh/ta/tr). Spot-checked samples: placeholders (`{seconds}`) preserved in all locales, F&B/staff domains translate naturally (打卡, 损耗, Daftar Masuk, குப்பை அறிக்கை, etc.).
- One miss fixed manually: pwa-ui `common.welcome` ta was left as English "Welcome" → நல்வரவு (marked `is_auto_translated=false` so the weekly review won't revert it).
- Logs: `backend/logs/translation_review_20260726_*.log`.
- **Store rename didn't propagate to translations**: fixing `stores.store_name` in the table doesn't touch `translations` rows — ms/tr/zh/ta kept serving "Loka Loka Cafe (KLIA1)". Fixed manually + protected. Rule: any renamed entity (store, category, item) needs its `translations` rows updated too, or non-EN locales keep the old name.
- **Full translation coverage verified live (2026-07-26)**: 0 empty rows in all 23 namespaces × 5 locales; public API serves pwa-ui 1003 / staff-ui 751 / admin-ui 2732 keys per locale with EN fallback; "same as EN" remainders are all legit (tier names Bloom/Origin/Reserve, Vegetarian/Vegan/Halal loanwords, SST, store proper nouns).

### Translations page gaps + menu F&B trap sweep (2026-07-26)
- **Root cause of "many fields not translated" on /translations**: (1) `PwaTranslationsTab` had a HARDCODED section list — DB key groups added later (luckyDraw, workshops, guestPay, pos, checkin, shared, *_page, …) were invisible on the page, so their keys never got managed. Sections are now derived dynamically from fetched keys (same as AdminTranslationsTab). (2) Keys held in variables/arrays (`labelKey`, `localeKey`, `fieldKey`) are invisible to the sync scanners, which only catch direct `t("…")` calls — 56 genuinely-used keys were missing from the DB (translations tabs ×6, twilioVerify ×6, customers.field_* ×8, locale.* ×5, notifications.field/type ×10, admin nav luckyDraw, pwa ×17, staff ×3). All inserted (EN) + DeepSeek-filled ×4 locales. A literal-diff script (extract dot-namespaced string literals from all 3 portals, diff vs DB) is the way to find these — save for reuse.
- **Menu F&B trap sweep**: word-boundary scan across all menu translations found 31 rows the AI review had judged acceptable: ms "Tembakan Tambahan" (gunshot!) for Extra Shot, "Tandatangan"/ta "கையொப்ப" (autograph) for Signature, ms/tr "Kotor"/"Kirli" (filthy) for Dirty Latte/Matcha → kept as loanwords, ms "krim putar"→"krim pukal" (whipped cream, ×10 rows), "tajam" (blade) for sharp cheese→"kuat" (×3), "Salad Taman"→"Salad Garden", "herba taman"→"herba segar", "ditarik"→"diregang" (stretched dough); zh "附加组件" (software!) → 加料 normalized everywhere (incl. 额外浓缩（加料）, 豆浆（加料）), 脏拿铁→脏脏拿铁 consistency. All marked `is_auto_translated=false` (protected) since the review already proved it would keep these. Zero traps remain; zero untranslated-English chunks remain.
- **sync_translations_to_json.py skips EN by design** (en.json is the dev-maintained baseline) — new pwa-ui EN keys must ALSO be hand-added to `customer-pwa/src/locales/en.json` or the file↔DB sync drifts. Done for the 17 keys; PWA rebuilt (all 5 locale files now 1020 keys).
- **"/translations shows unfilled fields" root cause #3 — fetch caps**: the tabs fetch per-locale with fixed `per_page` — Staff tab used **200** (staff-ui has 754 keys → 554 invisible!) and Admin tab 2000 (admin-ui 2768 → 768 invisible). All 3 tabs now use `per_page=5000` (the endpoint's max; if a namespace ever approaches 5000 keys, switch to paged fetching). Verified: staff grid fully populated ×5 locales, admin 2768 / staff 754 / pwa 1020 all returned in one page. Also humanized section names (underscores/dashes) on the Admin tab.
- **Translations split into 3 sidebar pages** (owner request): `/translations` (redirects to pwa) + `/translations/pwa`, `/translations/admin`, `/translations/staff`. Sidebar Translations item is now expandable with 3 children reusing `admin.translations.tab.*` keys (already ×5 locales). Shared chrome lives in `components/TranslationsPageShell.tsx` (header + optional Sync-to-JSON + how-it-works footer); Sync button is on the PWA page only. `TranslationTabs.tsx` deleted.
- **Sync-to-JSON is now scheduled**: cron Sun 05:41 (after the 03:17 menu review) runs `scripts/sync_translations_to_json.py` — writes DB→PWA locale JSONs, bumps version.json (forces client translation refresh), rebuilds + restarts PWA. Manual button remains on `/translations/pwa` for ad-hoc syncs. Both the button endpoint and the script do the full rebuild+restart cycle.

### Customer pages audit + lucky-draw ticket verification (2026-07-26)
- **Lucky-draw ticket system verified end-to-end** (temporarily flipped campaign 2 to ticket_spend, granted 2 test tickets, reverted): grants fire from payment completion + staff order completion; PWA shows "Spend RM 50 = 1 draw ticket" + "N draw tickets left" + spends a ticket per spin; admin page shows Tickets Issued/Consumed/Available/Customers-Holding KPI cards when draw_type=ticket_spend. Only ONE campaign is active at a time (`/lucky-draw/active` returns a single campaign) — ticket mode activates by switching the campaign's draw type. PWA ticket keys (ticketsLeft/spendToEarn/earnBySpending) exist ×5 locales.
- **Customer pages**: /customers works; /customers/consents and /customers/devices show 0 rows by design — consent rows are created on marketing opt-out/admin action, device rows on PWA push registration; neither flow has run on dev data yet. Not bugs.
- **Count-label spacing fixed properly**: "353customers"/"20of353customers"/"0records"/"0devices" were fragment-concatenated JSX (`{n}{t(...of)}{m}...`) — replaced with single placeholder keys (`customers.total_count`, `customers.showing_of_total`, `customers_consents.total_records`, `customers_devices.total_devices`) so locales can reorder words.
- **PLACEHOLDER SYNTAX RULE: admin portal uses `{{name}}` (double braces), PWA + staff use `{name}` (single).** First fill produced `{count}` for admin-ui and rendered raw — caught by verification. Filler/review prompts and any hand-written admin-ui values must use double braces.

### Notifications / feedback / help audit (2026-07-26)
- **Notifications**: list/templates/report pages all work; list is empty on dev (no notifications sent yet) — expected. Templates Welcome + Order Ready seeded.
- **Feedback**: 23 identical anonymous 5★ rows ("Great coffee and friendly staff!") were leftover e2e junk — the public submit endpoint allows anonymous guest feedback BY DESIGN, and `cleanup_e2e_test_data.py` only deleted rows with a customer_id, so anonymous rows accumulated. Junk deleted; cleanup script now also removes anonymous rows with known test bodies. "Customer #null" display fixed: anonymous rows now show localized "Guest" (`feedback.guest`).
- **Help Center**: renders article groups + audience selector correctly; no issues.
- More fragment-concatenation count labels replaced with placeholder keys: `notifications.total_count/showing_of_total/page_of`, `notifications_templates.subtitle_count/total_count`, `feedback.showing_of_total/page_of` (all {{name}} admin syntax, ×5 locales).

### Help center content regeneration (2026-07-26)
- All help articles were frozen at 2026-07-21 (pre lucky-draw/workshops/bundles/surveys/translations-split). 10 guide markdown files rewritten, each verified against current code by two agents: admin marketing (all 13 sidebar pages incl. lucky draw), loyalty (real Bloom/Origin/Reserve ladder, BYOT 2×/3×, welcome_reward_type points/voucher/points_and_voucher), translations (3 pages, crons, {{}} vs {} placeholder rule), menu (experiences/workshops + bundles + category lock), settings (real prefix groups, OTP go-live sequence); staff pos-checkout (2-stage Send-to-Kitchen→Unpaid-drawer flow, workshop phone rule) + reservations (two-systems table); customer promotions (lucky draw tickets, survey-claim gating) + reservations-and-events; FAQ refresh.
- Workflow: edit `v3/guide/**.md` → `seed_help_articles.py --yes --force-prod` (upserts by slug) → `translate_missing_content.py --yes --force-prod` (purges stale + refills; 376 help translations written).
- **Real bug found during doc review**: promo banner forms saved `action_type="survey_claim"` but PWA + claim gate check `=="survey"` — admin-created survey banners would never gate. Fixed in all 3 promo pages (list/edit/new), added missing `detail` (Display Only) option, badge map updated. No DB rows affected (seeds already use "survey").
- Doc-verified notes: PWA `#workshops` page has no profile-menu entry (reached via event buttons/direct link); reservations "Order" button passes ?table=&type= but POS only reads ?checkout (documented around it).

### Store Operations section audit (2026-07-26)
- All 18 ops pages audited (orders/reservations/tables/inventory×6/equipment×2/hygiene/staff×5). Functional issues fixed:
- **Systemic count-label bug portal-wide**: ~60 spots in 41 files concatenated `{n}{t("…")}` ("84orders") — batch-fixed with JSX space (correct for number-noun in all 5 locales). Split-fragment phrases ("X of Y", "Page X of Y") replaced with proper placeholder keys: shared `common.showing_of_total` / `common.page_of` / `common.page_of_total` + page-specific `orders.showing_of_total`, `equipment_reports.page_of_total`, `surveys_report.showing_page_of`, `vouchers_report.summary`, `admins_roles.roles_permissions_count`. RULE for future pages: never concatenate `{n}{t()}` or `{t()}{n}{t()}` — use a placeholder key.
- **66 junk suppliers** ("E2E Item Supplier xxxx") deleted; `cleanup_e2e_test_data.py` now covers `suppliers` (HARD_DELETE + purchase_orders reference check) — it never cleaned them before.
- **Equipment list**: added Store column (per-store equipment looked like duplicates) + fixed overlapping filter selects (dead Tailwind classes `border rounded px-3 py-2` — NO Tailwind in this portal; use the standard inline select style. Other pages with the same classes also carry real inline styles so they're fine).
- Empty-by-design pages (reservations, stocks, movements, POs, tables, shifts, attendance) work — they need store selection or have no data yet.

### Store Ops deep pass + test-data seeding (2026-07-27)
- **New seeder `backend/scripts/seed_ops_test_data.py`** (idempotent, `--yes --force-prod`): 2 suppliers, 9 inventory items (real F&B: beans/milk/syrup/croissant + disposables + cleaning), 18 stock records ×2 stores + opening movements, 2 POs (received + draft — mind `chk_po_actual_after_expected`: actual ≥ expected), 5 reservations (enum is `requested` NOT `pending`), 7 shift assignments (`planned_start/end` are datetimes), 5 clock in/out events. Also purges E2E junk in those tables on each run.
- **Table QR "EXPIRED" bug**: the frontend had a self-invented 30-minute expiry (QR_EXPIRY_SECONDS) that hid QR images and badged every table EXPIRED — the backend validates ONLY the token, which is permanent until regenerated. Removed the frontend expiry gating (badge, image filter, countdown timer, `useQrExpiry` prop chain); tables now show Active + always-rendered QR.
- **List-endpoint enrichment pattern**: list endpoints return model rows without joins, but pages expect names — fixed 4 spots the same way: PurchaseOrderOut +supplier_name/items_count, MovementLogOut +item_name, TimeEventOut +staff_name (admin AND staff list — identical blocks, edit both).
- **SupplierOut.lead_time_days was `int` while the column is nullable** → suppliers endpoint 500'd whenever any row had NULL. Now `int | None`.
- E2E junk purged this round: 22 stock rows, 11 inventory items, 23 shift templates, 21 "Verified via E2E" clock-ins (in addition to the 66 suppliers earlier). Cleanup script now covers suppliers + anonymous feedback; inventory_items/shift_templates/staff_time_events junk is handled by the seeder cleanup step.
- Verified live: all 18 ops pages render real data correctly; 6 e2e passed on touched endpoints.

### Refunds & reservations flow verification (2026-07-27)
- **CRITICAL: POS cash payments never set `captured_amount`** (staff_ops.py Payment() — only `status="captured"` + amount) → refundable balance = 0, so ALL cash POS refunds failed validation. Fixed at creation + backfilled 5 legacy rows (`UPDATE payments SET captured_amount = amount WHERE status='captured' AND captured_amount=0 AND provider IN ('cash','internal_wallet','store_credit')`). Dashboard revenue was unaffected (sums `Order.total_amount`).
- **Cash refunds now auto-complete**: `refund_payment` marked wallet refunds completed but left cash "pending" forever (no provider webhook exists for cash). Cash/store_credit/wallet now complete immediately (money handed back at the counter). Stripe/HitPay refunds still go through the real provider when enabled, simulated `re_sim_*` pending on dev.
- Verified end-to-end: partial refund RM5 → payment partially_refunded + refund listed; over-refund rejected with exact remaining balance; cash refund completes immediately; refunds page renders order/amount/reason/status.
- **Reservations flow verified end-to-end**: customer POST /reservations → requested → admin PATCH confirm → seated → customer DELETE → cancelled_by_guest. 8 e2e passed (refunds + reservations). Reservation status enum: requested/confirmed/seated/no_show/cancelled_by_guest/cancelled_by_merchant/completed.

### Refund deep audit + hardening (2026-07-27)
Verified whole flow: wallet refunds credit the wallet via `_credit_wallet_for_refund` (ledger entry), `_sync_order_payment_status` recomputes order payment_status (refunded/partially_refunded), payment events recorded, over-refund rejected with exact remaining balance. Two gaps fixed:
- **No idempotency → double-click created duplicate refunds** (verified 2×RM3 both 201). `refund_payment` now rejects an identical refund (same payment+amount+reason) created within 60s with 409. Verified: repeat → 409, different amount → 201.
- **Refunds wrote NO audit_log entries** — now writes `action=create, resource_type=refund` with payment/order/amount/reason/provider/status in changes_summary.
- OPEN POLICY QUESTION (owner to decide): **loyalty points + annual spend are NOT clawed back on refund** — a customer keeps points earned on a refunded order (farming risk: buy → refund → keep points). Lucky-draw tickets likewise not clawed back (documented design). No customer notification is sent on refund (nice-to-have).

### Inventory / Equipment / Hygiene audit (2026-07-27)
- **CRITICAL: POST /admin/inventory/movements 500'd on every call** — `stock.current_stock` (Decimal) + `quantity_delta` (schema float) = TypeError. Stock adjustments never worked. Fixed with explicit Decimal conversion (same trap class in 3 spots — RULE: DB numerics are Decimal, never mix with schema floats in arithmetic).
- **PO receive never incremented stock** — receiving only updated line quantities + PO status. Now books the newly-received delta (partial → follow-up receives don't double-count): increments `inventory_stock` (row-locked, auto-creates the stock row) + writes `inventory_movement_log` entries (type `in`, `reference_type='purchase_order'`). Verified: PO receive +10 → stock 9995→10005 with movement.
- **PO status filter dropdown had dead values** (submitted/ordered/partially_received) — DB CHECK constraint allows draft/sent/partial/received/cancelled. Fixed + keys added.
- Equipment CRUD + maintenance logs verified (create/log/delete). Hygiene chain verified end-to-end: staff submits garbage report with photo (staff PIN flow incl. must_change_pin enforcement — staff1 PIN was changed and restored to 123456) → report lands pending on admin page with image → admin verifies inline (Verify/Flag + notes).
- `PATCH /stocks/{id}` adjusts levels WITHOUT a movement log (by design for direct corrections) — prefer POST /movements for auditable adjustments.
- E2E interference note: running pytest re-junks stock values (10000) — the ops seeder only inserts missing rows, so e2e-created rows keep their values. Re-run `seed_ops_test_data.py` to clean again if the pages look junked.

### Staff section audit — time clock / shifts / attendance (2026-07-27)
- **Clock in/out works**: POST /staff/time-events?event_type=… (clock_in/out, break_start/end, overtime_start) with lat/long + device info; literal-validated. Staff time-clock page is state-aware (out→in→break) so the UI prevents double clock-ins; the backend accepts them (harmless with last-event-wins state). NOTE: `overtime_end` does NOT exist as an event type — overtime tracking is start-only for now.
- **Attendance Verify button was broken ×2**: frontend sent `{}` to an endpoint requiring `{"approved": bool}` (422 on every click), and the badge read `verified_at` which the API never returns — the backend model is `approved_by`. Fixed: `verifyTimeEvent()` sends `{approved:true}`, badge keys off `approved_by != null`. Also typeBadge used `start_break/end_break` but API event types are `break_start/break_end`.
- **Admin attendance page shows staff names** (TimeEventOut.staff_name enrichment from earlier round). Verify flow: admin clicks Verify → approved_by=admin.id (+ optional notes).
- **Missing staff-ui status keys**: `staff.status.clock_in/clock_out/break_start/break_end/overtime_start` added ×5 locales — the Today list on the staff time-clock page showed raw keys. `staff.status.${event_type}` is a dynamic key family — new event types need matching keys.
- Shift templates + assignments verified (create/assign; overnight 22:00→06:00 handled correctly). Roles Perms editor uses the admin-auth permission endpoints (22 permissions).
- Test artifacts cleaned (double clock-in, break/overtime probes); staff1 PIN changed and restored to 123456 during hygiene testing earlier.
