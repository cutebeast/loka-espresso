# FNB Enterprise v3 — Loka Espresso

> **Status**: Live | **Last Audit**: Round 11 (2026-05-25) | **TS**: 0 errors | **Lint**: 0 warnings

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

## Staff Portal (13 pages)

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
| `/equipment` | Daily equipment check + issue reporting with photo upload |
| `/inventory` | Stock count updates (non-FnB) + wastage reporting |

**Key features**: Tip entry (presets + custom), table transfer, order cancel, order modification, idle timeout with 60s warning, equipment check & issue reporting with photos, inventory stock count + waste reporting.

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
| Inventory | Items (FnB/Non-FnB), categories, suppliers, movements, purchase orders |
| Orders | Full order management |
| Notifications | Templates, broadcast, report |
| Settings | Platform config, version control, reservation settings |
| Equipment | CRUD + maintenance logs + reports ledger with photos |
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
- Float/Decimal precision in orders.py: monetary calc uses float() — Numeric(12,4) columns cap precision at DB level

## Round 11 Audit (2026-05-25)

### Backend crash bugs (new Round 10 features)
- 6 model imports missing from `orders.py` — `CustomerVoucher`, `VoucherDefinition`, `CustomerReward`, `RewardCatalog`, `Wallet`, `WalletLedgerEntry`
- AuditLog fields wrong in 3 places (`actor_id`→`principal_id`, `target_type`→`resource_type`, etc.)
- AuditAction enum expanded + migration `a1b2c3d4e5f6`
- OrderLineItem fields wrong (`item_name`→`item_snapshot`, `total_price`→`line_total`, `modifier_ids`→`selected_modifiers`)
- set[int] store_id comparisons fixed in `orders.py` and `reservations.py`
- reservations.py regression: restored accidentally removed `base_stmt`/`count_stmt` definitions

### Staff portal — Equipment check & report (redesign)
- New endpoints: `GET /staff/equipment`, `POST /staff/equipment/{id}/report` (operational/maintenance/broken + photo uploads)
- Model: `image_urls`(JSONB) on `EquipmentMaintenanceLog` + migration
- UI: Report button on every card → inline form with status + description + 5-image upload

### Staff portal — Inventory management (new)
- New endpoints: `GET /staff/inventory`, `POST /staff/inventory/update` (stock count), `POST /staff/inventory/waste` (menu + inventory items)
- Model: `item_type` (fnb/non_fnb) on `InventoryItem` + migration
- New page: `/inventory` — stock counts, update non-FnB items, report waste

### Staff portal — 8 low-severity fixes
- API client: `request<T>` returns `data.items` (claimed fixed in R10 but code unchanged)
- Kitchen detail: raw `fetch()` → `getTables()`; Orders: added `out_for_delivery` kanban column
- Time-clock: invalid pendingAction error handling; timer flicker fix
- Wallet: stale `walletData` reset on error; various dead code/guard fixes

### Admin portal — Fixes + new features
- Reservations page: status values fixed (`cancelled`→`cancelled_by_merchant`), badge map, `party_size` field
- Equipment reports ledger: new `/equipment/reports` page with filters + photo gallery
- Equipment pages: pagination added; create page error feedback
- Menu item editor: removed per-store recipe filter (recipes are global)
- Inventory: `item_type` toggle (FnB/Non-FnB) on create/edit/list
- Customers CSS unit, favicon cleanup, settings typo fixes

### Customer PWA
- Hardcoded store ID 1 fallback removed; cart sync lock → promise queue
- MyRewards frozen timer fixed; focus trap aria-hidden filter fixed

### E2E tests
- ScopeMismatch, wrong admin email, wrong endpoint paths, wrong response parsing fixed
