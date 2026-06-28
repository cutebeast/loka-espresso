# FNB Super App — Loka Espresso

Full-stack F&B ordering and loyalty platform. The active codebase is in `v3/`.

| Component | Stack | Dev URL |
|-----------|-------|---------|
| Backend API | FastAPI + SQLAlchemy async | https://admin.loyaltysystem.uk/api/v1 |
| Admin Portal | Next.js 16 | https://admin.loyaltysystem.uk |
| Staff Portal | Next.js 16 | https://staff.loyaltysystem.uk |
| Customer PWA | Next.js 16 | https://app.loyaltysystem.uk |
| Database | PostgreSQL 16 | Docker `fnb-v3-postgres` |
| Cache / Rate limit | Redis 7 | Docker `fnb-v3-redis` |
| Reverse Proxy | Caddy 2 | Host Caddy + Docker-ready Caddyfile |

## Current status

See [`v3/docs/000-project-status.md`](v3/docs/000-project-status.md) for the full project status, deployment notes, domain setup, upload handling, test results, and recent cleanup.

Highlights:
- **182 passed, 17 skipped, 0 failed** in the E2E suite.
- TypeScript strict: 0 errors across all 3 portals.
- Root repository has been cleaned of legacy v1/v2 files; all active code stays in `v3/`.
- Upload endpoints (avatars, item images, equipment photos) are verified and served correctly through the backend.
- Docker Compose stack is domain-agnostic and ready for dev (`loyaltysystem.uk`), production (`lokaespresso.com`), and future brand servers.

## Quick start

```bash
cd v3

# Backend (PM2 dev mode)
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 13800

# Frontends (PM2 dev mode)
cd admin-portal && npm run dev    # localhost:13830
cd staff-portal && npm run dev    # localhost:13820
cd customer-pwa && npm run dev    # localhost:13810

# Tests
cd e2e-tests && pytest -q
```

## Full-Docker deployment

```bash
cd v3/infra/docker
cp .env.example .env
# edit .env with secrets and domains for the target server
docker compose up -d --build
```

See the status doc for multi-server domain configuration and operational commands.
