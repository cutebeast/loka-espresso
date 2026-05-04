# Troubleshooting

## Common Issues

### Backend 502 / crash loop
Check logs: `docker logs fnb-backend --tail 50`
Most common: Alembic migration conflict, duplicate data in DB, FK constraint violation.

### Pull-to-refresh sends user to login
Fixed in `useAuthFlow.ts` — session validated on every mount via httpOnly cookie.
CSS defense: `overscroll-behavior: none` on `body` and `.app-container`.

### Login modal has no CSS
Fixed — `login-v2.css` now includes Modal component shell classes.
If any other bottom sheet appears unstyled, check `globals.css` for `.sheet-*` classes.

### API 401
Check: JWT cookie present? Session expired? Token refresh may fail silently — app will prompt re-auth.

### Legal pages 500
Fixed — SQLAlchemy `or_()` syntax was malformed. Uses `or_(column1.ilike(), column2 == key)`.

### Notification templates 401
Requires admin authentication. Templates auto-seeded at startup.

## Quick Commands
```bash
# Rebuild single service
docker compose up -d --build customer-app

# Full rebuild
docker compose up -d --build

# View backend logs
docker logs fnb-backend --tail 50 -f

# Run DB migration manually
docker exec fnb-backend alembic upgrade head
```
