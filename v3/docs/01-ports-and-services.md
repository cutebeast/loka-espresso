# FNB Enterprise v3 — Ports & Services Reference

> **Rule**: v3 uses the `138xx` port range to avoid collisions with legacy services.

---

## Production PM2 Ports (Current)

| Service | Port | PM2 Name | Domain |
|---------|------|----------|--------|
| **Backend API** | 13800 | `v3-backend` | Caddy `/api/*` proxy |
| **Admin Portal** | 13810 | `admin-portal-v3` | `admin.loyaltysystem.uk` |
| **Staff Portal** | 13820 | `staff-portal-v3` | `staff.loyaltysystem.uk` |
| **Customer PWA** | 13830 | `customer-pwa-v3` | `app.loyaltysystem.uk` |

## Docker Compose Ports (for container deployment)

| Service | Host Port | Container Port |
|---------|-----------|----------------|
| Backend API | 13800 | 13800 |
| Admin Portal | 13810 | 3000 |
| Staff Portal | 13820 | 3000 |
| Customer PWA | 13830 | 3000 |
| PostgreSQL v3 | 13334 | 5432 |
| Redis v3 | 13335 | 6379 |

---

## Legacy Ports (Untouched)

| Service | Port |
|---------|------|
| Legacy Backend | 3002 |
| Legacy Admin Frontend | 3001 |
| Legacy Customer PWA | 3003 |
| Legacy PostgreSQL | 5433 |
| Legacy Redis | 6379 |

---

## Service Domain Map

```
admin.loyaltysystem.uk  → Caddy → localhost:13810 (admin-portal-v3)
staff.loyaltysystem.uk  → Caddy → localhost:13820 (staff-portal-v3)
app.loyaltysystem.uk    → Caddy → localhost:13830 (customer-pwa-v3)
/api/*                  → Caddy → localhost:13800 (v3-backend)
/uploads/*              → Caddy → filesystem serve
```

---

## Environment Variables

### Backend `.env`
```env
DATABASE_URL=postgresql+asyncpg://fnb_user:fnb_pass@postgres:5432/fnb_enterprise_v3
REDIS_URL=redis://redis:6379/0
CORS_ORIGINS=http://localhost:13810,http://localhost:13820,http://localhost:13830
```

### Frontend `.env` (all three apps)
```env
NEXT_PUBLIC_API_URL=http://localhost:13800/api/v1
```
