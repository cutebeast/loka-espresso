# FNB Super App v3 — Agent Documentation

## Project Overview

Multi-app F&B platform ("Loka Espresso") rebuilt on v3 architecture:

| Component | Stack | Port | TypeScript/Python |
|-----------|-------|------|-------------------|
| **Backend** | FastAPI + SQLAlchemy async | 13800 | Python 3.12+ |
| **Staff Portal** | Next.js 16 (Turbopack) + pure CSS | 13820 | TypeScript strict |
| **Admin Portal** | Next.js 16 (Turbopack) + pure CSS | 13830 | TypeScript strict |
| **Customer PWA** | Next.js 16 (Turbopack) + pure CSS | 13810 | TypeScript strict |

---

## Directory Structure

```
v3/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── deps.py         # Dependency injection (CurrentAdmin, DBDependency)
│   │   │   ├── router.py       # Central route registration
│   │   │   └── endpoints/
│   │   │       ├── admin/      # 37 admin endpoint files
│   │   │       ├── staff/      # Staff auth + POS endpoints
│   │   │       ├── customer/   # Customer-facing endpoints
│   │   │       ├── public/     # Public (unauthenticated) endpoints
│   │   │       └── common/     # Health, upload
│   │   ├── models/             # 24 SQLAlchemy model files
│   │   ├── schemas/            # Pydantic v2 schemas
│   │   └── services/           # 8 service modules
│   ├── alembic/                # Database migrations (10 migrations)
│   └── scripts/                # Seed scripts (seed_v3.py + seed_pwa_translations.py)
├── staff-portal/               # Staff POS + operations
│   └── src/
│       ├── app/                # 12 page routes (error.tsx + loading.tsx added Round 9)
│       │   ├── page.tsx        # Home dashboard
│       │   ├── login/
│       │   ├── pos/            # Point-of-sale terminal
│       │   ├── orders/         # Order management
│       │   ├── kitchen/        # Kitchen display system
│       │   ├── tables/         # Table management + QR
│       │   ├── reservations/   # Reservation management
│       │   ├── time-clock/     # Staff clock-in/out
│       │   ├── wallet/         # Customer wallet top-up
│       │   └── profile/        # Staff profile
│       ├── components/         # 22 shared components
│       ├── hooks/              # 5 custom hooks
│       ├── lib/api.ts          # API client with token refresh
│       └── styles/             # Global CSS variables + utilities
├── admin-portal/               # Admin dashboard
│   └── src/
│       ├── app/                # 90+ page routes
│       │   ├── page.tsx        # Admin dashboard
│       │   ├── orders/         # Order management + detail
│       │   ├── customers/      # Customer management + detail
│       │   ├── stores/         # Store management + detail
│       │   ├── staff/          # Staff management + shifts
│       │   ├── menu/           # Menu items, categories, dietary tags
│       │   ├── inventory/      # Inventory, suppliers, purchase orders
│       │   ├── vouchers/       # Voucher definitions
│       │   ├── rewards/        # Reward catalog
│       │   ├── content/        # Events, products, info cards, PWA
│       │   ├── marketing/      # Campaigns
│       │   ├── feedback/       # Customer feedback
│       │   ├── notifications/  # Push notification templates
│       │   ├── reports/        # Business reports
│       │   ├── settings/       # System settings
│       │   └── audit-log/      # Audit trail
│       ├── components/         # Sidebar, GalleryUpload, QRCodeGenerator
│       └── lib/api.ts          # API client with token refresh + upload
├── customer-pwa/              # Customer mobile PWA
├── e2e-tests/                  # Pytest E2E API suite (16 test files, Round 9)
└── infra/                      # Docker compose + Caddy reverse proxy + DB schema
```

---

## Staff Portal — Architecture

### Auth Flow
1. `AuthProvider.tsx` wraps the entire app (replaces old `layout.tsx` auth logic)
2. On mount: reads `localStorage` token → checks JWT expiry client-side → auto-refreshes via `/staff/auth/refresh` if within 30s of expiry
3. Calls `/staff/auth/me` to verify token validity
4. 403 → "Access Denied" screen with 3s redirect to `/login`
5. 30-minute idle timeout: auto-logout on inactivity
6. Token refresh is handled both in `AuthProvider` AND in `api.ts` request interceptor

### API Client (`lib/api.ts`)
- All requests go through `api.get<T>()`, `api.post<T>()`, `api.patch<T>()`, `api.del<T>()`
- Token refresh: on 401, auto-calls `/staff/auth/refresh`, retries original request
- SSR-safe: all `localStorage` access guarded by `typeof window !== "undefined"`
- Error handling: `console.error` on all failures, proper error propagation

### Page Routes (12 total)
| Route | Description | Key Features |
|-------|-------------|--------------|
| `/login` | Staff login | Store selector, name-based or email-based login, PIN/password |
| `/` | Home dashboard | KPI cards, navigation grid, pending orders count, table status |
| `/pos` | POS terminal | Menu grid with images, cart, modifiers, table assignment, QR scanner, held orders, checkout with voucher/reward/wallet |
| `/orders` | Orders list | Filterable order list, status updates, payment status |
| `/kitchen` | Kitchen display | Real-time order queue, urgency colors, audio alerts, status filters |
| `/kitchen/[id]` | Order detail | Line items, modifiers, status timeline, update actions |
| `/tables` | Table management | Status overview, section filter, QR generation, active order display |
| `/reservations` | Reservation management | Date/status filter, confirm with table assignment, cancel |
| `/time-clock` | Staff clock-in/out | Clock in, clock out, break start/end, event history |
| `/wallet` | Customer wallet | Search/scan customer, top-up, view rewards/vouchers, redeem |
| `/profile` | Staff profile | Display name, email, roles, change password, change PIN |

### Shared Components
`Alert`, `AuthProvider`, `Badge`, `Button`, `Card`, `Drawer`, `EmptyState`, `Modal`, `NumericKeypad`, `OrderCard`, `PageHeader`, `QrScannerModal`, `SearchInput`, `SkeletonCard`, `SkeletonText`, `StatusBadge`, `StoreHeader`, `Timer`

### Custom Hooks
`useIsAdmin`, `usePolling`, `useQrExpiry`, `useQrImages`

### Known Design Decisions
- Auth is client-side only (middleware.ts provides security headers only; token is in localStorage)
- QR codes generated client-side via `qrcode` npm library
- All CSS is pure (no framework) — variables in `styles/variables.css`
- PageHeader component renders `BACK` text + arrow on all sub-pages

---

## Admin Portal — Architecture

### Auth Flow
1. `layout.tsx` wraps the entire app with Sidebar + auth check
2. `lib/api.ts`: token refresh interceptor identical to staff-portal pattern
3. Session guard: 401 → clear session → redirect to `/login`
4. Favicon loaded from admin config after auth success

### API Client (`lib/api.ts`)
- `api.get<T>()`, `api.post<T>()`, `api.patch<T>()`, `api.del<T>()`, `api.upload<T>()`, `api.fetchRaw<T>()`
- Token refresh on 401 identical to staff-portal
- SSR-safe: all localStorage access guarded
- Upload supports FormData with proper Content-Type

### Admin Roles Endpoint
- `POST /admin/staff/{id}/roles` — replaces all role assignments (deactivates existing, adds new)
- RoleAssignment model linked via IAMPrincipal.assignee_id

---

## Backend — Architecture

### Models (24 models)
`AdminAccount`, `AuditLog`, `Cart`, `Checkin`, `Customer`, `CustomerAddress`, `CustomerDeviceToken`, `CustomerReward`, `CustomerVoucher`, `DiningTable`, `Feedback`, `IAMPrincipal`, `IAMRole`, `InfoCard`, `InventoryItem`, `InventoryMovement`, `LoyaltyAccount`, `MarketingCampaign`, `MenuItem`, `NotificationTemplate`, `Order`, `OrderAdjustment`, `OrderModificationLog`, `OrderStatusLog`, `Payment`, `PosSession`, `PosTerminal`, `PurchaseOrder`, `Reservation`, `RewardCatalog`, `RoleAssignment`, `ShiftTemplate`, `SplashScreen`, `StaffProfile`, `StaffShift`, `Store`, `Supplier`, `SurveyResponse`, `SystemPage`, `TableStatusSnapshot`, `TimeEvent`, `Translation`, `UserReward`, `UserVoucher`, `VoucherDefinition`, `Wallet`, `WalletLedgerEntry`

### Endpoint Structure
- **Admin**: `/api/v1/admin/*` — 37 endpoint files, all require `CurrentAdmin` dependency
- **Staff**: `/api/v1/staff/*` — auth, POS orders, dashboard, time events
- **Customer**: `/api/v1/customer/*` — cart, orders, profile
- **Public**: `/api/v1/public/*` — menu, stores, RSVP
- **Common**: `/api/v1/health`, `/api/v1/upload`

### Key v3 Endpoint Additions (from gap analysis)
| Endpoint | File | Purpose |
|----------|------|---------|
| `POST /staff/auth/refresh` | `staff/staff_ops.py` | Token refresh with 7-day refresh token |
| `PATCH /admin/orders/{id}/payment` | `admin/orders.py` | POS payment processing |
| `POST /admin/scan/*` (3) | `admin/scan.py` | QR scanner — customer, reward, voucher |
| `POST /admin/customers/{id}/use-reward/{rid}` | `admin/customers.py` | Mark reward used in-store |
| `POST /admin/customers/{id}/use-voucher/{vid}` | `admin/customers.py` | Mark voucher used in-store |
| `POST /admin/orders/{id}/apply-voucher` | `admin/orders.py` | Apply voucher to order |
| `POST /admin/orders/{id}/apply-reward` | `admin/orders.py` | Apply reward to order |
| `POST /admin/orders/{id}/wallet-payment` | `admin/orders.py` | Pay from customer wallet |
| `GET/POST/DELETE /admin/staff/shifts` | `admin/staff.py` | Flat shift CRUD for admin portal |
| `GET /admin/customers/{id}/wallet` | `admin/customers.py` | Customer wallet with balance, rewards, vouchers |
| `GET/POST /admin/pos/*` (4) | `admin/pos.py` | POS terminals + sessions + order modifications |

---

## Key Commands

```bash
# Backend
cd backend && uvicorn app.main:app --reload
cd backend && alembic upgrade head
cd backend && alembic revision --autogenerate -m "description"
cd backend && python scripts/seed_v3.py

# Staff Portal
cd staff-portal && npm run dev
cd staff-portal && npm run build
cd staff-portal && npx next start -p 13820

# Admin Portal
cd admin-portal && npm run dev
cd admin-portal && npm run build
cd admin-portal && npx next start -p 13830

# Customer PWA
cd customer-pwa && npm run dev
cd customer-pwa && npm run build
```

---

## Quality Standards (from 9 rounds of audit)

### All Clear (Reinforced by Round 9)
- **No runtime crash risks**: All `.toFixed()`, `.charAt()`, `new Date()`, `JSON.parse()`, `parseFloat()` calls are properly guarded with `Number(… ?? 0)`, `|| "?"`, `isNaN()` checks, or try/catch
- **No SSR crashes**: All `localStorage`/`window`/`document` access in api.ts and layout.tsx guarded by `typeof window !== "undefined"`
- **No React key warnings**: Every `.map()` call has proper `key` prop using stable composite IDs (Round 8 hardened OrderCard composite keys; Round 9 fixed GalleryUpload index→URL keys)
- **No state mutations**: All array operations use spread/copy patterns
- **All useEffect cleanups present**: Timers, intervals, event listeners, abort controllers all properly cleaned up (Round 9 added cleanup to refunds, reports, useAudienceSegments)
- **Auth token refresh**: Every API call through `api` module auto-refreshes on 401 with proper retry-failure handling (Round 8 fixed bypass in failed-retry path; Round 9 added abort check to staff requestRaw)
- **Error boundaries**: `error.tsx` at root-level in admin and staff portals; staff portal now has `error.tsx` + `loading.tsx` (Round 9)
- **Staff middleware**: `src/middleware.ts` provides security headers (CSP, HSTS, X-Frame-Options, etc.)
- **Admin middleware**: `src/middleware.ts` provides full CSP, HSTS, and security headers
- **CSP hardened**: Customer PWA CSP includes `frame-ancestors 'none'`; Staff Portal CSP includes `'unsafe-inline' 'unsafe-eval'` for Next.js 16 hydration compatibility
- **Monetary precision**: All financial models use `Mapped[Decimal]` with `Numeric(12,4)` columns
- **NULL-safe DB constraints**: CHECK constraints use `IS NULL OR` pattern for nullable unlimited-use columns
- **Row locks on financial operations**: All wallet balance reads in mutation endpoints use `.with_for_update()`
- **Rate limiter**: Logs warning when falling back to in-memory storage; should use Redis in production
- **Customer PWA**: Cart persistence uses synchronous in-memory Map cache backed by async IndexedDB fire-and-forget writes
- **Infrastructure**: Docker-compose ports aligned to docs (13830/13810/13820), Redis healthcheck fixed, REDIS_URL with credentials, Caddy reverse proxy service added (Round 9)
- **Seed data**: Full `seed_v3.py` baseline script — stores, loyalty tiers, menu items, rewards, vouchers (Round 9)
- **Services layer**: `__init__.py` with proper re-exports from all 8 service modules (Round 9)

### Round 9 Audit & Remediation (2026-05-23) — 38 issues, 25 files fixed

The 9th full-system audit across all 6 domains found 38 issues (6 critical, 11 high, 12 medium, 9 low). Infrastructure had the worst drift from v1→v3 migration. Customer PWA emerged as the cleanest domain (2 low findings).

**Critical Fixes:**
| Domain | Issue | Fix |
|--------|-------|-----|
| Infra | Port numbers (13801-13803) didn't match docs (13830/13810/13820) | Aligned compose ports to match AGENTS.md |
| Infra | Redis healthcheck `redis-cli ping` failed with `requirepass` set | Changed to password-authenticated healthcheck |
| Infra | Caddyfile referenced v1 service names and port 8000 | Full rewrite for v3 service names and port 13800 |
| Infra | REDIS_URL missing password — backend couldn't authenticate | Added `redis://:${REDIS_PASSWORD}@redis:6379/0` |
| Admin | Marketing redirect to `/rewards` instead of `/marketing/campaigns` | Fixed to correct landing page |
| Backend | `seed_v3.py` documented but didn't exist | Created comprehensive baseline seed (8 steps, 50+ entities) |

**High Fixes:**
| Domain | Issue | Fix |
|--------|-------|-----|
| Admin | `useEffect` missing deps in stores, refunds, reports pages | Added `useCallback` wrapping + correct dep arrays |
| Admin | Store fetch in refunds with no abort cleanup | Added `mountedRef` guard |
| Admin | Staff listing fetched ALL staff then client-side filtered | Changed to server-side `store_id` query param |
| Admin | `isLoggedIn()` accessed localStorage with no SSR guard | Added `typeof window !== "undefined"` check |
| E2E | Voucher redemption accepted 400/422 as "pass" | Strengthened to strict `== 200` assertion |
| E2E | Order cancel rejection accepted both 400 and 409 | Tightened to `== 409` (semantically correct Conflict) |
| E2E | Brute-force endpoint guessing in voucher assignment | Removed; uses correct direct endpoint |
| Infra | `NEXT_PUBLIC_API_URL` hardcoded to `localhost:13800` | Changed to relative `/api/v1` across all 3 frontends |
| Infra | `CORS_ORIGINS` hardcoded to old ports | Changed to env-var driven `${CORS_ORIGINS:-...}` |

**Medium Fixes:**
| Domain | Issue | Fix |
|--------|-------|-----|
| Backend | 13 empty model subdirectories | Deleted |
| Backend | No `__init__.py` in admin endpoints | Created |
| Backend | Empty services `__init__.py` | Added re-exports from all 8 service modules |
| Admin | `GalleryUpload` used `key={idx}` for images | Changed to stable `key={url}` with filter-based remove |
| Admin | `PwaTranslationsTab` API paths missing `/admin/` prefix | Fixed 3 endpoints |
| Staff | `requestRaw` missing abort check before `refreshToken` | Added consistent abort guard |
| Staff | No `error.tsx` or `loading.tsx` | Created both at root level |
| Staff | Duplicate CSS selectors in utilities.css | Removed duplicates |

**Low Fixes:**
| Domain | Issue | Fix |
|--------|-------|-----|
| Admin | `feedback/page.tsx` CSS drawer width conflict | Removed inline width override |
| Backend | `config.py` cors_origins default used old ports | Updated to 13830,13810,13820 |
| E2E | `conftest.py` BASE_URL hardcoded, misleading comment | Added `E2E_BASE_URL` env var, fixed comment |
| Backend | `useAudienceSegments` no cleanup | Added `cancelled` flag |

### Active Logging
- All catch blocks log `console.error` with descriptive context strings
- `usePolling` logs polling errors to console
- Scanner errors logged with descriptive messages

### Accessibility
- All icon-only buttons have `aria-label`
- Interactive cards use `role="button"` + `tabIndex={0}` + `onKeyDown` handlers
- `Button` component defaults to `type="button"` (prevents accidental form submits)
- Admin portal buttons on all core pages have `type="button"`

### Remaining Known (Round 9 — Post-Fix, 2 items)

| Domain | Issue | Reason |
|--------|-------|--------|
| Customer PWA | i18n ~25 lines incomplete for ta/tr/zh | English fallback is automatic; functional but cosmetically incomplete |
| Customer PWA | SW maintains separate IndexedDB from Zustand | By design — `loka-offline-orders` isolates offline order queue from `loka-pwa-db` cart state

### Legacy Cleanup (Round 9)
- Removed old v1/v2 directories: `backend/`, `frontend/`, `customer-app/` (~1.1 GB)
- Removed old `docker-compose.yml`, `.env`, `.env.local`, `scripts/seed/`, `scripts/fnb-manage.sh`, third-party mock scripts
- Caddyfile rewritten for v3; v3 docker-compose ports fixed; Redis healthcheck fixed
- `v3/backend/.env.example` CORS and REDIS_URL aligned with v3 defaults
