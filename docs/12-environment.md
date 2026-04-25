# Environment Variable Reference

> Last updated: 2026-04-22

Consolidated reference for all environment variables used across the FNB Super-App stack.

---

## Backend (`backend/.env`)

### Required

| Variable | Example | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://fnb:password@localhost:5433/fnb` | PostgreSQL connection string |
| `JWT_SECRET` | `<strong-random-string>` | HS256 signing secret |
| `JWT_ALGORITHM` | `HS256` | JWT algorithm |
| `JWT_EXPIRE_MINUTES` | `30` | Access token lifetime |
| `CORS_ORIGINS` | `https://admin.loyaltysystem.uk,https://app.loyaltysystem.uk` | Allowed frontend origins |
| `UPLOAD_DIR` | `/root/fnb-super-app/uploads` | Static file upload directory |

### Optional / Integration

| Variable | Example | Description |
|----------|---------|-------------|
| `WEBHOOK_API_KEY` | `<shared-key>` | Shared secret for webhook verification |
| `WEBHOOK_SIGNING_SECRET` | `<signing-secret>` | HMAC signing secret for webhooks |
| `OTP_BYPASS_ALLOWED` | `false` | Allow OTP bypass in non-prod environments |
| `POS_API_URL` | `http://pos-provider:8080` | Outbound POS integration URL. **Empty = manual mode** |

### Operational

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Backend server port (production) |
| `LOG_LEVEL` | `INFO` | Python logging level |

---

## Admin Frontend (`frontend/.env`)

| Variable | Example | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `/api/v1` | Backend API base path (proxied or direct) |

---

## Customer PWA (`customer-app/.env`)

| Variable | Example | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://admin.loyaltysystem.uk/api/v1` | Backend API base URL |

---

## Docker Compose (`docker-compose.yml`)

| Service | Internal Port | Exposed Port | Notes |
|---------|---------------|--------------|-------|
| `backend` | `8000` | `3002` | uvicorn with 2 workers |
| `postgres` | `5432` | `5433` | Avoids conflict with host PostgreSQL |
| `admin` | `3000` | `3001` | Next.js admin frontend |
| `customer` | `3001` | `3003` | Next.js customer PWA |

---

## Local Development Ports

Used by `scripts/fnb-manage.sh`:

| Service | Port |
|---------|------|
| Backend API | `3002` |
| Admin Frontend | `3001` |
| Customer PWA | `3003` |
| PostgreSQL | `5433` |

---

## Integration Mode Notes

### POS Integration

- Set `POS_API_URL` to enable automatic outbound POS order sync
- Leave empty to run in **manual mode** (staff use "Mark POS Synced" button)
- All stores have `pos_integration_enabled=false` by default (migration `609e5d64bfa6`)

### Delivery Integration

- Set `DELIVERY_API_URL` (future env var) to enable automatic 3PL booking
- Currently manual mode only: staff use "Mark Dispatched" button
- All stores have `delivery_integration_enabled=false` by default

### Payment Gateway

- Real PG integration pending
- Current flow uses internal payment intents + wallet settlement
- Mock PG server available at `scripts/3rdparty_pg/mock_pg_server.py` (port `8889`)
