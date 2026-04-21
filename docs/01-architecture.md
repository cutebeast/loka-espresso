# FNB Super-App — Architecture Overview

> Last updated: 2026-04-21 | Status: current internal architecture before real provider integrations

## Runtime Topology

```text
admin.loyaltysystem.uk ─┬─ frontend/     (merchant/admin Next.js app)
                        └─ backend/      (FastAPI API)

app.loyaltysystem.uk   ─┬─ customer-app/ (customer PWA Next.js app)
                        └─ backend/      (same FastAPI API)

backend/ ──────────────── PostgreSQL 16
```

## Main Components

### Backend
- Framework: FastAPI
- ORM: SQLAlchemy 2 async
- DB: PostgreSQL 16 via `asyncpg`
- Migrations: Alembic
- Auth:
  - admin/staff: email + password
  - customer: OTP login
  - refresh tokens + token blacklist
- Main domains:
  - auth and users
  - stores, menu, cart, orders
  - wallet and loyalty
  - vouchers, rewards, promotions, surveys, information cards
  - staff, reports, audit, notifications

### Merchant App
- Location: `frontend/`
- Framework: Next.js 16
- Purpose: merchant/admin dashboard for operations, marketing, reporting, and system management
- Current auth model:
  - email/password login
  - local token storage with refresh handling

### Customer PWA
- Location: `customer-app/`
- Framework: Next.js 16
- Purpose: customer ordering, wallet, rewards, promotions, profile, and order tracking
- Current auth model:
  - OTP login
  - OTP bypass/testing flow still used before Twilio integration
- Current PWA behavior:
  - service worker enabled
  - manifest enabled
  - versioned rebuild flow via `scripts/fnb-manage.sh`

## Current Integration Boundaries

These integrations are still mocked, not real-provider implementations:

### Payment Gateway
- Mock tools:
  - `scripts/3rdparty_pg/mock_pg_server.py`
  - `scripts/3rdparty_pg/pg_client.py`
- Backend readiness implemented:
  - payment intents
  - wallet payment confirmation
  - order payment webhook handling
  - webhook verification foundation

### Delivery Provider
- Mock tools:
  - `scripts/3rdparty_delivery/mock_delivery_server.py`
  - `scripts/3rdparty_delivery/delivery_client.py`
- Backend readiness implemented:
  - delivery metadata on orders
  - delivery status webhook handling
  - delivery validation and minimum-order enforcement

### External POS
- Mock tools:
  - `scripts/external_pos/mock_pos_server.py`
  - `scripts/external_pos/pos_client.py`
  - `scripts/external_pos/pos_webhooks.py`
- Backend readiness implemented:
  - POS webhook endpoint on orders
  - dine-in payment/status flow support

### Twilio / SMS OTP
- Not integrated yet
- Current system still uses backend OTP generation plus admin/test lookup and optional OTP bypass configuration

## Data Model Notes

### Universal Menu
- Customer-facing store menu is universal HQ-managed content
- Public endpoints are store-addressed, but menu data is effectively served from HQ menu records

### Order Flows

#### Flow A — Pickup / Delivery
- `pending -> paid -> confirmed -> preparing -> ready -> completed`
- delivery may additionally pass through `out_for_delivery`
- payment happens before fulfillment progression

#### Flow B — Dine-in
- `pending -> confirmed -> preparing -> ready -> paid -> completed`
- payment happens after fulfillment stage

## Security & Reliability Notes

- access tokens include `jti` and are blacklist-checked
- refresh tokens are rotated/revoked in current auth flow
- OTP sessions now track resend windows and verify attempts
- payment and delivery/POS webhooks now rely on shared verification logic
- idempotency middleware exists, but is still in-memory and not distributed

## Project Layout

```text
/root/fnb-super-app/
├── backend/
│   ├── alembic/
│   ├── app/
│   │   ├── api/v1/endpoints/
│   │   ├── core/
│   │   ├── models/
│   │   └── schemas/
├── frontend/
│   └── src/
├── customer-app/
│   └── src/
├── scripts/
│   ├── seed/
│   ├── 3rdparty_pg/
│   ├── 3rdparty_delivery/
│   └── external_pos/
└── docs/
```

## Environment Notes

Important backend env variables currently in use:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_ALGORITHM`
- `JWT_EXPIRE_MINUTES`
- `CORS_ORIGINS`
- `UPLOAD_DIR`
- `WEBHOOK_API_KEY`
- `WEBHOOK_SIGNING_SECRET`
- `OTP_BYPASS_ALLOWED`

## Operational Modes

### Local / Rebuild Workflow
- Scripted manager:
  - `scripts/fnb-manage.sh`
- Current local ports used by that script:
  - backend: `8765`
  - admin: `3001`
  - customer PWA: `3002`

### Production-style Deployment Docs
- Some deployment examples still reference backend port `8000` for systemd/Caddy-style deployment
- Treat `scripts/fnb-manage.sh` as the source of truth for local rebuild/testing
- Treat `07-deployment-guide.md` as the source of truth for deployment structure

## Current Readiness Summary

- merchant app: active
- customer PWA: active
- modular seed scripts: active and updated to current internal contracts
- mock PG/delivery/POS: active simulation layer
- real PG/Twilio/delivery/POS integrations: pending next phase
