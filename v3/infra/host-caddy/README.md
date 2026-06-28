# Host Caddy configuration (PM2 mode)

These are the Caddy site configs used when the v3 stack runs as PM2 services on the host, with Docker providing only PostgreSQL and Redis.

## Files

- `fnb-app.conf` — `app.loyaltysystem.uk` (customer PWA)
- `fnb-admin.conf` — `admin.loyaltysystem.uk` (admin portal)
- `fnb-staff.conf` — `staff.loyaltysystem.uk` (staff portal)

`loyaltysystem.uk` / `www.loyaltysystem.uk` are **not** part of this project.

## Install

Copy to `/etc/caddy/sites/` and import them from the main `/etc/caddy/Caddyfile`:

```caddy
import /etc/caddy/sites/fnb-admin.conf
import /etc/caddy/sites/fnb-app.conf
import /etc/caddy/sites/fnb-staff.conf
```

Then reload Caddy:

```bash
caddy reload --config /etc/caddy/Caddyfile
```

## Uploads

All `/uploads/*` requests are proxied to the backend (`localhost:13800`). The backend's `StaticFiles` mount serves them from `v3/backend/uploads/` (PM2) or `/app/uploads` (Docker). Do **not** serve `/uploads` directly from the legacy root `uploads/` directory.

## TLS / Cloudflare

These configs use a Cloudflare Origin CA certificate:

```caddy
tls /etc/ssl/certs/loyaltysystem-origin.pem /etc/ssl/private/loyaltysystem-origin.key {
    protocols tls1.2
}
```

For a new server or brand, replace the certificate paths or let Caddy auto-generate TLS. Ensure Cloudflare SSL/TLS mode is set to **Full (strict)** and purge Cloudflare cache after any Caddy change.

## Production (`lokaespresso.com`)

For production, copy these files and replace `loyaltysystem.uk` with `lokaespresso.com` (or use Caddy env vars). Alternatively, switch to the full-Docker stack in `v3/infra/docker/docker-compose.yml`, which is already domain-agnostic.
