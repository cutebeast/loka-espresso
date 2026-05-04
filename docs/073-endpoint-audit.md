# Endpoint Audit — 2026-05-04 (Final, Corrected)

**Result:** 161 routes registered. 110 live. ~55 dead (verified by cross-referencing every frontend API call). 0 auth gaps. 0 duplicate routes.

> ⚠️ Previous version had 9 false positives — customization CRUD, upload variants, and scan endpoints were incorrectly marked dead. Corrected below.

---

## Live Endpoint Verification (137 tested)

| Category | Count | Result |
|----------|-------|--------|
| Public (no auth) | 43 | All 200/4xx |
| Customer Auth | 38 | All 200/4xx |
| Admin via Customer (RBAC) | 28 | All 403 |
| Admin via Admin | 23 | All 200 |
| Critical Changed | 4 | Verified |
| **Total** | **137** | **0 failures** |

---

## Dead Endpoints (~55 — registered but never called)

### Admin (31)

| Method | Path | Reason |
|--------|------|--------|
| 5× | `/admin/marketing/campaigns` (CRUD) | No campaign UI |
| DELETE | `/admin/customizations/{id}` | No delete UI |
| GET | `/admin/broadcasts/{id}` | List suffices |
| POST | `/admin/broadcasts/{id}/send` | No send button |
| POST | `/admin/feedback` | PWA submits via `/feedback` |
| PUT | `/admin/feedback/{id}` | No edit UI |
| DELETE | `/admin/feedback/{id}` | No delete UI |
| GET | `/admin/feedback/{id}` | List suffices |
| GET | `/admin/vouchers/{id}/usage` | No usage UI |
| GET | `/admin/rewards/{id}/redemptions` | No redemption UI |
| GET | `/admin/stores/{id}/inventory/low-stock` | No low-stock UI |
| POST | `/admin/system/backfill-inventory-ledger` | CLI only |
| GET | `/admin/otps` | No OTP lookup |
| GET | `/admin/users/{id}` | Uses `/admin/customers/{id}` |
| DELETE | `/admin/system/reset` | No reset button |
| POST | `/admin/system/init-hq` | Seed script |
| GET | `/admin/reports/loyalty` | No loyalty tab |
| GET | `/admin/reports/inventory` | No inventory tab |
| GET | `/admin/reports/csv` | No CSV button |
| GET | `/admin/reports/sales` | Uses `/admin/reports/revenue` |
| GET | `/admin/reports/popular` | No popular tab |
| GET | `/admin/export` | No export button |
| PATCH | `/admin/stores/{id}/tables/{id}/occupancy` | No occupancy UI |
| POST | `/admin/staff/{id}/clock-in` | No clock-in UI |
| POST | `/admin/staff/{id}/clock-out` | No clock-out UI |
| GET | `/admin/stores/{id}/shifts` | No shifts UI |
| GET | `/admin/pwa/version` | PWA uses `/content/version` |

### PWA / Common (23)

| Method | Path | Reason |
|--------|------|--------|
| GET | `/promos` | Uses `/promos/banners` |
| GET | `/menu/items/search` | PWA filters client-side |
| GET | `/menu/items/popular` | Uses `featured=true` param |
| GET | `/menu/stores` | Uses `/content/stores` |
| GET | `/content/notifications` | Uses `/notifications` |
| POST | `/vouchers/apply` | Via `/checkout` |
| POST | `/vouchers/use/{code}` | Uses `/admin/customers/{id}/use-voucher/{uv_id}` |
| DELETE | `/vouchers/me/{id}` | No discard UI |
| 3× | `/favorites` (CRUD) | No favorites feature |
| GET | `/order-tracking/{id}/track` | Uses `/orders/{id}` |
| DELETE | `/users/me` | No self-delete |
| GET | `/loyalty/tiers` | Admin uses `/admin/loyalty-tiers` |
| GET | `/tables/{table_id}` | QR via `/tables/scan` |
| POST | `/tables/{table_id}/release` | No release UI |
| 3× | `/splash` (GET/PUT/DELETE) | Static PWA page |
| POST | `/wallet/deduct` | No deduct UI |
| POST | `/referral/apply` | PWA shows stats only |
| POST | `/orders/{id}/apply-voucher` | Via `/checkout` |
| POST | `/admin/scan/cron/expire` | Cron job (intentional) |

### Upload Dead (1)

| Method | Path | Reason |
|--------|------|--------|
| GET | `/upload/files/{path}` | Caddy serves `/uploads/` |

### External Webhooks (4 — intentional)

| Method | Path |
|--------|------|
| POST | `/orders/{id}/delivery-webhook` |
| POST | `/orders/{id}/pos-webhook` |
| POST | `/wallet/webhook/pg-payment` |
| POST | `/wallet/webhook/order-payment` |

---

## False Positives Corrected (9 — these ARE live)

| Method | Path | Caller |
|--------|------|--------|
| GET | `/admin/items/{id}/customizations` | `CustomizationManager.tsx:22` |
| POST | `/admin/items/{id}/customizations` | `AddCustomizationModal.tsx:18` |
| PUT | `/admin/customizations/{id}` | `CustomizationManager.tsx:30` |
| POST | `/upload/products-image` | `InformationPage.tsx:622` |
| POST | `/upload/events-image` | `InformationPage.tsx:664` |
| POST | `/upload/marketing-image` | `AddRewardModal.tsx:25` |
| POST | `/admin/scan/customer` | `QRScanner.tsx:54` |
| POST | `/admin/scan/reward/{code}` | `QRScanner.tsx:79` |
| POST | `/admin/scan/voucher/{code}` | `QRScanner.tsx:103` |

---

## Fixed Issues (this session)

| Issue | Before | After | File |
|-------|--------|-------|------|
| `POST /favorites/{id}` | 500 FK violation | 404 | `favorites.py:39` |
| `GET /admin/stores/{id}/tables` | 200 leak (customer) | 403 | `admin_stores.py:129` |
| `GET /admin/pwa/version` | 500 crash | 200 | `admin_pwa_mgmt.py:127` |

## Deleted Endpoints (this session)

| Method | Path | File | Reason |
|--------|------|------|--------|
| GET | `/admin/stores/{id}` | `admin_stores.py` | Dead: unused single store detail |
| GET | `/admin/stores/{id}/menu` | `admin_stores.py` | Dead: PWA uses `/menu/*` |
| GET | `/admin/stores/{id}/pickup-slots` | `admin_stores.py` | Dead: no caller |

---

## Security Summary

- All 70 admin routes: protected with `get_current_user` / `require_hq_access` / `require_store_access`
- No unauthenticated admin endpoints remain
- Token prop-drilling: eliminated from all 18+ pages
- JWT: `issuer`/`audience` validated on all decode paths (session, blacklist, get_current_user)
- Webhooks: require `WEBHOOK_API_KEY` + `WEBHOOK_SIGNING_SECRET`

## Test Results

- Backend: 17 passed, 1 skipped (DB-dependent schema import test)
- Admin TypeScript: 0 errors
- PWA TypeScript: 0 errors
- Admin production build: Successful (19.1s)
