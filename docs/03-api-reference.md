# FNB Super-App — Backend API Reference

> Last updated: 2026-04-18 | Base URL: `https://admin.loyaltysystem.uk/api/v1` | 189+ endpoints
> OpenAPI docs: `https://admin.loyaltysystem.uk/docs`

## Rate Limiting

API rate limiting via slowapi (IP-based):

| Endpoint | Limit |
|----------|-------|
| `POST /auth/send-otp` | 5 requests/minute |
| `POST /auth/register` | 5 requests/minute |
| `POST /auth/login-password` | 10 requests/minute |
| `POST /admin/staff/{id}/clock-in` | 5 PIN attempts/5 minutes (database-backed) |

## Authentication

All authenticated endpoints require `Authorization: Bearer <JWT>` header.

### Auth Endpoints (Public)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login-password` | Login with email+password → `{access_token, refresh_token}` |
| POST | `/auth/register` | Register new customer |
| POST | `/auth/send-otp` | Send OTP to phone |
| POST | `/auth/verify-otp` | Verify OTP code |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Logout (blacklists JWT via JTI) |
| POST | `/auth/device-token` | Register push notification token |
| DELETE | `/auth/device-token` | Unregister push token |

---

## ACL System

### How It Works

Relational access control using integer-based IDs with 6 lookup tables:

| Lookup Table | Purpose |
|-------------|---------|
| `user_types` | 4 tiers: HQ Management (1), Store Management (2), Store (3), Customer (4) |
| `roles` | 7 roles: Admin (1), Brand Owner (2), Manager (3), Asst Manager (4), Staff (5), Customer (6), HQ Staff (7) |
| `role_user_type` | Valid role↔user_type combinations |
| `user_store_access` | Per-user store assignments (Admin/Brand Owner = global, no records needed) |
| `permissions` | 23 granular permissions with resource+action |
| `role_permissions` | 83 role↔permission mappings |

### Access Control Functions

| Function | Who Gets Access | Used For |
|----------|----------------|----------|
| `require_role(RoleIDs.ADMIN)` | Admin only (id=1) | System-level configs, rewards, vouchers |
| `require_hq_access()` | Admin, Brand Owner, HQ Staff | Dashboard, reports, store CRUD |
| `require_store_access()` | HQ roles + users with `user_store_access` record for that store | Menu, tables, inventory CRUD |
| `get_current_user` | Any authenticated user | Customer-facing features |

### Store Access Logic
```
IF user.role_id IN (1, 2) THEN -- Admin/Brand Owner
  allowed_stores = ALL active stores
ELSE
  allowed_stores = SELECT store_id FROM user_store_access WHERE user_id = :uid
```

See `/root/acl-guide.md` for the full ACL specification.

---

## API Endpoints by Module

### Admin Dashboard

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/dashboard` | admin, store_owner | Dashboard KPIs + chart data. Params: `store_id`, `from_date`, `to_date`, `chart_mode` (day/month/quarter/year) |
| GET | `/admin/orders` | admin, store_owner | Paginated order list. Params: `page`, `page_size`, `status`, `store_id`, `search` |
| GET | `/admin/orders` | admin, store_owner | All orders (paginated, filterable by store/status) |
| GET | `/admin/export` | admin, store_owner | Export data as CSV/JSON |

### Store CRUD

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| POST | `/admin/stores` | admin | Create store |
| PUT | `/stores/{store_id}` | require_store_access(manager+) | Update store details |

### Category CRUD (PER-STORE)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/stores/{store_id}/categories` | public | List categories |
| POST | `/admin/stores/{store_id}/categories` | require_store_access | Create category |
| PUT | `/admin/stores/{store_id}/categories/{cat_id}` | require_store_access | Update category |
| DELETE | `/admin/stores/{store_id}/categories/{cat_id}` | require_store_access | Soft-delete category |

### Menu Item CRUD (PER-STORE)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/stores/{store_id}/items` | public | List items |
| GET | `/stores/{store_id}/items/search` | public | Search items |
| GET | `/stores/{store_id}/items/popular` | public | Popular items |
| GET | `/stores/{store_id}/items/{item_id}/customizations` | public | List customization options |
| GET | `/stores/{store_id}/menu` | public | Full menu (categories + items tree) |
| POST | `/admin/stores/{store_id}/items` | require_store_access | Create item |
| PUT | `/admin/stores/{store_id}/items/{item_id}` | require_store_access | Update item |
| DELETE | `/admin/stores/{store_id}/items/{item_id}` | require_store_access | **Soft-delete** |

### Customization Options (PER-ITEM, PER-STORE)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/stores/{store_id}/items/{item_id}/customizations` | require_store_access | List customization options |
| POST | `/admin/stores/{store_id}/items/{item_id}/customizations` | require_store_access | Create customization option |
| PUT | `/admin/stores/{store_id}/customizations/{option_id}` | require_store_access | Update customization option |
| DELETE | `/admin/stores/{store_id}/customizations/{option_id}` | require_store_access | Deactivate customization option |

### Table CRUD (PER-STORE)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/stores/{store_id}/tables` | public | List tables |
| POST | `/admin/stores/{store_id}/tables` | require_store_access | Create table |
| PUT | `/admin/stores/{store_id}/tables/{table_id}` | require_store_access | Update table |
| DELETE | `/admin/stores/{store_id}/tables/{table_id}` | require_store_access | Soft-delete table |
| POST | `/tables/scan` | customer | Scan QR → get table info |
| GET | `/tables/{table_id}` | public | Get table details |
| PATCH | `/admin/stores/{store_id}/tables/{table_id}/occupancy` | require_store_access | Override table occupancy |

### Inventory (PER-STORE)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/stores/{store_id}/inventory` | require_store_access | List inventory |
| POST | `/stores/{store_id}/inventory` | require_store_access | Add inventory item |
| PUT | `/stores/{store_id}/inventory/{item_id}` | require_store_access | Update inventory |
| DELETE | `/stores/{store_id}/inventory/{item_id}` | require_store_access | Delete inventory |
| GET | `/stores/{store_id}/inventory/low-stock` | require_store_access | Low stock alerts |
| GET | `/stores/{store_id}/inventory-ledger` | require_store_access | **Paginated** inventory movement history. Params: `page`, `page_size`, `from_date`, `to_date`, `movement_type` (received/waste/transfer_out/transfer_in/cycle_count/adjustment) |
| POST | `/stores/{store_id}/inventory/{item_id}/adjust` | require_store_access | Record stock adjustment |
| PATCH | `/stores/{store_id}/inventory/{item_id}/toggle` | require_store_access | Toggle inventory item active status |

### Inventory Categories (PER-STORE)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/stores/{store_id}/inventory-categories` | require_store_access | List inventory categories |
| POST | `/stores/{store_id}/inventory-categories` | admin | Create inventory category |
| PUT | `/stores/{store_id}/inventory-categories/{cat_id}` | admin | Update inventory category |
| DELETE | `/stores/{store_id}/inventory-categories/{cat_id}` | admin | Deactivate inventory category |

#### Inventory Ledger Response
```json
{
  "entries": [
    {
      "id": 1,
      "inventory_item_id": 42,
      "inventory_item_name": "Coffee Beans - Brazil Santos",
      "movement_type": "received",
      "quantity": 50,
      "balance_after": 75,
      "note": "Supplier delivery",
      "created_by_name": "John Doe",
      "created_at": "2026-04-18T10:30:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "page_size": 20,
  "total_pages": 8
}
```

### Staff Management (PER-STORE)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/stores/{store_id}/staff` | manager, assistant_manager | List staff at store |
| POST | `/admin/stores/{store_id}/staff` | admin | Create staff member |
| PUT | `/admin/staff/{staff_id}` | admin | Update staff |
| DELETE | `/admin/staff/{staff_id}` | admin | Deactivate staff |
| POST | `/admin/staff/{staff_id}/clock-in` | any (PIN-based) | Clock in (rate-limited) |
| POST | `/admin/staff/{staff_id}/clock-out` | any (PIN-based) | Clock out |
| GET | `/admin/stores/{store_id}/shifts` | manager, assistant_manager | View shifts |

### Order Management

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| POST | `/orders` | customer | Create order from cart |
| GET | `/orders` | customer | List own orders (admin sees all) |
| GET | `/orders/{order_id}` | customer (own), admin, store_owner, staff | Get order details + timeline |
| PATCH | `/orders/{order_id}/status` | admin, store_owner, staff at order's store | Update order status |
| PATCH | `/orders/{order_id}/payment-status` | admin | Update payment status directly (for dine-in flow) |
| POST | `/orders/{order_id}/confirm` | customer (own) | Confirm dine-in order (sends to kitchen) |
| POST | `/orders/{order_id}/apply-voucher` | customer (own) | Apply voucher to pending order |
| POST | `/orders/{order_id}/cancel` | customer (own), admin, store_owner | Cancel order (**rolls back loyalty points**) |
| POST | `/orders/{order_id}/reorder` | customer | Re-add items to cart |
| GET | `/orders/tracking/{order_id}` | any user | Track order status (public tracking) |

**Order Status Flows:**
- **Flow A (Pickup/Delivery)**: `pending` → `paid` → `confirmed` → `preparing` → `ready` → `completed`
- **Flow B (Dine-in)**: `pending` → `confirmed` → `preparing` → `ready` → (payment) → `completed`
- **Delivery adds**: `ready` → `out_for_delivery` → `completed`

### Checkout

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| POST | `/checkout` | customer | Process checkout with payment |
| POST | `/checkout/validate` | customer | Validate checkout before payment |

### Customer Management

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/customers` | admin | List all customers |
| GET | `/admin/customers/{user_id}` | admin | Get customer details |
| GET | `/admin/customers/{user_id}/orders` | admin | Customer's orders |
| GET | `/admin/customers/{user_id}/loyalty-history` | admin | Loyalty history |
| GET | `/admin/customers/{user_id}/wallet-history` | admin | Wallet history |
| POST | `/admin/customers/{user_id}/adjust-points` | admin | Manual points adjustment |
| PUT | `/admin/customers/{user_id}` | admin | Update customer details |

### Reward Management (Admin)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/rewards` | admin | List all rewards (excludes soft-deleted; `?include_deleted=true`) |
| POST | `/admin/rewards` | admin | Create reward |
| PUT | `/admin/rewards/{reward_id}` | admin | Update reward |
| DELETE | `/admin/rewards/{reward_id}` | admin | **Soft-delete** reward |
| GET | `/admin/rewards/{reward_id}/redemptions` | admin | Redemption records |

### PWA Rewards (Customer)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/rewards` | public | Active rewards catalog (sorted by points_cost) |
| GET | `/rewards/{reward_id}` | public | Reward detail page data |
| POST | `/rewards/{reward_id}/redeem` | customer, admin | Redeem reward with points → creates user_reward instance with unique redemption_code |

### Voucher Management (Admin)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/vouchers` | admin | List all vouchers (excludes soft-deleted; `?include_deleted=true`) |
| POST | `/admin/vouchers` | admin | Create voucher |
| PUT | `/admin/vouchers/{voucher_id}` | admin | Update voucher |
| DELETE | `/admin/vouchers/{voucher_id}` | admin | **Soft-delete** voucher |
| GET | `/admin/vouchers/{voucher_id}/usage` | admin | Voucher usage records |

### PWA Vouchers (Customer)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/vouchers/me` | customer, admin | Customer's voucher instances (all statuses) |
| POST | `/vouchers/validate` | any user | Validate a voucher code before checkout (per-instance or catalog code). Accepts `order_total` for discount calculation |
| POST | `/vouchers/use/{code}` | customer, admin, store_owner | Use/consume voucher instance at checkout |

### Survey Management (Admin)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/surveys` | admin | List all surveys |
| GET | `/admin/surveys/{survey_id}` | admin | Get survey detail with questions |
| POST | `/admin/surveys` | admin | Create survey (with questions) |
| PUT | `/admin/surveys/{survey_id}` | admin | Update survey |
| DELETE | `/admin/surveys/{survey_id}` | admin | Delete survey |

### PWA Surveys (Customer)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/surveys/{survey_id}` | public | Get survey detail + questions for PWA display |
| POST | `/surveys/{survey_id}/submit` | customer, admin | Submit answers. Auto-grants voucher if `reward_voucher_id` set. Guards: no duplicate submissions, per-user limit, global limit |

### PWA Promo Banners

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/promos/banners` | public | Active banners (within date range, sorted by position) |
| GET | `/promos/banners/{banner_id}` | public | Banner detail (long_description, terms, linked voucher/survey) |
| GET | `/promos/banners/{banner_id}/status` | any user | Check if customer already claimed this banner's voucher |
| POST | `/promos/banners/{banner_id}/claim` | customer, admin | Claim voucher linked to this banner. Guards: max_uses_per_user, global limit, duplicate check |

### PWA Customer Wallet

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/me/wallet` | customer, admin | **Full wallet** — returns rewards (user_rewards where available), vouchers (user_vouchers where available), cash (wallets.balance), and loyalty_points (loyalty_accounts.points_balance) |

### Barista Scan & Cron

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| POST | `/scan/reward/{code}` | admin, store_owner | Scan reward redemption code → marks `user_rewards.status='used'`. Returns reward name, image, customer_id |
| POST | `/scan/voucher/{code}` | admin, store_owner | Scan voucher instance code → marks `user_vouchers.status='used'`, increments catalog `used_count` |
| POST | `/scan/cron/expire` | admin | Marks all `available` instances past `expires_at` as `expired`. Returns counts expired |

### Loyalty

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/loyalty/balance` | any user | Get points balance + tier + total_points_earned |
| GET | `/loyalty/history` | any user | Points transaction history |
| GET | `/loyalty/tiers` | public | Loyalty tier definitions |
| GET | `/admin/loyalty-tiers` | admin | List tiers (admin) |
| POST | `/admin/loyalty-tiers` | admin | Create tier |
| PUT | `/admin/loyalty-tiers/{tier_id}` | admin | Update tier |

### Wallet & Payments

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/wallet` | any user | Get wallet balance |
| POST | `/wallet/topup` | any user | Top up wallet (stub) |
| GET | `/wallet/transactions` | any user | Wallet transaction history |
| GET | `/payments/methods` | any user | List saved payment methods |
| POST | `/payments/methods` | any user | Add payment method |
| POST | `/payments/create-intent` | any user | Create payment intent (stub) |
| POST | `/payments/confirm` | any user | Confirm payment (stub) |

### Cart

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/cart` | any user | Get current cart |
| POST | `/cart/items` | any user | Add item (**400 if different store**). Accepts `customization_option_ids` |
| PUT | `/cart/items/{item_id}` | any user | Update cart item quantity |
| DELETE | `/cart/items/{item_id}` | any user | Remove from cart |
| DELETE | `/cart` | any user | Clear entire cart |

### Reports

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/reports/revenue` | admin, store_owner | Revenue breakdown |
| GET | `/admin/reports/sales` | admin, store_owner | Sales breakdown |
| GET | `/admin/reports/popular` | admin, store_owner | Popular items report |
| GET | `/admin/reports/loyalty` | admin | Loyalty points stats |
| GET | `/admin/reports/inventory` | admin, store_owner | Inventory report + low stock |
| GET | `/admin/reports/marketing` | admin | Marketing report: loyalty, tier distribution, points flow, redemptions, voucher usage |

### Marketing Campaigns

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/marketing/campaigns` | admin | List campaigns |
| POST | `/admin/marketing/campaigns` | admin | Create campaign |
| PUT | `/admin/marketing/campaigns/{id}` | admin | Update campaign |
| DELETE | `/admin/marketing/campaigns/{id}` | admin | Cancel campaign |

### Feedback

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| POST | `/feedback` | any user | Submit feedback |
| GET | `/admin/feedback` | admin | List all feedback |
| GET | `/admin/feedback/stats` | admin | Aggregated stats (average_rating, total_reviews, rating_distribution). `?store_id=` filter |
| GET | `/admin/feedback/{id}` | admin | Get feedback detail |
| POST | `/admin/feedback/{id}/reply` | admin | Reply to feedback |
| PUT | `/admin/feedback/{id}/reply` | admin | Update reply |

### Notifications

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/notifications` | any user | List own notifications |
| PUT | `/notifications/read-all` | any user | Mark all as read |
| PUT | `/notifications/{id}/read` | any user | Mark one as read |

### System & Config

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/audit-log` | admin | View audit trail |
| GET | `/admin/broadcasts` | admin | List broadcasts |
| POST | `/admin/broadcasts` | admin | Send broadcast |
| PATCH | `/admin/broadcasts/{id}/archive` | admin | Archive broadcast |
| GET | `/admin/banners` | admin | Manage promo banners |
| POST | `/admin/banners` | admin | Create banner (accepts voucher_id, survey_id, action_type) |
| PUT | `/admin/banners/{id}` | admin | Update banner |
| DELETE | `/admin/banners/{id}` | admin | Delete banner |
| GET | `/banners` | public | Active banners (customer app) |
| GET | `/promos` | public | Active promos + vouchers |
| GET | `/splash` | public | Splash screen content |
| PUT | `/splash` | admin, store_owner | Update splash screen |
| GET | `/config` | public | App configuration |
| PUT | `/admin/config` | admin | Update app config |
| POST | `/upload/image` | admin, store_owner | Upload image file (5MB max, JPEG/PNG/WebP/GIF) |
| POST | `/upload/marketing-image` | admin | Upload marketing image |
| POST | `/admin/system/init-hq` | admin | Initialize HQ store (id=0) |
| DELETE | `/admin/system/reset` | admin | Reset all data (preserves ACL) |
| POST | `/admin/system/backfill-inventory-ledger` | admin | Backfill missing ledger entries |

### User Profile

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/users/me` | any user | Get own profile |
| PUT | `/users/me` | any user | Update profile |
| PUT | `/users/me/avatar` | any user | Upload avatar |
| GET | `/users/me/addresses` | any user | List saved addresses |
| POST | `/users/me/addresses` | any user | Add address |
| PUT | `/users/me/addresses/{id}` | any user | Update address |
| DELETE | `/users/me/addresses/{id}` | any user | Delete address |

### Stores (Public)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/stores` | public | List active stores (with location filter) |
| GET | `/stores/{id}` | public | Get store details |
| GET | `/stores/{id}/menu` | public | Full menu tree |
| GET | `/stores/{id}/pickup-slots` | public | Available pickup time slots |

### Social

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/referral/code` | any user | Get my referral code |
| POST | `/referral/apply` | any user | Apply referral code (**≤7 days after account creation, one-time only**) |
| GET | `/favorites` | any user | List my favorites |
| POST | `/favorites/{item_id}` | any user | Add to favorites |
| DELETE | `/favorites/{item_id}` | any user | Remove from favorites |

---

## Common Request/Response Patterns

### Authentication
```json
// POST /auth/login-password
{ "email": "admin@loyaltysystem.uk", "password": "admin123" }

// Response
{ "access_token": "eyJ...", "refresh_token": "eyJ...", "token_type": "bearer" }
```

### Reward Redemption
```json
// POST /rewards/1/redeem (auth required)
// Response:
{
  "success": true,
  "message": "Reward redeemed! Code: RWD-1-A3F2B1",
  "user_reward_id": 6,
  "redemption_code": "RWD-1-A3F2B1",
  "expires_at": "2026-05-14T14:23:06Z",
  "remaining_points": 670
}
```

### Barista Scan
```json
// POST /scan/reward/RWD-1-A3F2B1 (admin/store_owner auth)
// Response:
{
  "success": true,
  "message": "Reward redeemed: Free Cappuccino",
  "reward_name": "Free Cappuccino",
  "reward_image_url": "/images/rewards/free-cappuccino.jpg",
  "customer_id": 3,
  "redeemed_at": "2026-04-14T14:23:06Z"
}
```

### Voucher Validation
```json
// POST /vouchers/validate (auth required)
{ "code": "WELCOME10-A3F2B1", "order_total": 50 }

// Response:
{ "valid": true, "discount_type": "percent", "discount_value": 10.0, "discount": 5.0, "min_spend": 20.0 }
```

### Full Wallet
```json
// GET /me/wallet (customer auth required)
{
  "rewards": [
    { "id": 6, "reward_id": 1, "reward_name": "Free Cappuccino", "redemption_code": "RWD-1-A3F2B1", "status": "available", "expires_at": "2026-05-14T..." }
  ],
  "vouchers": [
    { "id": 7, "voucher_id": 3, "code": "VCH-7-28a259", "discount_type": "free_item", "discount_value": 8.9, "status": "available", "expires_at": "2026-05-03T..." }
  ],
  "cash": { "balance": 120.5, "currency": "MYR" },
  "loyalty_points": 670
}
```

### Survey Submit
```json
// POST /surveys/1/submit (customer auth required)
{ "answers": [{"question_id": 1, "answer_text": "5"}, {"question_id": 2, "answer_text": "Great!"}] }

// Response:
{ "success": true, "message": "Survey submitted successfully! Voucher granted!", "response_id": 1, "voucher_granted": true, "voucher_code": "WELCOME10-A3F2B1", "voucher_title": "First Order Discount" }
```

### Pagination
```json
// Request: ?page=1&page_size=20
// Response:
{ "orders": [...], "total": 21, "page": 1, "page_size": 20 }
```

### Store-Scoped Access Error
```json
// 403 Forbidden
{ "detail": "No staff record found for this store" }
{ "detail": "Staff role 'barista' not authorized for this action" }
```

### Token Revocation
```json
// 401 Unauthorized (after logout)
{ "detail": "Token has been revoked" }
```

---

## Security Features

- **JWT Token Blacklist**: Tokens include a `jti` claim. On logout, the JTI is stored in `token_blacklist` table. Every request checks if the token's JTI is blacklisted.
- **API Rate Limiting**: slowapi on auth endpoints — send-otp 5/min, register 5/min, login 10/min.
- **PIN Rate Limiting**: Staff clock-in PIN attempts are rate-limited to 5 per 5 minutes per staff member (database-backed).
- **Soft Deletes**: Menu items, vouchers, and rewards use `deleted_at` timestamp. GET endpoints filter by default.
- **File Upload Validation**: 5MB max size, JPEG/PNG/WebP/GIF MIME types only.
- **Order Cancellation Rollback**: Cancelling an order reverses loyalty points.
- **Cross-Store Cart Guard**: Adding items from a different store returns 400.
- **Referral Code Expiry**: Only within 7 days of account creation.
- **Repeat Customer Protection**: Duplicate voucher claims, survey submissions, and reward redemptions are all guarded.
- **Audit Log Hooks**: All critical admin actions are logged to `audit_log`.
- **Token Blacklist Auto-Cleanup**: Background task purges expired rows every 24 hours.
