# FNB Super App v3 — Project Status

> Last updated: 2026-07-06
> Active codebase: `/root/fnb-super-app/v3`
> Repository: `https://github.com/cutebeast/loka-espresso`

---

## 1. Overview

The **Loka Espresso FNB Super App v3** is a full-stack F&B ordering and loyalty platform.

| Layer | Stack | Dev URL (current server) | Live URL (target) |
|-------|-------|--------------------------|-------------------|
| Admin dashboard | Next.js 16 | https://admin.loyaltysystem.uk | https://admin.lokaespresso.com |
| Staff POS + ops | Next.js 16 | https://staff.loyaltysystem.uk | https://staff.lokaespresso.com |
| Customer PWA | Next.js 16 | https://app.loyaltysystem.uk | https://app.lokaespresso.com |
| Backend API | FastAPI + SQLAlchemy async | https://admin.loyaltysystem.uk/api | https://admin.lokaespresso.com/api |
| Database | PostgreSQL 16 | Docker `fnb-v3-postgres` | Docker `fnb-v3-postgres` |
| Cache / rate limit | Redis 7 | Docker `fnb-v3-redis` | Docker `fnb-v3-redis` |
| Reverse proxy | Caddy 2 | Host Caddy (PM2 mode) or Docker Caddy (full-Docker mode) | Host Caddy or Docker Caddy |

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
    ├── e2e-tests/            # pytest API + browser E2E suite
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

The Docker Caddyfile is domain-agnostic. Set these variables in `v3/infra/docker/.env` per server:

```bash
APP_DOMAIN=app.lokaespresso.com
ADMIN_DOMAIN=admin.lokaespresso.com
STAFF_DOMAIN=staff.lokaespresso.com
CADDY_EMAIL=admin@lokaespresso.my
```

The host Caddy configs (`infra/host-caddy/fnb-*.conf`) use environment variables (`APP_DOMAIN`, `ADMIN_DOMAIN`, `STAFF_DOMAIN`). For a new server, set those variables (see `infra/host-caddy/.env.example`) or switch to the Docker Caddy stack.

> **Current dev server still uses `loyaltysystem.uk` in host Caddy + `.env` files.** These must be updated before cut-over to `lokaespresso.com` (see migration checklist below).

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
cd /root/fnb-super-app/v3/backend
source .venv/bin/activate
pytest tests/
```

**Latest run:** 24 passed, 0 failed.

```bash
cd /root/fnb-super-app/v3/e2e-tests
source .venv/bin/activate
pytest -q
```

**Latest run:** **189 passed, 26 skipped, 0 failed** (with browser tests enabled).

TypeScript strict: 0 errors across all 3 portals.
Runtime API audit: route validator reports 0 unmatched frontend API calls.

---

## 7. Recent fixes (Round 26 audit — 2026-07-06)

### Backend
- **Customer auth:** login now requires `phone_number`; email-only login removed. OTP bypass remains config-driven (`otp.bypass_enabled`); environment-name bypass removed.
- **Admin/staff auth boundary:** `CurrentAdmin` no longer accepts real staff tokens (`staff_id > 0`). Admin-acting-as-staff tokens (with `admin_id`) still work.
- **Staff login:** every failed password/PIN attempt now increments `failed_login_count` and respects lockout.
- **Admin logout:** refresh token `jti` is blacklisted before cookies are cleared.
- **Webhooks:** removed `X-Webhook-API-Key` gate from Stripe/GrabPay/HitPay provider-facing endpoints.
- **Config:** empty `TRUSTED_HOSTS` in production now raises an error instead of wildcard fallback.
- **Roles:** `readonly_analyst` can access `/admin/auth/me`; custom IAM roles are included in permission resolution.
- **Payments:** `PaymentMethodOut` no longer exposes `provider_token_encrypted`; webhook capture events cannot revert refund/chargeback states.
- **Platform config:** `/admin/config` PUT now accepts `key`/`value` in the JSON body (query-string still supported for backward compatibility).
- **Seeds:** `clear_db.py` covers `staff_tasks`; `seed_platform.py` defaults `otp.bypass_enabled=true` for dev/E2E compatibility.

### Admin portal
- Server-side `/auth/login` and `/auth/refresh` no longer leak tokens in the response body.
- Currency is now configurable: admin settings control `app.currency` and `app.currency_symbol`; all admin UI currency formatting uses the new `useCurrency()` hook instead of hard-coded `RM `.
- Removed all legacy localStorage token handling.
- Version-control page fetches the backend version via cookie credentials.
- Twilio Verify settings page sends sensitive values in the request body.
- `next.config.ts` no longer hard-codes localhost in production; Docker Compose and Dockerfile.admin supply `API_URL`.
- Middleware whitelists public assets (`/version.json`, `/favicon.svg`, `/manifest.json`, `/icons/*`) and adds staff/customer version hosts to CSP.
- HSTS only emitted in production.
- i18n locale flash fixed; translation tab inputs are controlled.

### Staff portal
- `staff_refresh_token` HttpOnly cookie now persisted and forwarded by `/auth/refresh`.
- Logout calls backend `/staff/auth/logout` with credentials so the refresh token can be blacklisted.
- `AuthProvider` no longer relies on `localStorage` for auth gating.
- POS checkout skips zero-amount wallet calls when total ≤ 0.
- `useStaffRole` checks the `roles` array as well as `staff_role`.
- HSTS only emitted in production.

### Customer PWA
- Middleware matcher fixed so security headers and public-prefix logic apply to all routes.
- `OrdersPage` "Load more" pagination closure bug fixed.
- `CheckoutPage` double-submit guard added.
- Web push permission now requested only from a user action; subscription deregistered on logout.
- Offline order replay in the service worker shares the same idempotency key as the app and no longer stores a separate `authToken`.
- Missing locale keys backfilled in `ms/zh/ta/tr.json`.
- HSTS only emitted in production.

### Tooling / cleanup
- Removed one-time scripts and unused smoke-test files: `fix_broken_jsx.py`, `translate_*.py`, `smoke_admin_*.js`, `customer-pwa-journey.js`, `debug-pwa.js`.

---

## 8. Configuration / secrets

Secrets live in untracked `.env` files:

- `v3/backend/.env`
- `v3/infra/docker/.env`
- `v3/admin-portal/.env.local`
- `v3/staff-portal/.env.local`
- `v3/customer-pwa/.env.local`

Never commit these. Templates are provided:

- `v3/backend/.env.example`
- `v3/infra/docker/.env.example`
- `v3/admin-portal/.env.example`
- `v3/staff-portal/.env.example`
- `v3/customer-pwa/.env.example`

Key values to set per deployment:

- `POSTGRES_PASSWORD`, `REDIS_PASSWORD`
- `JWT_SECRET` (minimum 32 characters)
- `CORS_ORIGINS` (exact production HTTPS origins)
- `TRUSTED_HOSTS` (must not be empty in production)
- Public domains (`APP_DOMAIN`, `ADMIN_DOMAIN`, `STAFF_DOMAIN`)
- Server-side backend URLs for the portals:
  - Admin portal: `API_URL`
  - Staff portal: `API_PROXY_URL`
  - Customer PWA: `API_PROXY_URL`

---

## 9. Migration checklist (loyaltysystem.uk → lokaespresso.com)

- [ ] Update `v3/backend/.env`: `CORS_ORIGINS`, `TRUSTED_HOSTS`.
- [ ] Update `v3/infra/docker/.env`: domains, `CORS_ORIGINS`, `TRUSTED_HOSTS`, secrets.
- [ ] Update `v3/admin-portal/.env.local` / `.env.example`: `API_URL`, `NEXT_PUBLIC_*_DOMAIN`.
- [ ] Update `v3/staff-portal/.env.local` / `.env.example`: `API_PROXY_URL`, domains.
- [ ] Update `v3/customer-pwa/.env.local` / `.env.example`: `API_PROXY_URL`, `NEXT_PUBLIC_APP_URL`.
- [ ] Replace host Caddy configs (`/etc/caddy/sites/fnb-*.conf`) or switch to Docker Caddy with new domains.
- [ ] Issue/obtain TLS certificates for `*.lokaespresso.com`.
- [ ] Change the default `otp.bypass_code` from `000000` to a strong secret if keeping bypass enabled.
- [ ] Re-seed the database on the live server so platform config matches the new brand/domain.
- [ ] Run the full test suite after cut-over.

---

## 10. Known issues / next steps

| Item | Status | Recommendation |
|------|--------|----------------|
| Disk usage 76% | Monitor | Clean PM2 logs and `.next/cache` periodically. Do not delete running `.next/` builds. |
| Python environment | Backend uses `v3/backend/.venv` | For full-Docker deployments the backend Dockerfile uses its own venv. |
| Full-Docker switch | Ready | Validate on staging before replacing PM2 on production. |
| Legacy v1/v2 artifacts | Cleaned | Only `fnb-v3-postgres` and `fnb-v3-redis` remain. |
| OTP bypass | Config-driven fallback | Default `otp.bypass_enabled=true` on dev. On live, keep only if required and rotate `otp.bypass_code`. |
| Admin currency | Fixed — uses `app.currency` / `app.currency_symbol` via `useCurrency()` hook. | Apply the same pattern to staff portal and customer PWA (still hard-coded `RM `). |
| E2E cleanup script | Dependency mismatch | `cleanup_e2e_test_data.py` uses `psycopg2`; install `psycopg2-binary` in the backend venv or run from the e2e-tests venv. |

---

## 11. Quick commands

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

# Seed admin UI translations
cd /root/fnb-super-app/v3
python3 scripts/seed_admin_ui_translations.py

# Run E2E tests
cd /root/fnb-super-app/v3/e2e-tests
source .venv/bin/activate
pytest -q

# TypeScript checks
cd /root/fnb-super-app/v3/admin-portal && npx tsc --noEmit
cd /root/fnb-super-app/v3/staff-portal && npx tsc --noEmit
cd /root/fnb-super-app/v3/customer-pwa && npx tsc --noEmit

# Validate frontend routes against backend OpenAPI
cd /root/fnb-super-app/v3
python3 scripts/validate-routes.py

# Reload host Caddy after config edits
caddy reload --config /etc/caddy/Caddyfile
```

---

## 12. Decision: keep `v3/` nested

**Do not flatten `v3/` into the repository root.**

- Root-level legacy files have been removed.
- Docker build contexts, Caddy mounts, and PM2 paths all assume `v3/`.
- Moving would rewrite git history, break open PRs/deploy scripts, and gain nothing.
- Future versions (v4, white-label brands) can live as sibling directories (`v4/`, `brand-x/`) without touching `v3/`.
