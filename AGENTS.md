# FNB Super App v3 — Loka Espresso

**Status**: Live | **E2E**: 182 passed, 17 skipped, 0 failed  
**Active code**: `v3/` | **Project status**: [`v3/docs/000-project-status.md`](v3/docs/000-project-status.md)

## Services

| Component | Dir | Dev URL | Port |
|-----------|-----|---------|------|
| Backend | `v3/backend/` | https://admin.loyaltysystem.uk/api/v1 | 13800 |
| Admin Portal | `v3/admin-portal/` | https://admin.loyaltysystem.uk | 13830 |
| Staff Portal | `v3/staff-portal/` | https://staff.loyaltysystem.uk | 13820 |
| Customer PWA | `v3/customer-pwa/` | https://app.loyaltysystem.uk | 13810 |
| Database | Docker `fnb-v3-postgres` | localhost:13334 | 5432 |
| Redis | Docker `fnb-v3-redis` | localhost:13335 | 6379 |

## Quick Start

```bash
# Backend
cd v3/backend && uvicorn app.main:app --host 0.0.0.0 --port 13800

# Frontends
cd v3/admin-portal && npm run dev    # → localhost:13830
cd v3/staff-portal && npm run dev    # → localhost:13820
cd v3/customer-pwa && npm run dev    # → localhost:13810

# Tests
cd v3/e2e-tests && pytest -q
```

## Production (PM2)

```bash
pm2 restart v3-backend admin-portal-v3 staff-portal-v3 customer-pwa-v3
```

## Full-Docker deployment

```bash
cd v3/infra/docker
cp .env.example .env
# edit .env with target-server domains and secrets
docker compose up -d --build
```

See [`v3/docs/000-project-status.md`](v3/docs/000-project-status.md) for domains, secrets, uploads, troubleshooting, and operational commands.

## Notes for agents

- Do **not** move `v3/` contents to the repository root. The root is intentionally clean; active code lives under `v3/`.
- Secrets are in untracked `.env` files only.
- Uploads are served through the backend (`/uploads` → backend StaticFiles). Caddy proxies to the backend.
- Run the full E2E suite after any backend/portal change.
