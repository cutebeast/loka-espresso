# FNB Super-App — Architecture Overview

> Last updated: 2026-04-13 | Phase 2 Complete

## System Architecture

```
                    ┌──────────────────────┐
                    │   Cloudflare CDN     │
                    │   (DNS + WAF)        │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   Caddy Reverse Proxy │
                    │   :443 (TLS)          │
                    │   Origin certs from   │
                    │   Cloudflare          │
                    └──┬────────────────┬───┘
                       │                │
          admin.loyaltysystem.uk   app.loyaltysystem.uk
                       │                │
         ┌─────────────┼────────────────┼──────────┐
         │             │                │          │
    /api/*,:8000  /*,:3001     /api/*,:8000  /*,:3002
         │             │                │          │
    ┌────▼────┐  ┌─────▼─────┐          │   ┌──────▼──────┐
    │ FastAPI  │  │ Next.js 16│          │   │ Next.js 16  │
    │ Backend  │  │ Merchant  │          │   │ Customer PWA│
    │ :8000    │  │ :3001     │          │   │ :3002       │
    └────┬─────┘  └───────────┘          │   └─────────────┘
         │                               │
    ┌────▼───────────────────────────────▼──┐
    │   Docker PostgreSQL 16                │
    │   Container: fnb-db  Port: 5433       │
    │   Database: fnb   Volume: fnb-db-data │
    └───────────────────────────────────────┘
```

## Server Details

| Item | Value |
|------|-------|
| Server IP | `147.93.158.244` |
| OS | Linux (Ubuntu/Debian) |
| Domains | `admin.loyaltysystem.uk`, `app.loyaltysystem.uk` |
| TLS | Cloudflare Origin Certificate (valid until 2041) |
| TLS Cert | `/etc/ssl/certs/loyaltysystem-origin.pem` |
| TLS Key | `/etc/ssl/private/loyaltysystem-origin.key` |

## Services (systemd)

| Service | Purpose | Port | Working Directory |
|---------|---------|------|-------------------|
| `fnb-backend` | FastAPI API | 8000 | `/root/fnb-super-app/backend/` |
| `fnb-admin` | Merchant Dashboard (Next.js) | 3001 | `/root/fnb-super-app/frontend/` |
| `fnb-app` | Customer PWA (Next.js) | 3002 | `/root/fnb-super-app/customer-app/` |
| Docker `fnb-db` | PostgreSQL 16 | 5433 | Docker volume `fnb-db-data` |

## Caddy Routing

### `admin.loyaltysystem.uk`
- `/api/*`, `/docs`, `/health` → `localhost:8000` (Backend)
- `/*` → `localhost:3001` (Merchant Dashboard)

### `app.loyaltysystem.uk`
- `/api/*`, `/health` → `localhost:8000` (Backend)
- `/*` → `localhost:3002` (Customer PWA)

Config files:
- `/etc/caddy/sites/fnb-admin.conf`
- `/etc/caddy/sites/fnb-app.conf`

## Backend Stack

| Component | Technology |
|-----------|-----------|
| Framework | FastAPI (async) |
| ORM | SQLAlchemy 2.x (async) |
| Database | PostgreSQL 16 (Docker, asyncpg driver) |
| Migrations | Alembic |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| Settings | pydantic-settings |
| Server | Uvicorn |

## Frontend Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16 + TypeScript |
| Styling | Tailwind CSS 4 |
| Architecture | Single-page client components (no SSR routing) |
| Merchant | 12 component files in `src/components/` (pages, modals, charts) |
| Customer | 10 component files + shared React Context (`src/lib/app-context.tsx`) |

## Project Structure

```
/root/fnb-super-app/
├── .env                          # Environment variables (DATABASE_URL, JWT_SECRET, etc.)
├── backend/
│   ├── .venv/                    # Python virtualenv (use for all commands)
│   ├── alembic/
 │   │   ├── versions/             # 7 migration files
│   │   ├── env.py
│   │   └── script.py.mako
│   ├── app/
│   │   ├── main.py               # FastAPI app
│   │   ├── core/
│   │   │   ├── config.py         # Settings (pydantic-settings)
│   │   │   ├── database.py       # Async SQLAlchemy engine
│   │   │   ├── security.py       # JWT + ACL system + token blacklist check
│   │   │   └── audit.py          # log_action() helper
│   │   ├── models/               # 15 model files, 41 tables
│   │   ├── schemas/              # Pydantic request/response schemas
│   │   └── api/v1/
│   │       ├── router.py         # Assembles all endpoint routers
│   │       └── endpoints/        # 29 endpoint files, 112 routes
│   └── seed_full.sql             # Comprehensive seed data
├── frontend/                     # Merchant Dashboard (Next.js)
│   └── src/
│       ├── app/page.tsx          # Main SPA entry
│       ├── components/           # 12 component files
│       │   ├── pages/            # DashboardPage, OrdersPage, MenuPage, TablesPage, CustomersPage
│       │   ├── charts.tsx        # SVG BarChart, DonutChart, SparkLine
│       │   ├── LoginScreen.tsx
│       │   ├── Sidebar.tsx
│       │   └── Modals.tsx        # All modal forms
│       └── lib/
│           ├── merchant-api.tsx  # API helpers
│           └── merchant-types.ts # TypeScript interfaces
├── customer-app/                 # Customer PWA (Next.js)
│   └── src/
│       ├── app/page.tsx          # Entry → AppShell
│       ├── components/           # 10 component files
│       │   ├── AppShell.tsx      # Main shell (header, nav, modals)
│       │   ├── HomePage.tsx
│       │   ├── MenuPage.tsx
│       │   ├── RewardsPage.tsx
│       │   ├── CartPage.tsx
│       │   ├── OrdersPage.tsx
│       │   ├── ProfilePage.tsx
│       │   ├── HistoryPage.tsx
│       │   ├── LoginModal.tsx
│       │   └── StoreLocator.tsx
│       └── lib/
│           ├── api.ts            # API helper + types
│           └── app-context.tsx   # Shared React Context (state management)
└── docs/                         # Documentation
```

## Environment Variables (`.env`)

Located at `/root/fnb-super-app/.env`. Resolved via `env_file = "../.env"` from `app/core/`.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (asyncpg) |
| `JWT_SECRET` | JWT signing key |
| `JWT_ALGORITHM` | Default: HS256 |
| `JWT_EXPIRE_MINUTES` | Token expiry |
| `UPLOAD_DIR` | File upload directory |
| `CORS_ORIGINS` | Allowed origins (comma-separated) |

## Data Scope Model

| Scope | Description | Tables |
|-------|-------------|--------|
| **GLOBAL** | Shared across all stores | users, vouchers, rewards, loyalty_accounts, loyalty_tiers, wallets, user_addresses, referrals |
| **PER-STORE** | Scoped to a single store | stores, menu_categories, menu_items, store_tables, inventory_items, staff, staff_shifts |
| **HYBRID** | Global user + store context | orders, cart_items, feedback, loyalty_transactions, user_rewards, user_vouchers |

## Ordering Modes

1. **Dine-in** — QR code scan at table (`table_id` required)
2. **Pickup** — Scheduled time slots (`pickup_time` required)
3. **Delivery** — Address-based with delivery fee (`delivery_address` required)

## Key Design Decisions

- Rewards ≠ Vouchers: Rewards cost loyalty points; Vouchers are promo codes
- Payments are stubs (wire Stripe later)
- WhatsApp/SMS notifications are stubs
- `orders.items` is JSON (backward compat) + `order_items` table (normalized)
- `promos` table dropped in v4 → consolidated into `vouchers` + `promo_banners`
- Naive datetimes only (all models use `datetime.utcnow()`)
- Merchant frontend is a single `'use client'` SPA (no Next.js routing)
- Soft deletes on `menu_items`, `vouchers`, `rewards` via `deleted_at` column
- Table occupancy auto-updated via PostgreSQL trigger on order status changes
- Staff unique constraint: `(store_id, user_id) WHERE user_id IS NOT NULL` — prevents duplicate staff records at the same store
- Cart enforces single-store per cart — adding items from a different store returns 400
- Referral codes can only be applied within 7 days of account creation

## Security

- **JWT Token Blacklist**: Every JWT includes a `jti` claim. On logout, the JTI is stored in the `token_blacklist` table. `get_current_user()` checks the blacklist on every request.
- **PIN Rate Limiting**: Staff clock-in attempts are rate-limited to 5 per 5 minutes per staff member (database-backed via `pin_attempts` table).
- **API Rate Limiting**: slowapi on auth endpoints — send-otp 5/min, register 5/min, login 10/min. Shared Limiter instance across all decorated endpoints.
- **Soft Deletes**: `menu_items`, `vouchers`, `rewards` use `deleted_at`. GET endpoints filter `WHERE deleted_at IS NULL` by default; admin endpoints accept `?include_deleted=true`.
- **File Upload Validation**: 5MB max size, only JPEG/PNG/WebP/GIF MIME types allowed.
- **Order Cancel Rollback**: Cancelling an order reverses loyalty points with a negative `LoyaltyTransaction`.
- **Cross-Store Cart Guard**: Adding items from a different store returns 400. User must clear cart first.
- **ACL**: Two-tier access control — `UserRole` (admin/store_owner/customer) + `StaffRole` (manager/assistant_manager/barista/cashier/delivery) with per-store isolation.
- **Delivery Provider**: Delivery orders set `delivery_provider` field (defaults to `"internal"`, can be `"grab"`, `"panda"`, etc.).

## Phase Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Core backend (112 endpoints, 41 tables), merchant dashboard, customer PWA, security hardening |
| Phase 2 | ✅ Complete | Production readiness — bug fixes, rate limiting, soft delete filters, charts, PWA refactor |
| Phase 3 | 🔲 Pending | External integrations — Stripe payments, Twilio SMS, WhatsApp Business, Firebase FCM |
