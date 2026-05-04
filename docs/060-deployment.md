# FNB Super-App — Deployment & Rebuild Guide

> Last updated: 2026-04-22

## Two Supported Operating Contexts

### 1. Local / verification workflow
- primary control script: `scripts/fnb-manage.sh`
- default ports used by that script:
  - backend: `3002`
  - admin: `3001`
  - customer PWA: `3003`

### 2. Production-style deployment
- backend commonly documented behind Caddy/systemd on `8000`
- admin on `3001`
- customer PWA on `3003`
- PostgreSQL on `5433`

If there is any conflict between local scripted usage and production examples, use:

- `scripts/fnb-manage.sh` for local rebuild/test operations
- service/Caddy config for production deployment decisions

---

## Environment

Minimum backend environment variables:

```env
DATABASE_URL=postgresql+asyncpg://fnb:<password>@localhost:5433/fnb
JWT_SECRET=<strong-secret>
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=30
JWT_ISSUER=fnb-api
JWT_AUDIENCE=fnb-app
CORS_ORIGINS=https://admin.loyaltysystem.uk,https://app.loyaltysystem.uk
UPLOAD_DIR=/root/fnb-super-app/uploads
REDIS_URL=redis://redis:6379/0             # Optional — auto-falls back to in-memory
WEBHOOK_API_KEY=<shared-webhook-key>
WEBHOOK_SIGNING_SECRET=<optional-signing-secret>
POS_API_URL=                               # Leave empty to disable outbound POS calls (manual mode)
```

OTP bypass is DB-controlled via `AppConfig` (`otp_bypass_enabled` / `otp_bypass_code`). No env var needed.

---

## Database & Migrations

```bash
docker compose exec backend alembic upgrade head
```

After the latest hardening pass, ensure the newest migration is applied before startup.

---

## Local Rebuild Workflow

```bash
cd /root/fnb-super-app/scripts
./fnb-manage.sh rebuild
./fnb-manage.sh status
./fnb-manage.sh verify
```

Useful commands:

```bash
./fnb-manage.sh start
./fnb-manage.sh stop
./fnb-manage.sh restart
./fnb-manage.sh logs
./fnb-manage.sh build
./fnb-manage.sh build_admin
./fnb-manage.sh build_customer
```

---

## Mock Provider Services

For current pre-provider integration testing, run these separately when needed:

```bash
./fnb-manage.sh mock-pg
./fnb-manage.sh mock-delivery
./fnb-manage.sh mock-pos
```

Default ports:

| Service | Port |
|--------|------|
| Mock PG | `8889` |
| Mock Delivery | `8888` |
| Mock POS | `8081` |

---

## Seed Workflow

After services are up, run seed scripts from:

```bash
cd /root/fnb-super-app/scripts/seed
```

Recommended order:

1. base system seeds `00-09`
2. customer journey seeds `10-18`

See `docs/04-testing-guide.md` for the current ordered sequence.

---

## Production-style Service Layout

> **Note:** Docker-based deployment is the primary supported production method. The service layout below reflects `docker-compose.yml` port mappings.

Typical service allocation:

| Service | Purpose | Suggested Port |
|--------|---------|----------------|
| `fnb-backend` | FastAPI | `3002` (host) → `8000` (container) |
| `fnb-admin` | Merchant Next.js | `3001` |
| `fnb-app` | Customer PWA Next.js | `3003` |
| `fnb-db` | PostgreSQL | `5433` |

Reverse proxy examples should route:

- `admin.loyaltysystem.uk/api/*` -> backend
- `admin.loyaltysystem.uk/*` -> merchant app
- `app.loyaltysystem.uk/api/*` -> backend
- `app.loyaltysystem.uk/*` -> customer PWA

---

## Verification Checklist

### Local

```bash
curl -s http://localhost:3002/health
curl -s http://localhost:3002/api/v1/config
curl -I http://localhost:3001
curl -I http://localhost:3002
```

### Production-style

```bash
curl -s https://admin.loyaltysystem.uk/health
curl -s https://admin.loyaltysystem.uk/api/v1/config
curl -I https://admin.loyaltysystem.uk
curl -I https://app.loyaltysystem.uk
```

---

## Operational Notes

1. `scripts/fnb-manage.sh` does not start the mock PG/delivery/POS services for you.
2. Customer PWA build flow updates manifest/service-worker versioning automatically.
3. Merchant app currently uses `proxy.ts`, replacing deprecated `middleware.ts` naming.
4. Before production exposure, rotate any live-looking secrets and disable OTP bypass in production.
