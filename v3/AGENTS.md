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
│   │   └── schemas/            # Pydantic v2 schemas
│   ├── alembic/                # Database migrations
│   └── scripts/                # Seed scripts
├── staff-portal/               # Staff POS + operations
│   └── src/
│       ├── app/                # 12 page routes
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
└── scripts/                   # Deployment scripts
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
cd backend && python scripts/seed.py

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

## Quality Standards (from 6 rounds of audit)

### All Clear
- **No runtime crash risks**: All `.toFixed()`, `.charAt()`, `new Date()`, `JSON.parse()`, `parseFloat()` calls are properly guarded with `Number(… ?? 0)`, `|| "?"`, `isNaN()` checks, or try/catch
- **No SSR crashes**: All `localStorage`/`window`/`document` access in api.ts and layout.tsx guarded by `typeof window !== "undefined"`
- **No React key warnings**: Every `.map()` call has proper `key` prop (cart/checkout/order-detail keys fixed to use stable composite IDs)
- **No state mutations**: All array operations use spread/copy patterns
- **All useEffect cleanups present**: Timers, intervals, event listeners, abort controllers all properly cleaned up
- **Auth token refresh**: Every API call through `api` module auto-refreshes on 401
- **Error boundaries**: `error.tsx` at root-level + `orders/[id]`; `loading.tsx` skeletons on `orders/`, `orders/[id]`, `customers/[id]`, `menu/items/[id]`
- **Staff middleware**: `src/middleware.ts` provides security headers (CSP, HSTS, X-Frame-Options, etc.)
- **CSP hardened**: Customer PWA CSP removed `unsafe-eval`/`unsafe-inline` from script-src, added `frame-ancestors 'none'`

### Active Logging
- All catch blocks log `console.error` with descriptive context strings
- `usePolling` logs polling errors to console
- Scanner errors logged with descriptive messages

### Accessibility
- All icon-only buttons have `aria-label`
- Interactive cards use `role="button"` + `tabIndex={0}` + `onKeyDown` handlers
- `Button` component defaults to `type="button"` (prevents accidental form submits)
- Admin portal buttons on all core pages have `type="button"`

### Remaining Known (Non-Blocking)
- Admin portal login at `/login` returns 404 on SSR (Next.js 16 Turbopack issue with `"use client"` pages) — works after client hydration
