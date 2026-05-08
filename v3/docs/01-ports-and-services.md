# FNB Enterprise v3 — Ports & Services Reference

> **Rule**: v3 uses the `138xx` port range to avoid collisions with legacy services.

---

## Service Port Map

| Service | Host Port | Container Port | Purpose |
|---------|-----------|----------------|---------|
| **Backend API** | `13800` | `13800` | FastAPI + SQLAlchemy async |
| **Admin Portal** | `13801` | `3000` | Next.js — HQ & Store Manager dashboard |
| **Customer PWA** | `13802` | `3000` | Next.js — Customer ordering app |
| **Staff Portal** | `13803` | `3000` | Next.js — Service crew counter ops |
| **PostgreSQL v3** | `13334` | `5432` | `fnb_enterprise_v3` database |
| **Redis v3** | `13335` | `6379` | Cache, rate limiting, OTP sessions |

---

## Legacy Port Map (Untouched)

| Service | Port | Note |
|---------|------|------|
| Legacy Backend | `3002` | Existing FastAPI |
| Legacy Admin Frontend | `3001` | Existing Next.js |
| Legacy Customer PWA | `3003` | Existing Next.js |
| Legacy PostgreSQL | `5433` | Existing `fnb` database |
| Legacy Redis | `6379` | Existing Redis |

---

## Environment Variables

### Backend `.env`
```env
# Internal container networking
DATABASE_URL=postgresql+asyncpg://fnb_user:fnb_pass@postgres:5432/fnb_enterprise_v3
REDIS_URL=redis://redis:6379/0

# CORS must include all v3 frontend ports
CORS_ORIGINS=http://localhost:13801,http://localhost:13802,http://localhost:13803
```

### Frontend `.env` (all three apps)
```env
NEXT_PUBLIC_API_URL=http://localhost:13800/api/v1
```

---

## Docker Compose Mapping

```yaml
services:
  backend:
    ports:
      - "13800:13800"

  admin-portal:
    ports:
      - "13801:3000"

  customer-pwa:
    ports:
      - "13802:3000"

  staff-portal:
    ports:
      - "13803:3000"

  postgres:
    ports:
      - "13334:5432"

  redis:
    ports:
      - "13335:6379"
```

---

## Local Development URLs

| App | Local URL |
|-----|-----------|
| Backend API Docs | http://localhost:13800/docs |
| Backend Health | http://localhost:13800/health |
| Admin Portal | http://localhost:13801 |
| Customer PWA | http://localhost:13802 |
| Staff Portal | http://localhost:13803 |

---

## Port Collision Check

Run this before starting v3 to ensure ports are free:

```bash
for port in 13800 13801 13802 13803 13334 13335; do
  if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "WARNING: Port $port is already in use"
  else
    echo "OK: Port $port is free"
  fi
done
```
