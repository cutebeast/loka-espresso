# Customer PWA Gap Analysis — v3 vs Backend Reality

> Date: 2026-05-17 | Status: Port fixed ✅ | Next: Build missing public APIs

---

## 1. Infrastructure Fix (DONE)

| Issue | Before | After |
|-------|--------|-------|
| Port collision | `customer-pwa-v3` on 13830 (same as `admin-portal-v3`) → 3,149 crash restarts | Now on **13840**, stable, 0 restarts |

All services:
| Service | Port | Status |
|---------|------|--------|
| v3 Backend | 13800 | ✅ online |
| Staff Portal | 13820 | ✅ online |
| Admin Portal | 13810 | ✅ online |
| Customer PWA | **13840** | ✅ online (was 13830) |

---

## 2. Backend Content Architecture (Key Context)

The old unified `content_blocks` table was **intentionally broken down** into separate tables:

| Table | Admin Prefix | Public Prefix | Status |
|-------|-------------|---------------|--------|
| `information_cards` | `/admin/content/info-cards` | **NONE** | 🔴 Missing |
| `product_cards` | `/admin/content/product-cards` | **NONE** | 🔴 Missing |
| `event_cards` | `/admin/content/event-cards` | **NONE** | 🔴 Missing |
| `promo_banners` | `/admin/banners` | **NONE** | 🔴 Missing |
| `system_pages` | `/admin/system-pages` | **NONE** | 🔴 Missing |
| `content_sections` | `/admin/content-sections` | **NONE** | 🔴 Missing |
| `splash_screens` | `/admin/content/splash-screens` | **NONE** | 🔴 Missing |

**Result:** The PWA calls `/promos/banners`, `/content/information`, `/content/legal/*` — all of these map to `/content/blocks` in `api.ts`, but **no such endpoint exists**. The content pages (Home carousel, Promotions, Information, Legal, Splash) are all empty.

---

## 3. Complete API Gap Matrix

### 3.1 Working (Backend exists, PWA calls reach it)

| PWA Call | Maps To | Backend | Auth |
|----------|---------|---------|------|
| `POST /auth/register` | `/auth/register` | `endpoints/auth.py` | Public |
| `POST /auth/login` | `/auth/login` | `endpoints/auth.py` | Public |
| `POST /auth/refresh` | `/auth/refresh` | `endpoints/auth.py` | Public |
| `GET /stores` | `/stores` | `public/store.py` | Public |
| `GET /menu/stores/{id}` | `/menu/stores/{id}` | `public/menu.py` | Public |
| `GET /menu/items/{id}` | `/menu/items/{id}` | `public/menu.py` | Public |
| `GET /me` | `/me` | `customer/profile.py` | Customer |
| `GET /me/addresses` | `/me/addresses` | `customer/profile.py` | Customer |
| `POST /me/addresses` | `/me/addresses` | `customer/profile.py` | Customer |
| `PATCH /me/addresses/{id}` | `/me/addresses/{id}` | `customer/profile.py` | Customer |
| `DELETE /me/addresses/{id}` | `/me/addresses/{id}` | `customer/profile.py` | Customer |
| `GET /cart` | `/cart` | `customer/cart.py` | Customer |
| `GET /cart/items` | `/cart/items` | `customer/cart.py` | Customer |
| `POST /cart/items` | `/cart/items` | `customer/cart.py` | Customer |
| `PATCH /cart/items/{id}` | `/cart/items/{line_item_id}` | `customer/cart.py` | Customer |
| `DELETE /cart/items/{id}` | `/cart/items/{line_item_id}` | `customer/cart.py` | Customer |
| `POST /orders` | `/orders` | `customer/order.py` | Customer |
| `GET /orders` | `/orders` | `customer/order.py` | Customer |
| `GET /orders/{id}` | `/orders/{id}` | `customer/order.py` | Customer |
| `POST /payments/intent` | `/payments/intent` | `payment.py` | Customer |
| `POST /payments/{id}/confirm` | `/payments/{id}/confirm` | `payment.py` | Customer |
| `POST /payments/{id}/cancel` | `/payments/{id}/cancel` | `payment.py` | Customer |
| `GET /wallet/me` | `/wallet/me` | `admin/wallet.py` public_router | Customer |
| `GET /wallet/ledger/me` | `/wallet/ledger/me` | `admin/wallet.py` public_router | Customer |
| `POST /wallet/topup` | `/wallet/topup` | `admin/wallet.py` public_router | Customer |
| `GET /loyalty/me` | `/loyalty/me` | `admin/loyalty.py` public_loyalty_router | Customer |
| `GET /loyalty/ledger/me` | `/loyalty/ledger/me` | `admin/loyalty.py` public_loyalty_router | Customer |
| `GET /vouchers/me` | `/vouchers/me` | `admin/vouchers.py` public_router | Customer |
| `POST /vouchers/apply` | `/vouchers/apply` | `admin/vouchers.py` public_router | Customer |
| `GET /rewards/catalog` | `/rewards/catalog` | `admin/rewards.py` public_router | Public |
| `GET /rewards/me` | `/rewards/me` | `admin/rewards.py` public_router | Customer |
| `POST /rewards/{id}/redeem` | `/rewards/{id}/redeem` | `admin/rewards.py` public_router | Customer |
| `GET /notifications/me` | `/notifications/me` | `admin/notifications.py` public_router | Customer |
| `PATCH /notifications/me/{id}/read` | `/notifications/me/{id}/read` | `admin/notifications.py` public_router | Customer |
| `GET/PUT /notifications/preferences/me` | `/notifications/preferences/me` | `admin/notifications.py` public_router | Customer |
| `GET /referrals/me` | `/referrals/me` | `admin/referrals.py` public_router | Customer |
| `POST /referrals` | `/referrals` | `admin/referrals.py` public_router | Customer |
| `GET /reservations` | `/reservations` | `admin/reservations.py` public_reservations_router | Customer |
| `POST /reservations` | `/reservations` | `admin/reservations.py` public_reservations_router | Customer |
| `GET /reservations/{id}` | `/reservations/{id}` | `admin/reservations.py` public_reservations_router | Customer |
| `DELETE /reservations/{id}` | `/reservations/{id}` | `admin/reservations.py` public_reservations_router | Customer |
| `GET /surveys` | `/surveys` | `admin/surveys.py` public_router | Public |
| `GET /surveys/{id}` | `/surveys/{id}` | `admin/surveys.py` public_router | Public |
| `POST /surveys/{id}/responses` | `/surveys/{id}/responses` | `admin/surveys.py` public_router | Customer |
| `POST /devices` | `/devices` | `admin/devices.py` public_router | Customer |
| `DELETE /devices/{id}` | `/devices/{id}` | `admin/devices.py` public_router | Customer |
| `GET /consents` | `/consents` | `admin/consents.py` public_router | Customer |
| `POST /consents` | `/consents` | `admin/consents.py` public_router | Customer |

### 3.2 Broken / Missing (Need Backend Work)

| PWA Call | Current Map | Problem | Priority |
|----------|-------------|---------|----------|
| `GET /promos/banners` | `/content/blocks` | **No public endpoint** for promo_banners table. Home carousel + Promotions page empty. | **HIGH** |
| `GET /promos/banners/{id}/status` | `/content/blocks/{id}` | **No endpoint**. Banner interaction tracking broken. | **HIGH** |
| `POST /promos/banners/{id}/claim` | `/vouchers/apply` | Maps to voucher apply, but claim flow expects banner context. Works but wrong semantics. | Medium |
| `GET /content/information?...` | `/content/blocks?...` | **No public endpoint** for information_cards table. Information page empty. | **HIGH** |
| `GET /content/information/{slug}` | `/content/blocks/{slug}` | **No endpoint**. Info detail page empty. | **HIGH** |
| `GET /content/legal/{key}` | `/content/blocks` | **No endpoint** for system_pages table. Legal page empty. | **HIGH** |
| `GET /content/version` | `/stores` | Returns stores, not version. Useless version check. | Low |
| `GET /config/bootstrap` | `/stores` | Returns stores, not config. App falls back to hardcoded defaults. | Low |
| `POST /tables/scan` | `/stores` | **No table scan endpoint**. Dine-in QR flow completely broken. | **HIGH** |
| `POST /orders/{id}/cancel` | unmapped | **404**. No customer order cancellation endpoint. | **HIGH** |
| `POST /orders/{id}/reorder` | `/orders` | Creates empty order, doesn't rebuild cart from history. | Medium |
| `GET /payments/methods` | `/payments` | Backend `/payments` is admin-only list. No customer payment methods endpoint. | Medium |
| `PUT /payments/methods/{id}/default` | unmapped | **404**. No payment method default endpoint. | Low |
| `POST /feedback` | `/surveys` | Maps to surveys! PWA posts feedback to survey endpoint. **Wrong target.** | Medium |
| `PUT /users/me` | `/me` | Backend uses `PATCH`, not `PUT`. Method mismatch → 405. | **HIGH** |
| `PUT /users/me/avatar` | `/me` | Backend has no avatar upload on customer profile. | Medium |
| `PUT /users/me/addresses/{id}` | `/me/addresses/{id}` | Backend uses `PATCH`, not `PUT`. Method mismatch → 405. | **HIGH** |
| `GET /menu/items` | `/menu/stores/{store_id}` | Works but ignores item-specific query. OK fallback. | Low |
| `GET /menu/categories` | `/menu/stores/{store_id}` | Works but no dedicated category endpoint. OK fallback. | Low |
| `GET /menu/items/{id}/customizations` | unmapped | No customization endpoint. Falls back to local menu state. | Low |
| `GET /splash` | unmapped | **No endpoint** for splash_screens table. Splash uses hardcoded content. | Low |

---

## 4. What Needs to Be Built

### 4.1 Public Content Router (HIGH)

Create a new `endpoints/public/content.py` with a `public_router` that serves the separated content tables:

```
GET  /promos/banners              → list active PromoBanner (ordered by position)
GET  /promos/banners/{id}         → single PromoBanner detail
GET  /promos/banners/{id}/status  → customer's interaction status with banner (auth optional)
GET  /content/information         → list InformationCard (filter by content_type, is_active)
GET  /content/information/{slug}  → single InformationCard by slug
GET  /content/products            → list ProductCard (is_active, ordered by position)
GET  /content/products/{slug}     → single ProductCard by slug
GET  /content/events              → list EventCard (is_active, future events first)
GET  /content/events/{slug}       → single EventCard by slug
GET  /content/legal/{page_key}    → single SystemPage by page_key (terms, privacy, about)
GET  /splash                      → active SplashScreen (if any within date range)
GET  /config/bootstrap            → return app config (currency, fees, loyalty settings, tiers)
```

Also update `router.py` to mount this public router.

### 4.2 Table Scan Endpoint (HIGH)

Create `POST /tables/scan` in a new or existing public router:
- Accept `{ store_slug, table_id, qr_token }`
- Validate `qr_code_token` against `DiningTable.qr_code_token`
- Check table `is_active=True`
- Return `{ store_id, store_name, store_slug, table_id, table_number, capacity }`
- Update `TableStatusSnapshot` if needed

### 4.3 Order Cancel Endpoint (HIGH)

Add to `customer/order.py`:
- `POST /orders/{order_id}/cancel` — customer-initiated cancellation
- Only allow if order status is `pending` or `initiated`
- Create status log entry
- Release table if dine-in

### 4.4 Method Fixes (HIGH)

The PWA uses PUT but backend expects PATCH for:
- `PUT /users/me` → should be `PATCH /me`
- `PUT /users/me/addresses/{id}` → should be `PATCH /me/addresses/{id}`

**Fix options:**
A. Update PWA to use PATCH (frontend change)
B. Add PUT aliases in backend (backend change)
C. Add method override in api.ts mapping layer (quick fix)

### 4.5 Feedback Endpoint (Medium)

Create public router for feedback:
- `POST /feedback` — submit customer feedback (auth optional, store_id required)

Currently the PWA posts to `/feedback` which maps to `/surveys` — this is wrong.

### 4.6 Payment Methods (Medium)

Create customer payment methods endpoints:
- `GET /payments/methods` — list customer's saved methods
- `PUT /payments/methods/{id}/default` — set default method

### 4.7 Reorder Endpoint (Medium)

Fix `POST /orders/{id}/reorder` to actually:
- Fetch order items + customizations
- Add them to cart
- Return the populated cart

---

## 5. PWA Frontend Issues (Separate from Backend)

| Issue | Location | Fix |
|-------|----------|-----|
| `PUT /users/me` should be `PATCH` | `AccountDetailsPage.tsx:51` | Change to `api.patch` |
| `PUT /users/me/addresses/{id}` should be `PATCH` | `SavedAddressesPage.tsx` | Change to `api.patch` |
| `POST /feedback` maps to `/surveys` | `api.ts:79` | Fix map to `/feedback` after backend endpoint exists |
| `/content/blocks` response mapper | `api.ts:422` | Update to handle new separated content shapes |

---

## 6. Auth Reality

- **Backend has no `/auth/send-otp` or `/auth/verify-otp`**
- **PWA `LoginModal.tsx` ignores OTP code** and calls `/auth/login` with phone only
- This is documented as "dev bypass" — works for now but needs real OTP for production
- **Not a blocker for PWA MVP** — can be Phase 2

---

## 7. Recommended Build Order

### Sprint 1: Core Public APIs (2-3 days)
1. **Public content router** — banners, information, products, events, legal, splash, bootstrap
2. **Table scan endpoint** — `POST /tables/scan`
3. **Order cancel endpoint** — `POST /orders/{id}/cancel`

### Sprint 2: PWA Integration Fixes (1-2 days)
4. Fix PUT→PATCH in PWA (profile, addresses)
5. Fix `/feedback` mapping in `api.ts`
6. Update content response mapper for new separated shapes
7. End-to-end test all content pages

### Sprint 3: Polish (1-2 days)
8. Build `POST /feedback` public endpoint
9. Build payment methods endpoints
10. Fix reorder flow
11. Full PWA smoke test against all 26 pages

### Phase 2 (Future)
- Real OTP SMS integration
- Payment gateway (Stripe/GrabPay)
- Favorites feature
- Delivery/POS webhook integrations
