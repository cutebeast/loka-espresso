# FNB Super-App — Troubleshooting Guide

> Last updated: 2026-04-18 | Common issues and solutions

---

## Backend Issues

### 1. Backend Won't Start

**Symptoms:**
```
systemctl status fnb-backend shows failed
```

**Check:**
```bash
# View logs
journalctl -u fnb-backend -n 50

# Common causes:
# - Port 8000 already in use
ss -tlnp | grep 8000

# - Database connection failed
# - Missing environment variables
cat /root/fnb-super-app/.env
```

**Solutions:**
```bash
# Kill process on port 8000
kill $(lsof -t -i:8000)

# Verify database is running
docker ps | grep fnb-db

# Test database connection
cd /root/fnb-super-app/backend
.venv/bin/python -c "import asyncio; from app.core.database import engine; asyncio.run(engine.connect())"
```

---

### 2. Database Connection Errors

**Symptoms:**
```
asyncpg.exceptions.ConnectionRefusedError: connection refused
```

**Check:**
```bash
# Is PostgreSQL container running?
docker ps | grep fnb-db

# Check container logs
docker logs fnb-db

# Verify connection string in .env
grep DATABASE_URL /root/fnb-super-app/.env
```

**Solutions:**
```bash
# Start database if stopped
docker start fnb-db

# If container doesn't exist, recreate:
docker run -d --name fnb-db -p 5433:5432 -e POSTGRES_USER=fnb -e POSTGRES_PASSWORD=<password> -e POSTGRES_DB=fnb -v fnb-db-data:/var/lib/postgresql/data postgres:16

# Run migrations
cd /root/fnb-super-app/backend
.venv/bin/alembic upgrade head
```

---

### 3. Migration Failures

**Symptoms:**
```
alembic.util.exc.CommandError: Target database is not up to date
```

**Solutions:**
```bash
# Check current revision
.venv/bin/alembic current

# View history
.venv/bin/alembic history

# If stuck, manually stamp:
.venv/bin/alembic stamp <revision-id>

# Or reset (WARNING: loses data):
curl -X DELETE http://localhost:8000/api/v1/admin/system/reset \
  -H "Authorization: Bearer <admin-token>"
```

---

### 4. 502 Bad Gateway

**Symptoms:**
- Website shows "502 Bad Gateway"
- Backend appears to be running

**Check:**
```bash
# Is backend actually responding?
curl http://localhost:8000/health

# Check Caddy logs
journalctl -u caddy -n 20

# Verify ports
ss -tlnp | grep -E '8000|3001|3002'
```

**Solutions:**
```bash
# Restart all services
systemctl restart fnb-backend fnb-admin fnb-app caddy

# If using setsid/disown (old method), processes may have died
# Check for orphaned processes
ps aux | grep next

# Kill and restart
kill $(lsof -t -i:3001)
kill $(lsof -t -i:3002)
systemctl restart fnb-admin fnb-app
```

---

### 5. JWT/Authentication Errors

**Symptoms:**
```json
{"detail": "Token has been revoked"}
```

**Check:**
```bash
# Verify JWT_SECRET matches
grep JWT_SECRET /root/fnb-super-app/.env

# Check token blacklist table
docker exec fnb-db psql -U fnb -c "SELECT COUNT(*) FROM token_blacklist;"
```

**Solutions:**
```bash
# Clear token blacklist (forces all users to re-login)
docker exec fnb-db psql -U fnb -c "TRUNCATE TABLE token_blacklist;"

# If JWT_SECRET changed, all tokens are invalid - users must re-login
```

---

## Frontend Issues

### 6. Frontend Shows Blank Page

**Symptoms:**
- White screen when accessing admin/customer app
- Console shows 404 errors for JS/CSS

**Check:**
```bash
# Did build succeed?
cd /root/fnb-super-app/frontend
ls -la .next/

# Check for build errors
npm run build 2>&1 | tail -20
```

**Solutions:**
```bash
# Rebuild frontend
cd /root/fnb-super-app/frontend
rm -rf .next
npm run build
systemctl restart fnb-admin

# Same for customer app
cd /root/fnb-super-app/customer-app
rm -rf .next
npm run build
systemctl restart fnb-app
```

---

### 7. API Calls Failing from Frontend

**Symptoms:**
- Frontend loads but data doesn't appear
- Browser console shows CORS errors

**Check:**
```bash
# Check CORS_ORIGINS in .env
grep CORS_ORIGINS /root/fnb-super-app/.env

# Verify backend is accessible
curl -I http://localhost:8000/api/v1/config
```

**Solutions:**
```bash
# Update .env with correct origins
CORS_ORIGINS=https://admin.loyaltysystem.uk,https://app.loyaltysystem.uk,http://localhost:3001,http://localhost:3002

# Restart backend
systemctl restart fnb-backend
```

---

### 8. Styles Not Loading (Next.js)

**Symptoms:**
- Page loads but unstyled (raw HTML)
- Console shows CSS 404 errors

**Solutions:**
```bash
# Clear Next.js cache
cd /root/fnb-super-app/frontend
rm -rf .next
npm run build
systemctl restart fnb-admin
```

---

## Database Issues

### 9. Data Loss / Accidental Deletion

**Solutions:**
```bash
# Restore from backup
# Stop backend first
systemctl stop fnb-backend

# Restore database
docker exec -i fnb-db psql -U fnb -d fnb < /backup/fnb-20260418.sql

# Restart
systemctl start fnb-backend

# Re-seed if needed
cd /root/fnb-super-app/scripts/seed
python3 verify_master_base_seed.py --skip-reset
```

---

### 10. Slow Queries

**Symptoms:**
- API responses taking >5 seconds
- Database CPU usage high

**Check:**
```bash
# Check running queries
docker exec fnb-db psql -U fnb -c "SELECT pid, state, query_start, query FROM pg_stat_activity WHERE state = 'active';"

# Check slow query log
docker exec fnb-db psql -U fnb -c "SELECT query, calls, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"
```

**Solutions:**
```bash
# Add missing indexes (check alignment-verification.md for index list)
# Restart backend to clear SQLAlchemy cache
systemctl restart fnb-backend

# Consider connection pooling for high traffic
```

---

## SSL/TLS Issues

### 11. Certificate Errors

**Symptoms:**
- Browser shows "Your connection is not private"
- SSL certificate expired

**Check:**
```bash
# Check certificate expiry
echo | openssl s_client -servername admin.loyaltysystem.uk -connect admin.loyaltysystem.uk:443 2>/dev/null | openssl x509 -noout -dates

# Check Caddy certificates
ls -la /var/lib/caddy/.local/share/caddy/certificates/
```

**Solutions:**
```bash
# If using Let's Encrypt via Caddy, auto-renewal should work
# Force renewal
systemctl stop caddy
rm -rf /var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/
systemctl start caddy

# If using Cloudflare Origin cert, check expiry (should be 15 years)
openssl x509 -in /etc/ssl/certs/loyaltysystem-origin.pem -noout -dates
```

---

## Performance Issues

### 12. High Memory Usage

**Check:**
```bash
# Memory usage by service
systemctl status fnb-backend | grep Memory
ps aux --sort=-%mem | head -10

# Database memory
docker stats fnb-db --no-stream
```

**Solutions:**
```bash
# Restart services to clear memory
systemctl restart fnb-backend fnb-admin fnb-app

# Limit PostgreSQL memory in docker run:
# --memory=1g --memory-swap=1g

# Add swap if needed
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

---

### 13. High CPU Usage

**Check:**
```bash
# Top processes
top -o %CPU

# Database queries causing CPU load
docker exec fnb-db psql -U fnb -c "SELECT query, calls, total_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 5;"
```

**Solutions:**
- Check for runaway queries and kill if necessary
- Restart services
- Scale up server if consistently high

---

## Seed Data Issues

### 14. Seed Script Fails

**Symptoms:**
```
python3 verify_master_base_seed.py
# Fails with API errors
```

**Check:**
```bash
# Is backend running?
curl http://localhost:8000/health

# Is admin user created?
docker exec fnb-db psql -U fnb -c "SELECT email FROM users WHERE id = 1;"
```

**Solutions:**
```bash
# Reset and try again
curl -X DELETE http://localhost:8000/api/v1/admin/system/reset \
  -H "Authorization: Bearer <token>"

# Or use skip-reset flag if data exists
python3 verify_master_base_seed.py --skip-reset
```

---

### 15. Duplicate Data After Re-seeding

**Symptoms:**
- Multiple entries of same store/menu item
- Seed script not idempotent

**Solution:**
```bash
# Always run reset before full seed
curl -X DELETE http://localhost:8000/api/v1/admin/system/reset \
  -H "Authorization: Bearer <token>"

python3 verify_master_base_seed.py
```

---

## Common Error Messages

### "Role must be hq_management or store_management"
- **Cause:** Trying to access admin dashboard with customer account
- **Fix:** Use admin credentials from 04-testing-guide.md

### "No staff record found for this store"
- **Cause:** User doesn't have user_store_access entry for requested store
- **Fix:** Add user to store via admin or use Admin/Brand Owner account

### "Token has been revoked"
- **Cause:** User logged out or JWT blacklisted
- **Fix:** Re-login to get new token

### "Insufficient inventory"
- **Cause:** Trying to deduct more stock than available
- **Fix:** Adjust inventory levels or check current_stock

### "Table already occupied"
- **Cause:** Trying to seat customers at occupied table
- **Fix:** Check table occupancy or override via admin

---

## Debug Mode

Enable debug logging:

```bash
# Backend debug
# Edit /root/fnb-super-app/backend/app/core/config.py
# Set LOG_LEVEL=DEBUG

# Frontend debug
# Check browser console (F12)
# Add console.log() statements

# Database debug
# Enable query logging in PostgreSQL
docker exec fnb-db psql -U fnb -c "ALTER SYSTEM SET log_statement = 'all';"
docker exec fnb-db psql -U fnb -c "SELECT pg_reload_conf();"
```

---

## Getting Help

If issue persists:

1. Check logs: `journalctl -u fnb-backend -n 100`
2. Check alignment: Review `docs/05-alignment-verification.md`
3. Verify schema: Check `docs/02-database-schema.md`
4. Test API: Use examples from `docs/04-testing-guide.md`

---

## Quick Reference Commands

```bash
# Full restart
systemctl restart fnb-backend fnb-admin fnb-app caddy

# View all logs
journalctl -u fnb-backend -u fnb-admin -u fnb-app -u caddy -f

# Database access
docker exec -it fnb-db psql -U fnb -d fnb

# Check disk space
df -h

# Check memory
free -m

# Check connections
ss -tlnp | grep -E '8000|3001|3002|5433'
```
