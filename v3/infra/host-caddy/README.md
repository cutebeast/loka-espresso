# Host Caddy configuration (PM2 mode)

These are the Caddy site configs used when the v3 stack runs as PM2 services on the host, with Docker providing only PostgreSQL and Redis.

## Environment variables

The configs are domain-agnostic. Set these environment variables before reloading Caddy, or create a `.env` file next to this README and source it in your Caddy startup script.

| Variable | Default | Description |
|---|---|---|
| `APP_DOMAIN` | `app.loyaltysystem.uk` | Customer PWA domain |
| `ADMIN_DOMAIN` | `admin.loyaltysystem.uk` | Admin portal domain |
| `STAFF_DOMAIN` | `staff.loyaltysystem.uk` | Staff portal domain |
| `TLS_CERT_PATH` | `/etc/ssl/certs/loyaltysystem-origin.pem` | TLS certificate path |
| `TLS_KEY_PATH` | `/etc/ssl/private/loyaltysystem-origin.key` | TLS private key path |

For `lokaespresso.com` you only need to set:

```bash
export APP_DOMAIN=app.lokaespresso.com
export ADMIN_DOMAIN=admin.lokaespresso.com
export STAFF_DOMAIN=staff.lokaespresso.com
# Either provide your own cert, or remove/comment the tls lines to use Caddy auto-TLS
export TLS_CERT_PATH=/etc/ssl/certs/lokaespresso-origin.pem
export TLS_KEY_PATH=/etc/ssl/private/lokaespresso-origin.key
```

## Files

- `fnb-app.conf` — customer PWA (`{$APP_DOMAIN}`)
- `fnb-admin.conf` — admin portal (`{$ADMIN_DOMAIN}`)
- `fnb-staff.conf` — staff portal (`{$STAFF_DOMAIN}`)

`lokaespresso.com` / `www.lokaespresso.com` branding is configured through the environment above.

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

By default these configs use a Cloudflare Origin CA certificate. For a new server or brand, replace the certificate paths in the environment variables or let Caddy auto-generate TLS. Ensure Cloudflare SSL/TLS mode is set to **Full (strict)** and purge Cloudflare cache after any Caddy change.

## Production (`lokaespresso.com`)

For production, set the environment variables above to the `lokaespresso.com` subdomains and reload Caddy. Alternatively, switch to the full-Docker stack in `v3/infra/docker/docker-compose.yml`, which is already domain-agnostic.
