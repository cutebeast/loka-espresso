# FNB Super App v3 — Project Status

> Last updated: 2026-07-04
> Active codebase: `/root/fnb-super-app/v3`
> Repository: `https://github.com/cutebeast/loka-espresso`

---

## 1. Overview

The **Loka Espresso FNB Super App v3** is a full-stack F&B ordering and loyalty platform.

| Layer | Stack | Live URL (dev) |
|-------|-------|----------------|
| Admin dashboard | Next.js 16 | https://admin.lokaespresso.com |
| Staff POS + ops | Next.js 16 | https://staff.lokaespresso.com |
| Customer PWA | Next.js 16 | https://app.lokaespresso.com |
| Backend API | FastAPI + SQLAlchemy async | https://admin.lokaespresso.com/api |
| Database | PostgreSQL 16 | Docker `fnb-v3-postgres` |
| Cache / rate limit | Redis 7 | Docker `fnb-v3-redis` |
| Reverse proxy | Caddy 2 | Host Caddy (PM2 mode) or Docker Caddy (full-Docker mode) |

---

## 2. Repository layout

`/root/fnb-super-app` is the project root. The root has been cleaned of legacy v1/v2 artifacts.

```
/root/fnb-super-app/
├── .git
├── .gitignore
├── AGENTS.md                 # Agent quick-reference
├── README.md                 # Human-facing landing doc
└── v3/                       # Active application code
    ├── backend/              # FastAPI
    ├── admin-portal/         # Admin dashboard (120 pages)
    ├── staff-portal/         # Staff portal (16 pages)
    ├── customer-pwa/         # Customer PWA (26 pages)
    ├── e2e-tests/            # pytest API E2E suite
    ├── infra/                # Docker, Caddy, DB init scripts
    ├── docs/                 # Project documentation
    └── scripts/              # Seed / operational scripts
```

**Do not move `v3/` contents to root.** The active code is intentionally isolated in `v3/` so the root can stay clean and multi-version safe.

---

## 3. Current deployment mode

| Component | Where it runs | Notes |
|-----------|---------------|-------|
| PostgreSQL | Docker (`fnb-v3-postgres`) | Port `13334` mapped to host |
| Redis | Docker (`fnb-v3-redis`) | Port `13335` mapped to host, password-protected |
| Backend | PM2 (`v3-backend`) | Runs in `v3/backend/.venv`, listens on `localhost:13800`, uses Docker Redis |
| Admin portal | PM2 (`admin-portal-v3`) | Listens on `localhost:13830` |
| Staff portal | PM2 (`staff-portal-v3`) | Listens on `localhost:13820` |
| Customer PWA | PM2 (`customer-pwa-v3`) | Listens on `localhost:13810` |
| Caddy | Host (`/etc/caddy/sites/fnb-*.conf`) | Proxies public HTTPS to PM2 services |

A full-Docker deployment is ready in `v3/infra/docker/docker-compose.yml`. To switch this or another server to Docker-only:

```bash
cd /root/fnb-super-app/v3/infra/docker
# Copy and edit .env with real secrets and domains
cp .env.example .env
nano .env

docker compose up -d --build
pm2 stop v3-backend admin-portal-v3 staff-portal-v3 customer-pwa-v3
```

---

## 4. Domains / multi-server support

The Caddyfile is domain-agnostic. Set these variables in `v3/infra/docker/.env` per server:

```bash
APP_DOMAIN=app.lokaespresso.com
ADMIN_DOMAIN=admin.lokaespresso.com
STAFF_DOMAIN=staff.lokaespresso.com
CADDY_EMAIL=admin@lokaespresso.my
```

The host Caddy configs (`infra/host-caddy/fnb-*.conf`) use environment variables (`APP_DOMAIN`, `ADMIN_DOMAIN`, `STAFF_DOMAIN`) with the old dev server as a fallback. For a new server, set those variables (see `infra/host-caddy/.env.example`) or switch to the Docker Caddy stack.

---

## 5. Uploads / static files

All uploads are handled by the backend and served through the backend's `StaticFiles` mount at `/uploads`.

| Environment | Upload directory | How `/uploads/*` is served |
|-------------|------------------|----------------------------|
| PM2 (current dev) | `v3/backend/uploads/` | Caddy proxies `/uploads/*` to `localhost:13800` |
| Docker | `/app/uploads` in backend container | Docker Caddy proxies `/uploads/*` to `backend:13800` |

Endpoint mapping:

- `POST /api/upload/image` → `uploads/images/{uuid}.png`
- `PUT /api/me/avatar` → `uploads/avatars/avatar_user_{id}.png`
- `POST /api/staff/equipment/{id}/report` → `uploads/equipment/...`
- `POST /api/staff/hygiene/*` → `uploads/equipment/...`

**Verified 2026-06-28:**
- Generic image upload returns 200 and the HTTPS URL is reachable.
- Customer avatar upload returns 200 and the HTTPS URL is reachable.

Legacy uploads from the old v1/v2 app were moved to `/root/backups/legacy-fnb-uploads/` and are no longer served.

---

## 6. Test status

```bash
cd /root/fnb-super-app/v3/e2e-tests
pytest -q
```

Latest run: **207 passed, 8 skipped, 0 failed** (with browser tests enabled via `e2e-tests/.venv`).

```bash
cd /root/fnb-super-app/v3/e2e-tests
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
pytest -q
```

TypeScript strict: 0 errors across all 3 portals.
Runtime API audit: 43/43 admin/staff/customer checks passed after full re-seed.

---

## 7. Recent fixes (2026-06-27 → 2026-06-28)

- Repaired admin `/stores/settings` blank page.
- Stabilised staff and customer portals (Next.js standalone/output fixes).
- Fixed payment list 500, equipment create/update 500, splash-screen `always` frequency.
- Added modular seed scripts and expanded E2E coverage (content, marketing, refunds, tips, hygiene, etc.).
- Wired backend to Docker Redis for distributed rate limiting.
- Moved backend from system Python to a dedicated `v3/backend/.venv` virtual environment.
- Made Docker/Caddy stack domain-agnostic for multi-server deployment.
- Cleaned root-level legacy `infra/`, `scripts/`, `.github/workflows/ci.yml`, `.env.example`, and `uploads/`.
- Removed duplicate customer-PWA CSS (`events-v2.css`) and archived `docs/_archive/`.
- Untracked generated files (`public/version.json`, `next-env.d.ts`) and added them to `.gitignore`.

---

## 7b. Round 25 audit fixes (2026-07-04)

- Removed legacy v1/v2 Docker containers and images (`fnb-backend`, `fnb-db`, `fnb-redis`).
- Fixed `clear_db.py` missing `wallet_topup_sessions` table.
- Fixed payment method schema/enum mismatch (`PaymentMethodBase.method_type` and `provider`).
- Moved hardcoded payment/provider URLs (Stripe/GrabPay simulators, Resend/Twilio/DeepL) to `platform_config` or environment settings.
- Hardened admin portal auth:
  - Added server-side `/auth/login`, `/auth/logout`, `/auth/refresh` API routes.
  - Login now sets an `HttpOnly` `admin_token` cookie.
  - Middleware validates the cookie against the backend before serving any protected page.
- Fixed staff portal double wallet charge when checkout total is <= 0.
- Fixed customer PWA:
  - Added `events` to public/guest page whitelist.
  - Settings page version now reads from `version.json` instead of hardcoded `1.0.0`.
  - OTP send no longer silently swallows HTTP 404.
  - Orders page no longer fetches active and past orders with overlapping queries on mount.
- Added backend unit tests (`tests/test_schemas_payment.py`, `tests/test_config.py`).
- Added `scripts/purge_retention.py` for data-retention cleanup (delete strategy only; archive/anonymize still require custom logic).
- Fixed Docker Compose defaults for `TRUSTED_HOSTS` and `CORS_ORIGINS`.
- Made `scripts/validate-routes.py` gracefully handle production mode where OpenAPI docs are disabled.

---

## 8. Configuration / secrets

Secrets live in untracked `.env` files:

- `v3/backend/.env`
- `v3/infra/docker/.env`

Never commit these. Templates are provided:

- `v3/backend/.env.example`
- `v3/infra/docker/.env.example`

Key values to set per deployment:

- `POSTGRES_PASSWORD`, `REDIS_PASSWORD`
- `JWT_SECRET` (minimum 32 characters)
- `CORS_ORIGINS`
- Public domains (`APP_DOMAIN`, `ADMIN_DOMAIN`, `STAFF_DOMAIN`, etc.)

---

## 9. Known issues / next steps

| Item | Status | Recommendation |
|------|--------|----------------|
| Disk usage 76% | Monitor | Clean PM2 logs and `.next/cache` periodically. Do not delete running `.next/` builds. |
| Python environment | Backend now uses `v3/backend/.venv` | For full-Docker deployments the backend Dockerfile uses its own venv. |
| Full-Docker switch | Ready | Validate on staging before replacing PM2 on production. |
| Legacy v1/v2 artifacts | Cleaned | Legacy containers (`fnb-backend`, `fnb-db`, `fnb-redis`) and old images removed. Only `fnb-v3-postgres` and `fnb-v3-redis` remain. |
| Dev OTP bypass | Enabled in DB | `otp.bypass_enabled=true` set in `platform_config` so E2E can run against `ENVIRONMENT=production` dev server. Disable on real production. |

---

## 10. Quick commands

```bash
# Start backend with the ecosystem file
pm2 start /root/fnb-super-app/v3/backend/ecosystem.config.js

# Restart backend with current .env
pm2 restart v3-backend

# Restart all v3 services
pm2 restart v3-backend admin-portal-v3 staff-portal-v3 customer-pwa-v3

# Recreate Docker data stores
cd /root/fnb-super-app/v3/infra/docker
docker compose up -d --force-recreate postgres redis

# Re-seed baseline data (dev server uses ENVIRONMENT=production)
cd /root/fnb-super-app/v3/backend
source .venv/bin/activate
python3 scripts/clear_db.py --all --yes --force-prod
python3 scripts/seed_all.py --yes --force-prod

# Run E2E tests
cd /root/fnb-super-app/v3/e2e-tests
source .venv/bin/activate
pytest -q

# Reload host Caddy after config edits
caddy reload --config /etc/caddy/Caddyfile
```

---

## 11. Decision: keep `v3/` nested

**Do not flatten `v3/` into the repository root.**

- Root-level legacy files have been removed.
- Docker build contexts, Caddy mounts, and PM2 paths all assume `v3/`.
- Moving would rewrite git history, break open PRs/deploy scripts, and gain nothing.
- Future versions (v4, white-label brands) can live as sibling directories (`v4/`, `brand-x/`) without touching `v3/`.
