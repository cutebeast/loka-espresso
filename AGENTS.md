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

# Run full E2E suite (including browser tests)
cd /root/fnb-super-app/v3/e2e-tests
source .venv/bin/activate
pytest -q
```

## TypeScript

Run `npx tsc --noEmit` from each portal directory (`admin-portal`, `staff-portal`, `customer-pwa`).

## Domain migration checklist (loyaltysystem.uk → lokaespresso.com)

- Update `v3/backend/.env`: `CORS_ORIGINS`, `TRUSTED_HOSTS`.
- Set host-Caddy env vars (`APP_DOMAIN`, `ADMIN_DOMAIN`, `STAFF_DOMAIN`) or use Docker Caddy.
- Issue/obtain TLS certificates for `*.lokaespresso.com`.
- On real production, keep `otp.bypass_enabled=false` in `platform_config`.

## Known quirks

- Backend `ENVIRONMENT=production` on the dev server disables OpenAPI docs, so `scripts/validate-routes.py` cannot fetch `/openapi.json` here; run it against a dev-mode backend.
- The dev server has `otp.bypass_enabled=true` in the DB so the E2E suite can log in.
- Legacy v1/v2 containers and images have been removed. Only `fnb-v3-postgres` and `fnb-v3-redis` remain.
- Admin portal auth uses HttpOnly `admin_token` cookie + server-side `/auth/login` route; do not call `/api/auth/login` from Caddy-proxied domains because `/api/*` is proxied to the backend.
- Backend unit tests live in `v3/backend/tests/` and run with `pytest tests/` from the backend venv.
