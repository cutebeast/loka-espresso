# FNB Super-App — Deployment Guide

> Last updated: 2026-04-18 | For Ubuntu/Debian Linux servers

---

## Prerequisites

- Ubuntu 20.04+ or Debian 11+
- Root or sudo access
- Domain names configured (e.g., `admin.loyaltysystem.uk`, `app.loyaltysystem.uk`)
- Cloudflare account (for DNS and SSL)

---

## Server Setup

### 1. System Dependencies

```bash
# Update system
apt update && apt upgrade -y

# Install required packages
apt install -y python3 python3-pip python3-venv nodejs npm postgresql-client \
    nginx certbot git curl wget jq

# Install Docker (for PostgreSQL)
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
systemctl enable docker
systemctl start docker
```

### 2. Create Application Directory

```bash
mkdir -p /root/fnb-super-app
cd /root/fnb-super-app

# Clone repository (if using git)
git clone <repository-url> .
```

---

## Database Setup

### 1. Start PostgreSQL Container

```bash
docker run -d \
  --name fnb-db \
  -p 5433:5432 \
  -e POSTGRES_USER=fnb \
  -e POSTGRES_PASSWORD=<strong-password> \
  -e POSTGRES_DB=fnb \
  -v fnb-db-data:/var/lib/postgresql/data \
  postgres:16
```

### 2. Configure Environment

Create `/root/fnb-super-app/.env`:

```env
# Database
DATABASE_URL=postgresql+asyncpg://fnb:<password>@localhost:5433/fnb

# Security
JWT_SECRET=<generate-strong-secret>
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60

# App Settings
UPLOAD_DIR=/root/fnb-super-app/uploads
CORS_ORIGINS=https://admin.loyaltysystem.uk,https://app.loyaltysystem.uk

# Optional: External Services (Phase 3)
# STRIPE_API_KEY=
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# FCM_SERVER_KEY=
```

Generate JWT secret:
```bash
openssl rand -hex 32
```

---

## Backend Setup

### 1. Python Environment

```bash
cd /root/fnb-super-app/backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
.venv/bin/alembic upgrade head

# Seed initial data
# Option A: Use reset endpoint (recommended)
curl -X POST http://localhost:8000/api/v1/admin/system/init-hq \
  -H "Authorization: Bearer <admin-token>"

# Option B: Use Python seed scripts
cd /root/fnb-super-app/scripts/seed
python3 verify_master_base_seed.py
```

### 2. Systemd Service

Create `/etc/systemd/system/fnb-backend.service`:

```ini
[Unit]
Description=FNB Super App Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/fnb-super-app/backend
Environment=PATH=/root/fnb-super-app/backend/.venv/bin
ExecStart=/root/fnb-super-app/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
systemctl daemon-reload
systemctl enable fnb-backend
systemctl start fnb-backend
systemctl status fnb-backend
```

---

## Frontend Setup

### 1. Merchant Dashboard (admin.loyaltysystem.uk)

```bash
cd /root/fnb-super-app/frontend

# Install dependencies
npm install

# Build for production
npm run build

# Create systemd service
cat > /etc/systemd/system/fnb-admin.service << 'EOF'
[Unit]
Description=FNB Merchant Dashboard
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/fnb-super-app/frontend
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable fnb-admin
systemctl start fnb-admin
```

### 2. Customer PWA (app.loyaltysystem.uk)

```bash
cd /root/fnb-super-app/customer-app

# Install dependencies
npm install

# Build for production
npm run build

# Create systemd service
cat > /etc/systemd/system/fnb-app.service << 'EOF'
[Unit]
Description=FNB Customer PWA
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/fnb-super-app/customer-app
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3
Environment=PORT=3002

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable fnb-app
systemctl start fnb-app
```

---

## Reverse Proxy (Caddy)

We recommend Caddy for automatic HTTPS.

### 1. Install Caddy

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install caddy
```

### 2. Configure Sites

Create `/etc/caddy/sites/fnb-admin.conf`:

```caddy
admin.loyaltysystem.uk {
    # Backend API
    handle_path /api/* {
        reverse_proxy localhost:8000
    }
    
    # OpenAPI docs
    handle_path /docs {
        reverse_proxy localhost:8000
    }
    
    handle_path /openapi.json {
        reverse_proxy localhost:8000
    }
    
    # Health check
    handle_path /health {
        reverse_proxy localhost:8000
    }
    
    # Uploads
    handle_path /uploads/* {
        reverse_proxy localhost:8000
    }
    
    # Frontend
    reverse_proxy localhost:3001
}
```

Create `/etc/caddy/sites/fnb-app.conf`:

```caddy
app.loyaltysystem.uk {
    # Backend API
    handle_path /api/* {
        reverse_proxy localhost:8000
    }
    
    # Health check
    handle_path /health {
        reverse_proxy localhost:8000
    }
    
    # Frontend
    reverse_proxy localhost:3002
}
```

### 3. Import Sites in Caddyfile

Edit `/etc/caddy/Caddyfile`:

```caddy
import sites/*.conf
```

### 4. Start Caddy

```bash
systemctl restart caddy
systemctl enable caddy
```

---

## SSL/TLS with Cloudflare

### 1. Generate Origin Certificate

1. Go to Cloudflare Dashboard → SSL/TLS → Origin Server
2. Create Certificate
3. Save certificate to `/etc/ssl/certs/loyaltysystem-origin.pem`
4. Save private key to `/etc/ssl/private/loyaltysystem-origin.key`

### 2. Update Caddy Config (Optional)

If using Cloudflare origin certificates:

```caddy
admin.loyaltysystem.uk {
    tls /etc/ssl/certs/loyaltysystem-origin.pem /etc/ssl/private/loyaltysystem-origin.key
    # ... rest of config
}
```

---

## Verification

### 1. Check Services

```bash
# Check all services
systemctl status fnb-backend
systemctl status fnb-admin
systemctl status fnb-app
systemctl status caddy

# Check ports
ss -tlnp | grep -E '8000|3001|3002|443'
```

### 2. Test Endpoints

```bash
# Backend health
curl https://admin.loyaltysystem.uk/health

# API
curl https://admin.loyaltysystem.uk/api/v1/config

# Frontend
curl -I https://admin.loyaltysystem.uk
curl -I https://app.loyaltysystem.uk
```

### 3. Run Seed Data

```bash
cd /root/fnb-super-app/scripts/seed

# Base seed (steps 00-08)
python3 verify_master_base_seed.py

# Customer journey seed (steps 09-18)
python3 verify_master_customer_seed.py
```

---

## Backup Procedures

### Database Backup

```bash
# Manual backup
docker exec fnb-db pg_dump -U fnb fnb > /backup/fnb-$(date +%Y%m%d).sql

# Automated backup (add to crontab)
0 2 * * * docker exec fnb-db pg_dump -U fnb fnb > /backup/fnb-$(date +\%Y\%m\%d).sql
```

### Restore Database

```bash
# Stop backend
systemctl stop fnb-backend

# Restore from backup
docker exec -i fnb-db psql -U fnb -d fnb < /backup/fnb-20260418.sql

# Restart backend
systemctl start fnb-backend
```

### File Backup

```bash
# Backup uploads
tar -czf /backup/uploads-$(date +%Y%m%d).tar.gz /root/fnb-super-app/uploads

# Backup .env
cp /root/fnb-super-app/.env /backup/env-$(date +%Y%m%d)
```

---

## Monitoring

### View Logs

```bash
# Backend logs
journalctl -u fnb-backend -f

# Frontend logs
journalctl -u fnb-admin -f
journalctl -u fnb-app -f

# Caddy logs
journalctl -u caddy -f

# Database logs
docker logs fnb-db -f
```

### Health Checks

Add to cron for automated monitoring:

```bash
*/5 * * * * curl -sf https://admin.loyaltysystem.uk/health || echo "Backend down" | mail -s "FNB Alert" admin@example.com
```

---

## Troubleshooting

See [09-troubleshooting.md](09-troubleshooting.md) for common issues.

---

## Service Management Commands

```bash
# Start all services
systemctl start fnb-backend fnb-admin fnb-app caddy

# Stop all services
systemctl stop fnb-backend fnb-admin fnb-app caddy

# Restart all services
systemctl restart fnb-backend fnb-admin fnb-app caddy

# View status
systemctl status fnb-backend fnb-admin fnb-app caddy
```

---

## Security Checklist

- [ ] Change default admin password
- [ ] Use strong JWT_SECRET
- [ ] Configure firewall (allow only 80, 443, 22)
- [ ] Enable automatic security updates
- [ ] Set up log rotation
- [ ] Configure database backups
- [ ] Use Cloudflare WAF rules
- [ ] Enable 2FA for server access
