# FNB Enterprise v3 — Loka Espresso

> **Status**: Live | **Last Audit**: Round 10 (2026-05-24) | **TS**: 0 errors | **Lint**: 0 warnings

## Services

| Service | Stack | Port | Build |
|---------|-------|------|-------|
| **Backend** | FastAPI + SQLAlchemy async | 13800 | `uvicorn app.main:app` |
| **Staff Portal** | Next.js 16 + pure CSS | 13820 | `npm run build && npx next start -p 13820` |
| **Admin Portal** | Next.js 16 + pure CSS | 13830 | `npm run build && npx next start -p 13830` |
| **Customer PWA** | Next.js 16 + pure CSS | 13810 | `npm run build && npx next start -p 13810` |

## Quick Start

```bash
# Infrastructure
cd v3/infra/docker && docker compose up -d postgres redis

# Database
cd v3/backend && alembic upgrade head && python scripts/seed_v3.py

# Backend
cd v3/backend && uvicorn app.main:app --reload --port 13800

# Frontends (each in its own terminal)
cd v3/staff-portal    && npm run dev   # → localhost:13820
cd v3/admin-portal    && npm run dev   # → localhost:13830
cd v3/customer-pwa    && npm run dev   # → localhost:13810

# E2E Tests
cd v3/e2e-tests && pip install -r requirements.txt && pytest -v

# Full audit
cd v3 && bash scripts/check-all.sh
```

## Production (PM2)

```bash
pm2 start npm --name staff-portal-v3    --cwd v3/staff-portal    -- start -- -p 13820
pm2 start npm --name admin-portal-v3    --cwd v3/admin-portal    -- start -- -p 13830
pm2 start npm --name customer-pwa-v3    --cwd v3/customer-pwa    -- start -- -p 13810
pm2 start v3/backend/.venv/bin/python --name v3-backend -- -m uvicorn app.main:app --port 13800
pm2 save
```

## Staff Portal (12 pages)

POS + Kitchen Display + Order Tracking for service crew:

| Page | Purpose |
|------|---------|
| `/login` | Store selector + name/PIN or email login |
| `/` | Dashboard with KPI cards + nav grid |
| `/pos` | POS terminal — menu grid, cart, table, checkout with tips |
| `/orders` | Order list — kanban, queue/unpaid/history tabs |
| `/kitchen` | Kitchen display — 5s polling, urgency timers, audio |
| `/kitchen/[id]` | Order detail — status updates, cancel, table transfer |
| `/tables` | Table management — QR codes, status overview |
| `/reservations` | Reservation confirm/cancel |
| `/time-clock` | Clock in/out with PIN |
| `/wallet` | Customer wallet search, top-up, rewards, vouchers |
| `/profile` | Change password/PIN |
| `/equipment` | Equipment status and maintenance dates |

**Key features**: Tip entry (presets + custom), table transfer, order cancel, order modification, idle timeout with 60s warning, equipment status from admin config.

## Admin Portal (90+ pages)

Full CRUD dashboard for management:

| Section | Pages |
|---------|-------|
| Dashboard | KPI metrics, store selector |
| Stores | CRUD, settings, operating hours |
| Menu | Categories, items, allergens, dietary tags, tax |
| Loyalty | Tiers, accounts, ledger, settings |
| Marketing | Rewards, promotions, vouchers, surveys, campaigns, referrals, checkins |
| Content | Info cards, products, events, system pages, PWA splash |
| Customers | Management, consents, devices |
| Staff | Profiles, roles, shifts, tips |
| Inventory | Categories, items, suppliers, movements, purchase orders |
| Orders | Full order management |
| Notifications | Templates, broadcast, report |
| Settings | Platform config, version control, reservation settings |
| Equipment | CRUD + maintenance logs |
| Tables | Table configuration by store |
| Translations | PWA UI translations with auto-translate |
| Other | Profile, audit log, reports, feedback, refunds, reservations, admins/roles |

## Database

- **Database**: `fnb_enterprise_v3` (PostgreSQL)
- **Models**: 24 domain-organized SQLAlchemy models
- **Migrations**: Alembic (10 migrations)
- **Key decisions**: Wallet double-entry ledger, loyalty points ledger with FIFO expiry, staff PINs bcrypt-hashed, DB-driven platform config

## Design Decisions

1. **New Database**: `fnb_enterprise_v3` — clean slate
2. **Separate Identity Domains**: Customer ≠ Staff ≠ Admin, unified via `iam_principals`
3. **Wallet**: Double-entry ledger — no mutable `balance` column
4. **Loyalty**: Points ledger with FIFO expiry, tier auto-computation
5. **Staff PINs**: Bcrypt-hashed
6. **DB-Driven Config**: Feature flags in `platform_config` table
7. **Pure CSS**: CSS variables design system, no frameworks
8. **Client-Side Auth**: localStorage JWT tokens with auto-refresh on 401
9. **Minimal Seed**: `seed_v3.py` only creates admin + roles (105 lines); everything else via API

## Round 10 Audit (2026-05-24)

### Backend crash-loop fix
Backend had 2000+ restarts over 23 hours due to:
- `services/__init__.py` importing 6 non-existent functions
- `services/order.py` importing `with_for_update` (is a method)
- `wallet.py` importing `AuditLog` from wrong module
- Alembic migration never applied to production DB
- `refunds.updated_at` column missing from SQL seed

### Route ordering fix
FastAPI route shadowing: `/{staff_id}` matched before `/shifts` and `/templates` → 422 errors. Reordered routes in `staff.py` and `notifications.py`.

### API client fix
`request<T>` returned paginated wrapper `{items:[...]}` cast as `T[]` → `.map is not a function` at runtime. Fixed to return `data.items` directly.

### Admin portal fixes
- Layout: flex container added (sidebar + content were stacking vertically)
- Dietary-tags PATCH path fixed
- Version page auth fixed (was bare `fetch()`)
- Store PATCH: MissingGreenlet — removed `db.refresh()` + manual output construction
- Profile page created (`/profile`)
- 10 unused boilerplate SVGs deleted

### Staff portal — F&B features added
- **Tip entry**: `tip_amount` schema, 5%/10%/15%/20% presets + custom
- **Table transfer**: `PATCH /admin/orders/{id}/transfer-table` + UI
- **Order cancel**: `POST /admin/orders/{id}/cancel`
- **Order modification**: `POST .../items` (add), `DELETE .../items/{id}` (void)
- **Equipment view**: new `/equipment` page from admin equipment config
- **Idle timeout**: 60s warning banner before logout
- **Kitchen**: 5s polling, login UX improvements, user-friendly error page

### Customer PWA fixes
- SW offline orders: `authToken` stored in record + sent on replay
- Token refresh: URL guard prevents infinite recursion
- Cart sync: `_syncLock` mutex
- idbStorage: error visibility

### Known remaining
- Card/QR payment: placeholder UI (Stripe integration next week)
- Bill splitting: not needed (premium KL venues)
- Customer PWA i18n: ~25 lines incomplete (English fallback)
