# FNB Super-App — Test Credentials & Verification Guide

> Last updated: 2026-04-13

## Test Accounts

All passwords: `admin123`

### Admin & Store Owner

| Email | UserRole | StaffRole | Store Access | Purpose |
|-------|----------|-----------|-------------|---------|
| admin@loyaltysystem.uk | admin | — | ALL stores | Full platform admin |
| store.owner@zus.my | store_owner | manager | Stores 1 + 2 | Multi-store owner/operator |

### Managers (Single Store)

| Email | UserRole | StaffRole | Store Access | Purpose |
|-------|----------|-----------|-------------|---------|
| raj.manager@zus.my | customer | manager | Store 2 only | Single-store manager isolation test |
| lisa.manager@zus.my | customer | manager | Store 3 only | Single-store manager isolation test |

### Assistant Manager

| Email | UserRole | StaffRole | Store Access | Purpose |
|-------|----------|-----------|-------------|---------|
| siti@zus.my | customer | assistant_manager | Store 2 only | ACL test: can manage menu/staff but not delete managers |

### Staff (No Dashboard Access)

| Email | UserRole | StaffRole | Store Access | Purpose |
|-------|----------|-----------|-------------|---------|
| priya.dashboard@zus.my | customer | barista | Store 1 only | ACL test: barista should be BLOCKED from management endpoints |
| (PIN-only staff) | — | barista/cashier/delivery | Various | Clock-in/out only, no JWT |

### Customers

| Email | Name |
|-------|------|
| ahmad@zus.my | Ahmad Razak |
| sarah@zus.my | Sarah Tan |
| raj@zus.my | Raj Kumar |
| meilin@zus.my | Mei Lin Wong |
| aida@zus.my | Aida Hassan |

## Store Data

| ID | Name | Slug | Tables | Menu Items |
|----|------|------|--------|------------|
| 1 | ZUS Coffee KLCC | zus-klcc | 10 | ~14 |
| 2 | ZUS Coffee KLCC Park | klcc-park | 10 | ~5 |
| 3 | ZUS Coffee Cheras | zus-cheras | 5 | 3 |

## Verification Tests

### 1. Authentication
```bash
# Login
curl -s -X POST https://admin.loyaltysystem.uk/api/v1/auth/login-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@loyaltysystem.uk","password":"admin123"}'
# Expected: { "access_token": "eyJ...", "refresh_token": "eyJ..." }
```

### 2. Dashboard Access
```bash
TOKEN=$(curl -s -X POST https://admin.loyaltysystem.uk/api/v1/auth/login-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@loyaltysystem.uk","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s https://admin.loyaltysystem.uk/api/v1/admin/dashboard \
  -H "Authorization: Bearer $TOKEN"
# Expected: { total_orders: 21, total_revenue: 586.9, total_customers: 5, ... }
```

### 3. Cross-Outlet Isolation
```bash
# Raj (manager store 2) → store 2 inventory = ALLOWED
# Raj (manager store 2) → store 1 inventory = BLOCKED (403)
# Lisa (manager store 3) → store 3 inventory = ALLOWED  
# Lisa (manager store 3) → store 1 inventory = BLOCKED (403)
# Siti (asst_mgr store 2) → store 2 staff = ALLOWED
# Siti (asst_mgr store 2) → store 1 staff = BLOCKED (403)
# Priya (barista store 1) → store 1 inventory = BLOCKED (barista not in MANAGEMENT_ROLES)
# Admin → any store = ALWAYS ALLOWED
```

### 4. Multi-Store Manager
```bash
# Amirul (store_owner + manager at stores 1+2):
#   store 1 inventory = ALLOWED
#   store 2 inventory = ALLOWED
#   store 3 inventory = BLOCKED (no staff record at store 3)
# NOTE: Amirul's UserRole is store_owner, so he actually gets ALL stores.
#       The staff records at stores 1+2 are additional, not limiting.
```

### 5. Soft Delete Verification
```bash
# DELETE /admin/stores/1/items/{item_id}
# Expected: item gets deleted_at = NOW() AND is_available = false
# Verify: SELECT id, name, deleted_at, is_available FROM menu_items WHERE deleted_at IS NOT NULL;
```

### 6. Token Blacklist / Logout
```bash
TOKEN=$(curl -s -X POST https://admin.loyaltysystem.uk/api/v1/auth/login-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@loyaltysystem.uk","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# Use token — should work
curl -s https://admin.loyaltysystem.uk/api/v1/users/me -H "Authorization: Bearer $TOKEN"
# Expected: { "id": 1, "name": "Admin User", ... }

# Logout — blacklists the token
curl -s -X POST https://admin.loyaltysystem.uk/api/v1/auth/logout -H "Authorization: Bearer $TOKEN"
# Expected: { "message": "Logged out" }

# Use same token — should be rejected
curl -s https://admin.loyaltysystem.uk/api/v1/users/me -H "Authorization: Bearer $TOKEN"
# Expected: { "detail": "Token has been revoked" }
```

### 7. PIN Rate Limiting
```bash
# 5 wrong PINs → 6th attempt returns 429
for i in $(seq 1 6); do
  curl -s -w "HTTP:%{http_code}\n" -X POST http://localhost:8000/api/v1/admin/staff/1/clock-in \
    -H "Content-Type: application/json" \
    -d '{"pin_code":"0000"}'
done
# Expected: 5 × 400 "Invalid PIN", then 1 × 429 "Too many PIN attempts"
```

### 8. Order Cancel with Loyalty Rollback
```bash
# Cancel an order that earned loyalty points
# Before cancel: check user's loyalty balance
docker exec fnb-db psql -U fnb -d fnb -c "SELECT points_balance FROM loyalty_accounts WHERE user_id=6;"

# Cancel order (as admin)
curl -s -X POST https://admin.loyaltysystem.uk/api/v1/orders/20/cancel \
  -H "Authorization: Bearer $TOKEN"
# Expected: { "message": "Order cancelled", "loyalty_reversed": true }

# After cancel: points_balance should decrease by loyalty_points_earned
# A reversal LoyaltyTransaction with negative points should exist
```

### 9. Table Occupancy Override
```bash
# Manual override table occupancy (bypass trigger)
curl -s -X PATCH https://admin.loyaltysystem.uk/api/v1/admin/stores/1/tables/1/occupancy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_occupied": true}'
# Expected: { "table_id": 1, "is_occupied": true }
```

### 10. Customization Options CRUD
```bash
# List customizations for menu item 1
curl -s https://admin.loyaltysystem.uk/api/v1/admin/stores/1/items/1/customizations \
  -H "Authorization: Bearer $TOKEN"
# Expected: [ { "id": 1, "name": "Extra Shot", ... }, ... ]

# Create new customization
curl -s -X POST https://admin.loyaltysystem.uk/api/v1/admin/stores/1/items/1/customizations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Size","price_adjustment":0.0}'
# Expected: { "id": ..., "name": "Size", ... }
```

### 11. Table Occupancy Trigger
```bash
# 1. Create a dine-in order with status=confirmed → table should become occupied
# 2. Update order status to completed → table should become free
# Verify: SELECT * FROM table_occupancy_snapshot WHERE is_occupied = TRUE;
```

### 12. Marketing Campaigns
```bash
# GET /admin/marketing/campaigns
# Expected: { total: 3, campaigns: [...] }
```

### 13. Order Flow
```bash
# 1. POST /cart/items — add item to cart
# 2. GET /cart — verify cart
# 3. POST /orders — create order
# 4. GET /orders/{id} — verify order with timeline
# 5. PATCH /orders/{id}/status — update status (admin/staff)
```

## Common API Base URLs

| Purpose | URL |
|---------|-----|
| Backend API | `https://admin.loyaltysystem.uk/api/v1/` |
| OpenAPI Docs | `https://admin.loyaltysystem.uk/docs` |
| Health Check | `https://admin.loyaltysystem.uk/health` |
| Customer App API | `https://app.loyaltysystem.uk/api/v1/` (same backend) |

## Service Management Commands

```bash
# Restart backend
systemctl restart fnb-backend

# Restart merchant dashboard
systemctl restart fnb-admin

# Restart customer app
systemctl restart fnb-app

# View backend logs
journalctl -u fnb-backend -f

# Run Alembic migration
cd /root/fnb-super-app/backend && .venv/bin/alembic upgrade head

# Database direct access
docker exec -it fnb-db psql -U fnb -d fnb
```

## Known Issues & Notes

1. **Pyright false positives** — LSP errors on SQLAlchemy Column assignments are safe to ignore
2. **bcrypt 4.3.0 breaks passlib** — must use `bcrypt<4.1` (4.0.x)
3. **Store owner password** was previously wrong hash — fixed to admin123 hash
4. **Merchant frontend** is a single SPA — no Next.js routing, all state in one page
5. **Middleware.ts** in Next.js caused infinite loops — disabled (no-op)
6. **OTP login** is stubbed — no actual SMS sending
7. **Payment intents** are stubbed — no Stripe integration yet
8. **Naive datetimes** — all models use `datetime.utcnow()`, no timezone awareness
