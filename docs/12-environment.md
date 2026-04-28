# Environment Variable Reference

> **Last Updated:** 2026-04-26

Consolidated reference for all environment variables used across the FNB Super-App stack.

---

## Backend (`backend/.env`)

### Required

| Variable | Example | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://fnb:password@db:5432/fnb` | PostgreSQL connection string |
| `JWT_SECRET` | `<strong-random-string>` | HS256 signing secret |
| `JWT_ALGORITHM` | `HS256` | JWT algorithm |
| `JWT_EXPIRE_MINUTES` | `30` | Access token lifetime |
| `JWT_REFRESH_EXPIRE_DAYS` | `7` | Refresh token lifetime |
| `CORS_ORIGINS` | `https://admin.loyaltysystem.uk,https://app.loyaltysystem.uk` | Comma-separated allowed origins |
| `UPLOAD_DIR` | `/app/uploads` | Static file upload directory |
| `CUSTOMER_APP_DIR` | `/app/customer-app` | Customer PWA static files directory |
| `ENVIRONMENT` | `development` | Deployment environment (`development`, `staging`, `production`) |

### JWT (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET_PREVIOUS` | — | Previous secret for key rotation (verify-only) |
| `JWT_ISSUER` | `fnb-api` | JWT `iss` claim |
| `JWT_AUDIENCE` | `fnb-app` | JWT `aud` claim |

### Auth & Security

| Variable | Default | Description |
|----------|---------|-------------|
| `OTP_BYPASS_ALLOWED` | `false` | Allow OTP bypass in non-prod environments |
| `ALLOW_CUSTOMER_RESET` | `false` | Allow customer self-service password reset |

### Webhooks & Integrations

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_API_KEY` | — | Shared secret for webhook verification |
| `WEBHOOK_SIGNING_SECRET` | — | HMAC signing secret for webhooks |
| `POS_API_URL` | — | Outbound POS integration URL. **Empty = manual mode** |

### Twilio SMS

| Variable | Default | Description |
|----------|---------|-------------|
| `TWILIO_ACCOUNT_SID` | — | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | — | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | — | Twilio sender phone number |

> All three must be set for real SMS delivery. Leave all empty to use backend OTP stub.

### Operational

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Backend server port (production) |
| `LOG_LEVEL` | `INFO` | Python logging level |

### Database (Docker Compose)

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PASSWORD` | — | PostgreSQL password (used by Docker Compose) |

---

## Admin Frontend (`frontend/.env`)

| Variable | Example | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_APP_NAME` | `Loka Espresso` | Brand name shown in sidebar and header |
| `NEXT_PUBLIC_APP_DOMAIN` | `app.loyaltysystem.uk` | Customer PWA domain (for cross-links) |
| `NEXT_PUBLIC_ADMIN_DOMAIN` | `admin.loyaltysystem.uk` | Admin domain (for CORS, redirects) |
| `NEXT_PUBLIC_LOGO_URL` | `/logo.png` | Logo image path (sidebar, login) |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000/api/v1` | Backend API base URL |

> All `NEXT_PUBLIC_` variables are embedded at build time. Changes require rebuild.

---

## Customer PWA (`customer-app/.env`)

| Variable | Example | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_PROXY` | `https://admin.loyaltysystem.uk` | API proxy base URL (Next.js rewrite target) |
| `NEXT_PUBLIC_ADMIN_URL` | `https://admin.loyaltysystem.uk` | Admin frontend URL (for links) |
| `NEXT_PUBLIC_APP_URL` | `https://app.loyaltysystem.uk` | PWA own URL (for share links, redirects) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | — | VAPID public key for web push notifications |
| `NEXT_PUBLIC_OTP_BYPASS` | `false` | Enable OTP bypass in development |

> `NEXT_PUBLIC_VAPID_PUBLIC_KEY` must match the backend's VAPID private key pair.

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
| Mock PG Server | `8889` |

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

### SMS / OTP

- Set all three `TWILIO_*` variables to enable real SMS delivery
- Leave all empty to use backend OTP stub (logs OTP to console)
- `OTP_BYPASS_ALLOWED=true` skips OTP verification entirely (development only)
- `NEXT_PUBLIC_OTP_BYPASS=true` enables bypass UI in customer PWA (development only)

---

## Security Notes

- Never commit `.env` files — only `.env.example` with placeholder values
- `JWT_SECRET` must be a strong random string (64+ characters)
- `OTP_BYPASS_ALLOWED` must be `false` in production
- `WEBHOOK_API_KEY` and `WEBHOOK_SIGNING_SECRET` must be set before enabling webhook integrations
- `CORS_ORIGINS` must list only production domains in production
