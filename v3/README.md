# FNB Super App v3 — Project Documentation

*Last updated: 2026-07-11*

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

**Staff PIN**: Must be exactly 6 digits. All staff PINs = 123456.

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
- Display: `GET/POST/DELETE /staff/pos/display-state` (Redis-backed)
- Auth: `GET /staff/auth/me`, `POST /staff/auth/verify-pin`, `POST /staff/auth/change-pin`, `POST /staff/auth/change-password`
- POS: `POST /staff/pos/orders` (creates order with pay_token for Stripe QR)
- Customers: `GET /staff/customers/search`, `GET /staff/customers/{id}`, `GET /staff/customers/{id}/wallet`
- Wallet/Rewards: `POST /staff/wallets/topup`, `POST /staff/customers/{id}/use-reward/{reward_id}`, `POST /staff/customers/{id}/use-voucher/{voucher_id}`
- Scan: `POST /staff/scan/customer`, `POST /staff/scan/reward/{code}`, `POST /staff/scan/voucher/{code}`

### Customer display (`/pos/display`)
- **Same browser**: BroadcastChannel for instant sync
- **Cross-device**: Redis polling every 2 seconds
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
| staff1@loyaltysystem.uk | staff123 | Staff (Store 1 only) | server role |
| staff2@loyaltysystem.uk | staff123 | Staff (Store 2 only) | server role |
| demo@lokaespresso.my | +60123456001 | Customer PWA | RM50 wallet balance |
| vip@lokaespresso.my | +60123456002 | Customer PWA | RM200 wallet balance |

Staff PIN for all staff accounts: 123456

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
