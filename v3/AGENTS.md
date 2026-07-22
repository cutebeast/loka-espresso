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
