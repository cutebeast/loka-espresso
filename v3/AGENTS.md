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
│       │   ├── profile/        # Staff profile
│       │   └── equipment/      # Equipment status view
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
| `/login` | Staff login | Store selector, name/PIN or email/password |
| `/` | Home dashboard | KPI cards, navigation grid, equipment access |
| `/pos` | POS terminal | Menu grid, cart, table transfer, held orders, checkout with tip/voucher/reward/wallet |
| `/orders` | Orders list | Filterable, kanban view, queue/unpaid/history tabs |
| `/kitchen` | Kitchen display | 5s polling, urgency colors, audio alerts, kanban columns |
| `/kitchen/[id]` | Order detail | Status updates, cancel, table transfer, line items |
| `/tables` | Table management | QR generation, status overview, section filter |
| `/reservations` | Reservation management | Confirm with table, cancel |
| `/time-clock` | Staff clock-in/out | Clock in, out, break, event history |
| `/wallet` | Customer wallet | Search/scan, top-up, rewards, vouchers, redeem |
| `/profile` | Staff profile | Display info, change password, change PIN |
| `/equipment` | Equipment | View status, serial numbers, maintenance dates |

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

## Quality Standards (from 10 rounds of audit)

### All Clear (Reinforced by Round 10)
- **No runtime crash risks**: All `.toFixed()`, `.charAt()`, `new Date()`, `JSON.parse()` calls properly guarded
- **No SSR crashes**: All `localStorage`/`window`/`document` access guarded by `typeof window !== "undefined"`
- **No React key warnings**: Every `.map()` call has proper `key` prop
- **No state mutations**: All array operations use spread/copy patterns
- **All useEffect cleanups present**: Timers, intervals, event listeners, abort controllers cleaned up
- **Auth token refresh**: Every API call through `api` module auto-refreshes on 401
- **Error boundaries**: `error.tsx` at root-level in admin and staff portals (staff: user-friendly messages)
- **CSP hardened**: `connect-src` gated for dev-only; all 3 portals have security headers
- **Monetary precision**: All financial models use `Mapped[Decimal]` with `Numeric(12,4)` columns
- **Row locks on financial operations**: All wallet balance reads use `.with_for_update()`
- **API response consistency**: `request<T>` returns `data.items` for paginated responses (Round 10 fix)
- **Seed minimal**: `seed_v3.py` only creates admin + roles (105 lines); e2e conftest creates data via API
- **TypeScript**: 0 errors across all 3 portals
- **ESLint**: 0 warnings across all 3 portals

### Round 10 Audit & Remediation (2026-05-24) — Backend crash-loop fix + F&B features

**Backend crash-loop fix (pre-existing, not from audit):**
- `services/__init__.py` imported 6 non-existent functions → rewritten with real exports
- `services/order.py` imported `with_for_update` (is a method, not standalone) → removed
- `wallet.py` imported `AuditLog` from `app.models.audit` → fixed to `app.models.platform`
- Alembic migration `d4e5f6a7b8c9` (staff lockout columns) never applied to production DB → applied
- `refunds.updated_at` missing from SQL seed schema → ALTER TABLE added column
- `inventory/categories` response model `list[]` → `PaginatedResponse[]`

**FastAPI route ordering fix:**
- `/{staff_id}` defined before `/shifts` → staff shifts page 422 → reordered
- `/{notif_id}` defined before `/templates` → notification templates 422 → reordered

**API client fix:**
- `request<T>` returned paginated wrapper `{items:[...]}` as `T[]` → `.map()` failed → returns `(data.items ?? [])` now
- Same fix applied to retry path

**Admin portal:**
- Layout fix: added `display:flex` wrapper (sidebar + content were stacking vertically)
- Dietary-tags PATCH path `/admin/menu/dietary-tags` → `/admin/dietary-tags`
- Version page: bare `fetch()` without auth → added `localStorage` token header
- Translations per_page: backend limit 100→5000 to match PWA tab 2000 request
- Store create/update: removed `db.refresh()` + manual output construction (MissingGreenlet fix)
- Settings config PUT: reverted to query params (backend expects Query, not JSON body)
- Profile page: created `/profile` with view info + change password
- 10 unused Next.js boilerplate SVGs deleted

**Staff portal F&B features (new):**
- **Tip entry**: `tip_amount` on payment schema, 5%/10%/15%/20% presets + custom in PosCheckoutPanel
- **Table transfer**: `PATCH /admin/orders/{id}/transfer-table` + UI on kitchen detail page
- **Order cancel**: `POST /admin/orders/{id}/cancel` (from POS/orders, not just kitchen)
- **Order modification**: `POST /admin/orders/{id}/items` (add), `DELETE .../items/{line}` (void)
- **Equipment view**: new `/equipment` page — view status, maintenance dates from admin config
- **Idle timeout**: 60s warning banner before logout (was instant wipe), cart preserved on logout
- **Kitchen polling**: 10s → 5s interval
- **Login UX**: name list shows "Loading staff...", PIN retry shows "Wait X seconds"
- **Error page**: technical JS errors filtered into user-friendly messages

**Customer PWA:**
- SW offline orders: store `authToken` in record, include `Authorization` on replay
- Token refresh: URL guard prevents infinite recursion on `/auth/refresh` 401
- Cart sync: `_syncLock` mutex prevents concurrent sync races
- idbStorage: console.error when both IDB + localStorage fail

**Seed + E2E:**
- `seed_v3.py` reduced from 579 lines to 105 — only creates admin + roles
- `conftest.py` auto-bootstraps if DB blank; `_ensure_baseline_data` fixture creates stores + tiers via API
- `seed_pwa_translations.py` deleted (unused; PWA translations from admin panel)
- Seed config keys fixed: `otp_bypass_enabled` → `otp.bypass_enabled`

### Remaining Known (Round 10 Post-Fix)

| Domain | Item | Status |
|--------|------|--------|
| Staff | Card payment | Placeholder UI — Stripe/payment gateway integration next week |
| Staff | QR payment gateway | Pending third-party integration |
| Staff | Bill splitting | Not needed (premium KL venues: KLCC, TRX, Pavilion) |
| Customer PWA | i18n ~25 lines incomplete | English fallback automatic |

### Staff Portal — F&B Workflow Coverage

| Feature | Status |
|---------|--------|
| POS dine-in orders with table assignment | ✅ |
| Table transfer | ✅ kitchen detail page |
| Payment — cash (full), card/QR (placeholder) | ✅ |
| Tip entry — presets + custom | ✅ |
| Order cancel from POS/orders | ✅ |
| Order modification (add/void items) | ✅ POST/DELETE endpoints |
| Kitchen display — kanban, timer, audio | ✅ 5s polling |
| Order tracking — queue, unpaid, history | ✅ |
| Equipment status view | ✅ /equipment page |
| Customer wallet — search, top-up, rewards | ✅ |
| Reservations — confirm, cancel | ✅ |
| Tables — status, QR, mark clean | ✅ |
| Time clock — in/out, history | ✅ |
| Profile — change password/PIN | ✅ |
| Idle timeout — 60s warning | ✅ |
