# FNB Super-App — Testing & Verification Guide

> Last updated: 2026-04-21 | Current guide for modular API-based verification before real provider integrations

## Current Testing Approach

This project currently relies on three verification layers:

1. **Build verification**
   - `frontend/` Next.js build
   - `customer-app/` Next.js build
   - backend Python compile / runtime checks

2. **Modular API-driven seed scripts**
   - located in `scripts/seed/`
   - intentionally broken into small steps to mimic how the PWA/backend contracts were built

3. **Mock provider scripts**
   - PG: `scripts/3rdparty_pg/`
   - delivery: `scripts/3rdparty_delivery/`
   - POS: `scripts/external_pos/`

There is no comprehensive committed automated regression suite yet. Treat the seed scripts and build checks as the active verification path.

---

## Core Accounts

All password-based users use `admin123` unless explicitly changed by seed flow.

### Admin & HQ

| Email | Role | Scope |
|-------|------|-------|
| `admin@loyaltysystem.uk` | Admin | Global |
| `hq_mgr_1@fnb.com` | Brand/HQ management | Global |
| `hq_mgr_2@fnb.com` | HQ staff | Global |
| `hq_staff_1@fnb.com` | HQ staff | Global |

### Store Management / Store Users

Representative users created by staff seed scripts include:

| Email | Role | Store |
|-------|------|-------|
| `mgr_klcc@fnb.com` | Manager | KLCC |
| `astmgr_klcc@fnb.com` | Assistant Manager | KLCC |
| `mgr_pavilion@fnb.com` | Manager | Pavilion |
| `mgr_cheras@fnb.com` | Manager | Cheras |
| `mgr_pj@fnb.com` | Manager | PJ |
| `mgr_bangi@fnb.com` | Manager | Bangi |

### Customer Accounts

Customer records are primarily created through the OTP registration seed flow:

- `scripts/seed/verify_seed_10_register.py`

Those customers are stored in:

- `scripts/seed/seed_state.json`

Use the state file as the authoritative test-customer reference after running customer seed steps.

---

## Required Mock Services

Before running the payment, delivery, and lifecycle seed steps, make sure these are running:

| Service | Script | Default Port |
|--------|--------|--------------|
| Mock PG | `scripts/3rdparty_pg/mock_pg_server.py` | `8889` |
| Mock Delivery | `scripts/3rdparty_delivery/mock_delivery_server.py` | `8888` |
| Mock POS | `scripts/external_pos/mock_pos_server.py` | `8081` |

Run the mock services with the backend virtualenv so FastAPI/httpx dependencies are available.

---

## Recommended Verification Flow

### 1. Rebuild and start the apps

```bash
cd /root/fnb-super-app/scripts
./fnb-manage.sh rebuild
./fnb-manage.sh status
./fnb-manage.sh verify
```

### 2. Run base seed flow

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
```

### 3. Run customer journey seed flow

```bash
cd /root/fnb-super-app/scripts/seed
python3 verify_seed_10_register.py 10
python3 verify_seed_11_wallet_topup.py
python3 verify_seed_12_place_orders_main.py 5 2
python3 verify_seed_13_order_completion.py
python3 verify_seed_14_claim_vouchers.py
python3 verify_seed_15_redeem_rewards.py
python3 verify_seed_16_place_discounted_orders.py
python3 verify_seed_17_complete_discounted_orders.py
python3 verify_seed_18_submit_feedback.py
```

---

## Current Seed Script Contract Notes

### Auth / OTP
- `verify_seed_10_register.py` uses:
  - `POST /auth/send-otp`
  - `GET /admin/otps`
  - `POST /auth/verify-otp`
  - `POST /auth/register`
  - `GET /users/me`
- OTP bypass/testing is still acceptable for current pre-Twilio phase.

### Wallet / PG
- `verify_seed_11_wallet_topup.py` now simulates PG and verifies wallet balance through current wallet APIs.
- Wallet cash balance endpoint:
  - `GET /wallet`
- Combined customer wallet endpoint:
  - `GET /me/wallet`

### Order Placement
- Steps `12a/12b/12c` place pickup, delivery, and dine-in orders through API only.
- Menu fetches now use the current item/category contract.

### Order Completion
- Flow A completion now uses current payment APIs:
  - `POST /payments/create-intent`
  - `POST /payments/confirm`
- Flow B still uses dine-in payment-status flow for current internal testing.

### Discounts
- Discounted order scripts use:
  - `voucher_code`
  - `reward_redemption_code`
- One discount type per order remains enforced.

---

## Manual Spot Checks

### Admin login

```bash
curl -s -X POST http://localhost:8765/api/v1/auth/login-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@loyaltysystem.uk","password":"admin123"}'
```

### Config

```bash
curl -s http://localhost:8765/api/v1/config
```

### Customer wallet cash balance

```bash
curl -s http://localhost:8765/api/v1/wallet \
  -H "Authorization: Bearer <customer-token>"
```

### Combined customer wallet

```bash
curl -s http://localhost:8765/api/v1/me/wallet \
  -H "Authorization: Bearer <customer-token>"
```

### Merchant dashboard API health via local manager ports

```bash
curl -s http://localhost:8765/health
curl -I http://localhost:3001
curl -I http://localhost:3002
```

---

## Known Current Constraints

1. OTP delivery is still stubbed/testing-oriented until Twilio integration.
2. PG, delivery, and POS flows are still mock-provider simulations.
3. Seed scripts are the active end-to-end verification surface.
4. Conventional automated regression coverage is still limited.

## Pass Criteria Before Real Provider Work

Treat the stack as ready for the next integration phase when all of the following are true:

1. `./fnb-manage.sh rebuild` succeeds.
2. `./fnb-manage.sh verify` succeeds.
3. mock provider services are reachable.
4. base seed flow succeeds.
5. customer journey flow succeeds without stale-contract failures.
