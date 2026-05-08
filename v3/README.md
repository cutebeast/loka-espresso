# FNB Enterprise v3 — Ground-Up Rebuild

> **Status**: Foundation Complete | **Date**: 2026-05-07
> **Scope**: New database, new backend, new frontends — zero touch on legacy `fnb-super-app`

---

## Quick Start

### 1. Start Infrastructure
```bash
cd v3/infra/docker
docker-compose up -d postgres redis
```

### 2. Initialize Database
```bash
cd v3/scripts
./init-database.sh
```

### 3. Run Backend
```bash
cd v3/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 13800
```

### 4. Health Check
```bash
curl http://localhost:13800/health
```

---

## Architecture

### Database (`fnb_enterprise_v3`)
- **78 tables** across 18 domains
- **21 native PostgreSQL ENUMs**
- **232+ indexes** (B-tree, composite, partial, GIN, GiST, BRIN, Hash)
- **Row Level Security (RLS)** policies for tenant isolation
- **Append-only ledgers** for orders, payments, wallet, loyalty, inventory
- **AES-256-GCM** encrypted payment tokens and MFA secrets
- **Argon2id** for admin passwords, **bcrypt** for staff PINs

### Backend (FastAPI + SQLAlchemy 2.0 async)
- **Clean identity domains**: Customer ≠ Staff ≠ Admin (unified via `iam_principals`)
- **RBAC + ABAC**: Roles → Permissions with conditional store scoping
- **Explicit transactions**: `get_db()` does NOT auto-commit
- **Domain-organized models**: `models/iam/`, `models/store/`, `models/customer/`, etc.
- **Domain-organized API**: `endpoints/admin/`, `endpoints/customer/`, `endpoints/staff/`, `endpoints/common/`

### Frontends
| App | Port | Purpose | Auth |
|-----|------|---------|------|
| `admin-portal/` | 13801 | HQ / Store Manager dashboard | Email + Argon2id + optional TOTP |
| `customer-pwa/` | 13802 | Customer ordering PWA | Phone OTP |
| `staff-portal/` | 13803 | Service crew counter ops | PIN (bcrypt) + JWT session |

---

## Folder Structure

```
v3/
├── backend/                    # FastAPI + Alembic
│   ├── app/
│   │   ├── api/v1/endpoints/   # admin/ customer/ staff/ common/
│   │   ├── core/               # config, database, security, middleware
│   │   ├── models/             # Domain-organized SQLAlchemy models
│   │   ├── schemas/            # Pydantic v2
│   │   ├── services/           # Business logic
│   │   └── dependencies/       # FastAPI deps
│   ├── alembic/
│   └── tests/
├── admin-portal/               # Next.js 16
├── customer-pwa/               # Next.js 16
├── staff-portal/               # Next.js 16
├── shared/packages/            # Types, API client, UI components (future)
├── infra/
│   ├── docker/                 # docker-compose.yml + Dockerfiles
│   └── db/                     # Complete DDL + seed data
├── scripts/
│   ├── init-database.sh        # Bootstrap new DB from SQL files
│   └── seed/                   # Domain seed scripts (future)
└── docs/
    └── 00-rebuild-plan.md      # Full migration plan
```

---

## Migration Phases

| Phase | Status | Deliverables |
|-------|--------|--------------|
| **0: Foundation** | ✅ Complete | Folder structure, DDL, backend skeleton, Docker |
| **1: Core Domains** | 🔄 Next | All 78 SQLAlchemy models, Pydantic schemas, auth endpoints |
| **2: Customer & Commerce** | ⏳ Pending | Cart, checkout, orders, wallet, payments, PWA |
| **3: Staff & Operations** | ⏳ Pending | POS, KDS, clock-in, staff portal |
| **4: Marketing & Loyalty** | ⏳ Pending | Rewards, vouchers, campaigns, notifications |
| **5: Migration & Cutover** | ⏳ Pending | Data migration scripts, shadow mode, DNS cutover |

---

## Key Design Decisions

1. **New Database**: `fnb_enterprise_v3` — zero migration from legacy `fnb`. Clean slate.
2. **No JSON Duplication**: `orders.items` JSON removed. `order_line_items` is sole source.
3. **Staff PINs**: Hashed with bcrypt (legacy was plaintext).
4. **Wallet**: Double-entry ledger (`wallet_ledger_entries`). No mutable `balance` column.
5. **Loyalty**: Points ledger with FIFO expiry. Tier auto-computation.
6. **RLS Enabled**: Customer isolation at database level.
7. **One Brand, Multi-Store**: `stores.brand_name` for now. Add `brands` table if multi-brand SaaS needed later.
8. **DB-Driven Runtime Config**: OTP bypass, feature flags, and business rules live in `platform_config` — never in `.env`. Admin API controls these without restarts.

---

## Legacy Coexistence

The existing `/root/fnb-super-app/backend/`, `frontend/`, `customer-app/` are **untouched**.
Both systems can run simultaneously on different ports/databases until cutover.

| System | Database | Backend Port |
|--------|----------|--------------|
| Legacy v1 | `fnb` (port 5433) | 3002 |
| Enterprise v3 | `fnb_enterprise_v3` (port 13334) | 13800 |

---

## Next Immediate Steps

1. **Implement remaining SQLAlchemy models** (menu, inventory, cart, order, payment, wallet, loyalty, reward, voucher, marketing, content, survey, notification, platform)
2. **Auth endpoints** (OTP, password login, refresh, logout)
3. **Alembic baseline migration** generated from models
4. **Seed scripts** for stores, menu, inventory
5. **Copy/adapt legacy frontend components** into new portals
