# FNB Super App v3 — Project Documentation

## Overview

Loka Espresso enterprise FNB platform with three portals and a backend API.

| Component | URL (dev) | URL (live) | Port |
|-----------|-----------|------------|------|
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
│   │   │   ├── staff/     # Staff endpoints (CurrentStaff auth)
│   │   │   ├── public/    # Public endpoints (help articles, branding)
│   │   │   └── payment.py # Payment + guest-pay endpoints
│   │   ├── core/          # Security, database, cache, config
│   │   ├── models/        # SQLAlchemy models
│   │   └── schemas/       # Pydantic schemas (Money type for Decimal)
│   ├── scripts/           # Seed scripts
│   └── tests/             # Pytest unit tests
├── admin-portal/      # Next.js 16 (App Router, TypeScript strict)
├── staff-portal/      # Next.js 16 (App Router, TypeScript strict)
├── customer-pwa/      # Next.js 16 (hash-based router, TypeScript strict)
└── e2e-tests/         # Playwright + pytest E2E tests
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
| Admin account (`admin@loyaltysystem.uk`) | ✅ Full | ✅ All assigned stores | Admin login → admin_token. Staff login → staff_token. |
| Store manager (`store@loyaltysystem.uk`) | ✅ Limited | ✅ All assigned stores | Same as above. Admin role = store_manager. |
| Staff profile (`staff1@loyaltysystem.uk`) | ❌ | ✅ Assigned store only | Staff login only. No admin account. |

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

## Staff Portal

### Pages (17 routes)

| Route | Button name | Purpose |
|-------|------------|---------|
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

Staff portal calls `/api/staff/*` endpoints (not `/api/admin/*`):

- `GET /staff/menu/categories` — list menu categories
- `GET /staff/menu/items` — list menu items with prices
- `GET /staff/tables` — list dining tables with current status
- `GET /staff/orders` — list orders for staff member's store
- `GET /staff/orders/{id}` — order detail with line items
- `PATCH /staff/orders/{id}/status` — update order status
- `PATCH /staff/orders/{id}/transfer-table` — transfer order to another table
- `GET /staff/reservations` — list reservations for store
- `PATCH /staff/reservations/{id}/status` — update reservation status
- `PATCH /staff/tables/{id}/status` — update table status
- `GET/POST/DELETE /staff/pos/display-state` — POS display sync via Redis
- `GET /staff/auth/me` — current staff profile
- `POST /staff/auth/verify-pin` — PIN verification
- `POST /staff/auth/change-pin` — change PIN
- `POST /staff/auth/change-password` — change password

### Customer display (`/pos/display`)

Supports two deployment modes:
1. **Same browser (dual-screen)**: BroadcastChannel for instant sync
2. **Separate device (tablet)**: Redis polling every 2 seconds

Features:
- Idle screen with wallet top-up QR
- Live cart display as staff builds order
- Stripe QR payment (customer scans → PWA guest-pay → pays on phone)
- Fullscreen + Wake Lock for kiosk-like operation
- localStorage persistence for refresh recovery

## Customer PWA

### Pages (27 routes including kiosk)

Uses hash-based routing (`usePageRouter.ts`):
- `#home`, `#menu`, `#cart`, `#checkout`, `#orders`, `#order-detail`
- `#wallet`, `#rewards`, `#my-rewards`, `#promotions`, `#my-card`
- `#profile`, `#account-details`, `#settings`, `#payment-methods`
- `#saved-addresses`, `#notifications`, `#history`, `#referral`
- `#reservations`, `#events`, `#checkin`, `#information`, `#legal`
- `#help-support`, `#guest-pay`, `#kiosk`

### Self-ordering kiosk (`#kiosk?store=1`)

Full-screen touch-optimized ordering for customer-facing LCD:
- Welcome → Order Type → Menu → Cart → Checkout → Success
- 60-second inactivity auto-reset
- Guest mode (no login)
- Payment QR on success screen
- Fullscreen + Wake Lock

## Admin Portal

### Pages (130 routes across 30 sections)

- **Company**: Dashboard, Stores, Menu (6 sub), Loyalty (4 sub), Marketing (11 sub), Content (6 sub), Reports, Audit Log, Settings (4 sub), Admin User (3 sub), Translations
- **Support**: Customers (3 sub), Notifications (3 sub), Feedback, Help Center
- **Store Ops**: Orders, Refunds, Reservations, Tables, Inventory (6 sub), Equipment (2 sub), Hygiene, Staff (6 sub)

### Features
- Floating help button on every page (route-aware)
- Inline translation UI on 22 edit pages (5 locales: en, ms, zh, ta, tr)
- Sidebar with 3 sections, store-scoped data

## Help Center

Help articles stored in `help_articles` table:
- 23 admin articles
- 12 staff articles
- 13 customer articles (including kiosk guide)

All articles use markdown with table support (custom `renderMarkdown()` in `src/lib/markdown.ts`).

## Database

- **Host**: localhost:13334
- **Database**: fnb_enterprise_v3
- **User**: fnb_user
- **Key tables**: admin_accounts, staff_profiles, stores, store_assignments, iam_principals, iam_roles, role_assignments, menu_items, menu_categories, orders, dining_tables, reservations, pos_sessions

## Development

### Commands

```bash
# Backend tests
cd v3/backend && source .venv/bin/activate && pytest tests/ -q

# E2E tests
cd v3/e2e-tests && source ../backend/.venv/bin/activate && pytest -q

# TypeScript strict checks
for dir in admin-portal staff-portal customer-pwa; do
  cd "v3/$dir" && npx tsc --noEmit
done

# Build portals
for dir in admin-portal staff-portal customer-pwa; do
  cd "v3/$dir" && npm run build
done

# Restart portals
pm2 restart admin-portal-v3 staff-portal-v3 customer-pwa-v3 --update-env
```

### Test accounts

| Account | Password | Access |
|---------|----------|--------|
| admin@loyaltysystem.uk | admin123 | Admin Portal (all stores) + Staff Portal (all stores) |
| store@loyaltysystem.uk | store123 | Admin Portal (limited) + Staff Portal (Store 1 + 2) |
| staff1@loyaltysystem.uk | staff123 | Staff Portal (Store 1 only) |
| staff2@loyaltysystem.uk | staff123 | Staff Portal (Store 2 only) |

Staff PIN for all accounts: 123456

### Staff PIN validation
PIN must be exactly 6 digits. All staff PINs were re-hashed to `123456` using argon2id.

### Environment variables

**Staff portal** (`.env.local`):
- `API_PROXY_URL=http://127.0.0.1:13800/api` — backend URL for server-side proxy
- `NEXT_PUBLIC_API_URL=/api` — client-side API prefix

**Admin portal** (`.env.local`):
- `API_URL=http://127.0.0.1:13800/api` — backend URL
- `NEXT_PUBLIC_API_URL=/api` — client-side API prefix

**Customer PWA** (`.env.local`):
- `API_PROXY_URL=http://127.0.0.1:13800/api`
- `NEXT_PUBLIC_API_URL=/api`
- `NEXT_PUBLIC_APP_URL=https://app.loyaltysystem.uk`
