# FNB Super App — Agent Documentation

## Project Overview

Multi-app F&B platform for Loka Espresso. Active development is in `v3/`.

| Component | Location | Stack | Port |
|-----------|----------|-------|------|
| **v3 Backend** | `v3/backend/` | FastAPI + SQLAlchemy async | 13800 |
| **Staff Portal** | `v3/staff-portal/` | Next.js 16 (Turbopack) | 13820 |
| **Admin Portal** | `v3/admin-portal/` | Next.js 16 (Turbopack) | 13830 |
| **Customer PWA** | `v3/customer-pwa/` | Next.js 16 (Turbopack) | 13810 |

Shared: `v3/infra/`, `v3/scripts/`

---

## v3 Backend

### Structure
```
v3/backend/
├── app/
│   ├── api/v1/
│   │   ├── deps.py              # CurrentAdmin, DBDependency injection
│   │   ├── router.py            # Central route registration
│   │   └── endpoints/
│   │       ├── admin/           # 37 endpoint files
│   │       ├── staff/           # Staff auth + POS
│   │       ├── customer/        # Customer-facing
│   │       ├── public/          # Unauthenticated
│   │       └── common/          # Health, upload
│   ├── models/                  # 24 SQLAlchemy models
│   ├── schemas/                 # Pydantic v2 schemas
│   └── services/                # Business logic
├── alembic/                     # Database migrations
└── scripts/                     # Seed data
```

### Key Commands
```bash
cd v3/backend
uvicorn app.main:app --reload --port 13800
alembic upgrade head
alembic revision --autogenerate -m "description"
python scripts/seed_v3.py
```

---

## v3 Staff Portal

### Pages (12 routes)
| Route | Description |
|-------|-------------|
| `/login` | Staff login (store selector, name/email auth) |
| `/` | Home dashboard with KPI cards |
| `/pos` | POS terminal (menu grid, cart, modifiers, QR scanner, checkout with voucher/reward/wallet) |
| `/orders` | Order list + status management |
| `/kitchen` | Kitchen display (real-time queue, audio alerts) |
| `/kitchen/[id]` | Order detail with line items + status timeline |
| `/tables` | Table management + QR generation |
| `/reservations` | Reservation management + confirm/cancel |
| `/time-clock` | Staff clock-in/out with PIN |
| `/wallet` | Customer wallet top-up + rewards/vouchers |
| `/profile` | Staff profile + change password/PIN |

### Architecture
- Auth: `AuthProvider.tsx` — JWT with auto-refresh, 30min idle timeout, 403 redirect
- API: `lib/api.ts` — token refresh interceptor, SSR-safe localStorage access
- CSS: Pure CSS, no framework — variables in `styles/variables.css`
- Hooks: `usePolling`, `useIsAdmin`, `useQrExpiry`, `useQrImages`
- Components: 22 shared (Alert, Modal, Drawer, PageHeader, OrderCard, QrScannerModal, etc.)

### Commands
```bash
cd v3/staff-portal
npm run dev
npm run build && npx next start -p 13820
```

---

## v3 Admin Portal

### Pages (90+ routes)
Full CRUD for: orders, customers, stores, staff (+ shifts + roles), menu (items, categories, dietary tags, allergens, tax), inventory (items, categories, suppliers, purchase orders, movements), vouchers, rewards, content (events, products, info cards, PWA splash, system pages), marketing campaigns, feedback, notifications (templates + broadcast), reports, referrals, loyalty (tiers, accounts, ledger, settings), reservations, tables, promotions, surveys, translations, checkins, audit log, settings, admins + roles.

### Architecture
- Auth: `layout.tsx` — JWT with auto-refresh, Sidebar layout, 403 redirect
- API: `lib/api.ts` — token refresh, upload support, SSR-safe
- CSS: Pure CSS in `styles/` (base, components, sidebar, tables, orders, login, utilities, variables)
- Components: Sidebar, GalleryUpload, QRCodeGenerator, TableCard, useAudienceSegments

### Commands
```bash
cd v3/admin-portal
npm run dev
npm run build && npx next start -p 13830
```

---

## v3 Customer PWA

Full mobile PWA with: auth flow, menu browsing, cart + checkout, order history, loyalty + wallet, rewards + vouchers, reservations, surveys, profile, referrals, multi-language (en/ms/ta/tr/zh).

### Commands
```bash
cd v3/customer-pwa
npm run dev
npm run build && npx next start -p 13810
```

---

## Quality Standards (7 audit rounds completed)

- Zero runtime crash risks — all `.toFixed()`, `.charAt()`, `new Date()`, `parseFloat()` properly guarded
- SSR-safe — all `localStorage`/`window` calls use `typeof window !== "undefined"`
- No React key warnings, no state mutations, all useEffect cleanups present
- Token refresh on all 401 responses
- `console.error` logging on all catch blocks
- `type="button"` and `aria-label` on all interactive elements

---

## Docker

```bash
docker compose up -d                    # all services
docker compose up -d --build backend    # rebuild backend
cd v3/infra/docker && docker compose up -d  # v3-specific compose
```

### Caddy
- HTTPS for `*.loyaltysystem.uk`
- Reverse proxy: `/api/v1` → backend:13800, `/` → frontend by Host header
