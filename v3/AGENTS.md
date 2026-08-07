# FNB Super App v3 — Agent Notes

*Last updated: 2026-07-30*

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
| Kitchen Staff (kitchen@loyaltysystem.uk) | kitchen123, PIN 123456 | Staff — kitchen display, wastage, inventory, hygiene (Store 1) |
| Store Manager (manager@loyaltysystem.uk) | manager123, PIN 123456 | Staff — all ops pages incl. staff mgmt (Store 1) |
| demo@lokaespresso.my | +60123456001 | Customer PWA (RM50 wallet) |
| vip@lokaespresso.my | +60123456002 | Customer PWA (RM200 wallet) |

(Kitchen Staff + Store Manager seeded 2026-07-25 via `seed_staff.py` EMP004/EMP005 for role-gated page testing; PINs verified working as 123456 on 2026-07-29 — an earlier note claiming 654321 was stale. Other seeded staff still get the `must_change_pin` flow on first login.)

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
- Alembic head: `k1e2f3a4b5c6` (token_version session revocation, round 35). Fresh docker deploys: `infra/db/01-07` + generated `09_schema_sync.sql` + `10_seed_data.sql`; regenerate 09 with `v3/scripts/dump_schema_sql.py` after model changes; `Dockerfile.backend` also runs `alembic upgrade head` on boot

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
- A recipe referencing an unstocked ingredient BLOCKS the order with a clean 400 ("Insufficient stock for X") — fixed a POS-path gap where `OrderError` escaped as a 500 (`staff/pos.py` now catches it). The starter stock (1000/store) exists precisely so this never triggers for seeded recipes.
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
- **CRITICAL: POS cash payments never set `captured_amount`** (staff/pos.py Payment() — only `status="captured"` + amount) → refundable balance = 0, so ALL cash POS refunds failed validation. Fixed at creation + backfilled 5 legacy rows (`UPDATE payments SET captured_amount = amount WHERE status='captured' AND captured_amount=0 AND provider IN ('cash','internal_wallet','store_credit')`). Dashboard revenue was unaffected (sums `Order.total_amount`).
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

### Staff section second pass (2026-07-27)
- **Staff login UI verified working** (store picker is a CUSTOM button dropdown — native-select automation fails; drive the `.login-select-option` click instead). Dashboard shows live badges (Tables, Bookings, Not Clocked In).
- **Tips page rebuilt properly**: `TipAllocationOut.staff_id` was `int` — pooled tips (staff_id=NULL from PWA customer tips) would 500 the list; the list also INNER JOINed StaffProfile, silently excluding pooled tips. Now nullable + outer join. Enriched with `staff_name`, `payment_method` (from the order's captured payment), and store derived from the ORDER for pooled tips (was "Store #null"). Page shows Method (Cash) + Distributed By (staff name or "Pooled").
- **Perms button hidden on Staff Roles**: the modal expects staff-portal permissions (kitchen/tables/pos/wallet/time_clock) that were never seeded in `iam_permissions` — and staff access is enforced by role KEY (`useStaffRole` resolves staff_role), NOT `role_permission`. The modal would be permanently empty → hidden with a code comment until staff RBAC is built. Admin-side RBAC (22 permissions) is separate and works.
- New Staff form renders (default PIN shown); shift Template form opens; Assign form gates on store selection (by design). "Default PIN:x(staff…" label spacing fixed.
- Clock-in double-post note: backend accepts duplicate clock-ins (UI prevents them via state machine); overtime_end doesn't exist as an event type.

### Full regression + quick sweep (2026-07-27)
- **Full e2e: 207 passed, 17 skipped, 0 failed** (~6.5 min) after all of today's fixes — no regressions. (Baseline note for future runs: suite was 199 E2E before the 2026-07 feature round.)
- Backend log clean (0× 5xx in last 500 requests). All 6 pm2 services online; all 3 sites + API 200; disk 78%.
- Last adjacency fixes: customer detail lines, bundle form labels, and the `customers_[id].pts_3` junk value ("Pts 3" baked number → "pts" ×5 locales).

### Staff portal section-by-section audit (2026-07-27)
- **15 pages verified**: dashboard (live badges), POS (menu/categories/bundles/customer attach/table scan), Order Queue (payment-state cards), Kitchen KDS (role-gated), Tables, Reservations (Confirm/Seat/No Show), My Shifts, My Tasks, Customer Service (wallet), Inventory (role-gated), Equipment checks, Wastage, Garbage/Grease-trap (role-gated), Help, Profile.
- **captured_amount missing in TWO more payment paths** (same refund-blocking bug as the POS create-order path): `PATCH /staff/orders/{id}/payment` and admin `POST /admin/orders…payment` created captured payments with captured_amount=0. Both fixed identically; all 3 paths now mirror it; zero captured_amount=0 rows remain.
- **PATCH /staff/orders/{id}/status blindly assigned any string → 500 on invalid** ("completed" isn't a status). Now validates against the real order_status set (confirmed/preparing/ready_for_pickup/out_for_delivery/delivered/cancelled_by_*) and sets completed_at on `delivered` (was checking nonexistent "completed"/"cancelled").
- **Role gating is coherent**: OPS pages (inventory/wastage/garbage/grease-trap) = kitchen_staff/shift_supervisor/store_manager; KDS = same; server/cashier denied correctly. NOTE: the garbage/grease API accepts any authenticated staff (UI gates harder) — decide if API should match.
- **Admin staff list "No roles"**: page expected a `roles[]` array but `staff_profiles.role` is a plain string (RoleAssignment is admin-accounts only). Page now falls back to the role string badge.
- **47 junk staff purged** ("Audit Staff"/"Clock Staff" e2e leftovers, patterns added to cleanup script: audit-staff-/clock-staff-/Audit Staff/Clock Staff).
- **i18n pre-hydration trap**: kitchen + orders pages called `t()` in a synchronous mount effect (storeId=0 path) → raw key frozen into the error state. Fixed with a `storeMissing` state translated at render time. RULE: never call t() during mount; translate at render.
- Kitchen/manager accounts can't log in with untouched default PIN (`_pin_allowed` rejects defaults) — for tests, clone a working pin_hash (staff1's PIN is 123456 after a change-cycle).
- Tasks feature is a read-only shell: staff can view/complete, but NOTHING creates tasks (no admin UI, no auto-generation). Seeded 2 demo tasks for staff1. Priority enum: low/normal/high/urgent.
- E2E: 32 passed on staff/kitchen/pos suites after all changes.
- **Hygiene report gating fixed to match intent**: garbage disposal + grease-trap are OUTLET-WIDE duty reports (any staff who takes out garbage or cleans the trap submits photo proof; admin verifies). Pages were RoleGuard'd to kitchen/manager only while the API accepted everyone — now both pages use `canReportHygiene` (any authenticated staff). Grease-trap form takes BEFORE + AFTER photos (max 5 each); garbage takes up to 8 task photos.
- **Language selector round-trip bug (staff portal)**: the selector was an UNCONTROLLED native select (`defaultValue`) — after switching locale + reload, SSR re-rendered defaultValue=en while localStorage said zh, so the previous locale couldn't be re-selected (no change event on an already-en DOM select). Now a controlled select synced from localStorage post-mount. Verified en→zh→en round trip. Admin portal (React-state i18n) and PWA (button/modal selector) never had the issue. Also added `dark` variant for the staff header selector (was dark-on-dark text).

### Staff portal final sweep (2026-07-27)
- **Wastage endpoint was fully broken** (500 on every call): Decimal+float in both paths — inventory-item path (`stock.current_stock + delta`) and menu-item path. Menu path also lazy-loaded `menu_item.recipes` outside async context (MissingGreenlet) AND treated ORM recipe objects as dicts (`recipe.get`). All fixed: eager `selectinload`, ORM attribute access, Decimal math. Verified: inventory waste deducts stock + logs movement; menu waste works (empty recipes → no deductions, per the recipe-independence design).
- Equipment daily-check submit works (form fields: status_field + description, optional photos). Customer search (wallet page) works.
- Backend log: no 5xx except the test-caused ones fixed above. E2E 53 passed (waste/equipment/customer suites).

### Staff Tasks feature + recurring (2026-07-27)
- **Admin Tasks page** (`/staff/tasks`): create/assign tasks (title, description, staff, priority low/normal/high/urgent, due date), start/complete/delete actions, store+status filters. Sidebar Staff section now has 6 children. 37 translation keys ×5 locales.
- **Recurring tasks**: new `staff_tasks.recur_interval_days` (alembic `f6a7b8c9d0e1`, NULL=one-off, N=repeat every N days). Completing a recurring task auto-creates the next occurrence (due_date + interval) — verified: daily grease-trap task completed → next day's copy appeared pending. Recurrence shown as "Every day/week" badges.
- **Route-ordering trap**: `GET /admin/staff/{staff_id}` was registered BEFORE `/admin/staff/tasks` → "tasks" parsed as int staff_id (422). Tasks routes moved above all `/{staff_id}` routes. RULE: literal path segments must be registered before path params in the same router.
- StaffTaskOut enriched with staff_name/store_name for the page.
- Help guide (admin/staff.md) documents the Tasks page + recurring behavior; help re-seeded.
- Seeded: daily "Clean grease trap", weekly "Deep clean espresso machine (weekly)" duty tasks.

### POS improvements (2026-07-27)
- **Delivery tab removed from POS** — in-store ordering is dine-in/takeaway only (delivery is a PWA customer-app flow). Was just a tab in the order-type selector; no dependent UI.
- **Customer phone at POS**: the search field already handles it — staff type the phone; existing customers appear; if none, "+ Add new customer by phone" quick-adds (name + phone via /staff/customers/find-or-create). Placeholder changed to "Search or add customer by phone…" (×5 locales) so staff know. Workshops REQUIRE an attached customer (phone = identity anchor); menu orders are optional.
- **89 junk unpaid orders purged** (Unpaid drawer 93→5): auto-created phone-only e2e profiles with no captured payments. Purge added to cleanup_e2e_test_data.py (scoped: name=phone, empty email, unpaid only — never touches captured orders or named customers).

## POS Split Bill (Phase 1 of POS gap-closure plan)

- `payment_line_allocations` table (alembic `g7b8c9d0e1f2`): which line items/qty each payment covers. `PaymentLineAllocation` model in `backend/app/models/payment.py`.
- Staff `PATCH /staff/orders/{id}/payment` accepts `allocations` (per-item split — charge = pro-rated line totals incl. modifiers) XOR `charge_amount` (even/custom amount split). Guards: item must be on order, per-item allocated qty ≤ ordered qty (prior shares counted from captured/partially_refunded payments), charge ≤ remaining_due. Idempotency key includes running paid total so sequential identical shares pass but exact double-taps 409.
- `GET /staff/orders/{id}/split-state` returns `lines` (NOT `items` — the staff-portal api wrapper auto-unwraps any payload key named `items` into a bare array).
- Full refund of a split payment (status → refunded) re-opens its line items for payment in split-state; partial refunds keep them paid.
- Admin: `GET /api/payments?order_id=` includes `allocations` per payment (batched join, names from `OrderLineItem.item_snapshot`); order detail page shows a "Covers" column ("Full bill" when no allocations).
- Staff POS: `PosSplitBillSection.tsx` (Full Bill / By Item / Evenly), checkout stays open after a partial share with "X of Y paid" header.
- e2e: `e2e-tests/test_pos_split_bill.py` (3 tests: by-item, even shares, refund re-opens share).
- FIXED pre-existing bug: staff-portal `request`/`requestRaw` in `src/lib/api.ts` unwrapped any `data` containing an `items` array into a bare array — `getOrderById` returned line items instead of the order (checkout always RM 0). Now only unwraps when `!("id" in data)`. The admin-portal wrapper has the same unwrap but was left as-is (its list callers rely on it).

## POS Cash Drawer Sessions (Phase 2)

- Reuses the existing `pos_sessions`/`pos_terminals` tables (terminals are seeded per store; sessions were never used before this).
- `app/services/pos_session.py` computes the Z-report LIVE from payments on the store's orders in [opened_at, now]: expected = opening_float + cash captured − cash refunds; buckets providers cash/stripe→card/grabpay→qr. `close_session_with_report` snapshots totals + variance into the session row.
- Staff endpoints (`staff/pos_sessions.py`, prefix `/staff/pos/session`): GET `/current` (open session + live figures), POST `/open` (409 if a session is already open for the store — one drawer per store, uses the store's first active terminal), POST `/close`. Roles: cashier/shift_supervisor/store_manager (server is read-only on `/current`).
- Admin `POST /admin/pos/sessions/{id}/close` now uses the same live computation (previously expected = float + a `total_sales_cash` column that was never updated). `GET /admin/pos/sessions` gained a `store_id` filter.
- Staff POS header: `PosDrawerChip.tsx` — chip shows expected cash (or "Drawer closed"), tap for the Z-report dialog with counted-cash input and live variance.
- Admin page `/cash-sessions` (sidebar: Store Ops → Cash Sessions) lists sessions with store/status filters and an inline close action.
- e2e: `test_pos_sessions_merge.py::test_cash_drawer_session_lifecycle`.

## POS Order Merge + Table Occupancy Timer (Phase 3)

- `POST /staff/orders/{id}/merge {target_order_id}`: moves all line items to the target, ADDs totals (same store ⇒ same tax/service config), cancels the source ("Merged into order X"). Guards: not self, neither completed/cancelled, NEITHER may have captured/partially_refunded payments (split-bill allocations would orphan). Does NOT call `reverse_order_effects` — moved workshop lines keep their booked seats (covered by e2e). Frees the source table snapshot if it pointed at the source order.
- `table_status_snapshot.updated_at` is now stamped on every status change (POS dine-in order creation + manual status update) — it drives the occupancy timer.
- `GET /staff/tables` returns `occupied_since` + `current_order_id` for occupied tables (batched snapshot query). Staff tables page shows a duration badge on occupied tables (outline <60m, amber >60m, red >120m).
- Staff kitchen order detail: "Merge into…" card (unpaid, non-terminal orders only) lists other unpaid orders as merge targets.
- e2e: `test_pos_sessions_merge.py::test_merge_orders`, `::test_merge_preserves_workshop_seats`.

## POS KDS Station Routing (Phase 4 — final phase of POS gap-closure plan)

- `platform_config` key `kds.station_map` (value_type `json`, seeded by `seed_platform.py`, `ON CONFLICT DO NOTHING` so admin edits survive reseeds): `{"bar": ["cafe-specialty-coffee","beyond-coffee","frappes","fresh-juices","mixed-juices","beverage","loka-specialty"], "kitchen": ["*"]}`. NOTE: the plan's `beverage-bottled-canned` slug doesn't exist — the real slug is `beverage`; `loka-specialty` (signature drinks) was added to bar beyond the plan. `"*"` = every category NOT explicitly claimed by another station, including uncategorized items (slug NULL matches `*`).
- `GET /staff/orders?station=<name>` (staff/orders.py `staff_list_orders`): only orders with ≥1 line item routed to that station are returned, each with an `items` array limited to that station's lines (`{menu_item_id, name, quantity, category_slug}` — name from `item_snapshot.item_name`). Without `station` the response keeps its legacy shape (no `items` key — asserted by e2e). Unknown station → 400. Filtering happens within the returned page (latest N orders), which is fine for the KDS window.
- Routing is resolved in Python, not SQL: batch-fetch line items LEFT JOIN menu_items→menu_categories for the page's orders, then `slug in wanted` (explicit) or `slug not in claimed_elsewhere` (`*`).
- Staff kitchen page: All / Bar / Kitchen tabs above the status filters; tab switch refetches with the station param (5s polling keeps the active station). Bar/Kitchen cards show the station's items via the existing OrderCard item rendering (All tab unchanged, no items). Mixed orders appear in both tabs with different item subsets — verified live (Espresso+workshop order shows Espresso under Bar, workshop under Kitchen).
- i18n: `kitchen.station_bar` / `kitchen.station_kitchen` ×5 locales in DB (hand-set, `is_auto_translated=false`) + EN fallback keys in `staff-portal/src/lib/translations.ts` (the local pre-hydration bundle — new staff-ui EN keys must be added there too, same trap as PWA en.json).
- e2e: `test_kds_station_routing.py` (bar/kitchen split of mixed orders, 400 on unknown station, legacy shape without station).
- No admin/PWA change (station map editable in Settings if needed).
- Drive-by fix: `tests/test_payment_service.py::test_refund_payment_credits_wallet_for_internal_wallet` was red since the refund idempotency commit (`85ee706`) — the mocked DB returned the payment for the new dedupe select; now uses `side_effect` with an explicit no-duplicate result.

## POS gap-closure plan — COMPLETE (2026-07-27)

All 4 phases shipped: split bill (`d490dbe`), cash drawer/Z-report (`2595a67`), merge + occupancy timer (`2595a67` + `9b73dc0`), KDS station routing (this section). Recorded non-builds: MY e-invoice (needs accountant turnover-band decision first), offline mode (deferred post-go-live).

## Admin portal follow-ups to the POS phases (2026-07-27)

Post-phase review found 3 plan items that never landed on the admin side + 1 display gap. All fixed:
- **Cash session drill-down**: `GET /admin/pos/sessions/{id}` — session row + `report` (LIVE Z-report via `compute_session_report` for open sessions; `null` for closed, where the row already carries the close-time snapshot) + `payments` (every captured/partially_refunded/refunded payment on the store's orders in [opened_at, closed_at|now], with order_number). Admin `/cash-sessions` rows gained a View/Hide toggle that expands an inline drawer: figures row (float/cash/card/QR/refunds/expected, "live" badge for open sessions) + the payments table. e2e: `test_pos_sessions_merge.py::test_admin_session_detail_breakdown`.
- **Merge/cancellation reason was invisible in admin**: `OrderOut` always returned `cancellation_reason` but the order detail page never rendered it — merged sources showed only "cancelled by merchant". Now shown as an alert line under the header (key `orders_[id].cancellation_reason` ×5). Target-side merge info was already visible via status_log.
- **Settings page has a FIXED SECTIONS prefix list** — any new platform_config prefix is invisible until a section is added (happened to `kds.`). Added the KDS section; `PUT /admin/config` already parses `value_type="json"` correctly, so `kds.station_map` edits round-trip. NOTE: admin-ui translations are DB-only (the local `en.json` is just a ~40-key bootstrap; DB rows merge over it).
- Verified live (browser): cash drawer opens with payment rows, order 834 shows "Merged into order POS-…", order 823 Covers column lists split items, Settings renders the station map.

## Alembic drift fix + staff_ops.py split (2026-07-27)

- **`alembic check` was failing** — the dev DB had drifted from the models. Fixed via model edits + migration `h8c9d0e1f2a3` (single head preserved):
  - `event_invites.customer_id` / `lucky_draw_tickets.customer_id` were INTEGER in the DB; `customers.id` is BigInteger and SQLAlchemy FK type inheritance made the models BigInteger — DB columns widened.
  - `ix_event_invites_event_id` dropped (redundant with leftmost prefix of `uq_event_invites_event_customer`); `ix_event_invites_customer_id` kept and declared on the model (`index=True`).
  - `ix_lucky_draw_tickets_campaign_id` created (model declared it, DB never got it).
  - `PaymentLineAllocation` model gained the `uq_payment_line_allocations_payment_line` UniqueConstraint the Phase-1 migration had created (model now matches DB).
  - `infra/db/09_schema_sync.sql` regenerated (was stale since 2026-07-22 — predates split-bill + recurring-tasks schema). RULE: run `alembic check` after any model edit; it must say "No new upgrade operations detected".
- **`staff_ops.py` (2486 lines) split into 8 modules** + 3 appended siblings, file deleted: `staff/auth.py` (578), `staff/pos.py` (589, POS order create + display-state), `staff/inventory.py` (284), `staff/equipment.py` (221, incl. hygiene), `staff/menu.py` (152), `staff/shifts.py` (132, incl. tasks), `staff/dashboard.py` (123), `staff/reservations.py` (96); appended: orders list/detail/status/transfer → `staff/orders.py`, customers search/find-or-create → `staff/customer_ops.py` (ABOVE `/{customer_id}` — literal-before-param trap), tables list/status → `staff/tables.py`. Route table byte-verified identical (61 /api/staff/* routes); full e2e 216/216 green after.
- Auth/PIN helpers live in `staff/auth.py`; POS discount/loyalty helpers in `staff/pos.py` (the staff-portal `usePosState.ts` bundle-discount preview mirrors `staff/pos.py`).

## Full page sweep — both portals (2026-07-27)

Browser-crawled every page (admin: ~95 list routes + all [id] editors; staff: 17 pages + kitchen/[id] + help/[slug] + pos/display) checking render errors, 5xx API calls, console/page errors, near-empty bodies, raw i18n keys. Two real bugs found + fixed:
- **`pos/display` hydration crash (React #418)**: the idle-screen clock initialized `useState(Date.now())` — SSR and client rendered different times. Now null-initialized and set post-mount (clock renders after hydration, interval unchanged). Verified: clock shows, zero page errors.
- **Payment-gateway page showed a permanent "complete all required fields" banner**: `app.public_url` / `admin.public_url` / `staff.public_url` never existed in platform_config (used for Stripe/HitPay redirect URLs). Seeded with the current dev domains in `seed_platform.py` — UPDATE at domain migration (checklist already says so).
- False alarms: staff `/tasks` "near-empty" = correct empty state (manager has no tasks); admin sweep "raw i18n keys" on payment-gateway = a domain + Stripe webhook event names, not keys; `content/pwa-splash/[id]` untestable (zero rows; `/new` form renders fine).
- Reusable crawler: walks routes, flags alerts/5xx/pageerrors/empty bodies — pattern saved in session history (page_sweep.js).

## LHDN MyInvois e-invoice (2026-07-27) — previously deferred item #1

- **Config-gated, simulated on dev** (same pattern as stripe/hitpay): `einvoice.enabled=false` → submissions simulated (status `validated`, `sim-` uuid, `/share/` validation link). `einvoice.auto_issue=false` → nothing generates until enabled. Flip both + set `einvoice.client_id/secret/tin/brn/msic` to go live against preprod (`einvoice.base_url` default) then prod. **Still outstanding (business side)**: accountant confirms turnover band (RM1M/year exemption since Jan 2026) + real TIN/BRN/MSIC/SST values + digital-certificate signing middleware (submission transport is built; signing is the known v1 gap).
- `einvoice_documents` table (migration `i9c0d1e2f3a4`): order_id/payment_id/store_id, document_type ("01" invoice / "04" refund note), code_number `EINV-<order>-<type>`, status pending/submitted/validated/rejected/failed/cancelled, ubl_document JSONB, myinvois_uuid, submission_uid, validation_link, error_message; unique (order_id, payment_id, document_type) → idempotent issue.
- `app/services/einvoice.py`: `build_ubl_invoice` (MyInvois UBL 2.1 JSON — _D/_A/_B urn form, supplier from einvoice.* config, walk-in/placeholder customer → "General Public" TIN "NA", TaxTotal from order.tax_amount, service_charge/discount as AllowanceCharge), `issue_einvoice` (idempotent), `_submit` (real: /connect/token → /api/v1.0/documentsubmissions with sha256+base64; simulated on dev; NEVER raises into the payment path), `auto_issue_on_payment` (hooked into `process_staff_order_payment` after capture, fully guarded).
- Admin `/einvoice` (sidebar Store Ops → E-Invoice): filters (store/status/order), inline UBL drawer, retry (failed/rejected/pending only), manual issue per order. Endpoints under `/admin/einvoice/*`. Settings page has an `einvoice.` section (client_secret masked).
- Staff: `GET /staff/orders/{id}/einvoice`; kitchen order detail shows an e-invoice card (status badge, code number, copyable validation link + QR via the existing `qrcode` npm dep).
- i18n: admin-ui 29 keys ×5, staff-ui 12 keys ×5 (+ EN fallback bundle). Seed scripts: `seed_einvoice_ui_translations.py`.
- Tests: `tests/test_einvoice_service.py` (6 unit: UBL totals/buyer/charges, simulated submit, idempotency); `e2e-tests/test_einvoice_flow.py` (auto-issue → validated sim doc → admin list/detail UBL assertions → idempotent re-issue → retry-400; restores auto_issue=false after).

## POS offline mode (2026-07-27) — previously deferred item #2

- **Backend**: `orders.client_ref` String(64) nullable + partial unique index `(store_id, client_ref) WHERE client_ref IS NOT NULL` (migration `j0d1e2f3a4b5`). `POST /staff/pos/orders` accepts `client_ref` (also an IntegrityError replay branch for concurrent syncs); a replay returns the EXISTING order as HTTP 200 with the creation shape. The pre-existing `idempotency_key` is checked first (belt-and-braces).
- **Staff POS** (`src/lib/offlineQueue.ts` + `components/pos/usePosOffline.ts` + `PosOfflineQueueChip.tsx`):
  - IndexedDB `fnb-pos-offline`: `queue` (keyed by client_ref) + `snapshots` (menu per store). Menu snapshot saved on every successful load; fetch failure → snapshot with "offline data" flag (stale prices possible — server total is authoritative at sync).
  - Offline detection: navigator.onLine + online/offline events + network-error (TypeError) catch. Amber banner on POS; cash forced when offline (card/QR hidden — they need connectivity).
  - Offline checkout enqueues {client_ref: crypto.randomUUID(), order payload, cash payment, summary}, clears cart, shows queued confirmation.
  - Sync engine: window 'online' + 15s interval (self-gated on non-empty queue), FIFO, syncing-flag; create via raw fetch (201/200 both OK), tendered amount re-read from the SERVER create-response total; payment 409 → split-state remaining_due==0 → treated paid; 4xx/5xx → failed (manual Retry in the queue drawer); network error → pending. Items stuck in `syncing` reset to `pending` on mount (crash-safe).
- i18n: 11 `pos.offline_*` keys ×5 (+ EN bundle). Seed: `seed_staff_ui_offline_translations.py`.
- Tests: `e2e-tests/test_pos_offline_idempotency.py` (ref replay → same order, no dup). Puppeteer-verified: CDP offline → queued sale → online → auto-sync → order captured server-side.
- v1 limits: offline orders are cash-only; stale snapshot prices possible offline (server total wins at sync); no offline table-status updates.

## Customer display sync with POS features (2026-07-27)

Browser-driven audit of `/pos/display` against the POS feature work found 2 gaps + 1 pre-existing bug, all fixed and verified end-to-end (POS tab drives the display tab via BroadcastChannel in puppeteer):
- **Split-bill progress on the display** (was: full total shown during split payments): `PosSplitBillSection` echoes `{paid,total}` up → `PosCheckoutPanel` merges in the live share (`charging`) → POS broadcast includes `splitInfo`. Display shows "RM X of RM Y paid · This share RM Z" under the total during checkout. New staff-ui keys `pos.display_this_share` (+ existing `pos.split_paid_of` reused) ×5.
- **E-invoice QR on the thank-you screen** (was: nothing): after payment the POS re-broadcasts with `einvoiceUrl` (fetched from `GET /staff/orders/{id}/einvoice` — the display itself is unauthenticated so the link rides the broadcast; the public display-state endpoint only strips payment URLs). Display renders the validation QR via the existing `qrcode` dep when present (nothing shows while e-invoice is dormant/simulated-off). New key `pos.display_einvoice_scan` ×5.
- **PRE-EXISTING BUG — checkout mode showed an EMPTY display**: the broadcast always sent the POS cart, which is empty when charging an unpaid order (two-stage flow) — customers saw "No items found · RM 0.00" during checkout. The effect now maps the checkout order's `line_items`/`items_subtotal`/`service_charge`/`tax_amount`/`total_amount` in checkout + QR-payment phases.
- Offline: nothing needed — BroadcastChannel is same-device local (works offline), the Redis cross-device write is already fire-and-forget.
- Verified: typecheck, rebuild, puppeteer 2-tab run — cart/total in checkout, split progress advancing (RM 12 of RM 24), thank-you screen, e-invoice QR visible with `einvoice.auto_issue` on (restored to false after).

## Customer display URL + domain-hardcoding rule (2026-07-27)

**The customer-facing POS display lives at a RELATIVE path — no domain anywhere:**

```
https://<staff-host>/pos/display?store=<store_id>&key=<store display_key>
```

- Dev today: `https://staff.loyaltysystem.uk/pos/display?store=1&key=…`
- After migration the same path just works: `https://staff.lokaespresso.com/pos/display?store=1&key=…`
- Opened from the POS top bar (**Display** button) — `openCustomerDisplay()` passes `store` + `key` automatically and positions the popup (`pos.customer_display.left` store config, default 1920).
- `store` selects the store; `key` is the per-store `display_key` (required for the cross-device Redis poll — the unauthenticated GET 403s without it; rotate it if exposed). Same-device second windows work via `BroadcastChannel` and need nothing else.

**Domain-hardcoding rule:** never hardcode `loyaltysystem.uk` (or any domain) in app code. Everything derives at runtime:
- Display path is relative (`/pos/display`) — immune to migration by construction.
- PWA deep-links (guest-pay QR, wallet top-up QR) derive from the current host via `staff.X → app.X` — shared helper **`staff-portal/src/lib/pwaBase.ts` (`pwaBaseUrl()`)**; use it for any new PWA link (3 call sites: pos/page.tsx, usePosState.ts, pos/display/page.tsx — the old inline `… : "https://app.loyaltysystem.uk"` fallbacks were removed 2026-07-27).
- Payment redirects (Stripe/HitPay success/cancel) come from `app.public_url` / `admin.public_url` / `staff.public_url` platform_config (Settings → App; update at migration).
- Table QR payloads are scheme-based (`loka:table:{token}`) — no domain at all.
- Caddy vhost configs take `{$APP_DOMAIN}`/`{$ADMIN_DOMAIN}`/`{$STAFF_DOMAIN}` env vars (dev defaults only).

**Domain-migration checklist additions** (see the main checklist above): (1) update `*.public_url` configs in Settings; (2) update portal `.env.local` files (`NEXT_PUBLIC_APP_URL` etc.); (3) update the **guide/help articles** that name `app.loyaltysystem.uk` (`v3/guide/customer/index.md`, `getting-started.md`, `orders-and-order-detail.md`, `admin/index.md`, `staff/index.md`, `getting-started.md`) then re-run `seed_help_articles.py` + `translate_missing_content.py`; (4) re-seed test accounts with @lokaespresso.com emails or leave dev seeds out of prod entirely; (5) after cutover, verify the display top-up QR + guest-pay QR resolve to `app.lokaespresso.com` (they derive automatically — spot-check only).

## Portal deploy hardening — rebuild-portal.sh (2026-07-27)

- **Root cause of historical 502s + restart storms**: `next build` wipes `.next/` at the start; with pm2 serving from it, the process crashes ("Could not find a production build") and pm2 crash-restarts for the whole build duration. staff-portal error log showed this pattern repeatedly (500+ lifetime restarts, mostly this).
- **Fix — ALWAYS deploy frontend changes with `v3/scripts/rebuild-portal.sh <staff-portal|admin-portal|customer-pwa>`**: builds to `.next-fresh` (each portal's next.config.ts honors `BUILD_DIST_DIR`), stops pm2 for ~2s, swaps `.next`→`.next-previous` + `.next-fresh`→`.next`, starts, and waits for a healthy HTTP code. Downtime ~5s; no crash window; instant rollback (`mv .next-previous .next` + restart).
- Verified on staff-portal: healthy in ~4s, no new restarts, public URL serving.
- Supersedes the older "rebuild then pm2 restart" / "delete pm2 process + fuser -k" notes — use the script instead.

## Kiosk audit + fixes (2026-07-27)

Full browser audit of the self-ordering kiosk (`/#kiosk?store=N`, portrait tablet). Two REAL bugs, both present since the kiosk launched:
- **Kiosk menu was truncated to the first 20 items alphabetically** (of 163): KioskPage called `/menu/items` with `per_page=500`, but the endpoint's pagination param is `limit` (default 20). One-word fix (`limit: 500`). Every other PWA caller already used `limit` — only the kiosk had it wrong.
- **Every dine-in kiosk order 500'd**: `OrderCreate.fulfillment_type` defaults to `counter_pickup`, which violates `ck_orders_type_fulfillment_alignment` (dine_in ⇒ `dine_in_service`). `public/kiosk.py` now sets `fulfillment_type` from the order type. Takeaway always worked, which is why this went unnoticed.
- Verified end-to-end (puppeteer, portrait viewport): welcome → dine-in + table number → full menu (all items now) → modifier drawer → cart → checkout confirm (table shown) → Pay Now → success (order number + guest-pay QR + counter note) → order lands in staff orders unpaid, dine_in, table T2 → reload returns to welcome; zero page errors, zero own-domain 5xx. e2e customer order/menu suites: 22 passed.
- Help: kiosk was undocumented — added a "Self-ordering kiosk (`#kiosk`)" section to `staff/hardware-peripherals.md` (URL, flow, unpaid-then-counter/QR pattern, inactivity reset, wake lock).
- Kiosk guest-pay QR uses `window.location.origin` (the PWA's own host) — domain-agnostic, no migration work needed here.

## Customer-facing UX improvements (2026-07-28)

- **POS display thank-you auto-reset** (was: stuck until the next order): the display returns to idle 25s after payment (local state reset; safe with BroadcastChannel + the Redis poll's ts-gated updates). The kiosk already had a 30s `AutoResetTimer` on its success screen — nothing needed there.
- **POS display cart item images**: full chain — staff order detail serializer exposes `image_url` from `item_snapshot` (staff/orders.py), POS `CartItem` carries it from `addToCart`, `DisplayCartItem` passes it through the broadcast, display renders 40px thumbs in cart rows (checkout + browsing).
- **Language selectors on both customer screens**: POS display idle (top-left, persists to localStorage `locale` — note: the staff `useTranslation` `setLocale` is state-only, persistence is manual) and kiosk welcome (via PWA `LocaleProviderWrapper`).
- **Kiosk i18n-ified**: was ~35 hardcoded English strings → all `kiosk.*` keys via `useTranslation`. 34 keys ×5 locales in pwa-ui DB (hand-written, `is_auto_translated=false`) + nested `kiosk` object hand-added to `customer-pwa/src/locales/en.json` (the sync script skips EN by design) + `sync_translations_to_json.py` regenerated the other locale JSONs.
- **Correction noted**: an earlier audit claim that the kiosk success screen never times out was WRONG — `AutoResetTimer` (30s countdown) already existed.
- Verified: full kiosk order flow in Chinese end-to-end; display language switch; item image in checkout (needs the backend restart for the serializer change); thank-you → idle auto-reset. 42 unit + 9 POS e2e green.

## Subdomain deployment — COMPLETED (2026-07-28)

All 3 Cloudflare-registered subdomains are now live with dedicated Caddy vhosts and PM2 processes.

| Subdomain | Port | PM2 Process | Serves | Caddy Config |
|---|---|---|---|---|
| `api.loyaltysystem.uk` | 13800 | v3-backend (shared) | **External-only** API entry: webhooks, third-party integrations. Portals DO NOT route through it — they keep internal `/api` proxy. | `fnb-api.conf` — direct proxy to localhost:13800 |
| `kiosk.loyaltysystem.uk` | 13840 | kiosk-v3 | Self-ordering kiosk. PWA `AppShell.tsx` detects `kiosk.*` hostname → forces kiosk mode. Old `/#kiosk` still works. | `fnb-kiosk.conf` — proxy to localhost:13840 |
| `pos-disp.loyaltysystem.uk` | 13850 | pos-disp-v3 | POS customer display. Caddy rewrites `/?store=&key=` → `/pos/display?store=&key=` → staff portal. Old `/pos/display` still works. | `fnb-pos-disp.conf` — rewrite + proxy to localhost:13850 |

### `api.loyaltysystem.uk` — external-only API entry

**Purpose**: Stable public URL for webhooks and future external API consumers. NOT for internal portal traffic.

**What uses it (today)**:
- Stripe webhooks: `POST https://api.loyaltysystem.uk/api/webhooks/stripe`
- HitPay webhooks: `POST https://api.loyaltysystem.uk/api/webhooks/hitpay`
- Resend webhooks: `POST https://api.loyaltysystem.uk/api/webhooks/resend`
- Health checks: `GET https://api.loyaltysystem.uk/health`

**What does NOT use it**:
- All 3 portals use path-relative `/api/*` or `http://127.0.0.1:13800/api` internally — zero code changes.
- Cookie auth stays scoped to each portal's origin (no cross-origin issues).

**Changes made**:
- `/etc/caddy/sites/fnb-api.conf` — new vhost, TLS via existing `*.loyaltysystem.uk` wildcard cert, proxies to `localhost:13800`
- `/etc/caddy/Caddyfile` — added `import /etc/caddy/sites/fnb-api.conf`
- `backend/.env` — `CORS_ORIGINS` + `TRUSTED_HOSTS` now include `api.loyaltysystem.uk`
- Backend restarted via PM2 to pick up env changes

**At domain migration** (loyaltysystem.uk → lokaespresso.com): update the webhook URLs in Stripe/HitPay/Resend dashboards from `api.loyaltysystem.uk` to `api.lokaespresso.com`.

### `kiosk.loyaltysystem.uk` — dedicated kiosk entry

**App code**: `customer-pwa/src/components/AppShell.tsx:143-152` — `useEffect` checks `window.location.hostname.startsWith('kiosk.')` → extracts query params → calls `setPage('kiosk', params)`. Runs before the existing `page === 'kiosk'` early return.

**PM2**: `kiosk-v3` — separate Next.js process on port 13840 (same build as customer-pwa). Hostname detection happens client-side.

**Old URL preserved**: `app.loyaltysystem.uk/#kiosk?store=N` still works unchanged.

### `pos-disp.loyaltysystem.uk` — dedicated display entry

**Caddy rewrite**: `/?store=X&key=Y` → `/pos/display?store=X&key=Y` → staff portal (13850). Staff portal middleware already has `/pos/display` in `PUBLIC_PATHS` — no auth redirect.

**PM2**: `pos-disp-v3` — separate Next.js process on port 13850 (same build as staff-portal).

**Old URL preserved**: `staff.loyaltysystem.uk/pos/display?store=N&key=…` still works unchanged.

### Verification (2026-07-28)
- All 6 subdomains respond: admin 307, staff 307, app 200, api 200, kiosk 200, pos-disp 200
- API webhooks: stripe/hitpay/resend respond 405 (GET not allowed — POST-only, correct)
- Public menu via api: 200
- Health via all hosts: 200
- E2E smoke: 5/5 passed
- Backend: 42/42 passed
- Alembic check: no drift

### Full port map

| Service | Port | PM2 |
|---|---|---|
| Backend API | 13800 | v3-backend |
| Customer PWA | 13810 | customer-pwa-v3 |
| Staff Portal | 13820 | staff-portal-v3 |
| Admin Portal | 13830 | admin-portal-v3 |
| Kiosk | 13840 | kiosk-v3 |
| POS Display | 13850 | pos-disp-v3 |

## Round 33 — remaining gaps closed (2026-07-28)

Four issues identified in a full-system audit, all investigated and fixed:

### #2 Feedback rating made optional (real, fixed)
- **Backend**: `feedback_entries.rating` → nullable (`models/feedback.py`), CHECK constraint widened to `rating IS NULL OR (rating BETWEEN 1 AND 5)` (migration `60077da51931`), `FeedbackCreate.rating: int = 5` → `int | None = None` (`schemas/feedback.py`), endpoint handler allows None rating (`admin/feedback.py`).
- **PWA**: `HelpSupportPage.tsx` no longer sends hardcoded `rating: 3` for support tickets — rating is simply omitted.
- **Alembic head**: `60077da51931`; check passes.

### #3 Product card prices — confirmed FALSE POSITIVE
The AGENTS.md note about "3 product cards missing prices (owner to supply)" referred to Cocinare grinders + Loveramics cups. Investigation confirmed these are **loyalty rewards** (not menu items) with correct `points_cost` populated in `reward_catalog`. The PWA `RewardsPage` renders points cost on every card via `reward.points_cost.toLocaleString()`. Admin portal reward table/edit also show `points_cost`. No rendering gap. The note was misleading — rewards are points-priced by design, not RM-priced.

### #4 Loyalty tier downgrade background job (real, fixed)
- **Script**: `backend/scripts/evaluate_loyalty_tiers.py` — iterates all active loyalty accounts with a non-Bloom tier and an elapsed spend window, runs `_evaluate_tier_renewal` for each (renew or downgrade). Idempotent; safe to re-run.
- **Cron**: daily 02:00 (`crontab -l` → `evaluate_loyalty_tiers.py --force-prod --quiet`). Previously downgrade only fired on payment capture or lazy `/loyalty/me` read — a dormant customer could retain a higher tier indefinitely.

### #5 Help guide domain references (real, fixed)
- **7 guide files** (11 occurrences of `loyaltysystem.uk`) updated to domain-agnostic text (removed hardcoded URLs, use descriptive text like "the Admin Portal URL").
- **`customer-pwa/src/app/layout.tsx`**: metadataBase fallback changed from `app.loyaltysystem.uk` to `localhost:13810`.
- **0 remaining `loyaltysystem.uk` references in `v3/guide/`**.

### Verification
- Backend: 42 passed
- E2E: 5 smoke passed
- TypeScript strict: all 3 portals pass
- Alembic check: no drift
- Crontab: 6 entries (agency + 4 translation + 1 loyalty tier eval)

### #6 Resend webhook 500 → 400 (real, fixed — found during endpoint audit)
- `POST /api/webhooks/resend` returned `500 Internal Server Error` when no signing secret was configured — should be `400 Bad Request` (unconfigured is a client/config error, not a server crash).
- **Fix**: `webhooks.py:128` — `HTTP_500_INTERNAL_SERVER_ERROR` → `HTTP_400_BAD_REQUEST`. Test `test_resend_rejected_without_secret` updated to expect 400.

## Kiosk overhaul — standing LCD + tablet + phone (2026-07-28/29)

Complete UX rebuild for production kiosk deployment at `kiosk.loyaltysystem.uk` (port 13840).

### Two kiosk modes
| Mode | URL | Screen | Flow | Table |
|---|---|---|---|---|
| Standing | `kiosk.loyaltysystem.uk/` | Floor-standing LCD | Welcome → Order Type → Phone → Menu → Cart → Checkout → Success | Manual input |
| Tablet | `kiosk.loyaltysystem.uk/?mode=tablet` | Table-top tablet | Staff setup → Menu → Cart → Checkout → Success | Persisted via localStorage |

### Responsive layout
- **Portrait** (standing LCD 1080×1920): single-column vertical stack, larger cards
- **Landscape** (tablet 1920×1080): sidebar categories + item grid, side-by-side layout
- All font sizes scaled per orientation via `fs(portrait, landscape)` function

### Phone input (standing mode)
- New `phone` phase between order_type and menu — optional, skippable
- Phone sent as `customer_phone` in `POST /kiosk/orders` payload
- Backend: `_find_or_create_kiosk_customer()` — finds or creates customer by phone (no OTP)
- AML re-activation on profile reuse (was inactive → is_active=true)
- Falls back to walk-in `+0000000000` when no phone provided

### Tablet staff setup
- First load: shows "Tablet Setup" screen → staff enters table number → persists to localStorage
- Subsequent loads: detects saved table → goes straight to menu
- URL override: `?mode=tablet&table=5` sets and saves table
- Table number auto-sets order_type to dine_in

### Other improvements
- Wake lock: re-acquires on `visibilitychange` (previously one-shot, would sleep)
- Fullscreen: triggers on both `click` AND `touchstart` (was click-only, unreliable on touch LCDs)
- Inactivity: 10s countdown overlay before 60s silent reset ("Session ending soon — tap to continue")
- Call Staff: button on welcome + menu header → modal with store phone
- Cart running total: menu header button shows "Cart (3) · RM 45.00"
- Order type badge: "Dine In" / "Takeaway" indicator in menu header
- Font sizes: all bumped for LCD readability, descriptions 14→16px, min touch targets 48px
- `manifest.json`: `display: standalone` → `fullscreen`, `display_override` → `["fullscreen"]`

### Backend
- `KioskOrderCreateRequest.customer_phone` — new optional field
- `_find_or_create_kiosk_customer()` — phone normalisation (MY formats), find-or-create

## POS display improvements (2026-07-28/29)

Production-ready outlet LCD display at `pos-disp.loyaltysystem.uk` (port 13850).

### New features
- **Connection status indicator**: green/amber/red dot with Wifi/WifiOff icons in bottom-left corner (idle) and header (active). States: live (<5s), stale (>5s), disconnected (>30s → auto-idle)
- **Stale state handling**: auto-returns to idle after 30s of no BroadcastChannel/Redis updates. Prevents frozen screen showing stale orders.
- **LCD font scaling**: `?mode=lcd` query param OR auto-detect ≥1920px landscape → 2× font multiplier via `scale()` function. Readable from 3-5m.
- **Landscape layout optimisations**: header with store name + connection indicator + order type badge. Active phase: two-column (cart left, QR/totals right). Column layout on portrait.
- **Responsive QR**: payment QR resizes for LCD mode (480px vs 320px), e-invoice QR also scales
- **Translations**: 3 new keys — `pos.display_live`, `pos.display_waiting`, `pos.display_disconnected`

### Code refactor
- Removed hardcoded style object → inline styles with `scale()` function
- All font sizes, paddings, icons scale automatically for LCD mode
- Landscape detection: `window.innerWidth > window.innerHeight`
- `lastUpdateRef` timestamp tracking for staleness detection

## Round 34 — full fresh audit & hardening (2026-07-29)

Five parallel deep audits (auth/sessions, money flows, authz/store-scoping, public surface, 3 frontends) + infra sweep; every finding verified in code before fixing. ~30 fixes.

### Critical
- **Cross-domain refresh-token confusion (F1/F2)** — `refresh_admin_tokens`/`refresh_customer_tokens` accepted ANY `type="refresh"` JWT and used `sub` as the principal id; customer/staff ids collide with admin ids (both sequences start at 1). Proven live: customer-1 refresh token → `POST /api/admin/auth/refresh` → full system_admin tokens. Fixed by requiring the domain claim (`admin_id` / `customer_id`) in each refresh service (`services/auth.py:238,352`). Staff refresh was already claim-checked. Post-fix probes: both 401, legit refresh 200.
- **Admin staff-portal login skipped StoreAssignment (F-1)** — `POST /staff/auth/login` with `store_id` only checked the store exists, then minted an admin-context staff token for ANY store (passes `RequireStaffRole` admin override on money endpoints). Now mirrors `/admin-store`: HQ roles or explicit assignment required (`staff/auth.py:179-199`).

### High
- **Systemic authz gap** — store scoping previously existed only in admin/orders; ~44 admin modules trusted any admin token, and `readonly_analyst` (documented "view only") could mutate nearly everything.
  - **Central write-guard**: `reject_readonly_admin_mutations` (deps.py) attached to the root API router — mutations by admins with no write-capable role (`system_admin`/`regional_manager`/`store_manager`) → 403. Reads, public/customer/pure-staff traffic untouched; self-service auth paths (logout/refresh/change-password) exempt. Verified live: readonly GET 200 / POST 403.
  - **Store-scoping sweep (13 modules)**: `require_store_admin` added to stores lifecycle, staff mgmt, POS terminals/sessions, reservations (incl. cross-store move rejection), e-invoice (mutations + list narrowing), inventory stocks/suppliers, inventory movements, purchase orders, equipment, hygiene verify, time events, tips; redemption `store_id` stamping validated (admin scan) or forced to `staff.store_id` (staff customer_ops); `staff/pos.py` rejects client `store_id` ≠ staff store.
- **Loyalty points on unpaid orders (H1)** — points were credited at order CREATION; exploit: create order → redeem points → cancel → clawback capped at 0. Now credited on CAPTURE via idempotent `_credit_order_loyalty_points` (payment.py) hooked into `_sync_order_payment_status` + staff cash/wallet confirm + admin/orders capture paths; POS credits only when paid at creation (ledger rows now carry `order_id`); pay-later/Stripe-QR POS orders get estimate-only and credit on capture.
- **Stripe async methods treated as paid (H2)** — `checkout.session.completed` (fpx/grabpay send it with `payment_status="unpaid"`) credited wallets/captured orders before funds arrived. Now requires `payment_status=="paid"`; `async_payment_failed`/`expired` re-syncs the order and reverses any credited wallet top-up (`_reverse_wallet_topup`).
- **PostgreSQL/Redis internet-exposed** — running containers (created May/June, predating the compose `127.0.0.1` pin) bound `0.0.0.0:13334/13335`; docker iptables bypass UFW. Verified reachable via public IP (scram + non-default passwords held). Recreated both via repo compose → now `127.0.0.1` only; data intact (named volumes), backend healthy.
- **Public menu leak** — `GET /api/menu/items` raw-dumped all ORM columns incl. `cost_price`, `search_vector`, `deleted_at`. Now serializes only `MenuItemPublicOut` fields (verified live).

### Medium
- **Refresh-cookie path scoping (F4)** — refresh cookies were pathed to `.../auth/refresh` only, so logout never received them → server-side blacklist silently skipped. Paths widened to the auth root (`/api/{,admin/,staff/}auth`); clear deletes both paths.
- **verify-pin no lockout (F6)** — step-up PIN verify now shares the login counters (5 fails → 30 min lock).
- **Admin wallet ledger race (M1)** — adjust/topup/deduct now lock the wallet row (`with_for_update`) before computing `running_balance` (was: locked only the last ledger entry — forkable).
- **Refund reversal (M2)** — refunds now claw back loyalty points (pro-rata on partial), release bound vouchers/rewards (full refunds), and decrement annual spend, via `_reverse_order_benefits_on_refund`; wired into `refund_payment` AND the Stripe `charge.refunded` webhook (dashboard-initiated refunds). Stock is NOT restored on refunds.
- **Double-charge after partial refund (M3)** — staff payment + wallet-pay endpoints count `partially_refunded` payments as paid (was: `captured` only), summing `captured_amount` like split-state.
- **POS voucher/reward caps bypassed (M4)** — staff apply endpoints now increment `use_count`/`global_use_count`/`total_redemptions` under row locks.
- **Status-PATCH cancel bypass (M5)** — `PATCH /staff/orders/{id}/status` no longer accepts `cancelled_*` (use the cancel endpoint, which reverses effects + blocks captured orders). Kitchen UI updated to call `cancelOrder`.
- **Unbounded % discount (M6)** — staff percentage discounts > 100 rejected 400; discount recorded in OrderStatusLog reason.
- **Body-size caps** — new `RequestBodySizeLimitMiddleware`: /api/* JSON 1 MB, multipart 10 MB (was: unbounded buffering on webhooks/public endpoints).
- **Guest-pay phone linking** — new profiles no longer get `phone_verified_at` (token ≠ phone ownership); orders only (re)linked when unassigned or on the walk-in profile (refunds credit `order.customer_id`).
- **Markdown link schemes (frontend ×3)** — `renderMarkdown` now anchors only http(s)/mailto/`/`/`#` URLs; `javascript:`/`data:` render as text (stored active-content vector via help articles).

### Low
- Logout rate limits ×3; logout always clears cookies even when blacklist 401s (customer + admin); admin-via-staff-portal refresh tokens 30d → 7d (same principal, same lifetime); password policy min 8 (staff change + admin register); `AdminStaff.principal_id` now the real admin principal (audit rows were skipped); feedback schema length caps + rating bounds; kiosk order item/qty/modifier caps; staff logout clears `staffProfile/staffEmail/staffName/staffId` from localStorage; wallet adjust/deduct schemas float → `Money`.

### Deferred / documented (not fixed this round)
- **F5 session revocation on password/PIN change** — needs per-principal `token_version` claim checked in deps; access tokens (8h) + refresh tokens remain valid after password change until then. Top candidate for round 35.
- **F7 refresh-family revocation** — reuse detection blacklists only the single JTI, not descendants.
- **F8 admin login enumeration** (lock oracle + timing), **F10 SMS-pumping global cap**, **F11 email-only registration without verification**.
- **F-10 cross-store READS** for store_manager (refunds/feedback/dashboard/etc.) — writes scoped this round; read narrowing + audit-log system_admin gating deferred.
- **F-11 admin registration** — store_manager can still mint own-role admins (write-guard now blocks readonly/no-role); restrict further at go-live.
- **XFF spoofing (L6)** — rate-limit key trusts leftmost X-Forwarded-For; deliberate spoofers can rotate. Real fix = lock origin 80/443 to Cloudflare IPs + prefer `CF-Connecting-IP` at go-live.
- **Money lows**: L1 duplicate payment sessions per order, L2 reward-cap race (customer path), L3 webhook amount/currency cross-check, L4 spurious `partially_refunded` on zero-delta, L5 late void events, L6 voucher-code oracle (10/min + random codes mitigate), L8 store_credit refund void.
- **OTP bypass stays ON** (documented intentional until lokaespresso.com go-live — dev runs ENVIRONMENT=production, so no code-level prod guard was added).
- **Cloudflare Flexible SSL** (HTTP CF→origin) — recommend Full mode at go-live.
- **Upload magic-byte gaps** (.jpeg/.mov etc. not sniffed; extension whitelist + nosniff contain).
- **display_key in query strings** (browser/proxy logs) — move to header at go-live.

## Final verification (2026-07-29, round 34)

| Check | Result |
|---|---|
| Backend unit tests | 42/42 passed |
| Alembic drift | none |
| tsc strict ×3 portals | clean |
| Exploit probe F1 (customer→admin refresh) | 401 (was 200 pre-fix) |
| Exploit probe F2 (admin→customer refresh) | 401 |
| Legit customer refresh | 200 |
| Write-guard (readonly_analyst) | GET 200 / POST 403 |
| Menu items leak | no internal columns |
| Postgres/Redis via public IP | unreachable (was reachable) |
| Backend health after restart | 200 |
| Full E2E suite (excl. browser journey) | 217 passed, 15 skipped, 0 failed |
| Backend 500s during full E2E | 0 |
| PM2 (8 services) | all online after 3 portal rebuilds + kiosk/pos-disp restart |
| All 6 ports | 13830/13820 307, 13810/13840 200, 13850 307, 13800 health 200 |
| Kiosk takeaway / dine_in+phone / 101-item cap | 201 / 201 / 422 |

## Round 34 addendum — subdomain verification (2026-07-29, same day)

Full edge-level check of `api.`/`kiosk.`/`pos-disp.loyaltysystem.uk` (Cloudflare → Caddy → services) after the round-34 changes. Three real issues found and fixed:

### Rate limiting was silently OFF
`TestAwareLimiter` read `os.getenv("ENVIRONMENT")` — the pm2 process env has no `ENVIRONMENT` (only `.env` does, which pydantic loads into `Settings`, not `os.environ`), so it stayed in testing mode and **every rate limit was disabled**. Fix: env var falls back to `get_settings().environment` (`core/rate_limiter.py`).

### Rate-limit keying broken through Cloudflare (two layers)
- Leftmost-XFF trust was trivially spoofable (CF *appends* to a client-supplied `X-Forwarded-For`), and uvicorn's proxy-headers middleware rewrote `request.client` from XFF, so keys sharded across CF edge nodes (each edge = its own bucket → no effective limiting).
- Fix (3 parts): (1) `get_client_key` keys on `CF-Connecting-IP` — only trusted when the last XFF hop is inside Cloudflare's published edge ranges (hardcoded in `rate_limiter.py`, fetched 2026-07-29) — else the last XFF hop (Caddy's real peer, not client-controllable), else the TCP peer; IPv6 clients bucketed by /64 (privacy-address rotation). (2) uvicorn started with `--no-proxy-headers` (`ecosystem.config.js`) so `scope.client` stays the real TCP peer. (3) environment fallback above.
- Verified live: honest bursts 429 via CF domain AND direct; spoofed XFF ignored (429); client-supplied `CF-Connecting-IP` rejected by CF itself (edge error 1000); direct-to-origin API calls blocked by TrustedHost (400).
- **Note**: `pm2 restart` does NOT re-read `ecosystem.config.js` args — `pm2 delete <name> && pm2 start ecosystem.config.js` is required (then `pm2 save`). The ecosystem file is JS — `#` comments are a syntax error (use `//`).
- **E2E exemption**: with limits live, the E2E suite's bursts (login 5/min etc.) would 429 — `_is_local_direct_call` exempts loopback requests that carry NO `X-Forwarded-For` (only on-box processes can make those; Caddy always adds XFF, remote direct-to-origin callers have a non-loopback peer, so all external traffic stays limited). Implemented in `TestAwareLimiter._check_request_limit` — must set `request.state.view_rate_limit = None` when skipping (slowapi's decorator wrapper reads it, else 500).

### pos-disp.loyaltysystem.uk served the display page for /api/*
The Caddy block rewrote EVERYTHING to `/pos/display` — the display page's cross-device poll (`/api/staff/pos/display-state`) got HTML instead of JSON, so Redis polling through the pos-disp domain never worked (same-browser BroadcastChannel masked it). Added `/api/*` and `/uploads/*` proxy handles to both http/https blocks (`/etc/caddy/sites/fnb-pos-disp.conf`). Verified: no key → 422, wrong key → 403, real key → 200 sanitized (payment URLs/tokens stripped, `payment_pending: true`), push→poll→reset cycle clean.

### Subdomain verification results
| Check | Result |
|---|---|
| api. /api/health | 200 |
| api. /docs + /openapi.json | 404 (production) |
| api. stripe webhook bad body | 400 |
| api. >1MB JSON body | 413 (new body cap) |
| api. send-otp 5/min via CF | 429 after 5 |
| kiosk. app shell + tablet mode | 200 |
| kiosk. /api/menu/items?limit=500 | 163 items, no internal columns |
| kiosk. order takeaway / dine_in+phone / bad table / qty 0 / delivery type | 201 / 201 / 400 / 422 / 422 |
| kiosk. orders 10/min via CF | 429 after limit |
| pos-disp. page + /api + display-state gating | all correct after Caddy fix |
| Full E2E (limits live, local exempt) | 217 passed, 15 skipped, 0 failed |
| Backend unit tests | 42/42 |
| Backend 500s since final restart | 0 |
| **Caveat for scripted probes** | Cloudflare bot protection 403s `Python-urllib` UAs — use a browser UA in curl/scripts |

## UI/UX review + pos-disp critical fix (2026-07-29, evening)

Visual review via Playwright screenshots across all surfaces (PWA guest+auth, kiosk standing mode, pos-disp, staff POS/KDS/login, admin dashboard).

### CRITICAL: pos-disp.loyaltysystem.uk never hydrated (broken since 2026-07-28 deploy)
The Caddy catchall `rewrite * /pos/display` also caught `/_next/static/chunks/*` — every JS/CSS chunk was served as HTML (`text/html`), so the browser refused to execute them. The display page showed its SSR shell forever: **raw translation keys, no polling, no clock, no connection indicator** (the "2026-07-28 verification" only checked HTTP 200, not hydration).
- **Fix**: `/etc/caddy/sites/fnb-pos-disp.conf` now passes `/_next/*` straight through (no rewrite), plus the earlier `/api/*` + `/uploads/*` handles, in both http/https blocks.
- **Verified at origin** (`--host-resolver-rules` to bypass CF): page hydrates — translated strings, live clock, wallet top-up QR, language selector, "Waiting..." connection state, translations + branding API calls firing.
- **Residual**: Cloudflare edge cached the poisoned chunk responses (`max-age=14400`) at ~13:00 — they expire by ~17:00 the same day. **For an instant fix, purge the CF cache for `pos-disp.loyaltysystem.uk` (owner, CF dashboard → Caching → Purge by hostname).** The page HTML itself is `cf-cache-status: DYNAMIC` (not cached).

### pos-disp CF poisoning — full resolution (2026-07-30)
The residual cache did NOT self-heal: the poisoned responses carried `s-maxage=31536000` (1 year, from the Next.js prerender headers on the rewritten HTML) and Cloudflare honors `s-maxage` over `max-age` for shared caches — 9 of 12 chunks (incl. the framework chunk) were cached as text/html with a 1-year TTL. An origin-side redirect cannot help (CF HITs never reach the origin), and rebuilds can't bust framework-chunk hashes. **The only fix is a Cloudflare cache purge of `pos-disp.loyaltysystem.uk` (or the whole zone).** Origin verified 100% clean (all 12 chunks serve correct content types direct). Prevention: CF Cache Rule to bypass cache for `pos-disp.loyaltysystem.uk`, and/or strip `s-maxage` from rewritten responses.

### pos-disp purge verification + what NOT to do (2026-07-30, morning)
- First purge attempt did NOT clear the entries (`age` header kept counting past 60,000s = still the original poisoned copies). Requires re-purge: CF zone `loyaltysystem.uk` → Caching → Purge Cache → Custom Purge → Hostname `pos-disp.loyaltysystem.uk` — or "Purge Everything". Verify after: `curl -sI https://pos-disp.loyaltysystem.uk/_next/static/chunks/13j-rtocaphap.css` must return `content-type: text/css` with `cf-cache-status: MISS/EXPIRED`, not `HIT`+text/html.
- **Do NOT post-process the prerendered `display.html`** to append query strings to chunk URLs — it breaks turbopack's module mapping and the page never mounts (silent, no console errors). Tried and reverted via rebuild.
- After any staff-portal rebuild, restart `pos-disp-v3` (it serves the same `.next`).

### Image compression pass (2026-07-30)
Customer-facing uploads were uncompressed: promo banners 0.7–2.2MB, product gallery 1.4–1.9MB, rewards 1.5–1.6MB, splash 1.5MB. Compressed 15 files (ImageMagick: resize to display-size max — promos 1376w, gallery 1200w, rewards 900w, splash 1080w — `-strip -interlace Plane -quality 80`): **18MB → ~1.7MB (~90% smaller)**, visually identical at display size. Originals backed up at `/root/image-backup-20260730/`. Note: the upload endpoint does NO compression — future uploads land full-size; consider server-side compression on upload (or a "compress after upload" step in the admin flow).

### Server-side upload compression (2026-07-30)
All upload points compress on save via `app/services/images.py::compress_image` (Pillow, in requirements.txt): resize to a per-kind max edge + progressive JPEG q80 (opaque) / optimized PNG (transparency); animated GIFs pass through; undecodable input saved as-is (magic-byte validation is the gate, compression is not). Verified with an 857KB test file:
- Admin `POST /api/upload/image` (max 1600px) → 181KB
- Customer `PUT /api/me/avatar` (max 400px) → 26KB
- Staff equipment photos `POST /api/staff/equipment/{id}/report` (max 1200px) → 146KB
Gotcha found: one legacy promo file was a PNG saved with a .jpg extension — the magic-byte check correctly rejected it in testing; ImageMagick-converted files are real JPEGs.
- **RESOLVED 2026-07-30 ~08:30**: second CF purge cleared the poisoned chunks (all 12 verified MISS→correct content-type, CSS re-cached correctly). Display fully verified through the public domain: translations, live clock, wallet top-up QR, language selector, connection indicator, API polling all working.

### pos-disp idle screen rework (2026-07-30, owner feedback)
The wallet top-up QR was the idle centerpiece — wrong first impression for customers. Replaced with a **promo carousel**: active promo banners from `GET /api/promos/banners` (image + title + short_description overlay), rotating every 8s with fade, dot indicators; store name + clock compacted to the top; falls back to the welcome text when no banners exist. The wallet top-up QR generation was removed entirely. Rotation verified live (banner 1 → banner 2 after 9s).
- **Deployment lesson**: when a Caddy block rewrites `*` to an app route, it must pass `/_next/*` (and any asset dirs) through untouched. The kiosk block never rewrote, which is why only pos-disp broke.

### Small fixes
- Staff login: password-field label was hardcoded `PIN` in both modes — now shows "Password" in email mode / "PIN" in staff-name mode (new `login.password_label` key; other locales fall back to EN until the translation cron fills).
- POS display: `layout.tsx` with proper `<title>Customer Display — Loka Espresso` (was untitled); aria-labels on the language-selector buttons.

### What looked good (no changes needed)
- Staff POS (order-type tabs, table selector, category tabs, modifier "Custom" badges, drawer status, park/display/unpaid actions) and KDS (station tabs, status chips, kanban, timers, paid/unpaid badges, do-not-hand-over warnings) are production-grade.
- Admin dashboard (KPIs, store scoping, date filters, charts, floating help).
- PWA: guest "Browse as Guest" path into full menu, returning-user session restore via /me (hard reload skips the wall — hash navigation does NOT remount the app, so scripted checks must `page.reload()`), wallet top-up with quick denominations + offline note, rewards with points costs.
- Kiosk welcome + order-type screens scale properly at 1080×1920.
- a11y sweep: 0 `<img>` without alt in all 3 apps, aria-labels on icon buttons, skeleton/loading states consistent (PWA 22 files, staff 14, admin uses AdminLoading/AdminError).

## Kiosk layout verification (2026-07-29, evening)

Both layouts exercised via Playwright at native sizes:
- **Portrait 1080×1920 (standing LCD)**: welcome → order type → (skippable phone) → menu — single-column large cards, category chips, search + cart header ✓
- **Landscape 1920×1080**: left sidebar categories + 5-column item grid ✓
- **Modifier drawer**: bottom sheet with variants (Hot / Cold +RM2) + customisations with per-option price adjustments + Add to Cart ✓
- **Tablet mode `?mode=tablet`**: staff Tablet Setup (table number, one-time) → menu with `Dine In · Table: 5` badge; table **persists across reload** (localStorage) ✓
- **Fix shipped**: the `Experiences & Workshops` category tab was visible at the kiosk even though the backend rejects class items at checkout (400 "book on the mobile app") — customers could build an unplaceable cart. `KioskPage` now filters the `experiences` slug category + its items out of the menu entirely.
- Note (business decision, not a bug): the `Add-ons & Customizations` category sells add-on items (Oat Milk RM4, Pulled Chicken RM12…) as standalone products at kiosk/POS — flag to owner if those should be modifier-only.

## Experience (class/workshop) layout (2026-07-29, evening)

Classes no longer render as plain menu items ("need more desc"):
- **New `ExperienceCard`** (`customer-pwa/src/components/menu/ExperienceCard.tsx`): 16:9 banner image, title, FULL `long_description ?? description`, price (or variant range) "per person", up to 3 next-session chips (date/time/location/seats-left), and a Book Now CTA that opens the session-aware `ItemCustomizeSheet` (never direct-add — sessions are mandatory). Members/featured badges preserved. Styles in `menu-page-v2.css` (`.menu-experience-*`).
- **MenuPage**: the `experiences`-slug category renders the experience-card list instead of the product grid; session availability comes from a `/menu/workshops` fetch in `loadMenu` (graceful fallback to no sessions).
- **WorkshopsPage**: shows the full `long_description` too — the class CSS `.info-card-desc` truncates via `white-space: nowrap` + ellipsis (NOT `-webkit-line-clamp`), so the override needs `whiteSpace: 'normal'` (a clamp-only override does nothing).
- **Content**: `long_description` populated for all 3 experiences (Omakase RM299, Turkish Sand Brew RM199, Roastery RM199) via direct DB update (admin PATCH triggers synchronous DeepSeek translation and times out — nightly translation cron picks the text up for other locales).
- Verified via Playwright: menu experience cards (full text, per-person price, disabled CTA when no sessions), booking sheet (session required), workshops page (full text).

## Dark theme — "Loka Ritual" Phase 1 (2026-07-29, late evening)

Boss's direction (6 mockups in `/root/omakase`): charcoal + gold luxury look. Gold `#C9A84C` and Playfair Display were already brand tokens, so this landed as a token swap + polish, not a rewrite.

- **Token scope**: `:root[data-theme="dark"]` in `styles/variables.css` — charcoal surfaces (`#16130F/#1C1813/#211B14`), warm-parchment text, dark-bronze borders, gold brand actions (olive→gold for primary in dark), black shadows, `--color-gold-gradient` for metallic CTAs. `--loka-bg-light` alias fixed to follow the scope (it was a hardcoded `#F8F5EF` and caused the light header band).
- **Boot**: inline script in `layout.tsx` `<head>` sets `data-theme` before first paint (default **dark**, `localStorage 'loka-theme'='light'` restores light). theme-color metas → `#16130F`.
- **Toggle**: Settings → Appearance → Dark/Light (Sun/Moon), persists to localStorage. New keys `settings.appearance/darkMode/lightMode` (en; other locales fall back until cron).
- **Hex sweep**: 23 `.tsx` files — hardcoded brand hexes → `var(--color-*)` tokens (0 remaining).
- Verified (Playwright @390px): home (dark header + gold-bordered cards), menu (gold Add buttons, gold-bordered thumbs), wallet (gold balance card ≈ mockup), orders, profile/login sheet, E2E smoke 5/5, tsc clean.
- **NOT done yet (Phase 2/3)**: membership card + gold-gradient scan button + tier preview on home; Omakase bordered `[ section ]` layout + ornamental frames; dark voucher cards with barcode; "The Vault" (tier-locked items) presentation; event countdowns; Daily Brew Spotlight; kiosk/pos-disp dark variants. `--loka-white` still `#FFFFFF` in 32 files — surface outliers to fix individually as Phase 2 touches those pages.

## Dark theme — Phases 2–4 COMPLETE (2026-07-29, late evening)

All phases of the boss's mockups (`/root/omakase`) implemented on the customer PWA.

### Phase 2 — signature surfaces
- **Membership hero** (`components/home/MembershipHero.tsx` + `membership-hero-v2.css`): gold-bordered membership card with ornamental corners (LOKA serif, tier, current points, progress bar), gold-gradient "[ Tap to Scan at Counter ]" → `#my-card`, **Tier Status Preview** — "[ Locked ] {next tier} Perks: …" composed from `benefits_config` + `points_multiplier`. Progress math from `lifetimePoints` vs tier thresholds. Replaces `WalletCard` for authed users (guest keeps the sign-in card). New public endpoint: `GET /api/loyalty/tiers` (tier names/thresholds/multipliers/benefits — marketing info, no auth).
- **The Vault** (menu): tier-locked items (`minimum_tier_id`) now render in a gold-bordered "The Vault — Secret Menu" section with key icon, dashed locked cards + "Unlock at {tier}" chips (under-tier/guests), solid orderable cards when unlocked. Locked items are excluded from category grids; under-tier customers now SEE them (previously hidden). Backend enforcement in `create_order_from_cart` (`services/order.py`): ordering a `minimum_tier_id` item without the tier → 403 "members-only item" (POS path bypasses — staff override; kiosk guests rejected). Verified live: Bloom→403, Origin→orderable. Seeded 2 vault items (`VAULT-COLD-BREW`, `VAULT-BAKLAVA-LATTE`, tier=Origin, category Loka Specialty).
- **Experience journey view** (`menu/ExperienceDetailSheet.tsx` + `experience-detail-v2.css`): full-screen mockup-language page per class — ornamental gold-framed hero (corner brackets), serif title, "[ Reserve Your Seat ]" booking card (session chips + seats + location + gold Book button → customize sheet), "[ About the Experience ]" full long_description. ExperienceCard → detail → booking sheet.
- **Voucher/reward redemption** (MyRewardsPage): detail sheets now render a scannable QR (`qrcode` lib, encodes the redemption code — staff scan endpoint accepts it) + keep the copyable code; "[ Active ]" tag on voucher cards.

### Phase 3 — live elements (home, `components/home/`)
- `EventCountdown` — "[ Next Coffee Gathering ]" with per-second `DDd:HHh:MMm:SSs` from the nearest future workshop session (`/menu/workshops`); hidden when none
- `LuckyDrawPanel` — replaces the old banner; campaign title + "Your entries: N tickets/spins" (from `/lucky-draw/active` when authed) + "every cup is a ticket"
- `BrewSpotlight` — "[ The Daily Brew Spotlight ]" from `/content/products` (image + story + action)
- `BirthdayPrompt` — "[ Profile Enrichment ]" → `#account-details`, only when authed and `date_of_birth` unset
- Order on home: hero → birthday → countdown → lucky draw → carousel → spotlight → Today's Picks

### Phase 4 — rollout
- **Kiosk stays LIGHT** (deliberate): boot script pins `data-theme='light'` on `kiosk.*` hostnames and `#kiosk` routes + AppShell pins it in the kiosk-mode effect — bright in-store LCDs read better light; a deliberate dark kiosk pass is a future option if wanted. NOTE: kiosk-v3 must be deleted+restarted after EVERY PWA rebuild (stale chunk URLs → unstyled page).
- **pos-disp** is the staff portal (separate tokens) — untouched by the PWA flip, stays light.
- **Translations**: all new strings are in `en.json` under `home.hero`, `homeExtras`, `experience`, `menu_page.vault_*`, `settings.appearance/darkMode/lightMode`, `myRewards.*` — other locales fall back to EN until the nightly translation cron fills them.
- **Regression**: 42/42 backend unit, 40/40 targeted E2E, tsc clean ×1 (PWA), alembic no drift.

### De-literalization pass (2026-07-29, night)
Boss clarified the mockups are samples, not specs. Cleaned all mockup-annotation artifacts out of production copy while keeping the dark/gold/serif visual language: removed all `[ ... ]` brackets from buttons/section titles/tags (scan button, Reserve/About sections, Profile Enrichment, Next Coffee Gathering, Seasonal Lucky Draw, Brew Spotlight, Active tag, Locked/Unlocked in tier preview), fixed "1 spins" pluralization (singular/plural label in `LuckyDrawPanel`), and rewrote mockup-literal copy to accurate text ("Priority booking for members" → "Reserve early — seats are limited"; "RSVP opening soon" → "Book ahead to secure your seat"). Smoke 12/12 green. Competitor benchmark (Starbucks/ZUS/Luckin/Dutch Bros) informed the improvement roadmap below — the bracket-free copy is the production standard going forward.

## PWA improvement sprints (2026-07-29, night) — benchmark-driven

Competitor benchmark (Starbucks/ZUS/Luckin/Dutch Bros) → corrected gap inventory → 7 items, ALL COMPLETE. Important: an earlier draft of this plan mislabeled several existing features as gaps (reorder, welcome voucher, referral, ETA card, scheduled push all already existed) — the corrected inventory is the source of truth.

### Sprint 1 — completions
- **Welcome discovery**: registration now creates an inbox `NotificationMessage` ("Your welcome gift is here…") composed from the config-driven reward (`services/auth.py:172-196`, try/except so it never blocks signup). Home `WelcomeGiftCard` (dismissible, localStorage flag) shows while an unused `source='welcome_reward'` voucher exists.
- **Favorites ("Your Usuals")**: `stores/favoritesStore.ts` (zustand persist `loka-favorites`, item + variant + full modifier selection). Heart toggle on every menu card (bottom-right), save-with-config heart in the customize sheet footer, "YOUR USUALS" one-tap reorder bar above the category tabs (newest first, max 24).
- **Referral home card**: `ReferralCard` on home (authed). Verified the full chain already existed: `?ref=CODE` capture (`useAuthFlow`) → localStorage persist (`lib/referral.ts`) → `referral_code` in register payload (`usePhoneAuth`) → `ReferralEvent` → conversion on first paid order (`credit_referral_points`, 50 pts from `loyalty.referral_reward_points`).
- **Honest pickup estimate**: `compute_estimated_ready_at(db, order, line_items)` (`services/order.py`) = max item `prep_time_minutes` + min(today's confirmed/preparing order count × 2 min, 30). Wired into customer order create + detail. `estimated_ready_at` added to `OrderOut` schema (the field previously existed only on `OrderFulfillmentOut`/model — do NOT confuse the two). ETA card shows `estimated_ready_at ?? pickup_time`.

### Sprint 2 — new builds
- **LOKA Tuesday**: `LOKA-TUESDAY` voucher definition (15% off, global, validity 1 day, max_uses 52/yr) + `scripts/grant_tuesday_vouchers.py` — upserts the definition for the upcoming Tuesday and grants a fresh 1-use voucher to every active non-opted-out member (skips already-held). Weekly cron Mon 00:23. First run: 497 granted (2026-08-04). Home `TuesdayCard` with countdown (shows "Today!" on Tuesdays).
- **Coffee Pass**: sellable `COFFEE-PASS-12` menu item (RM120, Loka Specialty) + `PASS-CLASSIC-12` voucher definition (free_item, category_specific Café, 12 uses, 180 days). `_grant_coffee_pass_if_purchased(db, order)` (`services/payment.py`) — idempotent via source+source_id, checks `OrderLineItem.menu_item_id` directly (POS snapshots lack item_code; async lazy-load unsafe). Called at the top of `_credit_order_loyalty_points` (covers webhook/wallet/cash/admin paths) + POS paid-now path. Verified: pass purchase → capture → `customer_vouchers` row source=coffee_pass.

### Sprint 3 — retention channel
- **Morning Boost habit push**: `scripts/morning_boost_push.py` — segment = active members with ≥1 order in 60 days, skips `marketing_opt_out`, hard cap 3/member/ISO-week (tracked via `action_payload.campaign='morning_boost'` counts), inbox `NotificationMessage` + web push to subscribed devices (`CustomerDevice.web_push_subscription`). Daily cron 07:23. First run: 106 sent.

## PWA full verification round (2026-07-30, ~01:00)

Complete pass after the sprints: services all online; app domain + API + 5 locale JSONs + sw.js/manifest healthy; all 27 hash routes render (guest-accessible ones show no login wall — walls seen in one probe were an artifact of that probe clicking GUEST_RESTRICTED `#checkin`, which calls triggerSignIn and drops guest mode for the session; help-support/legal/workshops verified wall-free in a clean session); favorites persist across reload; theme toggle flips light↔dark correctly; coffee-pass voucher grants on capture; Tuesday card + referral card render; 30/30 smoke+lifecycle E2E.

Two real bugs found and fixed:
- **Order detail stale read**: `OrderDetailPage` skipped its refetch whenever the order was already in `orderStore` from the list — which lacks computed fields, so the ETA card showed `--:--`. Now always refetches on mount (also keeps status/payment fresh). ETA verified showing computed time.
- **POS order-number collision (production)**: `staff/pos.py` generated `POS-MMDD-XXXX` (4 hex = 65k values/day) — birthday-paradox collisions hit `orders_order_number_key` unique violations in the live log. Widened to 8 hex (16.7M). Verified 3 consecutive POS orders, no collisions.

### app.loyaltysystem.uk (Customer PWA) deep pass — 2026-07-29
| Check | Result |
|---|---|
| App shell / manifest / sw.js | 200 / fullscreen, 4 icons / 200 |
| Guest endpoints (menu, stores, content, events, banners, info, products, legal, help w/ `audience`, lucky-draw, bootstrap, splash, push key, payments config) | all 200 |
| Protected endpoints unauthenticated (/me, wallet, orders, loyalty, notifications, cart, referrals, payments/methods, addresses, devices, checkin) | all 401 |
| OTP login via domain + all account APIs | 200 |
| Cart → order → detail → unpaid cancel via domain | 200/201/200/200 |
| Rewards catalog / locale JSONs ×5 / deep-link rewrites ×5 | 13 items / all 200 / all 200 |
| Kiosk order → guest-pay summary via app domain / wrong token | 200 / 403 |
| Guest feedback / table scan w/o token / bogus voucher | 201 / 400 / 422 |
| Guest-pay Stripe initiation | 201 + redirect URL (dev simulator) |
| Guest-pay HitPay initiation | 503 — `hitpay.enabled=false` on dev (intentional; UI hides it via summary flags; live keys at go-live) |
| Menu translations (locale=ms) / events | live / 3 events |
| New 500s during PWA probes | 0 (only the intentional HitPay 503s) |


## Round 35 — fresh full audit & hardening (2026-07-30)

6-track fresh audit (auth/session, authz/store-scoping, money, public surface, frontends ×3, infra) with every finding re-verified in code before fixing. Round-34 regression checks all PASS except the two noted below. ~25 fixes.

### Critical / High
- **Cross-domain ACCESS-token confusion (new, live-proven pre-fix)** — round 34 fixed refresh tokens only; `get_current_customer` trusted any `type="access"` JWT's `sub`, so an admin token authenticated as the customer with the colliding id (admin id 1 → demo customer 1, wallet/orders exposed). Fixed: customer identity now requires the `customer_id` claim (deps.py `get_current_customer` + `_get_optional_customer` in public/content.py + the local `get_optional_customer` in public/lucky_draw.py). Admin/staff mints unchanged (they carry `admin_id`/`staff_id`, never `customer_id`).
- **F5 session revocation — BUILT**: `token_version` column (int, default 0) on `admin_accounts`/`staff_profiles`/`customers` (migration `k1e2f3a4b5c6`); claim minted in all access+refresh tokens; enforced in `get_current_customer`/`get_current_admin`/`get_current_staff` + all refresh flows; bumped on admin change-password, staff change-password, staff change-pin. Missing claim = 0, so pre-existing sessions survive until a credential change. Live-verified: old access+refresh 401 after password change.
- **F7 refresh-family revocation** — refresh-reuse detection now bumps the principal's `token_version` (both reuse points in customer/admin refresh; staff refresh wraps `blacklist_refresh_token`), killing the whole stolen family, not just one JTI.
- **Admin double-charge after partial refund (live-proven pre-fix)** — `admin/orders.py` payment + wallet-pay computed already-paid from `status="captured"` only; now `in_("captured","partially_refunded")` summing `captured_amount` (round-34 staff mirror had been fixed; admin mirrors missed).
- **Refund safety** — provider refund now executes AFTER the local Refund row exists (status pending → completed/failed), with Stripe idempotency key `refund_{id}` (+ HitPay `X-REQUEST-ID`); provider exception marks the refund failed instead of stranding money. `RefundCreate.reason_category` is now a `Literal[...]` of the 6 DB-CHECK values (was free `str` → 500 *after* provider contact).

### Medium
- Cancel guards (`staff/orders.py`, `admin/orders.py` ×2) now include `partially_refunded` — an order holding captured funds can no longer be cancelled.
- Stripe dispute webhooks resolve the payment via `payment_intent`/metadata fallback (lookup by charge id never matched — every `charge.dispute.*` was silently dropped); dispute handler now also reverses loyalty/voucher/annual-spend benefits like the refund path.
- **F8 login enumeration** — `login_admin` + staff-login mode 3: dummy argon2 verify for unknown emails (timing), lock evaluated AFTER password verification, uniform 401 for bad credentials (403 locked only after a correct password on a locked account).
- Cross-store feedback reply now store-scoped (`require_store_admin`).
- **store_manager money powers revoked** — new `require_hq_write_admin` (system_admin/regional_manager only) on wallet adjust/topup/deduct (incl. the `/admin/wallet` alias) and customer adjust-points/set-tier/soft-delete.
- Kiosk order creation no longer flips `is_active=True` on a phone match — a banned account stayed banned; order falls back to the walk-in guest profile.
- Help articles gated: `audience=customer` public; `admin`/`staff` require a matching valid token (cookie or bearer); unknown audience 400; slug endpoint enforces per-article.
- Guest-pay JWTs no longer logged: uvicorn `--no-access-log` (app middleware logs path only) + Caddy `format filter` stripping `?...` from request URIs on all 6 vhosts; 33 historical `token=eyJ` lines trimmed from pm2/Caddy logs.

### Lows
- Body-cap chunked bypass closed: `/api/*` requests with `Transfer-Encoding` but no `Content-Length` get 411 (empty-body mutations without either header pass — first version 411'd them and broke 20 E2E tests; RULE: require Content-Length only when Transfer-Encoding is present).
- Pillow decompression-bomb window closed (`MAX_IMAGE_PIXELS = 40M` + pre-`load()` size check).
- Lucky-draw free-spin TOCTOU closed with `pg_advisory_xact_lock(campaign_id, customer_id)`.
- `AdminRegisterRequest.email` now `EmailStr` (was `str` — accounts that could never log in); admin change-password rate-limited 5/min.
- TokenBlacklist purge added to the daily loyalty-tier cron.
- Cart validates variant/modifier options belong to the menu item (latent price manipulation).
- Admin payment capture now grants lucky-draw tickets (staff/POS already did).
- Staff portal: CSP added (mirrors admin + Stripe script/frame), `staffStoreId` cleared on logout.
- `.env` files chmod 600; `check-all.sh` now gates alembic check + backend pytest + portal lint (lint last — portals carry pre-existing eslint errors).
- `09_schema_sync.sql` regenerated (was 3 migrations stale); head is `k1e2f3a4b5c6`.

### Verification
42/42 backend unit tests; full E2E re-run after the 411 fix (first run 20 failed on the over-broad 411 — all 411-caused, fixed and re-verified); exploit probes: admin-token-as-customer 401 ×2, password-change revocation end-to-end, `reason_category` 422, help gating matrix (401/400/200), chunked 411, login-timing gap collapsed (unknown email now pays argon2 cost); tsc ×3 clean; staff portal rebuilt via rebuild-portal.sh + pos-disp restarted; all 6 pm2 services healthy.

### Still open (documented, next rounds / owner decisions)
- F-10 store_manager cross-store READS (writes were scoped in r34; money mutations gated to HQ in r35); F-11 store_manager minting own-role admins — restrict at go-live.
- L1 duplicate payment sessions per order, L2 reward-cap race (customer path), L3 webhook amount/currency cross-check, L4/L5 webhook status edges, L6 voucher oracle (mitigated: 10/min + random codes), L8 store_credit refund void.
- Stripe "pending" refunds never resolve (no `charge.refund.updated` handling); unpaid kiosk orders hold deducted stock (no abandonment sweep); PWA CSP `unsafe-eval` removal (needs build test); `display_key` in query string (header move at go-live).
- Policy questions for owner: lucky-draw tickets not clawed back on refund; stock not restored on refund; add-on items sold standalone at kiosk/POS; bundle prices unconfirmed.

### Round 35 follow-up — manual translation overwrite root-caused & fixed (2026-07-30)

User-reported: manually reviewed menu translations kept getting overwritten. Root cause: `auto_translate_record` (`services/translation.py`) runs on EVERY admin create/update of ~20 entity types AND is called for every record by the daily `translate_missing_content.py` cron (04:23) — its upsert overwrote existing rows unconditionally and flipped `is_auto_translated` to True, after which the Sunday `review_translations.py` cron also rewrote them. Fix: the upsert now SKIPS rows with `is_auto_translated=false` whose `source_text` is unchanged (manual review is sacred); a manual row whose source changed IS re-translated and re-marked auto (stale source → needs re-review). Verified live (sentinel row survived auto_translate_record; other fields still translate). DB currently holds 5,537 manual + 21,402 auto rows. RULE: never write to `translations` outside `auto_translate_record` and the admin translation endpoints; the `is_auto_translated=false` + unchanged-`source_text` pair is the manual-review contract — any new writer must honor it.

### Round 35 follow-up 2 — auto-translate contract tightened (2026-07-30)

`auto_translate_record` now translates ONLY missing rows and stale rows (source_text changed since the row was written) — fresh rows (translation matches current source) are skipped BEFORE any DeepSeek API call, regardless of the is_auto_translated flag. Previously it re-translated every field of every record on every save and every daily cron run (wasteful + the overwrite vector). The manual-review contract is subsumed: manual rows with unchanged source are fresh rows → skipped; manual rows with changed source are stale → re-translated + re-marked auto (queue for re-review). Verified live: fresh=0 ops, manual-unchanged untouched, stale re-translated. 42/42 unit, 38/38 translation/content/bundle E2E.

### Round 35 follow-up 3 — untranslated-content audit & repair (2026-07-30)

User-reported: some menu items "reverted" / never properly translated. Three root causes: (1) PROMPT keep-rule — DeepSeek is instructed to keep brand/Turkish/proper names (Coca-Cola, Kahve-i Türk, Baklava, store names) — most identical rows are intended; (2) API-FAILURE FALLBACK BUG — `_fetch_translation` failures stored the EN source as the "translation" AND cached it (`translated or text`), so failures looked done and never retried; (3) batch-concurrency EN echoes + cache re-poisoning between runs (sequential calls translate fine). Fixes: failures now SKIP the row (never store source, never cache — retried by next cron); cache writes conflict-safe (`pg_insert.on_conflict_do_nothing` — autoflush=False hid pending cache rows from sibling records, crashing bulk runs with uq_translation_cache_hash); max_tokens scales to 8000 / timeout 60s for long texts (help bodies). Data repair: purged 1,228 poisoned cache rows; re-translated 73 stale rows (34 real fixes incl. 9 help bodies, 37 provider-kept names, 2 transient retries). RULE: never store source text as a translation; a missing row is always better than a wrong one. OPEN STYLE QUESTION for owner: drink names get plain DeepSeek translations (热带日出) — the team's manual style is "English（中文）" gloss (热带晨曦); if preferred, add the style rule to FNB_CONTEXT and re-run item names.

### Round 35 follow-up 4 — F&B naming-style prompt rule + item-name restyle (2026-07-30)

Owner decision: menu item/drink names use the gloss style "English Name（翻译名）" for zh (full-width brackets) and "English Name (Translated Name)" for ms/ta/tr — added to FNB_CONTEXT with the instruction that the translated part conveys flavour/ingredient feeling, not literal translation; descriptions translate fully with appetizing F&B wording. FNB_CONTEXT also strengthened: "every translation must read naturally on an F&B menu in Malaysia". Cache purged (2,772 rows) per the prompt-change rule. Restyle job re-translated all AUTO item_name rows (648); 16 MANUAL item_name rows were left untouched (protected contract). NOTE: restyle was run sequentially — bulk runs can echo EN under concurrency (see follow-up 3).

### Round 35 follow-up 5 — cron protection matrix verified (2026-07-30)

All 4 translation crons audited against the "never touch good translations" requirement: daily fill (04:23) — only missing/stale rows (fresh-skip contract, verified 0 writes on fresh tables); Sunday menu review (03:17) — auto rows only, and its prompt now documents the gloss naming style as house style so it can't "fix" names back to plain translations (any fix must keep "English (Translation)" format); monthly admin-ui review — auto rows only, UI namespace only; Sunday sync-to-JSON (05:41) — read-only export. Manual rows (is_auto_translated=false, set by any admin Translations-page edit) are untouchable by every cron and by auto_translate_record.

Restyle completed (same day): 648/648 auto item_name rows now in gloss format (644 + 4 transient retries). Verified samples: 'Tropical Sunrise（热带晨曦）' (matches the team's manual style exactly), 'Matcha Latte（抹茶拿铁）', 'Cappuccino (Kappuccino)' ms, 'Pain au Chocolat (Çikolatalı Kruvasan)' tr. 16 manual item_name rows untouched.

### Round 35 follow-up 6 — menu add/edit 422, CRM manual import, seed audit, style glossary (2026-08-01)

- **Menu add/edit 422 (user-reported, screenshots)**: forms sent `addon_discount_value: ""` → decimal_parsing 422. Fixed two ways: (a) SYSTEMIC — `BaseSchema` now has a `model_validator(mode="before")` converting empty/whitespace strings to None for ALL schemas (fixes every optional Decimal/int/datetime field across every endpoint; required fields correctly report "Field required"); all 8 inline `BaseModel` request schemas in admin endpoints converted to `BaseSchema`; (b) menu item new/[id] pages send proper nulls for add-on deal fields. Verified live: create+PATCH with empty decimals 200. RULE: never send "" for optional numeric fields; the backend now tolerates it, but forms should still null them.
- **CRM manual Chinese menu imported** (`/root/CRM Menu_Chi 2.xlsx`): 112 items imported as PROTECTED manual translations (is_auto_translated=false, gloss format `EN（中文）`, 起司→芝士 normalized, names+descriptions); 24 skipped (16 already re-entered manually by the team — import never clobbers existing manual rows; 8 fuzzy mismatches incl. baklava 双/三/四拼 boxes + 炭烤鸡肉Gözleme which appear NOT to exist in the DB menu — flagged to owner). One fuzzy mismatch self-caught and reverted (36-pc set). Backup: `v3/backup_zh_translations_pre_crm_import.csv`. Comparison report: `v3/translation_review_crm_vs_ai.csv`.
- **Seed-file audit**: `seed_einvoice_ui_translations.py`, `seed_staff_ui_translations.py`, `seed_staff_ui_offline_translations.py` had ON CONFLICT DO UPDATE on translated_text — would clobber Translations-page edits on re-run. All three now ON CONFLICT DO NOTHING (matching the sync_* scripts, which were already safe). RULE: any future translation seed/migration must use DO NOTHING or honor is_auto_translated=false.
- **Style glossary**: `_get_style_examples()` in services/translation.py injects up to 25 recent MANUAL translations per locale into every DeepSeek prompt ("HOUSE STYLE EXAMPLES") so future AI translations reference the team's manual work (10-min cache). Verified: new names come out in the exact house style (蜂蜜柚子气泡饮).

### Round 35 follow-up 7 — add/edit sweep across all portals (2026-08-01)

User asked whether ALL add/edit issues (admin/staff/PWA) are solved. Actions: remaining inline BaseModel schemas converted to BaseSchema (staff/customer_ops, staff/equipment, payment GuestPayRequest, kiosk ×3, marketing ×2, customer/order, push ×2) — every request schema in the codebase now gets the empty-string→None validator. Live probe sweep across admin surfaces (menu, vouchers, rewards, inventory, equipment, campaigns, bundles, tax, staff, dietary, allergens, info-cards, stores, tiers): zero decimal_parsing/int_parsing 422s; required-field empties correctly 422 with clear errors. Found+fixed one pre-existing 500: supplier create without store_id (schema allowed None, DB NOT NULL) — now 400 with store-existence check. Probe data cleaned up. Full E2E re-run gated after.

### Round 35 follow-up 8 — full admin add/edit sweep (2026-08-01)

After the menu-item 422 and the availability/color bugs, user asked for a proper check of EVERY admin add/edit. Two systematic audits (backend schema-vs-model-vs-endpoint, frontend form-vs-schema-vs-response) found 33 issues; ~30 fixed same-day:

- **Broken features**: transfer-table (admin + staff) read/wrote nonexistent `DiningTable.status`/`active_order_id` — now uses row-locked `TableStatusSnapshot` with occupancy checks (staff version had NO snapshot updates or occupancy check at all); store special hours never saved (StoreUpdate + full-replace handler, reason required); store create dropped operating_hours; dining table `section`/`is_active` dropped; staff first table-status set 500'd (missing store_id) + unvalidated status.
- **Dropped fields**: allergen/tax `is_active` toggles, staff `employee_id` — schemas completed.
- **Data shapes**: `inventory_items.image_url` added end-to-end (migration `l2f3a4b5c6d7` — the admin UI upload button was dead); bundle edit no longer wipes component modifier_overrides (form round-trips them; groups guarded to multi_course); survey update passes min/max rating/labels/conditional_logic; dietary create/update responses include color_hex/description.
- **Validation → 422 instead of 500**: prep_time 1-120, loyalty tier validity/key, staff role/task/shift Literals, movement types, tip allocation types, voucher date order, inventory shelf_life/item_type/unit_cost, consent types, customer phone regex, staff reservation dates, staff equipment store guard, POS modification-log staff FK (principal lookup, nullable).
- Verified: all probes round-trip live; 42/42 unit; tsc clean; single alembic head; 09_schema_sync regenerated. RULE for future endpoints: request schema fields must map 1:1 to model columns (setattr drops silently), Literal-type anything with a DB CHECK, never hand-build response dicts missing editable fields, Time/Date columns need typed schema fields not str.

### Round 35 follow-up 9 — permanent preventions (2026-08-02)

User asked WHY the bug classes kept happening, then approved systemic fixes:
- **Global IntegrityError→409** (`app/main.py`): uncaught unique/FK/NOT NULL/CHECK violations return clean 409/400 with constraint name. Any future duplicate-key bug can no longer 500.
- **Form↔schema contract check** (`v3/scripts/check_form_schema_contract.py`, wired into check-all.sh): statically diffs every admin/staff form payload against the FastAPI request schemas — the pydantic extra=ignore silent-drop class is now CI-gated (0 drops across 150 calls). Extend ALLOWLIST_PAIRS with a comment when a finding is verified benign. Known checker limitation: same-named payload variables in one file merge (lucky-draw `body`, equipment `payload` — allowlisted).
- **ESLint was never broken**: the "hundreds of pre-existing errors" were stale `.next-previous`/`.next-fresh` build dirs. Real count was 2 (render-purity `useRef(Date.now())`/`useState(Date.now())` — fixed). All 3 portals now lint clean (0 errors); check-all.sh passes end-to-end.
- Checker found one real drop: order status reason now persists as cancellation_reason.

### Round 35 follow-up 10 — host-TZ datetime drift + remaining tester issues (2026-08-03)

- **THE BIG ONE: host TZ is Europe/Berlin (UTC+2), and asyncpg encodes NAIVE datetimes with the host offset.** Date-only form inputs parse to naive datetimes → stored shifted -2h (promo "2026-08-05" became 2026-08-04 22:00Z → list showed one day early). Fix: BaseSchema `_naive_datetimes_to_utc` pins every naive datetime field to UTC at validation. RULE: never let a naive datetime reach the DB; if the host TZ ever changes, this validator keeps dates stable. Existing shifted rows (+22:00Z signature) were unshifted.
- Feedback stats 500 on page load: NULL ratings (round-33 optional rating) crashed rating_distribution — unrated entries now skipped. (Earlier fix only handled the date-filter path.)
- Consents page: dropdown values "analytics"/"data_processing"/status "revoked" didn't map to the enums — backend now maps them (analytics→location_tracking, data_processing→data_sharing/third_party, revoked→withdrawn) and validates cleanly.
- Splash edit error banner: per-locale translation prefill failures set the page error banner — now console-only. Splash save verified 200.
- NOTE for go-live: server TZ is Europe/Berlin — cron times in crontab are Berlin-local (loyalty eval "02:00" = 08:00 MYT). Decide intended timezone at migration.

### Round 35 follow-up 11 — categories split, bundle types, splash split, help center split (2026-08-04/06)

- **Category separation**: menu-item categories renamed "Items Categories" in nav; bundle products get their own **Bundle Categories** (`type='bundle'`, hidden from item lists) and events/workshops get **Event Categories** (`type='event'`) — seeded "Combo"/"Experiences & Workshops" rows re-typed. Customer-facing category endpoints exclude both new types.
- **Bundle types admin-editable** (`/bundles/types`): `bundle_types` table + admin CRUD; hardcoded CHECK constraint dropped (migration `p6d7e8f9a0b1`); engine mechanics mapped per type (e.g. pick_x → pick_n pricing).
- **Splash screens split**: `splash_screen_type` discriminator (`pre_login` vs `home_banner`, migration `n4b5c6d7e8f9`) — two separate admin pages; pre-login no longer required to edit a home banner.
- **Help center**: reader split into 3 audience pages (Admin/Staff/PWA deep links `?audience=`); Manage Articles split per audience with in-page switcher; 14 articles rewritten + 3 "What's New"; guide is preview-by-default with an Edit toggle for admins.
- **Tester accounts**: store-manager + per-store role variants (see "Test accounts"); ops duty pages (wastage/inventory/garbage/grease-trap) widened to ALL staff roles (backend already allowed any authenticated staff).

### Round 35 follow-up 12 — photo evidence on ops reports + staff meal discount (2026-08-07)

Mirrors the outlet's WhatsApp ops flow (photos accompany every report):
- **Wastage + stock update take photos**: `inventory_movement_log.image_urls` JSONB (migration `q7e8f9a0b1c2`); `POST /staff/inventory/waste` and `/staff/inventory/update` are now **multipart** (Form fields + `images[]`, saved via shared `_save_uploaded_images(files, subdir)` under `uploads/inventory/`, compressed like equipment photos). Staff UI: wastage ≤5 photos, inventory update 1 photo — both optional. Admin inventory-movements page shows photo thumbnails (new "Photos" column).
- **Fixed latent 500** in staff stock update: `float - Decimal` on existing stock rows (Form float vs Numeric column) — all arithmetic now Decimal at the boundary.
- **Staff meal discount (Option B)**: `staffmeal.discount_type` (percentage|fixed) + `staffmeal.discount_value` in platform_config (seeded percentage/10, `ON CONFLICT DO NOTHING`); `GET /staff/config/staff-meal` (staff token) reads it; POS checkout "Staff Meal" button (UtensilsCrossed icon, in the Staff Discount card) one-tap applies it through the existing server-side discount path (recomputed server-side, capped at 100%). Boss edits values in Settings → Staff Meal section (new prefix section; remember: new platform_config prefixes are invisible in Settings until a SECTIONS entry is added).
- Help articles updated (staff-operations photo steps, staff-pos-checkout Staff Meal); new translation keys seeded EN into `staff-ui`/`admin-ui` namespaces with `is_auto_translated=false` — auto-translate cron fills other locales, never overwrites manual rows.

### Round 35 follow-up 13 — staff-ops reporting audit (2026-08-07)

User asked to audit the staff-operations loop end-to-end (staff reports → admin review with date filtering). Findings + fixes:
- **Wastage reports vanished**: staff wastage UI only offered menu items and `menu_item_recipes` had 0 rows, so the movement-deduction loop recorded NOTHING — the report disappeared after the success toast. Fix: new `wastage_reports` table (migration `r8f9a0b1c2d3`; item snapshot, qty, reason, photos, reported_by, pending/verified/flagged review flow); `POST /staff/inventory/waste` now ALWAYS writes a report row in addition to any stock-deduction movements. Staff wastage page gained a Menu Item / Inventory Item toggle (raw-material spoilage was impossible to report before).
- **Admin review UI**: new `/inventory/wastage` page (sidebar: Inventory → Wastage Reports) with store/status/date filters, photo viewer, verify/flag + notes. `GET/PATCH /admin/inventory/wastage-reports`.
- **Date filters were wrong everywhere the same way**: equipment logs compared timestamptz against bare dates (date_to excluded the whole day); movements/hygiene/tips/time-events/audit/referrals used UTC-midnight boundaries (MYT 00:00–08:00 rows land on the previous day). Fix: `app/core/business_time.py` (`BUSINESS_TZ = Asia/Kuala_Lumpur`, `day_start_utc`/`day_end_utc`) applied to ALL those endpoints; hygiene admin UI gained the missing date inputs. Shift-template planned start/end now combine in BUSINESS_TZ (a 09:00 shift displayed as 17:00 before); lucky-draw daily reset rolls at MYT midnight. `reservation_date` is a Date column — untouched (already correct). RULE: any date-only filter on a timestamptz column goes through business_time helpers.
- Smoke-tested full loop (menu-item waste w/o recipes, inventory-item waste, admin list/date/review, hygiene date filter); probe data cleaned.

### Round 35 follow-up 14 — menu↔inventory linking for wastage (2026-08-07)

User direction: wastage is mainly reported against MENU items; 1:1 items (menu "Coke" = inventory "Coke") needed an easy link path.
- **Recipe chain verified working** (was never used — 0 rows): menu-item waste deducts via `menu_item_recipes` (qty × (1+waste_factor)), writes movement + wastage_reports row.
- **Copy to Inventory + Link** button on menu-item edit recipe section: creates the matching inventory item (`item_code = MI-<menu_item_id>`, unit `unit`, copies image) and pre-fills a qty-1 primary recipe row; persists via normal Save. 409 on re-click → reuses the existing item.
- **Recipe-path waste no longer silently skips** items with no stock row at the store — creates the row and records the movement (stock clamps at 0), matching the direct inventory-item path.
- New inventory items have NO per-store stock row until admin sets stock (Inventory → Stock Levels) — they don't appear in the staff inventory list until then (pre-existing behavior, applies to copied items too).

### Round 35 follow-up 15 — menu↔recipe↔inventory deep audit (2026-08-07)

User asked why this area keeps having issues. Full audit (2 parallel code audits + live API probes) found the root causes and 20 issues; all confirmed ones fixed:

- **Root causes**: (1) recipes shipped but were never used (0 rows) so the whole deduction chain was untested dead code until now; (2) raw `list[dict]` sub-payloads bypassed pydantic — missing-key 500s and no bounds/FK checks; (3) silent-skip patterns (`if row exists`, clamped writes) hid failures; (4) destructive delete-and-recreate on modifier groups wiped translations + regenerated IDs on EVERY save.
- **BUSINESS DECISION (user)**: sales are NEVER blocked by stock. `_deduct_stock_for_order` no longer raises "Insufficient stock" — stock may go NEGATIVE, full deduction recorded, `stock_warnings[]` returned in POS order response (amber box on the success screen) and logged for customer-channel orders. All channels (POS/PWA/kiosk) deduct via the same service. `ck_inventory_stock_current_stock` CHECK dropped (migration s9a0b1c2d3e4; note baseline DB never actually had it). Waste paths no longer clamp at 0 — movement deltas now reconcile with stock. Cancel/restore verified round-trip (out -6 → in +6).
- **Recipe hardening**: `_validate_recipe_payloads` shared by create/update — numeric bounds, inventory-item existence, variant-ownership (cross-linked recipes silently never fired), dedupe by (variant, inventory item) keeping LAST (duplicates double-deducted); `NULLS NOT DISTINCT` unique constraint (migration t0b1c2d3e4f5; PG16) closes duplicate generic recipes at DB level; `dietary_tags` stray schema field removed (setattr silent-skip); dietary_tag_ids + allergen_ids FK-validated on BOTH create and update.
- **Modifier groups update in place** (keyed by id) — manually reviewed group/option translations and IDs now survive any save; only removed rows are deleted (with their translations). Modifier translation inputs on the edit page now actually SAVE (were silently discarded — saveAllTr only handled item fields). Modifier option missing option_name → 400, not KeyError-500.
- **Admin stock edit** writes an `adjustment` movement (audit chain reconciles); **PO receive** marks `received` only when EVERY line is fully received (lines absent from payload counted by stored amounts); movements list exposes `performed_by_name` and the page paginates (was capped at 20, "By" always blank).
- **Frontend**: price input no longer `.toFixed(2)`-bound (decimals typeable; empty no longer snaps to 0.00); blank numerics send null instead of 0 (unit_cost, stock levels, prep_time); staff stock count blocks blank instead of zeroing stock; PO drawer suppliers filter by store + store required; edit-page recipe rows validated like the new page; stray ")" cosmetic fixes; wastage reason min aligned to backend (5).
- **Known gaps (flagged, not fixed)**: POS can't sell variants (POSLineItem has no menu_variant_id; variant-level recipes never fire at POS); variants have no admin editor UI; abandoned pending orders (payment failed/never paid) hold deducted stock until manually cancelled — no sweeper job exists. All live-probed, probe data cleaned.

### Round 35 follow-up 16 — data cleanup + sort order + locale restriction (2026-08-07)

- **Dev DB cleanup** (user request — only stores/menu items/menu categories are real): full transactional wipe (orders graph, customer activity incl. wallets/loyalty ledgers, staff activity, ops reports, inventory transactions/stock, engagement, logs) + purge of ALL soft-deleted rows (638 E2E menu items, 413 bundle products, 118 customers, etc.) + orphaned translations. Kept: stores(2), menu_items(166), menu_categories(23), bundle_products(7), accounts, inventory items/suppliers, config, translations. Backup: `v3/backups/pre_clear_20260807_103926.dump`. Reusable script: `v3/scripts/clear_transactional_data.sql` (E2E runs re-pollute — re-run after).
- **Sort order wired end-to-end**: display_order was stored everywhere but exposed nowhere. Admin UI: sort fields on menu category/item + bundle category/product forms (bundle forms already had them), Sort columns + client-side ordering on all four list pages, combined-order note on both category pages. Backend: public menu items had NO order_by (arbitrary order!) — now display_order,id; category ordering dropped the legacy combo-first hardcode (pure display_order). PWA menu: bundle + item categories interleave in ONE display_order sequence (ties → bundle first; uncategorized bundles last; bundles hide while searching) for both the tab bar and body.
- **Locales restricted to EN + zh** (boss decision; ms may return later, ta/tr dropped): backend `translation.SUPPORTED_LOCALES=["zh"]` (auto-translate + cron now CN-only), deps locale validation {en,zh}, admin/staff/PWA selectors + translation tabs trimmed, stale stored locales fall back to EN. ms/ta/tr DB rows and locale JSON files kept for later re-enable.
- Chain re-verified on clean data: opening stock → sale deducts (2→1.94) → oversell proceeds with warning (-2.06) → wastage w/ photo deducts (-2.16) → cancel restores (+4 → 1.84); movement log reconciles at every step.

### Round 35 follow-up 16b — locale trim missed spots (2026-08-07, same day)

The EN/CN restriction initially missed the per-record translation tabs on ~26 admin edit pages (each had its own LOCALES constant with all 5 locales) and the kiosk welcome-screen language buttons (hardcoded list in KioskPage.tsx). All now EN+CN. RULE: when changing the locale set, grep for `code: "ta"`, `"ms", "zh"`, and hardcoded `[['en',...]]` lists — locale lists exist per-page, not just in the central i18n configs. Also fixed a pre-existing react-hooks violation in help-articles/new (useSearchParams inside useState initializer).
