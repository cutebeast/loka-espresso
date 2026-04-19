# FNB Super-App — Test Credentials & Verification Guide

> Last updated: 2026-04-19 (session 5) | Base Seed Steps 00-08 Complete | Customer Journey Seeds 09-17 Certified | Order Completion Flows A/B Implemented

## Test Accounts

All passwords: `admin123` (unless noted — some customers use OTP only)

### Admin & HQ Staff

| Email | User Type | Role | Store Access | Purpose |
|-------|-----------|------|-------------|---------|
| admin@loyaltysystem.uk | HQ Management | Admin | Global (all stores) | Full platform admin |
| hq_mgr_1@fnb.com | HQ Management | HQ Manager | Global (all stores) | HQ operations |
| hq_mgr_2@fnb.com | HQ Management | HQ Manager | Global (all stores) | HQ operations |
| hq_staff_1@fnb.com | HQ Management | HQ Staff | Global (HQ only) | HQ operations |

### Store Management

| Email | Role | Store Access |
|-------|------|-------------|
| mgr_klcc@fnb.com | Manager | KLCC |
| astmgr_klcc@fnb.com | Assistant Manager | KLCC |
| mgr_pavilion@fnb.com | Manager | Pavilion |
| astmgr_pavilion@fnb.com | Assistant Manager | Pavilion |
| mgr_cheras@fnb.com | Manager | Cheras |
| mgr_pj@fnb.com | Manager | PJ |
| mgr_bangi@fnb.com | Manager | Bangi |

### Store Staff

| Email | Role | Store |
|-------|------|-------|
| staff_klcc_1@fnb.com | Barista | KLCC |
| staff_klcc_2@fnb.com | Barista | KLCC |
| staff_klcc_3@fnb.com | Cashier | KLCC |
| staff_pavilion_1@fnb.com | Barista | Pavilion |
| staff_pavilion_2@fnb.com | Delivery | Pavilion |
| staff_cheras_1@fnb.com | Barista | Cheras |
| staff_cheras_2@fnb.com | Cashier | Cheras |
| staff_pj_1@fnb.com | Barista | PJ |
| staff_bangi_1@fnb.com | Barista | Bangi |
| staff_bangi_2@fnb.com | Delivery | Bangi |
| staff_bangi_3@fnb.com | Cashier | Bangi |

### Customers (for PWA testing)

| Email | Name |
|-------|------|
| ahmad.taher@email.my | Ahmad Taher |

## Store Data

| ID | Name | Slug | Tables |
|----|------|------|--------|
| 0 | HQ (Headquarters) | hq | — |
| 2 | Loka Espresso KLCC | le-klcc | 6 |
| 3 | Loka Espresso Pavilion | le-pavilion | 6 |
| 4 | Loka Espresso Cheras | le-cheras | 6 |
| 5 | Loka Espresso PJ | le-pj | 5 |
| 6 | Loka Espresso Bangi | le-bangi | 5 |

## Seeded Marketing Data

### Rewards (seed_06 — 8 total)

| Code | Name | Type | Points | Min Spend | Active |
|------|------|------|--------|-----------|--------|
| RWD-FREE-LATTE | Free Caramel Latte | free_item | 150 | — | ✅ |
| RWD-FREE-CROISSANT | Free Croissant | free_item | 120 | — | ✅ |
| RWD-FREE-TIRAMISU | Free Tiramisu | free_item | 200 | — | ✅ |
| RWD-FREE-TUMBLER | Free Loka Tumbler | free_item | 500 | — | ✅ |
| RWD-5OFF | RM5 Off Your Order | discount_voucher | 100 | RM15 | ✅ |
| RWD-MYSTERY | Mystery Reward | custom | 250 | — | ✅ |
| RWD-FREE-AMERICANO | Free Americano | free_item | 80 | — | ❌ |
| RWD-10OFF | RM10 Off | discount_voucher | 300 | RM20 | ❌ |

### Vouchers (seed_07 + seed_08 — 8 total)

| Code | Type | Value | Min Spend | Valid Until | Source |
|------|------|-------|-----------|-------------|--------|
| WELCOME10 | percent | 10% | RM25 | 2027-01-01 | seed_07 |
| SAVE5RM | fixed | RM5 | RM20 | 2027-06-30 | seed_07 |
| FREECOFFEE | free_item | up to RM15 | RM30 | 2027-03-15 | seed_07 |
| EXPIRED20 | percent | 20% | RM15 | 2025-01-01 | seed_07 (expired) |
| OLDSAVE | fixed | RM8 | RM25 | 2025-06-01 | seed_07 (expired) |
| SURVEY-REWARD-5 | fixed | RM5 | — | 2028-12-31 | seed_08 |
| SURVEY-REWARD-10PCT | percent | 10% | — | 2028-12-31 | seed_08 |
| SURVEY-REWARD-COFFEE | free_item | up to RM15 | — | 2028-12-31 | seed_08 |

### Surveys (seed_08 — 3 total)

| # | Title | Questions | Reward |
|---|-------|-----------|--------|
| 1 | Customer Satisfaction Survey | 4 (rating, single_choice, text, rating) | SURVEY-REWARD-5 |
| 2 | New Menu Feedback | 3 (rating, single_choice, dropdown) | SURVEY-REWARD-10PCT |
| 3 | Store Experience Review | 3 (rating, text, single_choice) | SURVEY-REWARD-COFFEE |

### Promo Banners (seed_08 — 5 total)

| # | Title | Action | End Date |
|---|-------|--------|----------|
| 1 | Take Our Survey & Get RM5 Off | survey → Survey 1 | 2027-06-30 |
| 2 | New Menu — Vote & Save 10% | survey → Survey 2 | 2027-06-30 |
| 3 | Store Review — Free Coffee! | survey → Survey 3 | 2027-06-30 |
| 4 | Summer Promo (Expired) | detail → FREECOFFEE | 2025-01-01 |
| 5 | Holiday Deal (Expired) | detail → SAVE5RM | 2025-06-01 |

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

### 16. Order Completion Flows
```bash
# Run full customer journey (register → wallet topup → place orders → complete orders)
cd /root/fnb-super-app/scripts/seed
python3 verify_seed_10_register.py 5        # Register 5 customers
python3 verify_seed_11_wallet_topup.py      # Top up wallets
python3 verify_seed_12_place_orders_main.py 5 2  # Place 2 orders per customer
python3 verify_seed_13_order_completion.py  # Complete all pending orders

# Expected: Orders processed through appropriate flow:
#   - Pickup/Delivery: pending → paid → confirmed → preparing → ready → completed
#   - Dine-in: pending → confirmed → preparing → ready → payment → completed
```

### 17. Dine-in Order Confirmation
```bash
# Customer confirms dine-in order (sends to kitchen)
CT=$(curl -s http://localhost:8000/api/v1/auth/login-password \
  -H "Content-Type: application/json" \
  -d '{"email":"customer@example.com","password":"password123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s -X POST -H "Authorization: Bearer $CT" \
  http://localhost:8000/api/v1/orders/123/confirm
# Expected: { "message": "Order confirmed and sent to kitchen", "status": "confirmed" }
```

### 18. Apply Voucher to Order
```bash
# Apply voucher to pending order (checkout flow)
curl -s -X POST -H "Authorization: Bearer $CT" -H "Content-Type: application/json" \
  http://localhost:8000/api/v1/orders/123/apply-voucher \
  -d '{"voucher_code": "WELCOME10-A1B2C3"}'
# Expected: { "message": "Voucher applied successfully", "discount_applied": 15.50, "new_total": 139.50 }
```

### 19. Claim Vouchers and Redeem Rewards
```bash
# Claim vouchers from surveys
cd /root/fnb-super-app/scripts/seed
python3 verify_seed_14_claim_vouchers.py

# Redeem rewards using loyalty points
python3 verify_seed_15_redeem_rewards.py
```

### 20. Place and Complete Discounted Orders
```bash
# Place orders applying one discount per order (checks strict 1 discount constraint)
cd /root/fnb-super-app/scripts/seed
python3 verify_seed_16_place_discounted_orders.py

# Complete the discounted orders
python3 verify_seed_17_complete_discounted_orders.py
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
8. **seed_08 not fully idempotent** — promotions seed creates duplicate surveys/banners on re-run without reset. Run `seed_00_full_reset.py` first for clean state.
9. **seed_full.sql is DEPRECATED** — Uses old `role` string column instead of `role_id` integer FK. Use Python seed scripts instead.
10. **Customer Journey Seeds (09-17)** — Available for full end-to-end testing (register, wallet topup, place orders, order completion with Flow A/B, claiming/redeeming discounts). See scripts/seed/ directory.
11. **Order Completion Flows** — Two distinct flows implemented: Flow A (Pickup/Delivery: pay → fulfill) and Flow B (Dine-in: fulfill → pay). Orchestrated via verify_seed_13_order_completion.py.

## Phase History

| Phase | Status | Key Deliverables |
|-------|--------|-----------------|
| Phase 1 | ✅ Complete | Core backend, merchant dashboard, customer PWA, security hardening |
| Phase 2 | ✅ Complete | Production readiness, rate limiting, charts, PWA refactor |
| Pre-Phase 3 | ✅ Complete | Cross-store validation, audit log hooks, timezone-aware datetimes |
| Marketing | ✅ Complete | 6 admin pages, 5 new PWA endpoint files, 5 migrations, customer wallet infrastructure (catalog→instance pattern, per-instance codes, expiry, scan, cron) |
| Base Seed | ✅ Complete | 9 seed scripts (00-08): full reset, stores, universal menu, inventory, staff, config, rewards, vouchers, surveys + banners |
| Customer Journey | ✅ Complete | 9 certified seed scripts (09-17): registration, wallet topup, order placement/completion (Flow A/B), claiming vouchers, redeeming rewards, and discounted orders |
| Order Flows | ✅ Complete | Two distinct completion flows: Flow A (Pickup/Delivery: pay→fulfill) and Flow B (Dine-in: fulfill→pay), voucher application, table release |
| Phase 3 | 🔲 Pending | Customer PWA rebuild, Stripe, Twilio, WhatsApp, FCM |
