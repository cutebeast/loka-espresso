# FNB Super App — Loka Espresso

Full-stack F&B ordering and loyalty platform. The active codebase is in `v3/`.

| Component | Stack | Dev URL | Live URL (target) |
|-----------|-------|---------|-------------------|
| Backend API | FastAPI + SQLAlchemy async | https://admin.loyaltysystem.uk/api | https://admin.lokaespresso.com/api |
| Admin Portal | Next.js 16 | https://admin.loyaltysystem.uk | https://admin.lokaespresso.com |
| Staff Portal | Next.js 16 | https://staff.loyaltysystem.uk | https://staff.lokaespresso.com |
| Customer PWA | Next.js 16 | https://app.loyaltysystem.uk | https://app.lokaespresso.com |
| Database | PostgreSQL 16 | Docker `fnb-v3-postgres` | Docker `fnb-v3-postgres` |
| Cache / Rate limit | Redis 7 | Docker `fnb-v3-redis` | Docker `fnb-v3-redis` |
| Reverse Proxy | Caddy 2 | Host Caddy + Docker-ready Caddyfile | Host Caddy or Docker Caddy |

## Current status

- **Backend unit tests:** 24 passed, 0 failed
- **E2E tests:** 199 passed, 16 skipped, 0 failed
- **TypeScript strict:** 0 errors across admin, staff, and customer PWA
- **Route validation:** 0 unmatched frontend API calls
- Root repository is cleaned of legacy v1/v2 artifacts; all active code stays in `v3/`
- Round 26 security, auth, currency, payment, and deployment fixes are applied

## Repository layout

```
/root/fnb-super-app/
├── AGENTS.md            # Agent quick-reference
├── README.md            # This file
└── v3/                  # Active application code
    ├── backend/         # FastAPI
    ├── admin-portal/    # Admin dashboard
    ├── staff-portal/    # Staff portal / POS
    ├── customer-pwa/    # Customer PWA
    ├── e2e-tests/       # pytest API + browser E2E suite
    ├── infra/           # Docker, Caddy, DB init scripts
    └── scripts/         # Seed / operational scripts
```

## Quick start

```bash
cd v3

# Backend (PM2 dev mode)
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 13800

# Frontends (PM2 dev mode)
cd admin-portal && npm run dev    # localhost:13830
cd staff-portal && npm run dev    # localhost:13820
cd customer-pwa && npm run dev    # localhost:13810
```

## Tests

```bash
# Backend unit tests
cd v3/backend
source .venv/bin/activate
pytest tests/

# Full E2E suite
cd v3/e2e-tests
source ../backend/.venv/bin/activate
pytest -q

# TypeScript strict checks
for dir in admin-portal staff-portal customer-pwa; do
  (cd "v3/$dir" && npx tsc --noEmit)
done
```

## Full-Docker deployment

```bash
cd v3/infra/docker
cp .env.example .env
# edit .env with secrets and domains for the target server
docker compose up -d --build
```

## Live cut-over checklist (loyaltysystem.uk → lokaespresso.com)

- Rotate all secrets: `JWT_SECRET`, DB/Redis passwords, Stripe/HitPay keys, VAPID keys, webhook secrets.
- Update `v3/backend/.env`: `CORS_ORIGINS`, `TRUSTED_HOSTS`, live payment keys.
- Update `v3/infra/docker/.env`: `APP_DOMAIN`, `ADMIN_DOMAIN`, `STAFF_DOMAIN`, secrets.
- Update portal `.env.local` files: replace `loyaltysystem.uk` with `lokaespresso.com`.
- Replace host Caddy configs (`/etc/caddy/sites/fnb-*.conf`) or switch to Docker Caddy.
- Provision TLS certificates for `*.lokaespresso.com`.
- Run `alembic upgrade head` on the live database.
- Set strong admin credentials; verify `otp.bypass_enabled=false` and `currency.default=MYR`.
- Register Stripe/HitPay webhooks on the new domains.
- Run the full test suite after cut-over.
