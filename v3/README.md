# FNB Enterprise v3

> **Status**: Live | **Last Audit**: 2026-05-24 (Round 9 — 38 issues fixed across 6 domains, 25 files changed, legacy cleaned)
> **Backend**: 53 endpoint files, 24 models, 8 services | **Staff Portal**: 12 pages | **Admin Portal**: 90+ pages | **E2E**: 16 test files

---

## Services

| Service | Stack | Port | Build |
|---------|-------|------|-------|
| **Backend** | FastAPI + SQLAlchemy async | 13800 | Python 3.12+ |
| **Staff Portal** | Next.js 16 (Turbopack) + pure CSS | 13820 | TypeScript |
| **Admin Portal** | Next.js 16 (Turbopack) + pure CSS | 13830 | TypeScript |
| **Customer PWA** | Next.js 16 (Turbopack) + pure CSS | 13810 | TypeScript |

---

## Quick Start

### 1. Start Infrastructure
```bash
cd v3/infra/docker
docker compose up -d postgres redis
```

### 2. Initialize Database
```bash
cd v3/backend
alembic upgrade head
python scripts/seed_v3.py
```

### 3. Run Backend
```bash
cd v3/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 13800
```

### 4. Run Frontends
```bash
# Staff Portal
cd v3/staff-portal && npm install && npm run dev
# or production: npm run build && npx next start -p 13820

# Admin Portal
cd v3/admin-portal && npm install && npm run dev
# or production: npm run build && npx next start -p 13830

# Customer PWA
cd v3/customer-pwa && npm install && npm run dev
```

### 5. Health Check
```bash
curl http://localhost:13800/api/v1/health
curl http://localhost:13820/login
curl http://localhost:13830/
```

### 6. E2E Tests
```bash
cd v3/e2e-tests
pip install -r requirements.txt
pytest -v
```

---

## Directory Structure

```
v3/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── deps.py         # CurrentAdmin, DBDependency
│   │   │   ├── router.py       # Route registration
│   │   │   └── endpoints/
│   │   │       ├── admin/      # 37 CRUD endpoint files
│   │   │       ├── staff/      # Staff auth + POS
│   │   │       ├── customer/   # Customer-facing
│   │   │       ├── public/     # Unauthenticated
│   │   │       └── common/     # Health, upload
│   │   ├── models/             # 24 SQLAlchemy models
│   │   ├── schemas/            # Pydantic v2 schemas
│   │   └── services/           # Business logic
│   ├── alembic/                # Database migrations
│   └── scripts/                # Seed scripts
├── staff-portal/               # Staff POS + operations (12 pages)
│   └── src/
│       ├── app/                # Page routes
│       ├── components/         # 22 shared components
│       ├── hooks/              # 5 custom hooks
│       ├── lib/api.ts          # API client
│       └── styles/             # CSS variables + utilities
├── admin-portal/               # Admin dashboard (90+ pages)
│   └── src/
│       ├── app/                # Page routes
│       ├── components/         # Sidebar, GalleryUpload, QR
│       ├── lib/api.ts          # API client
│       └── styles/             # CSS
**Services layer**: 8 modules with proper re-exports in `__init__.py` (Round 9)
├── customer-pwa/               # Customer mobile PWA
├── e2e-tests/                  # Pytest E2E API suite (16 test files)
├── scripts/                    # Init scripts
└── infra/                      # Docker + DB schema + Caddy reverse proxy
```

---

## Database

- **Database**: `fnb_enterprise_v3` (PostgreSQL)
- **Models**: 24 domain-organized SQLAlchemy models
- **Migrations**: Alembic (baseline + 8 incremental)
- **Key decisions**: Wallet double-entry ledger, loyalty points ledger with FIFO expiry, staff PINs bcrypt-hashed, RLS for tenant isolation, DB-driven platform config

---

## Design Decisions

1. **New Database**: `fnb_enterprise_v3` — clean slate, no legacy migration
2. **Separate Identity Domains**: Customer ≠ Staff ≠ Admin, unified via `iam_principals`
3. **Wallet**: Double-entry ledger — no mutable `balance` column
4. **Loyalty**: Points ledger with FIFO expiry, tier auto-computation
5. **Staff PINs**: Bcrypt-hashed (legacy was plaintext)
6. **DB-Driven Config**: Feature flags and business rules in `platform_config` table
7. **Pure CSS**: No frameworks — CSS variables design system across all 3 portals
8. **Client-Side Auth**: localStorage JWT tokens with auto-refresh on 401

---

## Round 9 Audit & Remediation (2026-05-24)

The 9th full-system audit across 6 domains (backend, admin portal, staff portal, customer PWA, e2e tests, infrastructure) found **38 new issues** (6 critical, 11 high, 12 medium, 9 low). 25 files changed, ~1.1 GB of legacy v1/v2 code removed.

### Infrastructure Fixes
- Docker-compose ports aligned to documentation (13830/13810/13820)
- Redis healthcheck fixed for password-protected instances
- REDIS_URL with credentials, CORS_ORIGINS env-var driven
- NEXT_PUBLIC_API_URL changed to relative `/api/v1` across all frontends
- Caddy reverse proxy service added to compose; Caddyfile fully rewritten for v3
- Legacy v1/v2 directories removed (`backend/`, `frontend/`, `customer-app/`, old compose, old env files)

### Backend Fixes
- `seed_v3.py` created — comprehensive baseline seed (stores, loyalty tiers, menu, rewards, vouchers, platform config)
- Services `__init__.py` with proper re-exports; admin endpoints `__init__.py` added
- 13 empty model subdirectories cleaned; `cors_origins` default aligned with v3 ports

### Admin Portal Fixes
- Marketing redirect fixed (`/rewards` → `/marketing/campaigns`)
- `isLoggedIn()` SSR guard added; `useEffect` deps fixed in stores, refunds, reports
- Staff listing: client-side filter → server-side query
- GalleryUpload: index keys → stable URL keys
- PwaTranslationsTab: 3 endpoints missing `/admin/` prefix fixed
- useAudienceSegments: abort cleanup added

### Staff Portal Fixes
- `requestRaw` abort check added; `error.tsx` + `loading.tsx` created
- Duplicate CSS selectors removed

### E2E Tests Fixes
- Voucher redemption assertion tightened (`in 200,400,422` → `== 200`)
- Order cancel rejection tightened to `== 409` (semantically correct)
- Brute-force endpoint guessing removed; BASE_URL env-var driven
- New `test_round9_coverage.py`: staff shift CRUD + KDS order display tests

## Quality Standards (Established by Rounds 1-7, Reinforced by Round 8)

- **Zero runtime crash risks** — all `.toFixed()`, `.charAt()`, `new Date()`, `parseFloat()` properly guarded
- **SSR-safe** — all `localStorage`/`window` calls use `typeof window !== "undefined"`
- **No React key warnings, no state mutations, all `useEffect` cleanups present**
- **Token refresh on all 401 responses** with proper retry-failure handling (Round 8 fixed bypass in failed-retry path)
- **`console.error` logging** on all catch blocks with descriptive context
- **`type="button"` and `aria-label`** on all interactive elements
- **Rate limiting** uses Redis storage (not in-memory) for multi-worker safety; warns on fallback
- **Webhook signatures** validated in production
- **Uploads validated** by magic bytes + MIME type
- **Financial calculations** use `Decimal` arithmetic throughout all models (Round 8: wallet, voucher, reward, order, customer monetary fields migrated from `float`)
- **Wallet balance** computed via SQL aggregation (not Python iteration)
- **Campaign sends** batched with concurrency limits
- **Translation upserts** use atomic composite-key endpoint
- **NULL-safe CHECK constraints** — nullable unlimited-use columns use `IS NULL OR` pattern (Round 8)
- **Row locks** on all financial mutation reads — `with_for_update()` on wallet/payment balance reads (Round 8)
- **Admin portal security headers** — full CSP, HSTS, X-Frame-Options via middleware (Round 8)
- **Customer PWA cart persistence** — sync in-memory cache backed by async IndexedDB (Round 8)
