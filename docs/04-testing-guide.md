# FNB Super-App — Test Credentials & Verification Guide

> Last updated: 2026-04-14 | Marketing Group + Wallet Infrastructure Complete

## Test Accounts

All passwords: `admin123` (unless noted — some customers use OTP only)

### Admin & Store Owner

| Email | UserRole | StaffRole | Store Access | Purpose |
|-------|----------|-----------|-------------|---------|
| admin@loyaltysystem.uk | admin | — | ALL stores | Full platform admin |
| store.owner@zus.my | store_owner | manager | Stores 1 + 2 | Multi-store owner/operator |

### Customers (for PWA testing)

| Email | Password | Name | Loyalty Points | Wallet |
|-------|----------|------|---------------|--------|
| sarah.wong@email.my | password123 | Sarah Wong | 820 | RM120.50 |
| raj.kumar@email.my | password123 | Raj Kumar | — | — |
| mei.lim@email.my | password123 | Mei Lim | — | — |
| aida.rahman@email.my | password123 | Aida Rahman | — | — |

### Managers

| Email | UserRole | StaffRole | Store Access |
|-------|----------|-----------|-------------|
| raj.manager@zus.my | customer | manager | Store 2 only |
| lisa.manager@zus.my | customer | manager | Store 3 only |

### Staff

| Email | StaffRole | Store | Purpose |
|-------|-----------|-------|---------|
| siti@zus.my | assistant_manager | Store 2 | ACL test |
| priya.dashboard@zus.my | barista | Store 1 | ACL: BLOCKED from management |

## Store Data

| ID | Name | Slug | Tables | Menu Items |
|----|------|------|--------|------------|
| 1 | ZUS Coffee KLCC | zus-klcc | 10 | ~14 |
| 2 | ZUS Coffee KLCC Park | klcc-park | 10 | ~5 |
| 3 | ZUS Coffee Cheras | zus-cheras | 5 | 3 |

## Verification Tests

### 1. Authentication
```bash
curl -s -X POST https://admin.loyaltysystem.uk/api/v1/auth/login-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@loyaltysystem.uk","password":"admin123"}'
# Expected: { "access_token": "eyJ...", "refresh_token": "eyJ..." }
```

### 2. Rewards Catalog (PWA)
```bash
# Public — no auth needed
curl -s http://localhost:8000/api/v1/rewards
# Expected: [ { "id": 3, "name": "Free Kaya Toast", "points_cost": 80 }, ... ]

curl -s http://localhost:8000/api/v1/rewards/1
# Expected: { "id": 1, "name": "Free Cappuccino", "points_cost": 150, "stock_limit": 500, "total_redeemed": 23 }
```

### 3. Reward Redemption
```bash
CT=$(curl -s http://localhost:8000/api/v1/auth/login-password \
  -H "Content-Type: application/json" \
  -d '{"email":"sarah.wong@email.my","password":"password123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s -X POST -H "Authorization: Bearer $CT" http://localhost:8000/api/v1/rewards/1/redeem
# Expected: { "success": true, "redemption_code": "RWD-1-XXXXXX", "remaining_points": 670 }
```

### 4. Full Customer Wallet
```bash
curl -s -H "Authorization: Bearer $CT" http://localhost:8000/api/v1/me/wallet
# Expected: { "rewards": [...], "vouchers": [...], "cash": {"balance": 120.5}, "loyalty_points": 670 }
```

### 5. Barista Scan (Reward)
```bash
AT=$(curl -s http://localhost:8000/api/v1/auth/login-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@loyaltysystem.uk","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# Scan the code from step 3
curl -s -X POST -H "Authorization: Bearer $AT" -H "Content-Type: application/json" \
  http://localhost:8000/api/v1/scan/reward/RWD-1-XXXXXX -d '{}'
# Expected: { "success": true, "reward_name": "Free Cappuccino", "customer_id": 3 }

# Duplicate scan → rejected
curl -s -X POST -H "Authorization: Bearer $AT" http://localhost:8000/api/v1/scan/reward/RWD-1-XXXXXX -d '{}'
# Expected: 400 "Reward already used"
```

### 6. Voucher Validate & Use
```bash
# Validate per-instance code
curl -s -X POST -H "Authorization: Bearer $CT" -H "Content-Type: application/json" \
  http://localhost:8000/api/v1/vouchers/validate -d '{"code": "VCH-7-28a259", "order_total": 30}'
# Expected: { "valid": true, "discount_type": "free_item", "discount_value": 8.9 }

# Barista scans voucher
curl -s -X POST -H "Authorization: Bearer $AT" -H "Content-Type: application/json" \
  http://localhost:8000/api/v1/scan/voucher/VCH-7-28a259 -d '{}'
# Expected: { "success": true, "message": "Voucher applied: FREECOFFEE" }
```

### 7. Survey Submit with Voucher Grant
```bash
curl -s -X POST -H "Authorization: Bearer $CT" -H "Content-Type: application/json" \
  http://localhost:8000/api/v1/surveys/1/submit \
  -d '{"answers": [{"question_id": 1, "answer_text": "5"}, {"question_id": 2, "answer_text": "Great!"}]}'
# Expected: { "success": true, "voucher_granted": true/false, "voucher_code": "..." }

# Duplicate submission → rejected
curl -s -X POST -H "Authorization: Bearer $CT" http://localhost:8000/api/v1/surveys/1/submit \
  -d '{"answers": [{"question_id": 1, "answer_text": "5"}]}'
# Expected: { "success": false, "already_submitted": true }
```

### 8. Promo Banner Claim
```bash
# Check status
curl -s -H "Authorization: Bearer $CT" http://localhost:8000/api/v1/promos/banners/1/status
# Expected: { "claimed": false }

# Claim
curl -s -X POST -H "Authorization: Bearer $CT" http://localhost:8000/api/v1/promos/banners/1/claim
# Expected: { "success": true, "voucher_code": "...", "voucher_title": "..." }
```

### 9. Cron Expire Job
```bash
curl -s -X POST -H "Authorization: Bearer $AT" http://localhost:8000/api/v1/scan/cron/expire
# Expected: { "rewards_expired": 0, "vouchers_expired": N }
```

### 10. Dashboard Access
```bash
curl -s https://admin.loyaltysystem.uk/api/v1/admin/dashboard \
  -H "Authorization: Bearer $AT"
# Expected: { total_orders, total_revenue, total_customers, ... }
```

### 11. Cross-Outlet Isolation
```bash
# Raj (manager store 2) → store 2 inventory = ALLOWED
# Raj (manager store 2) → store 1 inventory = BLOCKED (403)
# Priya (barista store 1) → store 1 inventory = BLOCKED (barista not in MANAGEMENT_ROLES)
# Admin → any store = ALWAYS ALLOWED
```

### 12. Soft Delete Verification
```bash
# DELETE /admin/stores/1/items/{item_id}
# Expected: item gets deleted_at = NOW() AND is_available = false
# Verify: SELECT id, name, deleted_at, is_available FROM menu_items WHERE deleted_at IS NOT NULL;
```

### 13. Token Blacklist / Logout
```bash
TOKEN=$(curl -s http://localhost:8000/api/v1/auth/login-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@loyaltysystem.uk","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s http://localhost:8000/api/v1/users/me -H "Authorization: Bearer $TOKEN"
# Expected: 200 OK

curl -s -X POST http://localhost:8000/api/v1/auth/logout -H "Authorization: Bearer $TOKEN"
# Expected: { "message": "Logged out" }

curl -s http://localhost:8000/api/v1/users/me -H "Authorization: Bearer $TOKEN"
# Expected: 401 "Token has been revoked"
```

### 14. Admin Surveys CRUD
```bash
curl -s http://localhost:8000/api/v1/admin/surveys -H "Authorization: Bearer $AT"
# Expected: [ { "id": 1, "title": "Customer Satisfaction", ... } ]
```

### 15. Marketing Reports
```bash
curl -s "http://localhost:8000/api/v1/admin/reports/marketing?from_date=2026-01-01&to_date=2026-12-31" \
  -H "Authorization: Bearer $AT"
# Expected: { tier_distribution, points_issued, points_redeemed, reward_redemptions, voucher_usage }
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
systemctl restart fnb-backend    # Restart backend
systemctl restart fnb-admin      # Restart merchant dashboard
systemctl restart fnb-app        # Restart customer app
journalctl -u fnb-backend -f     # View backend logs
cd /root/fnb-super-app/backend && .venv/bin/alembic upgrade head  # Run migrations
docker exec -it fnb-db psql -U fnb -d fnb  # Database direct access
```

## Known Issues & Notes

1. **Pyright false positives** — LSP errors on SQLAlchemy Column assignments are safe to ignore
2. **bcrypt 4.3.0 breaks passlib** — must use `bcrypt<4.1` (4.0.x)
3. **Merchant frontend** is a single SPA — no Next.js routing, all state in one page
4. **OTP login** is stubbed — no actual SMS sending
5. **Payment intents** are stubbed — no Stripe integration yet
6. **Customer users** have real password hashes — can log in with password123
7. **Customer PWA** at app.loyaltysystem.uk is Phase 2 version — needs rebuild for new wallet API

## Phase History

| Phase | Status | Key Deliverables |
|-------|--------|-----------------|
| Phase 1 | ✅ Complete | Core backend, merchant dashboard, customer PWA, security hardening |
| Phase 2 | ✅ Complete | Production readiness, rate limiting, charts, PWA refactor |
| Pre-Phase 3 | ✅ Complete | Cross-store validation, audit log hooks, timezone-aware datetimes |
| Marketing | ✅ Complete | 6 admin pages, 5 new PWA endpoint files, 5 migrations, customer wallet infrastructure (catalog→instance pattern, per-instance codes, expiry, scan, cron) |
| Phase 3 | 🔲 Pending | Customer PWA rebuild, Stripe, Twilio, WhatsApp, FCM |
