# FNB Super-App — Enterprise v3 Rebuild Plan

> **Status**: Planning Complete | **Date**: 2026-05-07
> **Goal**: Ground-up enterprise-grade rebuild alongside legacy system. Zero disruption to existing code.

---

## 1. Philosophy

Instead of patching the legacy schema (68 tables, 10 alembic migrations, dual FK anti-patterns, god tables, plaintext PINs), we build a **clean v3 system** on a new database with:

- **True 3NF/BCNF** — every fact stored once
- **Clean identity domains** — Customer ≠ Staff ≠ Admin (unified via `iam_principals`)
- **Append-only ledgers** — inventory, wallet, loyalty, order status, payments
- **Store-scoped multi-tenancy** — every operational table has `store_id`
- **Enterprise security** — RLS policies, encrypted columns, hashed PINs, Argon2id
- **No JSON duplication** — `orders.items` JSON removed; `order_line_items` is sole source

---

## 2. Folder Structure

```
/root/fnb-super-app/v3/
├── backend/                    # FastAPI + SQLAlchemy 2 async + Alembic
│   ├── app/
│   │   ├── api/v1/endpoints/   # Domain-separated routers
│   │   │   ├── admin/          # Backoffice operations
│   │   │   ├── customer/       # PWA customer-facing API
│   │   │   ├── staff/          # Staff-app API (clock-in, POS, KDS)
│   │   │   └── common/         # Shared public endpoints (menu, stores, auth)
│   │   ├── core/               # Config, DB, security, middleware
│   │   ├── models/             # SQLAlchemy models by domain
│   │   ├── schemas/            # Pydantic v2 schemas
│   │   ├── services/           # Business logic layer
│   │   └── dependencies/       # FastAPI dependencies
│   ├── alembic/                # Migrations for `fnb_enterprise_v3` DB
│   └── tests/
│
├── admin-portal/               # Next.js 16 — Admin & Store Manager
│   └── src/
│       ├── app/                # Next.js app router (or pages)
│       ├── components/         # Feature components
│       ├── lib/                # API client, stores, tokens
│       └── styles/             # Design system CSS
│
├── customer-pwa/               # Next.js 16 — Customer ordering PWA
│   └── src/
│       ├── app/
│       ├── components/
│       ├── lib/
│       └── styles/
│
├── staff-portal/               # Next.js 16 — Service crew counter ops
│   └── src/
│       ├── app/
│       ├── components/         # POS, KDS, table mgmt, clock-in
│       ├── lib/
│       └── styles/
│
├── shared/                     # Monorepo shared packages
│   └── packages/
│       ├── types/              # Shared TS types generated from OpenAPI
│       ├── api-client/         # Generated fetch/axios client
│       └── ui-components/      # Shared React primitives
│
├── infra/                      # Docker, DB, infrastructure
│   ├── docker/
│   │   ├── docker-compose.yml  # PG 16, Redis, backend, 3 frontends
│   │   ├── Dockerfile.backend
│   │   ├── Dockerfile.admin
│   │   ├── Dockerfile.customer
│   │   └── Dockerfile.staff
│   └── db/
│       ├── 01_extensions.sql
│       ├── 02_enums.sql
│       ├── 03_tables.sql       # Complete v3 DDL
│       ├── 04_indexes.sql
│       ├── 05_constraints.sql
│       ├── 06_triggers.sql
│       ├── 07_rls_policies.sql
│       └── 08_seed_data.sql    # Minimal seed for bootstrapping
│
├── scripts/
│   ├── seed/                   # Domain-based seed scripts
│   └── migrate/                # v1 → v3 data migration scripts (future)
│
└── docs/                       # v3 architecture decisions
```

---

## 3. Database Strategy

### New Database
- **Name**: `fnb_enterprise_v3`
- **Server**: Same PostgreSQL 16 instance (new DB, zero touch on `fnb`)
- **Connection**: Separate `DATABASE_URL_V3` env var
- **Migrations**: Fresh Alembic setup in `v3/backend/alembic/`

### Schema Highlights (78 tables, 21 enums)

| Domain | Tables | Key Design |
|--------|--------|-----------|
| IAM | 7 | `iam_principals` unified identity. RBAC with ABAC conditions. Argon2id + MFA. |
| Customer | 5 | GDPR by design. Consent tracking. Anonymization support. |
| Store Ops | 6 | `store_operating_hours` normalized (not JSON). `dining_tables` with QR tokens. |
| Menu | 6 | Hierarchical categories. Modifier groups + options. Item variants. Recipe BOM. |
| Inventory | 5 | Real-time ledger (`inventory_movement_log`). Auto-deduction via recipes. |
| Cart & Checkout | 3 | Persistent cross-device carts. Cryptographic checkout sessions (SHA-256). |
| Order Mgmt | 4 | Lean `orders` (18 cols). `order_line_items` snapshot. `order_status_log` append-only. |
| Fulfillment | 1 | `order_fulfillment` separates delivery/dine-in/pickup workflows. |
| Payments | 5 | Immutable payments. `payment_events` append-only. AES-256 encrypted tokens. Refunds. |
| Wallet | 2 | Double-entry ledger (`wallet_ledger_entries`). No mutable balance. |
| Loyalty | 3 | Points ledger. Tier auto-computation. FIFO expiry. |
| Rewards & Promo | 4 | `reward_catalog` + `customer_rewards`. `voucher_definitions` + `customer_vouchers`. |
| Marketing | 2 | Campaigns with A/B testing. `campaign_analytics`. |
| Content | 2 | `content_blocks` + `splash_screens`. Time-bound, segment-targeted. |
| Surveys | 4 | Conditional logic. Reward incentives. Response analytics. |
| Notifications | 3 | Per-channel delivery log. Preferences with quiet hours. |
| Staff | 3 | `staff_profiles` with bcrypt PIN. `staff_time_events` GPS-enabled. Tip allocation. |
| Platform | 5 | `audit_log` tamper-evident. `scheduled_jobs`. Data retention policies. Health metrics. |

---

## 4. Backend Architecture

### Stack
- FastAPI 0.115+ (async)
- SQLAlchemy 2.0 async ORM
- Pydantic v2 + pydantic-settings
- asyncpg + Alembic
- Redis (caching, rate limiting, session store)
- pyjwt + argon2-cffi

### Model Organization
Models grouped by domain under `app/models/`:
```
models/
├── base.py              # Base declarative, mixins (TimestampMixin, SoftDeleteMixin)
├── iam.py               # principals, admin_accounts, roles, permissions, assignments
├── customer.py          # customers, addresses, devices, consents
├── store.py             # stores, operating_hours, special_hours, config, dining_tables
├── menu.py              # categories, items, modifier_groups, modifier_options, variants, recipes
├── inventory.py         # categories, items, movement_log, suppliers, purchase_orders
├── cart.py              # customer_carts, cart_line_items, checkout_sessions
├── order.py             # orders, order_line_items, order_status_log, order_adjustments
├── fulfillment.py       # order_fulfillment
├── payment.py           # payments, payment_events, payment_methods, refunds
├── wallet.py            # wallets, wallet_ledger_entries
├── loyalty.py           # loyalty_tiers, loyalty_accounts, loyalty_points_ledger
├── reward.py            # reward_catalog, customer_rewards
├── voucher.py           # voucher_definitions, customer_vouchers
├── marketing.py         # marketing_campaigns, campaign_analytics
├── content.py           # content_blocks, splash_screens
├── survey.py            # survey_definitions, questions, responses, answers
├── notification.py      # notification_messages, delivery_log, preferences
├── staff.py             # staff_profiles, staff_time_events, tip_allocations
└── platform.py          # platform_config, audit_log, scheduled_jobs, retention, health_metrics
```

### API Organization
```
api/v1/endpoints/
├── common/
│   ├── auth.py            # OTP, password login, refresh, logout
│   ├── config.py          # App config, bootstrap
│   ├── menu.py            # Public menu (categories, items, customizations)
│   ├── stores.py          # Store list, details, hours, tables
│   ├── upload.py          # File uploads
│   └── health.py          # Health checks
├── customer/
│   ├── users.py           # Profile, addresses
│   ├── cart.py            # Cart CRUD
│   ├── checkout.py        # Checkout session, discount validation
│   ├── orders.py          # Order CRUD, tracking, reorder
│   ├── wallet.py          # Balance, top-up, transactions
│   ├── loyalty.py         # Points, tiers, history
│   ├── rewards.py         # Catalog, redemption
│   ├── vouchers.py        # Claim, validate, apply
│   ├── favorites.py       # Favorite items
│   ├── notifications.py   # Inbox, mark read
│   ├── referral.py        # Referral code, tracking
│   ├── feedback.py        # Submit feedback
│   ├── surveys.py         # List, submit surveys
│   └── content.py         # Promo banners, info cards
├── staff/
│   ├── auth.py            # PIN-based clock-in/out
│   ├── pos.py             # POS terminal API
│   ├── kds.py             # Kitchen display system
│   ├── tables.py          # Table status, QR scan
│   └── orders.py          # Order status updates (staff actions)
└── admin/
    ├── dashboard.py         # Stats, KPIs
    ├── stores.py            # Store CRUD, settings
    ├── menu.py              # Menu management
    ├── inventory.py         # Stock, movements, suppliers
    ├── orders.py            # Order management, refunds
    ├── customers.py         # Customer list, detail, wallet top-up
    ├── staff.py             # Staff CRUD, shifts, PIN mgmt
    ├── rewards.py           # Reward catalog
    ├── vouchers.py          # Voucher CRUD
    ├── promotions.py        # Banners, content blocks
    ├── marketing.py         # Campaigns, broadcasts
    ├── surveys.py           # Survey CRUD, reports
    ├── loyalty.py           # Tier rules
    ├── reports.py           # Sales, analytics
    ├── finance.py           # Payments, settlements
    ├── system.py            # Config, audit log, health
    └── notifications.py     # Templates, broadcasts
```

### Auth Strategy

| Identity | Auth Method | Table | Token Claims |
|----------|------------|-------|--------------|
| Customer | Phone OTP | `customers` (linked to `iam_principals`) | `{"sub": customer_id, "type": "customer", "store_id": ?}` |
| Admin | Email + Argon2id + optional TOTP | `admin_accounts` (linked to `iam_principals`) | `{"sub": admin_id, "type": "admin", "roles": [...]}` |
| Staff | PIN (bcrypt) for clock-in + JWT for API | `staff_profiles` (linked to `iam_principals`) | `{"sub": staff_id, "type": "staff", "store_id": ...}` |
| Service/API | API Key (SHA-256) | `api_credentials` (linked to `iam_principals`) | `{"sub": principal_id, "type": "service"}` |

---

## 5. Frontend Architecture

### Admin Portal
- **Role**: HQ admin, regional manager, store manager
- **Pages**: Dashboard, Orders, Inventory, Menu, Staff, Customers, Marketing, Reports, System Config
- **Auth**: Cookie-based JWT (httpOnly)
- **Mobile**: Restricted to desktop (or responsive for managers)

### Customer PWA
- **Role**: End customers
- **Pages**: Home, Menu, Cart, Checkout, Orders, Wallet, Rewards, Profile, Referral
- **Auth**: OTP-based JWT (cookie + memory)
- **Features**: Offline support, service worker, push notifications, QR dine-in

### Staff Portal
- **Role**: Service crew, cashiers, kitchen staff
- **Pages**: Clock-in/out, POS, KDS, Table mgmt, Wallet top-up (QR scan)
- **Auth**: PIN for clock-in, JWT session for operations
- **Device**: Tablet/phone optimized. This replaces the current "borrow admin frontend" approach.

---

## 6. Migration Phases

### Phase 0: Foundation (This Session)
- [x] Folder structure
- [x] Complete v3 DDL SQL
- [x] Docker Compose for new services
- [x] Backend skeleton (FastAPI, DB, security)
- [x] Alembic initialized for `fnb_enterprise_v3`
- [x] Base SQLAlchemy models (IAM, Stores, Customers, Staff)

### Phase 1: Core Domains
- [ ] All SQLAlchemy models (78 tables)
- [ ] Pydantic schemas
- [ ] Common API endpoints (auth, menu, stores)
- [ ] Admin API endpoints (dashboard, orders, customers)
- [ ] Database seeding scripts

### Phase 2: Customer & Commerce
- [ ] Customer API (cart, checkout, orders, wallet)
- [ ] Payment integration contracts
- [ ] Customer PWA v3 (copy/adapt existing components)

### Phase 3: Staff & Operations
- [ ] Staff API (POS, KDS, clock-in)
- [ ] Staff Portal v3
- [ ] Delivery/POS webhook contracts

### Phase 4: Marketing & Loyalty
- [ ] Loyalty engine
- [ ] Rewards & vouchers
- [ ] Marketing campaigns
- [ ] Notification system

### Phase 5: Migration & Cutover
- [ ] Data migration scripts from `fnb` → `fnb_enterprise_v3`
- [ ] Parallel running (shadow mode)
- [ ] DNS cutover
- [ ] Legacy decommission

---

## 7. Key Design Decisions

1. **One Brand, Multiple Stores**: `stores` table has `brand_name` but no separate `brands` table. For multi-brand SaaS, add `brands` table later.
2. **Universal Menu with Store Overrides**: Menu categories/items are global per brand. Store-specific availability via `menu_item_availability` (future) or `store_configuration`.
3. **Inventory is Store-Scoped**: Each store manages its own inventory. No central warehouse model.
4. **POS/Delivery/PG per Brand**: Integration credentials stored at store level (`pos_integration_type`, `delivery_integration_type`).
5. **No Shared Monorepo Yet**: `shared/packages/` is prepared but frontends remain independent until Phase 2+.
6. **Redis Required**: Caching, rate limiting, and OTP sessions all use Redis (no in-memory fallback for production).
7. **Test-Driven**: Every endpoint must have tests before merge.

---

## 8. Immediate Next Steps

1. ~~Generate DDL + indexes + constraints + triggers + RLS + seed~~ ✅
2. ~~Set up `v3/backend` with FastAPI + SQLAlchemy + Alembic~~ ✅
3. ~~Create `docker-compose.yml` with 138xx ports~~ ✅
4. ~~Implement IAM, Store, Customer, Staff base models~~ ✅
5. Document ports & services (`docs/01-ports-and-services.md`) ✅
6. Next: Implement remaining models (Menu, Inventory, Cart, Order, Payment, Wallet, Loyalty, etc.)
