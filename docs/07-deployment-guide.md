# FNB Super-App — Deployment & Rebuild Guide

> Last updated: 2026-04-21

## Two Supported Operating Contexts

### 1. Local / verification workflow
- primary control script: `scripts/fnb-manage.sh`
- default ports used by that script:
  - backend: `8765`
  - admin: `3001`
  - customer PWA: `3002`

### 2. Production-style deployment
- backend commonly documented behind Caddy/systemd on `8000`
- admin on `3001`
- customer PWA on `3002`
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
JWT_EXPIRE_MINUTES=10080
CORS_ORIGINS=https://admin.loyaltysystem.uk,https://app.loyaltysystem.uk
UPLOAD_DIR=/root/fnb-super-app/uploads
WEBHOOK_API_KEY=<shared-webhook-key>
WEBHOOK_SIGNING_SECRET=<optional-signing-secret>
OTP_BYPASS_ALLOWED=false
```

For the current pre-Twilio phase, OTP bypass may still be enabled intentionally in non-production environments via env + app config.

---

## Database & Migrations

```bash
cd /root/fnb-super-app/backend
.venv/bin/alembic upgrade head
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
/root/fnb-super-app/backend/.venv/bin/python3 /root/fnb-super-app/scripts/3rdparty_pg/mock_pg_server.py
/root/fnb-super-app/backend/.venv/bin/python3 /root/fnb-super-app/scripts/3rdparty_delivery/mock_delivery_server.py
/root/fnb-super-app/backend/.venv/bin/python3 /root/fnb-super-app/scripts/external_pos/mock_pos_server.py
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

Typical service allocation:

| Service | Purpose | Suggested Port |
|--------|---------|----------------|
| `fnb-backend` | FastAPI | `8000` |
| `fnb-admin` | Merchant Next.js | `3001` |
| `fnb-app` | Customer PWA Next.js | `3002` |
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
curl -s http://localhost:8765/health
curl -s http://localhost:8765/api/v1/config
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
