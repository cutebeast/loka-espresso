# FNB Enterprise v3

> **Status**: Live | **Date**: 2026-05-19
> **Backend**: 53 endpoint files, 24 models | **Staff Portal**: 12 pages | **Admin Portal**: 90+ pages

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
├── customer-pwa/               # Customer mobile PWA
├── scripts/                    # Init scripts + seed data
└── infra/                      # Docker + DB schema
```

---

## Database

- **Database**: `fnb_enterprise_v3` (PostgreSQL)
- **Models**: 24 domain-organized SQLAlchemy models
- **Migrations**: Alembic (baseline + 8 incremental)
- **Key decisions**: Wallet double-entry ledger, loyalty points ledger with FIFO expiry, staff PINs bcrypt-hashed, RLS for tenant isolation, DB-driven platform config

---

## Legacy Coexistence

The existing `/root/fnb-super-app/backend/`, `frontend/`, `customer-app/` are untouched.
Both systems can run simultaneously until cutover.

| System | Database | Backend Port |
|--------|----------|--------------|
| Legacy v1/v2 | `fnb` (port 5433) | 3002 |
| Enterprise v3 | `fnb_enterprise_v3` (port 13334) | 13800 |

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
