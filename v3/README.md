# FNB Super App v3 — Project Documentation

*Last updated: 2026-08-12 (round 36)*

## Overview

Loka Espresso enterprise FNB platform with three customer-facing portals, a backend API, and a self-ordering kiosk.

| Component | Dev URL | Live URL (target) | Port |
|-----------|---------|-------------------|------|
| Backend API | — | — | 13800 |
| Admin Portal | admin.loyaltysystem.uk | admin.lokaespresso.com | 13830 |
| Staff Portal | staff.loyaltysystem.uk | staff.lokaespresso.com | 13820 |
| Customer PWA | app.loyaltysystem.uk | app.lokaespresso.com | 13810 |
| PostgreSQL | localhost:13334 | — | — |
| Redis | localhost:13335 | — | — |

## Architecture

```
v3/
├── backend/           # FastAPI + SQLAlchemy + PostgreSQL + Redis
│   ├── app/
│   │   ├── api/routes/endpoints/
│   │   │   ├── admin/     # Admin-only endpoints (CurrentAdmin auth)
│   │   │   ├── staff/      # Staff endpoints (CurrentStaff auth)
│   │   │   ├── customer/   # Customer endpoints (ActiveCustomer auth)
│   │   │   ├── public/     # Public endpoints (help articles, branding)
│   │   │   ├── payment.py  # Payment + guest-pay endpoints
│   │   │   └── auth.py     # Customer auth (register, login, OTP)
│   │   ├── core/          # Security, database, cache, config
│   │   ├── models/        # SQLAlchemy models
│   │   └── schemas/       # Pydantic schemas (Money type for Decimal)
│   ├── scripts/           # Seed scripts
│   └── tests/             # Pytest unit tests
├── admin-portal/      # Next.js 16 (App Router, TypeScript strict)
├── staff-portal/      # Next.js 16 (App Router, TypeScript strict)
├── customer-pwa/      # Next.js 16 (hash-based router, TypeScript strict)
├── e2e-tests/         # Playwright + pytest E2E tests
├── README.md          # This file
└── AGENTS.md          # Agent notes
```

## Authentication

All three portals use HttpOnly cookie auth:

| Portal | Access token cookie | Refresh token cookie |
|--------|--------------------|--------------------|
| Admin | `admin_token` | `admin_refresh_token` |
| Staff | `staff_token` | `staff_refresh_token` |
| Customer PWA | `access_token` | `refresh_token` |

### Account types and portal access

| Account | Admin Portal | Staff Portal | Auth mechanism |
|---------|:---:|:---:|---|
| Admin account (`admin@loyaltysystem.uk` / `admin123`) | ✅ Full | ✅ All assigned stores | Admin login → admin_token. Staff login → staff_token. |
| Store manager (`store@loyaltysystem.uk` / `store123`) | ✅ Limited | ✅ All assigned stores | Same as above. Admin role = store_manager. |
| Staff profile (`staff1@loyaltysystem.uk` / `staff123`) | ❌ | ✅ Assigned store only | Staff login only. No admin account. |
| Customer (`demo@lokaespresso.my` / `+60123456001`) | — | — | Phone OTP login. Wallet balance RM50. |

### Role systems

**Admin Portal roles** (stored in `role_assignments`):
- `system_admin` — full access, all stores, all settings
- `store_manager` — assigned stores only, no Settings/Translations/Audit Log
- `regional_manager` — all stores, multi-store oversight
- `readonly_analyst` — all stores, view only

**Staff Portal roles** (stored on `staff_profiles.role`):
- `store_manager`, `shift_supervisor` — POS, Kitchen, Ops, all sections
- `cashier`, `server` — POS, Orders, Tables, Bookings, personal sections
- `kitchen_staff` — Kitchen, Orders, Tables, personal sections
- `delivery_coordinator` — Orders, Tables, personal sections

**Staff PIN**: Must be exactly 6 digits. All staff PINs = 123456. Staff whose PIN was never changed (`pin_last_changed_at IS NULL`) are blocked from staff endpoints (`403 must_change_pin`) until they change it.

**Staff money endpoints** (wallet top-up, order payment/discount, voucher/reward apply & redeem, item modify, order cancel) require role `cashier`, `server`, `shift_supervisor`, or `store_manager`; kitchen/delivery/readonly roles get 403. Admin-context staff sessions pass via admin override.

## Admin Portal (130 routes, 30 sections)

### Key features
- Sidebar with 3 sections (Company, Support, Store Ops), store-scoped data
- Floating help button on every page (route-aware, links to relevant guide)
- Inline translation UI on 22 edit pages (5 locales: en, ms, zh, ta, tr)
- Markdown renderer with table support in help center
- BrandProvider for custom branding

### Sections
- **Company**: Dashboard, Stores, Menu (6 sub), Loyalty (4 sub), Marketing (11 sub), Content (6 sub), Reports, Audit Log, Settings (4 sub), Admin User (3 sub), Translations
- **Support**: Customers (3 sub), Notifications (3 sub), Feedback, Help Center
- **Store Ops**: Orders, Refunds, Reservations, Tables, Inventory (6 sub), Equipment (2 sub), Hygiene, Staff (6 sub)

## Staff Portal (17 pages + customer display)

### Pages
| Route | Button | Purpose |
|-------|--------|---------|
| `/pos` | New Order | POS — take orders, process payments |
| `/pos/display` | — | Customer-facing display (cross-device via Redis) |
| `/orders` | Orders | Order queue, unpaid, history |
| `/kitchen` | Kitchen | Kitchen display system (KDS) |
| `/kitchen/[id]` | — | Order detail with status timeline |
| `/tables` | Tables | Table status, QR codes, detail modal |
| `/reservations` | Bookings | Reservation management |
| `/wallet` | Wallet & Rewards | Customer wallet top-up, rewards, vouchers |
| `/time-clock` | Clock In | Clock in/out, break, PIN verification |
| `/shifts` | Shifts | Upcoming shift schedule (30 days) |
| `/tasks` | Tasks | Task list with priorities |
| `/equipment` | Equipment | Equipment status + maintenance reports |
| `/garbage` | Garbage | Garbage disposal log |
| `/grease-trap` | Grease Trap | Grease trap cleaning log |
| `/inventory` | Inventory | Stock levels + inline editing |
| `/wastage` | Wastage | Menu item waste recording |
| `/profile` | Profile | Change password/PIN |
| `/help` | Help | Help articles |
| `/login` | — | Login (email+password or name+PIN) |

### Staff-specific backend endpoints
Staff portal calls `/api/staff/*` (not `/api/admin/*`):
- Menu: `GET /staff/menu/categories`, `GET /staff/menu/items`
- Tables: `GET /staff/tables`, `PATCH /staff/tables/{id}/status`, `POST /staff/tables/{id}/generate-qr`
- Orders: `GET /staff/orders`, `GET /staff/orders/{id}`, `PATCH /staff/orders/{id}/status`, `PATCH /staff/orders/{id}/transfer-table`, `PATCH /staff/orders/{id}/payment`, `POST /staff/orders/{id}/apply-voucher`, `POST /staff/orders/{id}/apply-reward`, `POST /staff/orders/{id}/wallet-payment`, `POST /staff/orders/{id}/items`, `DELETE /staff/orders/{id}/items/{line_item_id}`, `POST /staff/orders/{id}/cancel`
- Reservations: `GET /staff/reservations`, `PATCH /staff/reservations/{id}/status`
- Display: `GET/POST/DELETE /staff/pos/display-state` (Redis-backed; GET is public but requires `?key=<store display_key>` and serves a sanitized state with payment URLs/tokens stripped)
- Auth: `GET /staff/auth/me`, `POST /staff/auth/verify-pin`, `POST /staff/auth/change-pin`, `POST /staff/auth/change-password`
- POS: `POST /staff/pos/orders` (creates order with pay_token for Stripe QR)
- Customers: `GET /staff/customers/search`, `GET /staff/customers/{id}`, `GET /staff/customers/{id}/wallet`
- Wallet/Rewards: `POST /staff/wallets/topup`, `POST /staff/customers/{id}/use-reward/{reward_id}`, `POST /staff/customers/{id}/use-voucher/{voucher_id}`
- Scan: `POST /staff/scan/customer`, `POST /staff/scan/reward/{code}`, `POST /staff/scan/voucher/{code}`

### Customer display (`/pos/display`)
- **Same browser**: BroadcastChannel for instant sync
- **Cross-device**: Redis polling every 2 seconds, requires the per-store `display_key` (`/pos/display?store=N&key=...` — the POS opens it with both params; polled state has pay tokens/URLs stripped and shows a payment-pending prompt instead)
- **Idle screen**: Wallet top-up QR, store branding, clock
- **Payment phases**: browsing → payment → qr_payment → paid
- **Fullscreen + Wake Lock** for kiosk-like operation
- **localStorage persistence** for refresh recovery

### Staff portal technical notes
- `middleware.ts` at project root checks auth on every request — `getBackendUrl()` must not throw
- `lib/api.ts` `resolveApiBase()` falls back to `API_PROXY_URL` in production
- `next.config.ts` rewrites use plain array (afterFiles)
- Layout is a Server Component with `"use client"` AuthProvider

## Customer PWA (27 routes + kiosk)

### Pages
Uses hash-based routing (`usePageRouter.ts`):
- `#home`, `#menu`, `#cart`, `#checkout`, `#orders`, `#order-detail`
- `#wallet`, `#rewards`, `#my-rewards`, `#promotions`, `#my-card`
- `#profile`, `#account-details`, `#settings`, `#payment-methods`
- `#saved-addresses`, `#notifications`, `#history`, `#referral`
- `#reservations`, `#events`, `#checkin`, `#information`, `#legal`
- `#help-support`, `#guest-pay`, `#kiosk`

### Guest restrictions
**Guest-accessible**: home, menu, rewards (view only), cart, promotions, information, events, checkin (action needs login), help-support, legal, guest-pay, kiosk

**Login required**: checkout, orders, order-detail, wallet, my-rewards, profile, account-details, settings, payment-methods, saved-addresses, notifications, history, my-card, referral, reservations

### Self-ordering kiosk (`#kiosk?store=1`)
- Full-screen, touch-optimized ordering for customer-facing LCD
- Flow: Welcome → Order Type → Menu → Cart → Checkout → Success
- 60-second inactivity auto-reset
- Guest mode (no login), fullscreen, wake lock
- No impact on regular PWA experience or iOS/Android compilation

### Payment methods
| Method | When | Description |
|--------|------|-------------|
| Stripe (Card/e-wallet) | All orders | Stripe PaymentElement |
| HitPay | All orders | Online banking, e-wallet |
| Pay at Store | Pickup/Dine In | Pay in person |
| Cash on Delivery | Delivery only | Pay cash on arrival |

### Guest-pay flow
1. Staff POS selects "Stripe QR" → creates order with `pay_token`
2. Display shows QR code deep-linking to `#guest-pay?orderId=X&token=Y`
3. Customer scans QR → opens PWA → sees order summary
4. Customer pays via Stripe or HitPay
5. POS polls order status every 3s (15-min timeout)
6. Display shows "Thank You" screen

## Help Center

Help articles stored in `help_articles` table:

| Portal | Articles | Coverage |
|--------|----------|----------|
| Admin | 23 | 130 routes, 30 sections |
| Staff | 12 | 17 pages + customer display |
| Customer PWA | 13 | 27 routes + kiosk |

All articles use markdown with table support (custom `renderMarkdown()` in `src/lib/markdown.ts` per portal).

## Database

- **Host**: localhost:13334
- **Database**: fnb_enterprise_v3
- **User**: fnb_user
- **Key tables**: admin_accounts, staff_profiles, stores, store_assignments, iam_principals, iam_roles, role_assignments, menu_items, menu_categories, orders, order_line_items, dining_tables, reservations, pos_sessions, wallets, wallet_ledger_entries, loyalty_accounts, loyalty_points_ledger

## Development

### Commands

```bash
# Backend tests
cd v3/backend && source .venv/bin/activate && pytest tests/ -q

# E2E tests
cd v3/e2e-tests && source ../backend/.venv/bin/activate && pytest -q

# TypeScript strict checks
for dir in admin-portal staff-portal customer-pwa; do
  (cd "v3/$dir" && npx tsc --noEmit)
done

# Build portals
for dir in admin-portal staff-portal customer-pwa; do
  (cd "v3/$dir" && npm run build)
done

# Restart portals
pm2 restart admin-portal-v3 staff-portal-v3 --update-env
# Customer PWA needs special handling:
fuser -k 13810/tcp; sleep 2
pm2 delete customer-pwa-v3; sleep 2
cd v3/customer-pwa && API_PROXY_URL=http://127.0.0.1:13800/api NEXT_PUBLIC_API_URL=/api \
  pm2 start "npx next start -p 13810" --name customer-pwa-v3
```

### Test accounts

| Account | Password | Portal access | Notes |
|---------|----------|---------------|-------|
| admin@loyaltysystem.uk | admin123 | Admin (all stores) + Staff (all stores) | system_admin role |
| store@loyaltysystem.uk | store123 | Admin (limited) + Staff (Store 1 + 2) | store_manager role |
| tester@loyaltysystem.uk | test1234 | Admin (all stores) + Staff | system_admin, QA account |
| tester-store@loyaltysystem.uk | Test1234! | Admin (limited) + Staff (Store 1 + 2) | store_manager, QA account |
| staff1@loyaltysystem.uk | staff123 | Staff (Store 1 only) | server role |
| staff2@loyaltysystem.uk | staff123 | Staff (Store 2 only) | server role |
| s1-supervisor@loyaltysystem.uk | staff123 | Staff (Store 1 only) | shift_supervisor, QA |
| s1-cashier@loyaltysystem.uk | staff123 | Staff (Store 1 only) | cashier, QA |
| s1-kitchen@loyaltysystem.uk | staff123 | Staff (Store 1 only) | kitchen_staff, QA |
| s2-server@loyaltysystem.uk | staff123 | Staff (Store 2 only) | server, QA |
| s2-delivery@loyaltysystem.uk | staff123 | Staff (Store 2 only) | delivery_coordinator, QA |
| demo@lokaespresso.my | +60123456001 | Customer PWA | RM50 wallet balance |
| vip@lokaespresso.my | +60123456002 | Customer PWA | RM200 wallet balance |

Staff PIN for all staff accounts: 123456 (pre-set — no forced PIN change on QA accounts)
Staff portal login modes: email+password, name+PIN (with store selection), or email+PIN.

### Environment variables

**Admin portal** (`.env.local`):
- `API_URL=http://127.0.0.1:13800/api`
- `NEXT_PUBLIC_API_URL=/api`

**Staff portal** (`.env.local`):
- `API_PROXY_URL=http://127.0.0.1:13800/api`
- `NEXT_PUBLIC_API_URL=/api`

**Customer PWA** (`.env.local`):
- `API_PROXY_URL=http://127.0.0.1:13800/api`
- `NEXT_PUBLIC_API_URL=/api`
- `NEXT_PUBLIC_APP_URL=https://app.loyaltysystem.uk`

### Important: No throw in production configs
All three portals' `next.config.ts` and `lib/api.ts` must NOT throw errors when env vars are missing in production. Use fallback to `http://127.0.0.1:13800/api` instead. The staff portal's `middleware.ts` at project root also must not throw in its `getBackendUrl()`.

### Customer PWA build note
The customer PWA uses Next.js 16 Turbopack. After rebuilding, the pm2 process must be fully deleted and restarted (not just restarted) to pick up new chunks. Use `fuser -k 13810/tcp` to kill any process holding the port before starting.

## Recent fixes (2026-07-11 Round 32)

### Kiosk modifier support
- Public `/menu/items` endpoint now returns `modifier_groups` and `variants` arrays
- KioskPage renders a modifier drawer when tapping items with modifiers
- `POST /kiosk/orders` accepts `modifier_option_ids` and `variant_id` per line item
- Kiosk backend correctly calculates prices with modifier/variant adjustments

### Low-stock alerts
- `GET /admin/inventory/low-stock` — returns items at or below their reorder level
- Optional `store_id` and `threshold_override` query params

### HitPay wallet top-up
- `POST /wallets/topup/checkout` now accepts `provider` field (`stripe` or `hitpay`)
- HitPay creates a payment request and returns the checkout URL

### Voucher validate made truly public
- `POST /vouchers/validate` no longer requires `ActiveCustomer`
- Customer token is optional — used for ownership/tier checks when present

### Guest feedback
- `POST /feedback` no longer requires `ActiveCustomer`
- Guest feedback stored with `customer_id = NULL`
- `feedback_entries.customer_id` column is now nullable
- `FeedbackEntryOut.customer_id` schema field is `int | None`

### Staff page-level role guards
- POS, Kitchen, Equipment, Garbage, Grease Trap, Inventory, Wastage pages now
  check the user's role before rendering content
- `useStaffRole.tsx` exports `RoleGuard` component for reusable page guards

## Security & reliability hardening (2026-07-20, round 32 audit)

Full-system audit (~60 findings, each verified in code before fixing). Highlights — see `AGENTS.md` "Round 32 — go-live audit & hardening" for the complete list:

- **Payments/wallets**: wallet payments debit the wallet on confirm (row-locked + ledger); customers can no longer self-confirm cash payments or pay already-paid/cancelled orders; HitPay wallet top-up and guest-pay fixed end-to-end; Stripe refund webhook no longer double-counts
- **Auth**: customer accounts are created only AFTER OTP verification (was: account + welcome points before OTP check); `/admin/config` is system_admin-only with sensitive values masked; admin registration can no longer escalate privileges
- **Order lifecycle**: cancellation now reverses loyalty points, vouchers/rewards, and stock; customer self-cancel limited to pending/unpaid orders; voucher usage limits and scopes enforced; reservation double-booking blocked
- **Staff authorization**: money endpoints restricted to cashier/server/shift_supervisor/store_manager; role guards fixed (no more hooks crash) and extended to wallet/kitchen pages
- **Public surface**: rate limits on all unauthenticated mutation endpoints (keyed on real client IP behind Caddy); table scan requires its QR token; customer display state requires the per-store `display_key` and strips payment tokens; avatar uploads fully validated; SVG uploads rejected
- **Frontend fixes**: saved-card flow (missing `stripe.confirmSetup`), percentage-voucher discount, checkout voucher picker, kiosk cart line identity, HitPay return handling, campaign/reward form 422s, empty-date 422s across admin forms, tier progress uses lifetime points
- **Infra**: `infra/db` schema regenerated from models (`scripts/dump_schema_sql.py` → `09_schema_sync.sql`, seeds in `10_seed_data.sql`); Docker backend runs `alembic upgrade head` on boot; Caddy defaults moved to `*.lokaespresso.com`

Known intentional deviations: OTP bypass stays enabled until the lokaespresso.com cutover (then set `otp.bypass_enabled=false` and rotate the code); the tier validity/downgrade evaluation job is not built yet (fields stored only).
- Access-denied message shown when role doesn't match

## Security & reliability hardening (2026-07-29, round 34 audit)

Full fresh audit (5 parallel tracks + infra sweep; every finding verified in code, ~30 fixes). Full details in `AGENTS.md` "Round 34 — full fresh audit & hardening". Highlights:

- **Auth**: cross-domain refresh-token confusion closed (customer/staff tokens could mint admin tokens — proven live pre-fix); admin staff-portal login now enforces StoreAssignment; refresh cookies reach logout (blacklisting actually works); verify-pin lockout; admin-via-staff refresh tokens 30d → 7d
- **Authorization**: central write-guard — `readonly_analyst`/role-less admins get 403 on every admin mutation; store scoping (`require_store_admin`) added across 13 admin modules; POS order creation pinned to the staff member's store
- **Money**: loyalty points credited on payment capture (was: order creation — free-points exploit); Stripe async methods (fpx/grabpay) no longer captured before funds arrive; admin wallet mutations row-locked; refunds reverse points/vouchers/annual spend; POS voucher/reward usage counters enforced; status-PATCH can no longer bypass the cancel flow
- **Public surface**: `/api/menu/items` no longer leaks `cost_price`/internal columns; request body size caps (1 MB JSON / 10 MB multipart); marketing opt-out rate-limited; guest-pay phone linking hardened
- **Frontend**: markdown renderers block `javascript:`/`data:` links ×3 portals; staff logout clears cached identity from localStorage
- **Infra**: PostgreSQL/Redis were internet-reachable (stale containers predating the compose `127.0.0.1` pin) — recreated, now localhost-only, data intact

Verification: 42/42 backend unit tests, 217/217 E2E (15 skipped), tsc ×3 clean, no Alembic drift, exploit probes return 401, zero 500s during the full E2E run.

## Security & reliability hardening (2026-07-30, round 35 audit)

Fresh 6-track audit; every finding re-verified in code before fixing. Full details in `AGENTS.md` "Round 35 — fresh full audit & hardening". Highlights:

- **Auth**: cross-domain ACCESS-token confusion closed (admin token authenticated as the colliding-id customer — round 34 had fixed refresh tokens only); F5 built — `token_version` on all principals revokes sessions on password/PIN change; F7 — refresh-reuse detection kills the whole token family; F8 — login enumeration closed (dummy argon2 verify, uniform 401, lock evaluated after password)
- **Money**: admin payment paths no longer double-charge after partial refund; provider refunds execute after the local Refund row with idempotency keys; `reason_category` validated (was a post-provider 500); cancel guards include `partially_refunded`; Stripe dispute webhooks actually match payments now and reverse loyalty benefits
- **Authorization**: cross-store feedback reply scoped; store_manager platform-wide money mutations (wallet adjust/topup/deduct, points, tiers, customer delete) gated to HQ roles
- **Public surface**: kiosk no longer reactivates banned accounts; admin/staff help articles no longer publicly readable; guest-pay JWTs stripped from uvicorn/Caddy logs; chunked body-cap bypass closed (411); Pillow decompression-bomb cap
- **Infra**: staff portal has a CSP now; `09_schema_sync.sql` regenerated (head `k1e2f3a4b5c6`); `check-all.sh` gates alembic + pytest + lint

Verification: 42/42 backend unit tests, full E2E re-run green, tsc ×3 clean, single Alembic head with no drift, live exploit probes all blocked.


## Security & reliability hardening (2026-08-12, round 36 audit)

Fresh 5-track audit focused on the three newest feature commits (kiosk overhaul, payment_flow, table QR URLs); every finding verified in code before fixing, ~30 fixes. Full details in `AGENTS.md` "Round 36 — audit & hardening". Highlights:

- **Wallet security**: guest-pay wallet payments now require OTP verification to the supplied phone (same `_require_otp_or_bypass` as login — Twilio in production, bypass code in QA) BEFORE any linking/debit; no auto-registration on the wallet path; inactive/deleted customers rejected; already-paid re-check moved inside the debit row lock. Closes an unauthenticated wallet-drain (guest token + any phone number → victim's wallet debited).
- **Kiosk payment flow split**: standing kiosk = always prepaid (pay before food, incl. dine-in); table tablet (`kiosk_mode=tablet`) dine-in = pay-after-meal open tab; PWA dine-in stays open tab. `create_order_from_cart` is channel/mode-aware; `POST /kiosk/orders` accepts `kiosk_mode` ("kiosk"|"tablet", default "kiosk"). Fixes kiosk dine-in reaching the kitchen unpaid and escaping every sweep.
- **Sweep closure**: new shared `auto_cancel_order()` (status + reason + `reverse_order_effects` + `cancel_pending_order_payments`) used by all 4 sweeps; new 5-minute periodic sweeper in the FastAPI lifespan. Uniform predicates: `pending` + `initiated` + `prepaid`; kiosk 15 min, others 2h (was wrongly 30 min on the customer path); open tabs never swept (startup sweep was `order_type != dine_in`). Swept orders now release vouchers/rewards, restore stock, void pending payments, and free table locks.
- **Cancel reversal**: loyalty clawback only fires when points were actually credited (`order_earned` ledger probe — unpaid cancels no longer steal points); `reverse_order_effects` releases `TableStatusSnapshot` when it points at the cancelled order.
- **Payment lifecycle**: counter cash payments advance `pending → confirmed` (staff + admin) so paid orders always reach the kitchen; `_sync_order_payment_status` reverts `payment_status` to `initiated` when no active payments remain (abandoned Stripe/HitPay sessions become sweepable again; HitPay expiry now re-syncs); paid-amount math is net of refunds (POS, admin, split-bill); fully refunded orders leave the live queue/KDS; guest-pay wallet capture now runs the full pipeline (loyalty points, annual spend, lucky-draw, e-invoice hook).
- **Table QR (the round-35 headline feature, actually working now)**: PWA boot parses `?store&table&t` (new shared `lib/tableScan.ts`), calls `/stores/tables/scan`, and sets the dine-in session — camera scans of printed QRs land in a dine-in session instead of the home page; admin-portal QR generator prefers the full-URL payload (was still emitting the unopenable `loka:table:` scheme); POS scanner requires token match when `t` present; scan-legacy requires active tables.
- **GuestPay wallet UI**: phone → Send Code → 6-digit OTP → pay (matches passwordless login); wallet button disabled without phone/valid code.
- **Kiosk UX**: order-placement errors now render on the payment-select screen; tablet mode keeps the staff-set table across orders; inactivity reset branches per mode and clears the previous customer's phone; `kiosk_mode` sent on order creation.
- **Admin/staff API**: orders list pagination `count_stmt` fixed (default view total was 0); staff orders serializer exposes `payment_flow`; `issues=true` skips the 24h window cap.
- **i18n**: ~45 missing locale keys added (bundle hints + all 7 e-invoice keys were missing even from `en.json` and rendered as raw key strings; 34 kiosk + guestPay keys added to `zh.json`).
- **Infra**: all 6 production Caddy confs synced into `infra/host-caddy/` with the JWT-stripping log filter; `infra/db` schema SQL regenerated (payment_flow enum/column/index, head `v1w2x3y4z5a6`); compose app ports pinned to 127.0.0.1; Redis password now required; `ecosystem.config.js` covers all 6 pm2 services; `purge_retention.py` documented with a cron line.

Verification: 58/58 backend unit tests (16 new), 219/219 E2E (16 skipped), tsc ×3 clean, all 6 pm2 services healthy on fresh builds. Live probes: kiosk dine-in → pending+prepaid, guest-pay wallet wrong-OTP → 401, admin list totals correct, staff API exposes payment_flow, periodic sweeper auto-cancels stale kiosk orders with full reversal.

Known follow-up for a later round: `staff_pay_with_wallet` (staff/orders.py) still uses gross captured math for the already-paid check (the net-of-refund fix covered POS pay/admin/split-bill).
