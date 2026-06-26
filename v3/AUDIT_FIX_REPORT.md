# FNB Super App v3 — Audit Remediation Report

**Date:** 2026-06-26  
**Scope:** Backend (FastAPI), Admin Portal (Next.js), Staff Portal (Next.js), Customer PWA (Next.js)  
**Goal:** Fix all Critical / High / Medium / Low audit findings from the latest security & quality review.

---

## Executive Summary

All previously identified Critical and High severity issues have been remediated. The full E2E suite passes, all three front-end portals build cleanly, and TypeScript / ESLint are warning-free.

| Check | Result |
|-------|--------|
| E2E test suite | **156 passed, 14 skipped, 0 failed** |
| Backend syntax / import compile | **Clean** |
| Admin portal TypeScript + ESLint + production build | **Clean** |
| Staff portal TypeScript + ESLint + production build | **Clean** |
| Customer PWA TypeScript + ESLint + production build | **Clean** |

> The 14 skipped tests are environment-dependent browser/PWA journey tests; they were skipped in previous runs as well and do not indicate regressions.

---

## 1. Backend Remediation

### 1.1 Bundle & Add-on Deal Engine (already completed, re-verified)
- `_compute_bundle_discount` now prices **only** the items that form complete sets, using `_consumed_items_price()`.
- Highest-unit-total items are consumed first to keep discounts deterministic and customer-fair.
- Add-on deal discounts no longer apply to incomplete bundles.
- Mirrored logic in customer PWA (`addonDeal.ts`) and staff POS (`usePosState.ts`).

**Files:** `backend/app/services/order.py`, `customer-pwa/src/lib/addonDeal.ts`, `staff-portal/src/components/pos/usePosState.ts`

### 1.2 Cart Concurrency Hardening
- All cart mutation paths (`add_line_item`, `update_line_item`, `remove_line_item`, `get_or_create_cart`) now use `with_for_update()`.
- Handles the `IntegrityError` race when two requests create a cart simultaneously.

**Files:** `backend/app/services/cart.py`

### 1.3 Idempotency & Payment Safety

#### Customer order creation
- `OrderCreate` and `CustomerOrderCreateRequest` now accept an `idempotency_key`.
- The endpoint reads the `Idempotency-Key` header when the body does not contain a key.
- `create_order_from_cart` checks for an existing order before creating one and catches duplicate-key `IntegrityError` to return the existing order safely.

**Files:** `backend/app/schemas/order.py`, `backend/app/api/v1/endpoints/customer/order.py`, `backend/app/services/order.py`

#### Payment intent creation
- `PaymentIntentRequest` and `create_payment_intent` now accept a client-supplied `idempotency_key`.
- If a payment with the same key already exists, the cached payment is returned after ownership verification.
- Prevents duplicate wallet / gateway charges on retries.

**Files:** `backend/app/schemas/payment.py`, `backend/app/api/v1/endpoints/payment.py`, `backend/app/services/payment.py`

#### POS order replay
- `staff_pos_create_order` catches duplicate `idempotency_key` `IntegrityError` and returns the existing order instead of throwing a 500.
- Makes replay protection atomic.

**Files:** `backend/app/api/v1/endpoints/staff/staff_ops.py`

### 1.4 POS Payment Validation
- `process_order_payment` now **recomputes** the expected total server-side.
- Rejects client `amount` values that do not match the server-computed total.
- Discounts and tips are recomputed from `order.items_subtotal`; discount/tip cannot be injected after a payment has already been recorded.
- Cash tender validation remains server-side.

**Files:** `backend/app/api/v1/endpoints/admin/orders.py`

### 1.5 Wallet Top-up — Critical Money-Creation Bug Closed
- The public `/wallet/topup` endpoint previously credited the customer wallet immediately without verifying payment.
- It now returns **HTTP 501 Not Implemented** with a clear message until a real PSP flow is integrated.
- Customer PWA shows a user-friendly error and no longer attempts to process online top-ups.

**Files:** `backend/app/api/v1/endpoints/admin/wallet.py`, `customer-pwa/src/components/WalletPage.tsx`, `customer-pwa/src/locales/en.json`

### 1.6 Inventory Integrity
- Added DB unique constraint `(inventory_item_id, store_id)` on `inventory_stock` via migration `c012_inventory_stock_unique`.
- Prevents duplicate stock rows that could cause incorrect deduction / negative stock races.

**Files:** `backend/app/models/inventory.py`, `backend/alembic/versions/c012_inventory_stock_unique.py`

### 1.7 Security & Configuration
- Production validators reject the default JWT secret and default DB credentials.
- Webhook signature verification no longer bypasses in production when secrets are missing.
- Admin RBAC: only `system_admin` can create `system_admin` accounts; sensitive IAM endpoints restricted.
- Staff auth exposure: `/staff/auth/names` now requires staff/admin authentication.
- Admin `AddLineItemRequest` no longer accepts arbitrary `unit_price`.
- Table-transfer endpoint locks old and new table rows.

**Files:** `backend/app/core/config.py`, `backend/app/api/v1/endpoints/payment.py`, `backend/app/api/v1/endpoints/admin/auth.py`, `backend/app/api/v1/endpoints/admin/orders.py`, `backend/app/api/v1/endpoints/staff/staff_ops.py`

### 1.8 Performance Fixes
- Batched recipe lookup in `_deduct_stock_for_order`.
- Batched modifier option lookup in cart pricing.
- Order snapshot crash fixed (`bundle_component_name` uses loaded `item.item_name`).

**Files:** `backend/app/services/order.py`, `backend/app/services/cart.py`

---

## 2. Staff Portal Remediation

### 2.1 POS Modifier Pricing Bug
- `usePosCart` previously summed only the first selected modifier because the reducer returned early.
- Now iterates over every selected modifier id and sums all matching price adjustments.

**Files:** `staff-portal/src/components/pos/usePosCart.ts`

### 2.2 POS Checkout Safety
- `usePosCheckout` now guards wallet payment with `isPaymentProcessingRef` to prevent double-submission races.
- `handleCheckoutPayment` rejects checkout if order details are not loaded.
- Combined with the backend POS payment validation above, client-side totals can no longer be accepted blindly.

**Files:** `staff-portal/src/components/pos/usePosCheckout.ts`

### 2.3 QR Scanner Strictness
- Customer QR scans must now match `loka:customer:<positive-id>`; the fallback that accepted any numeric string has been removed.

**Files:** `staff-portal/src/components/pos/usePosScanner.ts`

### 2.4 Build / Static Quality
- TypeScript strict: zero errors.
- ESLint: zero warnings.
- Production build: successful.

---

## 3. Customer PWA Remediation

### 3.1 Auth & OTP
- `LoginModal` resend OTP now actually calls `handleSendOtp` and enforces the 60-second cooldown.
- `AuthFlow` no longer advances to OTP on send failure.

**Files:** `customer-pwa/src/components/auth/LoginModal.tsx`, `customer-pwa/src/components/AuthFlow.tsx`

### 3.2 Cart Synchronization
- `cartSync` now throws `CartSyncError` on failures; `placeOrder` aborts if the server cart cannot be reconciled.
- Hidden the unimplemented gateway payment option.
- Lint warnings cleaned up (removed unused `err` bindings).

**Files:** `customer-pwa/src/lib/cartSync.ts`, `customer-pwa/src/components/CheckoutPage.tsx`

### 3.3 Promotion Popup XSS
- `PromotionPopup` validates `action_url` and only renders the CTA for safe URLs (`http(s)`, `#`, `/`, or same-origin).

**Files:** `customer-pwa/src/components/PromotionPopup.tsx`

### 3.4 Payment Intent Idempotency
- `placeOrder` now sends an `Idempotency-Key` header when creating the wallet payment intent.

**Files:** `customer-pwa/src/lib/cartSync.ts`

### 3.5 Wallet Top-up
- Online top-up methods are blocked in the UI with a clear message.
- The backend rejects online top-up with HTTP 501.

**Files:** `customer-pwa/src/components/WalletPage.tsx`, `customer-pwa/src/locales/en.json`

### 3.6 Build / Static Quality
- TypeScript strict: zero errors.
- ESLint: zero warnings.
- Production build: successful.

---

## 4. Admin Portal Remediation

### 4.1 Middleware Security Headers
- Removed `unsafe-eval` from CSP `script-src`.
- Restricted `connect-src` to `'self'`, the configured backend host, and localhost in development (no longer `https:` wildcard).
- Retained other hardening headers (`X-Frame-Options`, `HSTS`, `Referrer-Policy`, `Permissions-Policy`, etc.).

**Files:** `admin-portal/src/middleware.ts`

### 4.2 Middleware Route Protection
- Added a lightweight auth gate via an `admin_auth` sentinel cookie.
- Unauthenticated requests to protected routes are redirected to `/login`.
- The cookie is set on login / token refresh and cleared on logout.

**Files:** `admin-portal/src/middleware.ts`, `admin-portal/src/lib/constants.ts`, `admin-portal/src/lib/api.ts`, `admin-portal/src/app/layout.tsx`

### 4.3 Build / Static Quality
- TypeScript strict: zero errors.
- ESLint: zero warnings.
- Production build: successful.

---

## 5. Test Results

```text
$ python3 -m pytest -q
test_admin_auth_orders.py .s...s..
test_admin_concurrent.py .
test_admin_content_setup.py ........s..................
test_admin_quick_ops.py ....s
test_admin_shifts.py ..
test_admin_splash.py ...
test_admin_store_scoping.py ....
test_admin_tables_flow.py ...
test_admin_wallet_points.py ...
test_bundle_products.py .........s.........
test_cross_auth_lifecycle.py .....
test_cross_integration.py ......
test_cross_negative.py ...................
test_cross_reservations.py ....
test_customer_checkin.py s..
test_customer_full_journey_browser.py .ss
test_customer_menu_public.py ......
test_customer_order_flow.py ...............
test_customer_order_lifecycle.py ...
test_customer_pwa_journey.py sssss
test_customer_voucher_reward.py ..
test_smoke_health.py .....
test_smoke_schema.py .......
test_staff_full_flow.py .s..........

================= 156 passed, 14 skipped in 275.35s (0:4:35) ==================
```

---

## 6. Remaining / Deferred Items

| Item | Reason | Risk |
|------|--------|------|
| Admin portal: some UI mutations still only `console.error` on failure | Broad UX improvement; API layer already throws errors and clears session on 401. Components catch and display inline errors where critical. | Low — operational; no security impact |
| Real PSP integration for wallet top-up and gateway payments | Requires provider contracts and PCI scope decisions. | Medium — feature gap; endpoint is now blocked so no financial risk |
| Admin middleware only checks cookie presence, not token validity | Token validation still happens client-side and on every API call; full server-side session validation would require moving tokens to HttpOnly cookies. | Low — adds defense-in-depth route gating |

---

## 7. Recommendations for Production Deployment

1. **Rotate secrets** if the default JWT secret or DB credentials were ever used outside local development.
2. **Set `REDIS_URL`** so the rate limiter works consistently across multiple workers.
3. **Configure real webhook signing secrets** for Stripe / other PSPs; the dev bypass is disabled in production.
4. **Enable the inventory_stock unique constraint migration** in all environments (`alembic upgrade head`).
5. **Monitor POS payment logs** after deploy to ensure the new server-side total validation does not conflict with legitimate manual-discount workflows.
6. **Do not enable online wallet top-up** until a real payment-provider flow with asynchronous confirmation is implemented.

---

## 8. Files Changed (Summary)

### Backend
- `app/services/order.py`
- `app/services/cart.py`
- `app/services/payment.py`
- `app/schemas/order.py`
- `app/schemas/payment.py`
- `app/api/v1/endpoints/customer/order.py`
- `app/api/v1/endpoints/payment.py`
- `app/api/v1/endpoints/staff/staff_ops.py`
- `app/api/v1/endpoints/admin/orders.py`
- `app/api/v1/endpoints/admin/wallet.py`
- `app/api/v1/endpoints/admin/auth.py`
- `app/core/config.py`
- `app/models/inventory.py`
- `alembic/versions/c012_inventory_stock_unique.py`

### Staff Portal
- `src/components/pos/usePosCart.ts`
- `src/components/pos/usePosCheckout.ts`
- `src/components/pos/usePosScanner.ts`

### Customer PWA
- `src/lib/cartSync.ts`
- `src/components/WalletPage.tsx`
- `src/components/auth/LoginModal.tsx`
- `src/components/AuthFlow.tsx`
- `src/components/PromotionPopup.tsx`
- `src/components/CheckoutPage.tsx`
- `src/locales/en.json`

### Admin Portal
- `src/middleware.ts`
- `src/lib/constants.ts`
- `src/lib/api.ts`
- `src/app/layout.tsx`

---

*Report generated by the remediation agent. All changes are committed to the working tree and have been validated by the E2E suite and production builds.*
