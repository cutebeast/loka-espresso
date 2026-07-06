# FNB Super App v3 — Agent Notes

## Active code

All application code lives in `/root/fnb-super-app/v3`. Do not move files to the repository root.

## Test & seed workflow

```bash
# Re-seed baseline (dev server runs ENVIRONMENT=production)
cd /root/fnb-super-app/v3/backend
source .venv/bin/activate
python3 scripts/clear_db.py --all --yes --force-prod
python3 scripts/seed_all.py --yes --force-prod

# Seed admin UI translations
cd /root/fnb-super-app/v3
python3 scripts/seed_admin_ui_translations.py

# Backend unit tests
cd /root/fnb-super-app/v3/backend
pytest tests/

# TypeScript strict checks
for dir in admin-portal staff-portal customer-pwa; do
  (cd "/root/fnb-super-app/v3/$dir" && npx tsc --noEmit)
done

# Validate frontend API calls against backend routes
cd /root/fnb-super-app/v3
python3 scripts/validate-routes.py

# Run full E2E suite (including browser tests)
cd /root/fnb-super-app/v3/e2e-tests
source .venv/bin/activate
pytest -q
```

## Domain migration checklist (loyaltysystem.uk → lokaespresso.com)

- Update `v3/backend/.env`: `CORS_ORIGINS`, `TRUSTED_HOSTS`.
- Update `v3/infra/docker/.env`: `APP_DOMAIN`, `ADMIN_DOMAIN`, `STAFF_DOMAIN`, `CORS_ORIGINS`, `TRUSTED_HOSTS`, secrets.
- Update portal `.env.local` / `.env.example` files:
  - `v3/admin-portal/.env.local`: `API_URL`, `NEXT_PUBLIC_API_URL`, domain env vars.
  - `v3/staff-portal/.env.local`: `API_PROXY_URL`, `NEXT_PUBLIC_API_URL`.
  - `v3/customer-pwa/.env.local`: `API_PROXY_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`.
- Replace host Caddy configs (`/etc/caddy/sites/fnb-*.conf`) or switch to Docker Caddy.
- Issue/obtain TLS certificates for `*.lokaespresso.com`.
- On live, rotate `otp.bypass_code` if keeping `otp.bypass_enabled=true` as a fallback.

## Known quirks

- Backend `ENVIRONMENT=production` on the dev server disables OpenAPI docs, so `scripts/validate-routes.py` falls back to generating the schema from code.
- The dev server keeps `otp.bypass_enabled=true` so the E2E suite can log in without Twilio credentials.
- Legacy v1/v2 containers and images have been removed. Only `fnb-v3-postgres` and `fnb-v3-redis` remain.
- All three portals use HttpOnly cookie auth:
  - Admin: `admin_token` / `admin_refresh_token`
  - Staff: `staff_token` / `staff_refresh_token`
  - Customer PWA: `access_token` / `refresh_token`
- Server-side portal code (route handlers, middleware, `next.config.ts`) needs absolute backend URLs via `API_URL` (admin) or `API_PROXY_URL` (staff/customer).
- Backend unit tests live in `v3/backend/tests/` and run with `pytest tests/` from the backend venv.
