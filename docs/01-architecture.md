# FNB Super-App — Architecture Overview

> Last updated: 2026-04-14 | Phase 3 Backend Ready

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
- `/api/*`, `/docs`, `/openapi.json`, `/redoc`, `/health`, `/uploads/*` → `localhost:8000` (Backend)
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
| Merchant | 18 pages across 5 sidebar groups (Overview, Store Ops, Marketing, Analytics, System) |
| Customer | Phase 3 — not yet rebuilt with new wallet API |

## Project Structure

```
/root/fnb-super-app/
├── .env                          # Environment variables (DATABASE_URL, JWT_SECRET, etc.)
├── backend/
│   ├── .venv/                    # Python virtualenv (use for all commands)
│   ├── alembic/
│   │   ├── versions/             # 14 migration files (initial + 5 marketing + 5 wallet)
│   │   ├── env.py
│   │   └── script.py.mako
│   ├── app/
│   │   ├── main.py               # FastAPI app
│   │   ├── core/
│   │   │   ├── config.py         # Settings (pydantic-settings)
│   │   │   ├── database.py       # Async SQLAlchemy engine
│   │   │   ├── security.py       # JWT + ACL system + token blacklist check
│   │   │   └── audit.py          # log_action() helper
│   │   ├── models/               # 16 model files, 45 tables
│   │   ├── schemas/              # Pydantic request/response schemas
│   │   └── api/v1/
│   │       ├── router.py         # Assembles all endpoint routers (34 routers)
│   │       └── endpoints/        # 34 endpoint files, 163 routes
│   └── seed_full.sql             # Comprehensive seed data
├── frontend/                     # Merchant Dashboard (Next.js)
│   └── src/
│       ├── app/page.tsx          # Main SPA entry
│       ├── components/
│       │   ├── pages/            # 18 page components (5 groups)
│       │   │   ├── DashboardPage.tsx
│       │   │   ├── OrdersPage.tsx
│       │   │   ├── MenuPage.tsx
│       │   │   ├── InventoryPage.tsx
│       │   │   ├── TablesPage.tsx
│       │   │   ├── StaffPage.tsx
│       │   │   ├── RewardsPage.tsx        # Marketing group
│       │   │   ├── VouchersPage.tsx       # Marketing group
│       │   │   ├── PromotionsPage.tsx     # Marketing group
│       │   │   ├── FeedbackPage.tsx       # Marketing group
│       │   │   ├── SurveysPage.tsx        # Marketing group
│       │   │   ├── MarketingReportsPage.tsx # Marketing group
│       │   │   ├── SalesReportsPage.tsx
│       │   │   ├── CustomersPage.tsx
│       │   │   ├── NotificationsPage.tsx
│       │   │   ├── AuditLogPage.tsx
│       │   │   ├── LoyaltyRulesPage.tsx
│       │   │   └── StoreSettingsPage.tsx
│       │   ├── charts.tsx        # SVG BarChart, DonutChart, SparkLine
│       │   ├── LoginScreen.tsx
│       │   ├── Sidebar.tsx
│       │   └── Modals.tsx
│       └── lib/
│           ├── merchant-api.tsx  # API helpers
│           └── merchant-types.ts # TypeScript interfaces
├── customer-app/                 # Customer PWA (Next.js) — Phase 3 rebuild pending
└── docs/                         # Documentation (5 files)
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

## Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@loyaltysystem.uk` | `admin123` |

## Data Scope Model

| Scope | Description | Tables |
|-------|-------------|--------|
| **GLOBAL** | Shared across all stores | users, vouchers, rewards, loyalty_accounts, loyalty_tiers, wallets, user_addresses, referrals, surveys |
| **PER-STORE** | Scoped to a single store | stores, menu_categories, menu_items, store_tables, inventory_items, staff, staff_shifts |
| **HYBRID** | Global user + optional store context | orders, cart_items, feedback, loyalty_transactions, user_rewards, user_vouchers, promo_banners |

## Ordering Modes

1. **Dine-in** — QR code scan at table (`table_id` required)
2. **Pickup** — Scheduled time slots (`pickup_time` required)
3. **Delivery** — Address-based with delivery fee (`delivery_address` required)

## Customer Wallet Architecture

The PWA "My Wallet" screen shows three sections, backed by dedicated endpoints:

| Section | Data Source | Endpoint | Instance Pattern |
|---------|------------|----------|------------------|
| **My Rewards** | `user_rewards` (status=available) | `GET /me/wallet` | Catalog: `rewards` → Instance: `user_rewards` |
| **My Vouchers** | `user_vouchers` (status=available) | `GET /me/wallet` | Catalog: `vouchers` → Instance: `user_vouchers` |
| **Cash Balance** | `wallets` | `GET /me/wallet` | Direct balance from `wallets` table |

### Catalog → Instance Pattern
- **Catalog** (admin creates): `rewards` and `vouchers` define the template
- **Instance** (per-customer): `user_rewards` and `user_vouchers` are created on redeem/claim
- Each instance has: unique scannable code, per-instance expiry, status (available/used/expired), frozen discount details
- `validity_days` on catalog determines instance expiry after issuance

### Instance Lifecycle
```
Customer redeems reward → user_rewards created (status=available, code=RWD-1-A3F2B1, expires_at=now+30d)
Barista scans code     → user_rewards.status = "used", used_at = now
Cron runs              → user_rewards WHERE expires_at < now → status = "expired"
```

### Voucher Acquisition Sources
| Source | `user_vouchers.source` | Trigger |
|--------|----------------------|---------|
| Survey completion | `survey` | Customer submits survey with `reward_voucher_id` |
| Promo banner claim | `promo_detail` | Customer taps banner → claims linked voucher |
| Admin grant | `admin_grant` | Admin assigns voucher to customer |
| Loyalty | `loyalty` | Points-based reward (future) |

## Key Design Decisions

- **Rewards ≠ Vouchers**: Rewards cost loyalty points; Vouchers are promo codes/freebies
- **Tier based on lifetime points**: `total_points_earned` (cumulative) — does NOT drop when points spent
- **Company-wide assets**: Rewards, vouchers, surveys, promos are not per-store
- **Feedback is company-wide**: Store is optional on feedback (NOT per-store)
- **Surveys max 5 questions**: Types limited to text, single_choice, rating, dropdown
- **Promotion action types**: `detail` (show info + link to voucher), `survey` (open survey → auto-grant voucher)
- **Per-instance codes**: Each `user_voucher` and `user_reward` gets a unique code for barista scanning
- Payments are stubs (wire Stripe later)
- WhatsApp/SMS notifications are stubs
- `orders.items` is JSON (backward compat) + `order_items` table (normalized)
- `promos` table dropped in v4 → consolidated into `vouchers` + `promo_banners`
- Naive datetimes replaced with timezone-aware: all models use `datetime.now(timezone.utc)`
- Merchant frontend is a single `'use client'` SPA (no Next.js routing)
- Soft deletes on `menu_items`, `vouchers`, `rewards` via `deleted_at` column
- Table occupancy auto-updated via PostgreSQL trigger on order status changes
- Staff unique constraint: `(store_id, user_id) WHERE user_id IS NOT NULL`
- Cart enforces single-store per cart — adding items from a different store returns 400
- Referral codes can only be applied within 7 days of account creation

## Security

- **JWT Token Blacklist**: Every JWT includes a `jti` claim. On logout, the JTI is stored in the `token_blacklist` table. `get_current_user()` checks the blacklist on every request.
- **PIN Rate Limiting**: Staff clock-in attempts are rate-limited to 5 per 5 minutes per staff member (database-backed via `pin_attempts` table).
- **API Rate Limiting**: slowapi on auth endpoints — send-otp 5/min, register 5/min, login 10/min.
- **Soft Deletes**: `menu_items`, `vouchers`, `rewards` use `deleted_at`. GET endpoints filter `WHERE deleted_at IS NULL` by default.
- **File Upload Validation**: 5MB max size, only JPEG/PNG/WebP/GIF MIME types allowed.
- **Order Cancel Rollback**: Cancelling an order reverses loyalty points with a negative `LoyaltyTransaction`.
- **Cross-Store Cart Guard**: Adding items from a different store returns 400.
- **ACL**: Two-tier access control — `UserRole` (admin/store_owner/customer) + `StaffRole` (manager/assistant_manager/barista/cashier/delivery) with per-store isolation.
- **Repeat Customer Protection**: System guards against duplicate voucher claims, duplicate survey submissions, and duplicate reward redemptions.
- **Audit Log Hooks**: All critical admin actions are logged.
- **Token Blacklist Auto-Cleanup**: Background task runs every 24 hours, purging expired `token_blacklist` rows.

## Phase Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Core backend (140 endpoints, 41 tables), merchant dashboard, customer PWA, security hardening |
| Phase 2 | ✅ Complete | Production readiness — bug fixes, rate limiting, soft delete filters, charts, PWA refactor |
| Pre-Phase 3 | ✅ Complete | Hardening — cross-store validation, self-referral guard, token blacklist cleanup, audit log hooks, timezone-aware datetimes |
| Marketing Group | ✅ Complete | 6 admin pages (Rewards, Vouchers, Promotions, Feedback, Surveys, Marketing Reports) + 5 new PWA endpoint files + 5 migrations + customer wallet infrastructure |
| Phase 3 | 🔲 Pending | Customer PWA rebuild using new wallet API, Stripe payments, Twilio SMS, WhatsApp Business, Firebase FCM |

## Customer Account Recovery — Design Notes

### Problem
Customers use passwordless login (OTP via phone). If they lose/change their phone number, they are locked out permanently with no recovery path.

### Solution: Email as Recovery Channel
- Admin can update customer phone/email via `PUT /admin/customers/{user_id}`
- Customer app **Profile/Settings** page should show a persistent reminder banner when email is not set
- Future Phase 3: Email-based OTP flow for phone number change (customer self-service)
