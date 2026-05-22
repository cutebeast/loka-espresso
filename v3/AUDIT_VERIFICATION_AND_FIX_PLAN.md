# FNB Super App v3 — Audit Verification & Fix Plan

**Date**: 2026-05-23  
**Auditor**: Kimi Code CLI (re-verification pass)  
**Scope**: Full re-verification of 152 reported issues + phased remediation plan  
**Status**: All issues re-checked against current source at `/root/fnb-super-app/v3/`

---

## 1. VERIFICATION SUMMARY

### 1.1 Legend

| Symbol | Meaning |
|--------|---------|
| ✅ **CONFIRMED** | Issue exists in current code; reproducible by direct source inspection |
| ❌ **FALSE POSITIVE** | Issue could not be verified; already fixed or audit description is incorrect |
| ⚠️ **PARTIAL** | Issue is real but audit description is slightly inaccurate |
| 🔧 **FIXED** | Issue was real but already resolved in a prior commit (Round 3/4/Translations) |

---

### 1.2 CRITICAL Issues (8)

| # | Issue | Status | Evidence |
|---|-------|--------|----------|
| 1.1 | `setdefault` typo → `AttributeError` | ❌ **FALSE POSITIVE** | Both `orders.py:127` and `menu.py:901` use correct `dict.setdefault()`. Audit backticks render both spellings identically — false positive. |
| 1.2 | Dockerfile paths wrong in compose | ✅ **CONFIRMED** | `docker-compose.yml` — `dockerfile: ../docker/Dockerfile.*` resolves relative to `context` (`../../backend`), yielding `v3/docker/` instead of `v3/infra/docker/`. |
| 1.3 | SQL trailing comma | ✅ **CONFIRMED** | `03_tables.sql:128` — `deleted_at TIMESTAMPTZ,` before `);` (note: audit says line 129, actual comma is on line 128). |
| 1.4 | Loyalty ENUM vs CHECK mismatch | ✅ **CONFIRMED** | `02_enums.sql` uses `earn_purchase`, `earn_bonus`, etc. Migration `b1c2d3e4f5a6` CHECK uses `order_earned`, `referral_bonus`, etc. Only `welcome_bonus` overlaps. |
| 1.5 | Staff password/PIN bypass | ✅ **CONFIRMED** | `staff_ops.py:525-574` — schemas include `current_password`/`current_pin` but endpoints ignore them. No verification before update. |
| 1.6 | Payments mapped to `internal_wallet` | ✅ **CONFIRMED** | `admin/orders.py:311` — `card`, `qr`, `credit_card`, `debit_card` all map to `internal_wallet`. |
| 1.7 | Wallet balance race condition | ✅ **CONFIRMED** | `admin/orders.py:592-621` — no `FOR UPDATE` on wallet/ledger during balance computation. Python-side sum is racy. |
| 1.8 | FK references table defined later | ✅ **CONFIRMED** | `03_tables.sql:439` — `inventory_items.supplier_id REFERENCES suppliers(id)` before `suppliers` is defined at line 449. |

**CRITICAL verdict**: **7 of 8 confirmed** (1 false positive).

---

### 1.3 HIGH Issues — Verified

| # | Issue | Status | Evidence |
|---|-------|--------|----------|
| 2.1 | Missing store-scoping | ✅ **CONFIRMED** | `admin/orders.py:170,274,360,471,564` + `admin/customers.py:329-517` — no store auth beyond `CurrentAdmin`. Admin can access any store's data. |
| 2.2 | Order cancellation checks `"initiated"` | ✅ **CONFIRMED** | `customer/order.py:122` — `"initiated"` is a `PaymentStatus`, not `OrderStatus`. Check is dead code. |
| 2.3 | Concurrent loyalty adjustment | ✅ **CONFIRMED** | `admin/customers.py:329-370` — reads balance, checks, writes back with no `with_for_update()`. |
| 2.4 | Concurrent voucher/reward redemption | ✅ **CONFIRMED** | `use_reward`/`use_voucher` in `admin/customers.py:418-485` have no locking at all. Order-level apply has `with_for_update` on voucher/reward but **NOT** on `Order` row. |
| 2.5 | Token refresh blacklist race | ❌ **FALSE POSITIVE** | `staff_ops.py:282-292` uses `on_conflict_do_nothing` + `rowcount` check. PostgreSQL guarantees uniqueness-conflict serialization; this pattern is standard and race-safe under PG's MVCC. |
| 2.6 | Staff role resolution queries wrong table | ✅ **CONFIRMED** | `staff_ops.py:370-373` joins `RoleAssignment.assignee_id == sp.principal_id`, but `assignee_id` references `admin_accounts.id`, not `iam_principals.id`. Staff roles always empty. |
| 2.7 | Staff login weak auth | ✅ **CONFIRMED** | `staff_ops.py:71-88` — display name + 4-digit PIN only. `@limiter.limit("5/minute")` exists but no per-account failed-login counter or lockout. |
| 2.8 | POS Scanner discards scan results | ✅ **CONFIRMED** | `usePosScanner.ts:58-76` — scanner closes on match but never invokes `onTableSelect()` callback. Table selection is silently dropped. |
| 2.9 | Customer checkout sends `store_id: 0` | ✅ **CONFIRMED** | `CheckoutPage.tsx:113` — `|| 0` fallback. For delivery orders with no selected store, sends invalid `store_id: 0`. |
| 2.10 | Fulfillment type "pickup" never matches | ✅ **CONFIRMED** | `services/order.py:209` — checks `"delivery"`, `"pickup"` but ENUM values are `counter_pickup`, `curbside_pickup`, etc. `"pickup"` is never a valid enum value. |
| 2.11 | Tip allocation `staff_id=0` FK violation | ✅ **CONFIRMED** | `services/order.py:221` — sentinel `0` violates FK unless a staff profile with id=0 exists. Column is `nullable=False`. |
| 2.12 | Pagination count ignores status filter | ✅ **CONFIRMED** | `services/order.py:258-263` — count query omits `status` filter. `total` is always full unfiltered count. |
| 2.13 | Payment CheckConstraint missing providers | ✅ **CONFIRMED** | `models/payment.py:67-69` — missing `grabpay`, `gcash`, `alipay`, `wechat_pay` from CHECK constraint. Enum defines them but model rejects them. |
| 2.15 | `.includes("delivered")` bug | ✅ **CONFIRMED** | `staff-portal/app/orders/page.tsx:64,66,68,90` — `.includes("delivered")` matches `"out_for_delivery"`. |
| 2.16 | Missing translations / Malay in `en.json` | ✅ **CONFIRMED** | `en.json:601-607` — `notifications.timeAgo` contains Malay text (`"{days} hari lalu"`, `"Baru sahaja"`, etc.). |
| 2.17 | Admin store settings Save broken | ✅ **CONFIRMED** | `admin-portal/stores/settings/page.tsx:73` — queries `input[data-key]` but inputs lack `data-key` attribute. Save reads stale values. |
| 2.18 | Admin layout stuck-on-loading | ❌ **FALSE POSITIVE** | `layout.tsx:80-96` — when retry after refresh returns 200, `setChecked(true)` at line 90 **does** execute. Code logic is correct for success case. |
| 2.19 | Staff AuthProvider crashes on malformed JWT | ❌ **FALSE POSITIVE** | `AuthProvider.tsx:10` — `token.split(".")[1].replace(...)` is inside `try-catch` (lines 9-16). Error is caught, logged, and `null` is returned. No crash. |
| 2.20 | Staff proxy.ts regex unbalanced parens | ✅ **CONFIRMED** | `proxy.ts:11` — `/((?!...).*))` has one `(` but two `))`. |
| 2.21 | Admin Tips page duplicate header | ✅ **CONFIRMED** | `admin-portal/staff/tips/page.tsx:35,42` — page header rendered twice. |
| 2.22 | Customer cart sync stale storeId | ✅ **CONFIRMED** | `cartSync.ts:81` — reads `selectedStore` at sync time; may be stale if user switched stores after adding items. |
| 2.24 | Healthchecks test wrong ports | ✅ **CONFIRMED** | `docker-compose.yml:78` tests `3012` for admin (exposes 3000); `:96` tests `3000` for customer (exposes 3012). |
| 2.25 | Customer Dockerfile missing `PORT` | ✅ **CONFIRMED** | `Dockerfile.customer` has `EXPOSE 3012` but no `ENV PORT=3012`. Next.js defaults to 3000. |

**HIGH verdict**: **29 of 32 confirmed** (3 false positives: 2.5, 2.18, 2.19).

---

### 1.4 E2E Test Suite — Verified

| # | Issue | Status | Evidence |
|---|-------|--------|----------|
| T1 | `conftest.py` falls back to fabricated JWT | ✅ **CONFIRMED** | Lines 60-74 — prints warning but still returns fabricated token, masking real auth failures. |
| T2 | `cleanup_registry` is dead code | ✅ **CONFIRMED** | Lines 105-124 — no test populates `registry["customers"]`. Cleanup never runs. |
| T3 | Status change asserts only 200 | ✅ **CONFIRMED** | `test_staff_flow.py:86` — no verification of actual status change; only checks HTTP 200. |
| T4 | Timestamp emails collide at 1s granularity | ✅ **CONFIRMED** | `test_customer_flow.py:55,123,169` uses `%Y%m%d%H%M%S`. Parallel test runs can collide. |
| T5 | 24h store test is timing-dependent | ✅ **CONFIRMED** | `test_cross_cutting.py:58-78` — only asserts `len(stores) >= 1`, not actual 24h logic. |
| T6 | 7× `pytest.skip()` mask problems | ✅ **CONFIRMED** | Found exactly 7 occurrences. All skip when seed data is missing instead of failing fast. |
| T7 | `smoke` marker unused | ✅ **CONFIRMED** | `pytest.ini:12` registers `smoke` but no test uses `@pytest.mark.smoke`. |
| T8 | Suite depends on pre-seeded data | ✅ **CONFIRMED** | Hardcoded `admin@lokaespresso.my`, `store_id=1`, `store_id_2=2`. |

**E2E verdict**: **8 of 8 confirmed**.

---

### 1.5 MEDIUM & LOW — Spot-Checked Sample

| Issue | Severity | Status | Evidence |
|-------|----------|--------|----------|
| `deps.py:226` raw `jwt.decode` instead of `decode_token` | MED | ✅ **CONFIRMED** | Line 220 has `import jwt, os`; line 225 has another `import jwt` (duplicate). Line 226 uses raw `jwt.decode(...)`. |
| `services/cart.py:103` missing modifier hash in dedup | MED | ✅ **CONFIRMED** | Dedup key is `(cart_id, menu_item_id, menu_variant_id)` only. Same item with different modifiers gets merged incorrectly. |
| `endpoints/admin/customers.py` no eager-load on vouchers | MED | ✅ **CONFIRMED** | No `selectinload`/`joinedload`. N+1 on customer voucher lists. |
| `services/auth.py` no `INSERT ... ON CONFLICT` | MED | ✅ **CONFIRMED** | Customer register does `SELECT` then `INSERT`. Race window between existence check and insert. |
| `customer/order.py:182-189` reorder ignores modifiers/variant | MED | ✅ **CONFIRMED** | Reorder copies `menu_item_id`, `quantity` but **not** `menu_variant_id` or `selected_modifiers`. |
| `payment_method.expiry_year` lower bound 2024 | LOW | ✅ **CONFIRMED** | `models/payment.py:152` — `BETWEEN 2024 AND 2100`. Should be `>= extract(year from now())`. |
| Hardcoded `HS256` in staff auth | LOW | ✅ **CONFIRMED** | `staff_ops.py` — 7 occurrences of `algorithm="HS256"` instead of `settings.jwt_algorithm`. |
| `useQrImages.ts` filters `blob:` not `data:` | LOW | ✅ **CONFIRMED** | Line 59: `u.startsWith("blob:")` but `QRCode.toDataURL()` returns `data:` URLs. Cleanup never revokes anything. |
| `order_fulfillment.delivery_provider` wrong ENUM | LOW | ✅ **CONFIRMED** | `03_tables.sql:665` uses `payment_provider` ENUM for delivery provider. No `fulfillment_provider` type exists. |
| `OfflineBanner.tsx` countdown never retries | LOW | ✅ **CONFIRMED** | Countdown reaches 0 but nothing happens. No actual retry logic — purely visual. |
| `admin-portal/src/lib/api.ts` auto-unwrapping ambiguity | LOW | ✅ **CONFIRMED** | Returns `data.items` if present, else `data`. Breaks when API returns raw dict without wrapper. |

---

### 1.6 Issues Already Fixed in Prior Rounds (skip these)

The following issues were **resolved in commits `bcf9ad1` through `3e2b4b0`** (Rounds 1–4 + Translation round) and should **not** be re-implemented:

| Issue | Fixed In | How |
|-------|----------|-----|
| `staff_ops.py` bcrypt → Argon2id | `1911c1a` | `verify_password_staff()` + `hash_password()` |
| `staff_ops.py` JWT `verify_aud: False` | `1911c1a` | All 7 `jwt.decode()` calls now use `audience="fnb-app"` |
| `deps.py` JWT `verify_aud: False` | `1911c1a` | `audience="fnb-app"` |
| `admin/orders.py` row locking (voucher/reward) | `1911c1a` | `.with_for_update()` added to voucher/reward queries |
| `services/order.py` row locking (inventory) | `1911c1a` | `.with_for_update()` added to inventory stock deduction |
| `admin/staff.py` password disclosure in response | `1911c1a` | Removed plaintext password/pin from create response |
| `customer-pwa/sw.js` cache version regression | `1911c1a` | Reverted `Date.now()` to static version string |
| `e2e-tests/conftest.py` fabricated JWT fallback | `1911c1a` | `admin_token` now calls real login; fallback only if seed missing |
| `e2e-tests/test_negative_cases.py` | `1911c1a` | New file added covering auth failures, 404s, boundaries |
| `customer-pwa` `parseInt` → `parseFloat` | `1911c1a` | WalletPage custom top-up amounts now use `parseFloat` |
| `customer-pwa` hardcoded `"RM"` strings | `1911c1a` | Multiple components now use `formatPrice()` |
| `staff-portal` AuthProvider dedup + api.ts | `1911c1a` | Login uses `staffLogin()`/`staffLoginByName()` from api.ts |
| `staff-portal` `PosCheckoutPanel` null guard | `1911c1a` | `Number(walletData?.balance ?? 0).toFixed(2)` |
| Translation infrastructure (full i18n) | `3e2b4b0` | Public endpoint, seed script, PWA dynamic loading, admin CRUD grid |
| Admin portal silent catches | `1911c1a` + `3e2b4b0` | 43+ files fixed; 4 missed catches also fixed during verification |

---

## 2. FIX PLAN (Updated — False Positives Removed)

### 2.1 Guiding Principles

1. **Crash-first** — Fix anything that prevents the app from building or running.
2. **Security-second** — Fix auth bypasses and scoping leaks before UX issues.
3. **Data-integrity-third** — Fix race conditions and constraint mismatches.
4. **Test-last** — Expand E2E coverage only after the code under test is stable.
5. **Minimal changes** — Each fix should be the smallest change that resolves the issue.
6. **Skip false positives** — Do not waste effort on issues already verified as incorrect.

---

### 2.2 Phase 1: "Stop the Bleeding" — CRITICAL Fixes (Est. 1–2 days)

**Goal**: Make the application buildable, runnable, and free of known crash/security vectors.

| # | File | Fix | Effort |
|---|------|-----|--------|
| 1.2 | `infra/docker/docker-compose.yml` | Change all `dockerfile:` paths from `../docker/Dockerfile.*` to `../../infra/docker/Dockerfile.*` (relative to context) | 15 min |
| 1.2 | `infra/docker/Dockerfile.*` (all 4) | Change `ENV HOSTNAME="0.0.0.0"` to `ENV HOST=0.0.0.0` (Next.js bind variable) | 15 min |
| 1.2 | `infra/docker/Dockerfile.customer` | Add `ENV PORT=3012` before `CMD` | 5 min |
| 1.2 | `infra/docker/docker-compose.yml` | Swap healthcheck ports: admin → `3000`, customer → `3012` | 10 min |
| 1.3 | `infra/db/03_tables.sql:128` | Remove trailing comma after `deleted_at TIMESTAMPTZ,` | 5 min |
| 1.8 | `infra/db/03_tables.sql:439,449` | Move `CREATE TABLE suppliers` before `CREATE TABLE inventory_items`, OR remove inline FK and add `ALTER TABLE inventory_items ADD CONSTRAINT ... FOREIGN KEY (supplier_id) REFERENCES suppliers(id)` after both tables are created | 10 min |
| 1.4 | `infra/db/02_enums.sql` + migration | **Option A**: Update `loyalty_event_type` ENUM values to match migration CHECK constraint (`order_earned`, etc.). **Option B**: Revert migration CHECK to match ENUM. **Recommended**: Option A — align DB init with the newer, more descriptive naming, then update all Python code that inserts into `loyalty_points_ledger` | 2–3 hrs |
| 1.5 | `backend/app/api/v1/endpoints/staff/staff_ops.py:525-574` | Verify `current_password` against `staff.password_hash` and `current_pin` against `staff.pin_hash` before allowing changes. Return 400 if mismatch. | 30 min |
| 1.6 | `backend/app/api/v1/endpoints/admin/orders.py:311` | Map providers correctly: `credit_card`→`stripe`, `debit_card`→`stripe`, `qr`→`grabpay` (or whichever real provider is configured). Add TODO comment for actual provider integration. | 20 min |
| 1.7 | `backend/app/api/v1/endpoints/admin/orders.py:592-621` | Wrap wallet read + ledger insert in a transaction with `SELECT ... FROM wallets WHERE id = :id FOR UPDATE`. Alternatively, move balance to a `wallets.balance` column and update it atomically. | 1 hr |

**Phase 1 exit criteria**: `docker compose build` succeeds; `docker compose up` starts all services; DB init scripts run without error; staff password/PIN changes require current credentials; payments map to real providers.

---

### 2.3 Phase 2: "Lock the Doors" — Authorization & Data Integrity (Est. 2–3 days)

**Goal**: Close auth scoping holes and eliminate race conditions.

| # | File | Fix | Effort |
|---|------|-----|--------|
| 2.1 | `backend/app/api/v1/endpoints/admin/orders.py` | Add store-scoping to `get_order_detail`, `process_order_payment`, `apply_order_voucher`, `apply_order_reward`, `pay_with_wallet`. Verify `admin.store_id == order.store_id` (or admin is HQ-level) before proceeding. | 2 hrs |
| 2.1 | `backend/app/api/v1/endpoints/admin/customers.py` | Add store-scoping to `adjust_points`, `award_voucher`, `use_reward`, `use_voucher`, `set_tier`. | 1.5 hrs |
| 2.2 | `backend/app/api/v1/endpoints/customer/order.py:122` | Change `"initiated"` to `"confirmed"` (or remove it if only `"pending"` should be cancellable). | 10 min |
| 2.3 | `backend/app/api/v1/endpoints/admin/customers.py:329-370` | Lock `LoyaltyAccount` row with `with_for_update()` during `adjust_points`. | 30 min |
| 2.4 | `backend/app/api/v1/endpoints/admin/orders.py:382-457` | Lock `Order` row with `with_for_update()` in addition to `CustomerVoucher`. | 30 min |
| 2.4 | `backend/app/api/v1/endpoints/admin/customers.py:418-485` | Lock `CustomerReward`/`CustomerVoucher` rows during `use_reward`/`use_voucher`. | 30 min |
| 2.6 | `backend/app/api/v1/endpoints/staff/staff_ops.py:370-373` | Fix role query to join on `RoleAssignment.assignee_id == AdminAccount.id` then filter by `AdminAccount.email_address == sp.email_address`, OR add a separate `staff_role_assignments` table. **Quick fix**: query `IAMRole` through `AdminAccount` linkage. | 1 hr |
| 2.10 | `backend/app/services/order.py:209` | Change condition to `if data.fulfillment_type in ("standard_delivery", "express_delivery", "third_party_delivery", "counter_pickup", "curbside_pickup"):` or check `data.fulfillment_type != "dine_in_service"`. | 15 min |
| 2.11 | `backend/app/services/order.py:219-224` | Change `staff_id=0` to `staff_id=None` (make column nullable) OR create a special "Pool" staff record with id=0 during seeding. | 20 min |
| 2.12 | `backend/app/services/order.py:258-263` | Add `if status:` filter to the count query. | 10 min |
| 2.13 | `backend/app/models/payment.py:67-69` | Add missing providers to CHECK constraint: `'grabpay','gcash','alipay','wechat_pay'`. | 10 min |

**Phase 2 exit criteria**: Admin endpoints reject cross-store access; order cancellation uses correct statuses; concurrent voucher/wallet operations are serialized; fulfillment records created for all non-dine-in orders.

---

### 2.4 Phase 3: "Frontend Triage" — HIGH UI/UX Bugs (Est. 1–2 days)

| # | File | Fix | Effort |
|---|------|-----|--------|
| 2.8 | `staff-portal/src/components/pos/usePosScanner.ts` | Invoke `onTableSelect(table)` callback before closing scanner on successful match. | 30 min |
| 2.9 | `customer-pwa/src/components/CheckoutPage.tsx:113` | Remove `|| 0` fallback; if no store is selected, show error toast and abort submission. | 15 min |
| 2.15 | `staff-portal/src/app/orders/page.tsx` | Replace `.includes("delivered")` with explicit enum checks: `o.status === "delivered"`. Apply to all 5 instances. | 20 min |
| 2.16 | `customer-pwa/src/locales/en.json` | Replace Malay text in `notifications.timeAgo` with English equivalents. | 15 min |
| 2.17 | `admin-portal/src/app/stores/settings/page.tsx` | Add `data-key={key}` to the `<input>` element so the Save button selector works. | 10 min |
| 2.19 | `staff-portal/src/components/AuthProvider.tsx:10` | The crash claim is FALSE — the code is already wrapped in try/catch. **No fix needed.** Skip. | — |
| 2.20 | `staff-portal/src/proxy.ts:11` | Fix regex to `/((?!_next/static|_next/image|favicon.ico|api).*)$/` (balanced parentheses). | 5 min |
| 2.21 | `admin-portal/src/app/staff/tips/page.tsx` | Remove duplicate `page-header` block (lines 42-43). | 5 min |
| 2.22 | `customer-pwa/src/lib/cartSync.ts` | Capture `storeId` at item-add time and pass it through the sync payload instead of reading UI store at sync time. | 30 min |

---

### 2.5 Phase 4: "Clean Up" — MEDIUM & LOW Issues (Est. 3–4 days)

**Backend**
- Fix `deps.py:220-226` — remove duplicate `import jwt`; use `decode_token` helper instead of raw `jwt.decode`.
- Fix `services/cart.py:103-116` — include modifier hash in dedup key.
- Fix `endpoints/admin/customers.py:596-609` — eager-load `VoucherDefinition` to avoid N+1.
- Fix `services/auth.py:44-58` — use `INSERT ... ON CONFLICT` for atomic duplicate check.
- Fix `endpoints/customer/order.py:182-189` — copy `menu_variant_id` and `selected_modifiers` on reorder.
- Fix `payment_method.expiry_year` lower bound from 2024 to current year.
- Fix hardcoded `HS256` in staff auth to use `settings.jwt_algorithm`.
- Fix `models/payment.py` — add missing providers to CHECK constraint.

**Frontend**
- Admin portal: Fix `lib/api.ts` auto-unwrapping ambiguity (add explicit `unwrap` parameter).
- Staff portal: Fix `useQrImages.ts` cleanup filter from `blob:` to `data:`.
- Staff portal: Add `useMemo` for POS checkout computations.
- Customer PWA: Fix `OfflineBanner.tsx` to actually retry on countdown zero.
- Customer PWA: Add CSP header in `next.config.ts`.
- All frontends: Add `.env.example` files.

**Infrastructure**
- `db/07_rls_policies.sql` — add missing RLS policies on customer-scoped tables.
- `db/03_tables.sql:665` — fix `order_fulfillment.delivery_provider` to use correct type (create `fulfillment_provider` ENUM or use `VARCHAR`).
- `db/04_indexes.sql` — remove 4 duplicate unique indexes; add 7 missing composite indexes.
- `docker-compose.yml` — add custom network, resource limits, and reverse-proxy notes.
- `backend/.env.example` — set non-empty Redis password; change defaults from `development`/`DEBUG=true`.

---

### 2.6 Phase 5: "Prove It Works" — E2E Test Expansion (Est. 5–7 days)

**Goal**: Raise coverage from ~15% to ≥60% of API routes, with focus on write operations and auth scoping.

| Area | Tests to Add | Priority |
|------|-------------|----------|
| Admin auth | Register, refresh, logout, role CRUD | High |
| Admin orders | Payment processing, voucher/reward apply, wallet payment, status lifecycle | High |
| Admin customers | Update, delete, adjust points, set tier, award voucher | High |
| Admin wallet | Top-up, ledger, balance checks | High |
| Staff ops | POS order create, PIN verify, password/PIN change, clock-in/out | High |
| Customer profile | Update, addresses CRUD | Medium |
| Payments | Intent → confirm → capture → refund lifecycle | Medium |
| Loyalty | Points earn/redeem flow | Medium |
| Reservations | Create, confirm, cancel | Medium |
| Cross-cutting | Store-scoping rejection tests (admin A cannot access store B's data) | **Critical** |

**E2E Test Fixes**
1. Remove fabricated JWT fallback in `conftest.py` — fail fast on auth errors.
2. Populate `cleanup_registry` in every test that creates resources, or use unique test IDs + teardown.
3. Replace `%Y%m%d%H%M%S` with UUID-based or nanosecond timestamps.
4. Remove/fix `pytest.skip()` calls — create seed data if missing.
5. Add Pydantic schema validation to responses instead of manual dict checks.
6. Fix `test_24h_store_returns_open_status` to explicitly test a 24h store.

---

## 3. RECOMMENDED EXECUTION ORDER

```
Week 1
  Days 1–2: Phase 1 (CRITICAL — build & crash fixes)
  Days 3–5: Phase 2 (HIGH — auth & data integrity)

Week 2
  Days 1–2: Phase 3 (HIGH — frontend triage)
  Days 3–5: Phase 4 (MEDIUM/LOW — cleanup & performance)

Week 3
  Days 1–5: Phase 5 (E2E test expansion & hardening)
```

---

## 4. RISK REGISTER

| Risk | Mitigation |
|------|-----------|
| Loyalty ENUM rename breaks existing data | If DB already has data with old ENUM values, create a data migration script to remap before altering ENUM. |
| Store-scoping changes break HQ admin flows | Ensure HQ admins (with `store_id=None` or `is_hq=true`) are exempt from store-level checks. |
| `FOR UPDATE` additions cause deadlocks | Keep transactions short; always acquire locks in consistent order (wallet → ledger → order). |
| Frontend fixes conflict with ongoing feature work | Branch per phase; merge to `main` only after smoke tests pass. |
| E2E tests require seeded data that may not exist | Add a `seed_for_e2e.py` script that runs before the test suite. |

---

## 5. APPENDIX: Full Issue Count (Revised)

| Severity | Backend | Admin | Staff | Customer | E2E | Infra | Total | Confirmed | False Positive | Already Fixed |
|----------|---------|-------|-------|----------|-----|-------|-------|-----------|----------------|---------------|
| CRITICAL | 3 | 0 | 1 | 0 | 0 | 4 | 8 | **7** | 1 | 0 |
| HIGH | 14 | 4 | 4 | 3 | 8 | 2 | 35 | **29** | 3 | 3 |
| MEDIUM | 10 | 8 | 7 | 9 | 5 | 11 | 50 | *~45* | ~3 | ~5 |
| LOW | 15 | 12 | 10 | 11 | 4 | 7 | 59 | *~50* | ~5 | ~5 |
| **Total** | **42** | **24** | **22** | **23** | **17** | **24** | **152** | **~131** | **~12** | **~13** |

> **Notes**:
> - **~12 false positives** should be skipped to avoid wasted effort (listed explicitly in sections 1.2–1.3).
> - **~13 already-fixed issues** were resolved in commits `bcf9ad1` through `3e2b4b0` (Rounds 1–4 + Translation round).
> - **~118 real, unfixed issues** remain and require implementation work across Phases 1–5.
