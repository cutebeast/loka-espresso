# Endpoint Audit — 2026-05-04 (Final)

**Result:** 161 routes registered. 137 live endpoints tested — 0 failures. ~44 dead endpoints identified. 0 auth gaps. 0 duplicate routes.

---

## Live Endpoint Verification

| Category | Tested | Result |
|----------|--------|--------|
| Public (no auth) | 43 | All 200/4xx |
| Customer Auth | 38 | All 200/4xx |
| Admin via Customer (RBAC) | 28 | All 403 (correctly denied) |
| Admin via Admin | 23 | All 200 |
| Critical Changed | 4 | Verified |
| **Total** | **137** | **0 failures** |

---

## Dead Endpoints (44 — registered but never called by either frontend)

### Admin-only (never called)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/admin/marketing/campaigns` | No campaign UI |
| GET | `/admin/marketing/campaigns` | No campaign UI |
| GET | `/admin/marketing/campaigns/{id}` | No campaign UI |
| PUT | `/admin/marketing/campaigns/{id}` | No campaign UI |
| DELETE | `/admin/marketing/campaigns/{id}` | No campaign UI |
| GET | `/admin/items/{id}/customizations` | CustomizationManager unused |
| POST | `/admin/items/{id}/customizations` | CustomizationManager unused |
| PUT | `/admin/customizations/{id}` | CustomizationManager unused |
| DELETE | `/admin/customizations/{id}` | CustomizationManager unused |
| GET | `/admin/broadcasts/{id}` | List endpoint suffices |
| POST | `/admin/broadcasts/{id}/send` | No send button |
| POST | `/admin/feedback` | PWA uses `/feedback` |
| PUT | `/admin/feedback/{id}` | No edit UI |
| DELETE | `/admin/feedback/{id}` | No delete UI |
| GET | `/admin/feedback/{id}` | List endpoint suffices |
| GET | `/admin/vouchers/{id}/usage` | No usage detail UI |
| GET | `/admin/rewards/{id}/redemptions` | No redemption detail UI |
| GET | `/admin/stores/{id}/inventory/low-stock` | No low-stock UI |
| POST | `/admin/system/backfill-inventory-ledger` | CLI-only |
| GET | `/admin/otps` | No OTP lookup UI |
| GET | `/admin/users/{id}` | Uses `/admin/customers/{id}` |
| DELETE | `/admin/system/reset` | No reset button |
| POST | `/admin/system/init-hq` | Seed script only |
| GET | `/admin/reports/loyalty` | No loyalty report tab |
| GET | `/admin/reports/inventory` | No inventory report tab |
| GET | `/admin/reports/csv` | No CSV export button |
| GET | `/admin/reports/sales` | Uses `/admin/reports/revenue` |
| GET | `/admin/reports/popular` | No popular items tab |
| GET | `/admin/export` | No export button |
| PATCH | `/admin/stores/{id}/tables/{id}/occupancy` | No occupancy UI |
| POST | `/admin/staff/{id}/clock-in` | No clock-in UI |
| POST | `/admin/staff/{id}/clock-out` | No clock-out UI |
| GET | `/admin/stores/{id}/shifts` | No shifts UI |

### PWA / Common (never called)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/promos` | PWA uses `/promos/banners` |
| GET | `/menu/items/search` | PWA filters client-side |
| GET | `/menu/items/popular` | PWA uses `featured` param |
| GET | `/menu/stores` | PWA uses `/content/stores` |
| GET | `/content/notifications` | PWA uses `/notifications` |
| POST | `/vouchers/apply` | PWA uses `/checkout` |
| POST | `/vouchers/use/{code}` | Admin uses `/admin/customers/{id}/use-voucher/{uv_id}` |
| DELETE | `/vouchers/me/{id}` | No discard voucher UI |
| GET | `/favorites` | No favorites UI |
| POST | `/favorites/{id}` | No favorites UI |
| DELETE | `/favorites/{id}` | No favorites UI |
| GET | `/order-tracking/{id}/track` | PWA uses `/orders/{id}` |
| DELETE | `/users/me` | No self-delete UI |
| GET | `/loyalty/tiers` | Admin uses `/admin/loyalty-tiers` |

### External-only (webhooks — intentional, keep)

| Method | Path |
|--------|------|
| POST | `/orders/{id}/delivery-webhook` |
| POST | `/orders/{id}/pos-webhook` |
| POST | `/wallet/webhook/pg-payment` |
| POST | `/wallet/webhook/order-payment` |

### Upload endpoints (some dead)

| Method | Path | Status |
|--------|------|--------|
| POST | `/upload/products-image` | Dead — no caller |
| POST | `/upload/events-image` | Dead — no caller |
| POST | `/upload/marketing-image` | Dead — replaced by `/upload/store-image` |
| GET | `/upload/files/{path}` | Dead — Caddy serves `/uploads/` directly |

---

## Fixed Issues (this session)

| Issue | Before | After |
|-------|--------|-------|
| `POST /favorites/{id}` | 500 FK violation | 404 "Menu item not found" |
| `GET /admin/stores/{id}/tables` | 200 leak (customer) | 403 denied |
| `GET /admin/pwa/version` | 500 crash | 200 with warning |

## Deleted Endpoints (this session)

| Method | Path | Reason |
|--------|------|--------|
| GET | `/admin/stores/{id}` | Dead — unused single store detail |
| GET | `/admin/stores/{id}/menu` | Dead — PWA uses `/menu/*` |
| GET | `/admin/stores/{id}/pickup-slots` | Dead — no caller |

---

## Security Posture

- **Admin routes**: All 70 protected with `get_current_user` / `require_hq_access` / `require_store_access`
- **No unauthenticated admin endpoints** remain
- **Token prop-drilling**: Eliminated from all 18+ admin pages
- **Auth flows**: httpOnly cookies via `credentials: 'include'`
- **JWT**: issuer/audience validated on all decode paths

## Tests

- Backend: 17 passed, 1 skipped (DB-dependent schema import)
- Admin TypeScript: 0 errors
- PWA TypeScript: 0 errors
- Admin production build: Successful (19.1s)
