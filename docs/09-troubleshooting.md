# FNB Super-App — Troubleshooting Guide

> Last updated: 2026-04-21

## First Checks

For local rebuild/test workflow, start here:

```bash
cd /root/fnb-super-app/scripts
./fnb-manage.sh status
./fnb-manage.sh logs
./fnb-manage.sh verify
```

Local scripted ports:

- backend: `8765`
- admin: `3001`
- customer PWA: `3002`

---

## Backend Won't Start

### Check

```bash
cat /tmp/fnb-backend.log
fuser 8765/tcp
grep DATABASE_URL /root/fnb-super-app/.env
docker ps | grep fnb-db
```

### Fix

```bash
cd /root/fnb-super-app/scripts
./fnb-manage.sh stop
./fnb-manage.sh backend
```

If the backend fails after schema changes:

```bash
cd /root/fnb-super-app/backend
.venv/bin/alembic upgrade head
```

---

## Frontend or PWA Won't Start

### Check

```bash
cat /tmp/fnb-admin.log
cat /tmp/fnb-customer.log
fuser 3001/tcp
fuser 3002/tcp
```

### Fix

```bash
cd /root/fnb-super-app/scripts
./fnb-manage.sh build_admin
./fnb-manage.sh build_customer
```

For a full local rebuild:

```bash
./fnb-manage.sh rebuild
```

---

## Mock Provider Problems

### Mock PG not reachable

```bash
curl http://localhost:8889/health
/root/fnb-super-app/backend/.venv/bin/python3 /root/fnb-super-app/scripts/3rdparty_pg/mock_pg_server.py
```

### Mock delivery not reachable

```bash
curl http://localhost:8888/health
/root/fnb-super-app/backend/.venv/bin/python3 /root/fnb-super-app/scripts/3rdparty_delivery/mock_delivery_server.py
```

### Mock POS not reachable

```bash
curl http://localhost:8081/health
/root/fnb-super-app/backend/.venv/bin/python3 /root/fnb-super-app/scripts/external_pos/mock_pos_server.py
```

---

## Seed Script Failures

### Common causes

1. backend not running on the expected `API_BASE`
2. latest migration not applied
3. mock PG/delivery/POS service not running
4. stale `seed_state.json`
5. tokens in state file invalid after reset

### Recovery path

```bash
cd /root/fnb-super-app/scripts/seed
python3 verify_seed_00_full_reset.py
python3 verify_seed_01_stores.py
python3 verify_seed_02_menu.py
python3 verify_seed_03_inventory.py
python3 verify_seed_04_staff.py
python3 verify_seed_05_config.py
python3 verify_seed_06_rewards.py
python3 verify_seed_07_vouchers.py
python3 verify_seed_08_promotions.py
python3 verify_seed_09_reset_customers.py
python3 verify_seed_10_register.py 10
```

Then continue with the later customer journey steps.

---

## Auth / Token Issues

### Symptoms
- `401 Invalid token`
- `401 Token has been revoked`
- seed scripts fail after reset because stored tokens are stale

### Fix

- re-run the OTP registration seed step
- or rely on the seed helpers that re-auth customers through OTP/admin lookup

If needed, clear local app state in the browser and log in again.

---

## Webhook Failures

### Symptoms
- PG charge completes but wallet/order not updated
- delivery mock advances but backend order status does not change
- POS mock progresses but backend dine-in order does not update

### Check

```bash
grep WEBHOOK_API_KEY /root/fnb-super-app/.env
grep WEBHOOK_SIGNING_SECRET /root/fnb-super-app/.env
```

Make sure the mock services are using compatible webhook settings. Current mock scripts send `X-API-Key` by default for local simulation.

---

## Migration Issues

### Check current head

```bash
cd /root/fnb-super-app/backend
.venv/bin/alembic heads
.venv/bin/alembic current
```

### Fix

```bash
.venv/bin/alembic upgrade head
```

---

## Production-style Runtime Checks

If you are troubleshooting a production-style deployment instead of local scripted mode, use the production service ports/config instead of `8765`.

Typical checks:

```bash
systemctl status fnb-backend fnb-admin fnb-app caddy
ss -tlnp | grep -E '8000|3001|3002|5433|443'
journalctl -u fnb-backend -n 100
```

---

## Quick Commands

```bash
# local rebuild and verify
cd /root/fnb-super-app/scripts
./fnb-manage.sh rebuild
./fnb-manage.sh verify

# backend migrations
cd /root/fnb-super-app/backend
.venv/bin/alembic upgrade head

# DB shell
docker exec -it fnb-db psql -U fnb -d fnb
```
