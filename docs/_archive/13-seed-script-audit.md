# Seed Script Audit & Fixes (2026-04-22)

> Comprehensive audit of all 24 seed scripts in `scripts/seed/` plus `fnb-manage.sh` and backend alignment.
> 
> **Trigger**: Major backend changes to order flows, store schemas, and API contracts necessitated a full audit to ensure seed scripts still mimic real PWA scenarios correctly.

---

## Store ID Convention (Critical)

**Store ID 0 is permanently reserved for HQ.**

- `POST /admin/system/init-hq` creates the HQ store with explicit `id=0`
- After init-hq, the sequence is reset to `MAX(id) + 1 = 1`
- Physical stores created via `POST /admin/stores` auto-increment from 1
- Result: **5 physical stores = IDs 1, 2, 3, 4, 5**

**Why this matters:**
- Universal menu has no `store_id`; all stores share the same menu
- Menu accessed via `/menu/categories` and `/menu/items`
- Staff assignments, inventory, and tables are per-store (1–5)
- Any script hardcoding store IDs 2–6 was broken after the reset logic change

---

## Summary of Fixes

### Backend

| File | Issue | Fix |
|------|-------|-----|
| `backend/app/api/v1/endpoints/admin/admin_customers.py:807` | Undefined variable `table` in exception handler | Changed to `table_name` |

### Management Script

| File | Issue | Fix |
|------|-------|-----|
| `scripts/fnb-manage.sh` | Referenced non-existent `verify_master_base_seed.py` | Updated to reference running scripts 00–18 in order |

### Seed Scripts — Critical (Would Cause Failure)

| Script | Issue | Root Cause | Fix |
|--------|-------|------------|-----|
| `verify_seed_01_stores.py:78` | IndentationError | Leading space before `def` | Removed extra space |
| `verify_seed_01_stores.py` | Dine-in tables had no QR codes | Script created tables but never called `generate-qr` | Added QR generation loop after table creation |
| `shared_config.py:50` | `STORE_IDS = [2,3,4,5,6]` | Outdated assumption about auto-increment | Changed to `[1,2,3,4,5]` |
| `verify_seed_02_menu.py:219-230` | Used old `/stores/{id}/menu` endpoint | Menu endpoints changed to universal `/menu/categories` and `/menu/items` | Updated to use new universal endpoints |
| `verify_seed_03_inventory.py:19` | `STORE_IDS = [2,3,4,5,6]` | Same as shared_config | Changed to `[1,2,3,4,5]` |
| `verify_seed_03_inventory.py:146-178` | Idempotency helpers broken | Expected nested `categories/items`; backend returns flat `InventoryItemOut` list | `_get_inv_cat_by_slug` now uses `/inventory-categories`; `_get_inv_item_by_name` iterates flat list |
| `verify_seed_04_staff.py:17,28-49` | All `store_id` values off by +1 | Same outdated ID assumption | Updated all `store_id` references to 1–5 |
| `verify_seed_06_rewards.py:145,158` | `"is_active": False` in POST payload | `RewardCreate` schema has no `is_active` field → Pydantic 422 | Removed from POST; existing PUT call handles deactivation |
| `verify_seed_10_register.py:45` | Customer count capped at 50 | `GET /admin/customers` without `page_size` defaults to 50 | Uses `?page_size=1` and reads `data["total"]` |
| `verify_seed_12c_place_orders_dinein.py:82-84` | Missing `qr_token` in scan payload | Table scan endpoint requires HMAC-validated `qr_token` | Added `qr_token` param, passed from `GET /stores/{id}/tables` response |
| `verify_seed_13a_flow_pickup_delivery.py:436-441` | PATCH to `"confirmed"` fails | Backend `settle_order_payment()` auto-sets Flow A to `confirmed` | Removed redundant confirm step; flow now goes `paid` → `preparing` |
| `verify_seed_13b_flow_dinein.py:237-285` | Voucher applied after confirm | `/orders/{id}/apply-voucher` requires `pending` status | Moved voucher application to **Step 1** (before customer confirms) |
| `verify_seed_14_claim_vouchers.py:63` | Wrong response key | Backend returns `voucher_claimed`, not `already_claimed` | Changed key name |
| `verify_seed_16_place_discounted_orders.py:60,151` | Vouchers never found | `customer.get("vouchers")` empty; claimed vouchers stored in `state["claimed_vouchers"]` | Builds lookup dict from `claimed_vouchers` by `user_id` |
| `verify_seed_17_complete_discounted_orders.py:60` | PATCH to `"confirmed"` fails | Same auto-confirm behavior as 13a | Changed `statuses` to `["preparing", "ready", "completed"]` |
| `verify_seed_18_submit_feedback.py:150` | Wrong response key | Admin feedback endpoint returns `items`, not `feedback` | Changed key name |

### Seed Scripts — Minor

| Script | Issue | Severity |
|--------|-------|----------|
| `verify_seed_11_wallet_topup.py:26` | Unused import `re_auth_customer` | Low |
| `verify_seed_11_wallet_topup.py:148` | `total_credited` sums pre-existing balances for skipped customers | Low (misleading log only) |
| `verify_seed_13a_flow_pickup_delivery.py:147-201` | Dead code: `initiate_payment()` and `simulate_payment_webhook()` never called | Low |

---

## Order Flow Verification

### Flow A (Pickup/Delivery)

```
pending → paid (wallet payment /payments/confirm)
        → confirmed (AUTO-SET by backend settle_order_payment)
        → preparing (PATCH /status)
        → ready (PATCH /status)
        → completed (PATCH /status)
        
Delivery adds: ready → out_for_delivery → completed
```

**Key change**: Scripts must NOT PATCH to `confirmed` after payment. The backend does this automatically for `pickup`/`delivery` order types.

### Flow B (Dine-in)

```
pending → [apply voucher] (POST /orders/{id}/apply-voucher — MUST be pending)
        → confirmed (POST /orders/{id}/confirm — customer or staff)
        → preparing (PATCH /status)
        → ready (PATCH /status)
        → paid (PATCH /orders/{id}/payment-status — staff marks after meal)
        → completed (PATCH /status)
        → table released (POST /tables/{id}/release)
```

**Key change**: Voucher must be applied BEFORE confirming. Once `confirmed`, the order is locked for voucher changes.

---

## API Endpoint Alignment Verified

All seed script endpoints were cross-referenced against the backend:

| Endpoint | Status | Notes |
|----------|--------|-------|
| `POST /admin/system/init-hq` | ✅ | Creates HQ store id=0, resets sequence |
| `POST /admin/stores` | ✅ | Physical stores get IDs 1–5 |
| `POST /admin/stores/{id}/tables` | ✅ | Creates table, no QR until `generate-qr` called |
| `POST /admin/stores/{id}/tables/{tid}/generate-qr` | ✅ | Sets `qr_token` + `qr_code_url` |
| `POST /tables/scan` | ✅ | Requires `qr_token` HMAC validation |
| `POST /orders/{id}/confirm` | ✅ | Allows customer OR staff with store access |
| `PATCH /orders/{id}/status` | ✅ | Enforces `VALID_TRANSITIONS` |
| `PATCH /orders/{id}/payment-status` | ✅ | Staff-only, awards loyalty points |
| `POST /orders/{id}/apply-voucher` | ✅ | Requires `pending` status |
| `POST /payments/create-intent` | ✅ | Wallet method supported |
| `POST /payments/confirm` | ✅ | Auto-confirms Flow A orders |
| `POST /wallet/deduct` | ✅ | Customer token required |

---

## Running the Seed Scripts

```bash
cd /root/fnb-super-app/scripts/seed

# 00: Reset database (SQL truncate + ACL recreate)
python3 verify_seed_00_full_reset.py

# 01-05: Base system
python3 verify_seed_01_stores.py
python3 verify_seed_02_menu.py
python3 verify_seed_03_inventory.py
python3 verify_seed_04_staff.py
python3 verify_seed_05_config.py

# 06-09: Marketing & customer reset
python3 verify_seed_06_rewards.py
python3 verify_seed_07_vouchers.py
python3 verify_seed_08_promotions.py
python3 verify_seed_09_reset_customers.py

# 10-11: Customer onboarding
python3 verify_seed_10_register.py
python3 verify_seed_11_wallet_topup.py

# 12: Place orders (pickup, delivery, dine-in)
python3 verify_seed_12a_place_orders_pickup.py
python3 verify_seed_12b_place_orders_delivery.py
python3 verify_seed_12c_place_orders_dinein.py

# 13: Complete orders
python3 verify_seed_13_order_completion.py
# Or individually:
# python3 verify_seed_13a_flow_pickup_delivery.py
# python3 verify_seed_13b_flow_dinein.py

# 14-18: Marketing & feedback
python3 verify_seed_14_claim_vouchers.py
python3 verify_seed_15_redeem_rewards.py
python3 verify_seed_16_place_discounted_orders.py
python3 verify_seed_17_complete_discounted_orders.py
python3 verify_seed_18_submit_feedback.py
```

---

## Known Limitations

1. **Mock services required**: Scripts 11, 12b, 13a require `mock_pg_server.py` (port 8889) and `mock_delivery_server.py` (port 8888) to be running.
2. **State file dependency**: `seed_state.json` carries customer tokens between scripts. If it becomes stale, run `verify_seed_10_register.py` again or use `helper_reauth_customers.py`.
3. **No master orchestrator**: Each script is self-contained. Run in order — skipping steps will cause downstream failures.
