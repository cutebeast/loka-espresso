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

# Seed staff UI translations (staff portal login labels)
python3 scripts/seed_staff_ui_translations.py

# Seed admin UI translations
python3 scripts/seed_admin_ui_translations.py

# Backend unit tests
pytest tests/

# TypeScript strict checks
for dir in admin-portal staff-portal customer-pwa; do
  (cd "/root/fnb-super-app/v3/$dir" && npx tsc --noEmit)
done

# Validate frontend API calls against backend routes
cd /root/fnb-super-app/v3
python3 scripts/validate-routes.py

# Run full E2E suite
cd /root/fnb-super-app/v3/e2e-tests
source ../backend/.venv/bin/activate
pytest -q
```

## Domain migration checklist (loyaltysystem.uk → lokaespresso.com)

- Update `v3/backend/.env`: `CORS_ORIGINS`, `TRUSTED_HOSTS`, live Stripe/HitPay keys, `VAPID_*`.
- Update `v3/infra/docker/.env`: `APP_DOMAIN`, `ADMIN_DOMAIN`, `STAFF_DOMAIN`, `CORS_ORIGINS`, `TRUSTED_HOSTS`, secrets.
- Update portal `.env.local` / `.env.example` files:
  - `v3/admin-portal/.env.local`: `API_URL`, `NEXT_PUBLIC_API_URL`, domain env vars.
  - `v3/staff-portal/.env.local`: `API_PROXY_URL`, `NEXT_PUBLIC_API_URL`.
  - `v3/customer-pwa/.env.local`: `API_PROXY_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`.
- Replace host Caddy configs (`/etc/caddy/sites/fnb-*.conf`) or switch to Docker Caddy.
- Provision TLS certificates for `*.lokaespresso.com`.
- On live DB run `alembic upgrade head` and seed with strong admin credentials.
- Verify `otp.bypass_enabled=false` and rotate/remove `otp.bypass_code`.
- Register Stripe/HitPay webhooks on the new domains.

## Known quirks

- Backend `ENVIRONMENT=production` on the dev server disables OpenAPI docs, so `scripts/validate-routes.py` falls back to generating the schema from code.
- `otp.bypass_enabled` is now seeded `false` for production safety. The E2E suite re-enables it temporarily via the admin API at session start.
- `currency.default` is seeded `"MYR"`; wallets created without an explicit currency use this value.
- All three portals use HttpOnly cookie auth:
  - Admin: `admin_token` / `admin_refresh_token`
  - Staff: `staff_token` / `staff_refresh_token`
  - Customer PWA: `access_token` / `refresh_token`
- Server-side portal code (route handlers, middleware, `next.config.ts`) needs absolute backend URLs via `API_URL` (admin) or `API_PROXY_URL` (staff/customer).
- Backend unit tests live in `v3/backend/tests/` and run with `pytest tests/` from the backend venv.
- `psycopg2-binary` is now in `v3/backend/requirements.txt` so `cleanup_e2e_test_data.py` runs without manual installs.
