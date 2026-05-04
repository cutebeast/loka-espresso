# API Audit

> **Last Updated:** 2026-04-26

## Overview

231 REST API endpoints served by FastAPI at `/api/v1`. Endpoints are organized into three groups:

| Group | Directory | Description | Count |
|-------|-----------|-------------|-------|
| Common | `endpoints/common/` | Shared auth, users, stores, orders, payments, loyalty, rewards, vouchers, promos, notifications, tables, uploads, splash, config | ~80 |
| Admin | `endpoints/admin/` | Dashboard, CRUD, reports, staff, feedback, customers, marketing, surveys, content, system | ~120 |
| PWA | `endpoints/pwa/` | Wallet, promos, surveys, content, cart, checkout, loyalty, order tracking, favorites, referral, menu | ~30 |

## Modularity (April 2026)

Monolithic endpoint files were split into focused modules:

- `orders.py` (1,243 lines) → `order_crud.py`, `order_confirm.py`, `order_status.py`, `order_webhooks.py`
- `admin_customers.py` (1,147 lines) → `admin_customer_list.py`, `admin_customer_wallet.py`, `admin_customer_actions.py`
- `admin.py` (887 lines) → `admin_dashboard.py`, `admin_store_management.py`, `admin_menu_management.py`, `admin_table_management.py`, `admin_customizations.py`, `admin_reports_legacy.py`

All original files now serve as thin aggregation modules.

Swagger UI available at `/docs`, ReDoc at `/redoc`.

## April 2026 Remediation

### Fixed

| Issue | Fix | Files |
|-------|-----|-------|
| Cart `customizations` column referenced but being dropped by migration | Removed all code references to `ci.customizations`; cart customization now uses `customization_option_ids` as canonical | `pwa/cart.py`, `schemas/cart.py` |
| `Order.loyalty_discount` referenced but column dropped by migration | Removed from schema, serializer, and remaining reference in order_tracking.py; loyalty_discount marked removed from order_tracking.py | `schemas/order.py`, `order_crud.py`, `order_status.py`, `pwa/order_tracking.py` |
| Cart dedup used stale customizations comparison | Changed to `customization_option_ids` comparison in application layer | `pwa/cart.py`, `stores/cartStore.ts` |
| Checkout token not authoritative in `POST /orders` | Token consumed first; discount applied from token data, not re-validated | `order_crud.py` |
| Wallet top-up/deduct publicly callable | Restricted to `require_hq_access()` | `pwa/wallet.py` |
| `/vouchers/use/{code}` missing `update` import, invalid `is_used` attr | Added import, removed invalid attribute | `common/vouchers.py` |
| Menu dietary filter using MySQL `json_contains` | Changed to PostgreSQL `@>` operator | `pwa/menu.py` |
| Order status machine not order-type aware | Added `VALID_TRANSITIONS_BY_TYPE` per pickup/delivery/dine_in | `order_crud.py`, `order_status.py` |
| Admin viewport `maximumScale: 1` | Removed to restore accessibility | `frontend/src/app/layout.tsx` |
| Admin inline layout bypassing responsive CSS | Replaced inline styles with CSS classes | `frontend/src/app/page.tsx`, `layout.css` |
| Customer PWA bypasses checkout token | `placeOrder` now calls `POST /checkout` for discounts | `lib/cartSync.ts` |
| Cart dedup used stale customizations comparison | Changed to `customization_option_ids` comparison | `stores/cartStore.ts` |
| Hash routing loses params on navigation | `setPage` now preserves params in URL hash | `stores/uiStore.ts` |
| Missing `autoprefixer` dev dependency | Added to both apps | `package.json` |

### Remaining Risks

- Idempotency middleware is in-memory only (multi-worker unsafe under Docker)
- ACL permissions are defined but most admin routes use coarse role checks
- OTP bypass is enabled in Docker compose (`OTP_BYPASS_ALLOWED: "true"`) — disable in production
- No automated test coverage exists; verification is limited to lint/build/import checks

## Session 4 Findings (April 26, 2026)

### Response Format Standardization
- 8 endpoints standardized from legacy keys (`"detail"`, `"deleted"`, `"success"`) to `"message"`
- Affected files: `admin_menu.py`, `admin_customer_actions.py`, `admin_staff.py`, `admin_banners.py`, `admin_broadcasts.py`

### Pagination Inconsistency
- Only 2/17 paginated endpoints use `"items"` key; remainder use resource-specific names (`"stores"`, `"orders"`, `"campaigns"`, etc.)

### Router Prefix Inconsistency  
- 6 files use sub-prefixes (`/admin/vouchers`, `/admin/rewards`, `/admin/marketing`, `/admin/surveys`, `/admin/content`, `/admin/reports`) instead of standard `prefix="/admin"`

### New CRUD Endpoints Added
- DELETE `/payments/methods/{id}` — delete payment method
- DELETE `/splash/{id}` — delete splash content
- DELETE `/users/me` — delete own account
- PUT `/feedback/{id}` — update feedback (add admin reply)  
- DELETE `/feedback/{id}` — delete feedback
- GET `/campaigns/{id}` — get single campaign
- GET `/broadcasts/{id}` — get single broadcast
- DELETE `/vouchers/me/{voucher_id}` — delete own voucher

### Pydantic Validation
- All 8 admin_marketing.py endpoints converted from `req: dict` to Pydantic schemas
