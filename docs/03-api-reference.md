# FNB Super-App — Backend API Reference

> Last updated: 2026-04-13 | Base URL: `https://admin.loyaltysystem.uk/api/v1` | 112 endpoints
> OpenAPI docs: `https://admin.loyaltysystem.uk/docs`

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

The system uses a two-tier access control:

1. **UserRole** (on `users` table): `admin`, `store_owner`, `customer`
2. **StaffRole** (on `staff` table): `manager`, `assistant_manager`, `barista`, `cashier`, `delivery`

### Access Control Patterns

| Pattern | Who Gets Access | Implementation |
|---------|----------------|----------------|
| `require_role("admin")` | Admin only | System-level configs |
| `require_role("admin", "store_owner")` | Admin + store owners | Dashboard, reports |
| `require_store_access("store_id")` | Admin, store_owner, manager, assistant_manager at that store | Menu, tables, inventory CRUD |
| `require_store_access("store_id", allowed_staff_roles={"manager"})` | Admin, store_owner, manager only | Store settings, staff management |
| `require_store_access("store_id", allowed_staff_roles=ALL_STAFF_ROLES)` | Admin, store_owner, ALL staff roles | Order status updates |
| `get_current_user` | Any authenticated user | Customer-facing features |

### Multi-Store Manager Support

A single user can manage multiple stores by having multiple staff records:
```
staff: user_id=7, store_id=1, role=manager  ← Store 1 access
staff: user_id=7, store_id=2, role=manager  ← Store 2 access
```
The `require_store_access` dependency checks for a matching staff record at the **specific** store in the URL path. No cross-store leakage.

### Staff ↔ User Link

- Staff with `user_id = NULL`: PIN-only access (clock in/out), no dashboard login
- Staff with `user_id` set: Can log in to merchant dashboard with their user account email/password
- Creating a staff member with dashboard access requires: (1) creating a user account, (2) creating a staff record linking to that user

---

## API Endpoints by Module

### Admin Dashboard

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/dashboard` | admin, store_owner | Stats: total_orders, revenue, customers, orders_by_type |
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
| GET | `/stores/{store_id}/menu` | public | Full menu (categories + items tree) |
| POST | `/admin/stores/{store_id}/items` | require_store_access | Create item |
| PUT | `/admin/stores/{store_id}/items/{item_id}` | require_store_access | Update item |
| DELETE | `/admin/stores/{store_id}/items/{item_id}` | require_store_access | **Soft-delete** (sets deleted_at + is_available=false) |

### Customization Options (PER-ITEM, PER-STORE)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/stores/{store_id}/items/{item_id}/customizations` | require_store_access | List customization options for a menu item |
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
| PATCH | `/admin/stores/{store_id}/tables/{table_id}/occupancy` | require_store_access | **Override** table occupancy (is_occupied) |

### Inventory (PER-STORE)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/stores/{store_id}/inventory` | require_store_access | List inventory |
| POST | `/stores/{store_id}/inventory` | require_store_access | Add inventory item |
| PUT | `/stores/{store_id}/inventory/{item_id}` | require_store_access | Update inventory |
| DELETE | `/stores/{store_id}/inventory/{item_id}` | require_store_access | Delete inventory |
| GET | `/stores/{store_id}/inventory/low-stock` | require_store_access | Low stock alerts |

### Staff Management (PER-STORE)

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/stores/{store_id}/staff` | manager, assistant_manager | List staff at store |
| POST | `/admin/stores/{store_id}/staff` | admin | Create staff member |
| PUT | `/admin/staff/{staff_id}` | admin | Update staff |
| DELETE | `/admin/staff/{staff_id}` | admin | Deactivate staff |
| POST | `/admin/staff/{staff_id}/clock-in` | any (PIN-based) | Clock in (rate-limited: 5 attempts/5 min) |
| POST | `/admin/staff/{staff_id}/clock-out` | any (PIN-based) | Clock out |
| GET | `/admin/stores/{store_id}/shifts` | manager, assistant_manager | View shifts |

### Order Management

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| POST | `/orders` | customer | Create order from cart |
| GET | `/orders` | customer | List own orders |
| GET | `/orders/{order_id}` | customer (own), admin, store_owner, staff | Get order details + timeline |
| PATCH | `/orders/{order_id}/status` | admin, store_owner, **any staff at order's store** | Update order status |
| POST | `/orders/{order_id}/cancel` | customer (own), admin, store_owner | Cancel order (**rolls back loyalty points**) |
| POST | `/orders/{order_id}/reorder` | customer | Re-add items to cart |

### Customer Management

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/customers` | admin | List all customers |
| GET | `/admin/customers/{user_id}` | admin | Get customer details |
| GET | `/admin/customers/{user_id}/orders` | admin | Customer's orders |
| GET | `/admin/customers/{user_id}/loyalty-history` | admin | Loyalty history |
| GET | `/admin/customers/{user_id}/wallet-history` | admin | Wallet history |
| POST | `/admin/customers/{user_id}/adjust-points` | admin | Manual points adjustment (sets created_by + description) |

### Voucher Management

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/vouchers` | admin | List all vouchers |
| POST | `/admin/vouchers` | admin | Create voucher |
| PUT | `/admin/vouchers/{voucher_id}` | admin | Update voucher |
| DELETE | `/admin/vouchers/{voucher_id}` | admin | **Soft-delete** voucher |
| GET | `/admin/vouchers/{voucher_id}/usage` | admin | Voucher usage records |
| GET | `/vouchers/me` | customer | My vouchers |
| POST | `/vouchers/apply` | customer | Apply voucher to order |
| POST | `/vouchers/validate` | customer | Validate voucher code |

### Reward Management

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/rewards` | admin | List all rewards |
| POST | `/admin/rewards` | admin | Create reward |
| PUT | `/admin/rewards/{reward_id}` | admin | Update reward |
| DELETE | `/admin/rewards/{reward_id}` | admin | **Soft-delete** reward |
| GET | `/admin/rewards/{reward_id}/redemptions` | admin | Redemption records |
| GET | `/rewards` | customer | List available rewards |
| POST | `/rewards/{reward_id}/redeem` | customer | Redeem reward |

### Loyalty

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/loyalty/balance` | customer | Get points balance + tier |
| GET | `/loyalty/history` | customer | Points transaction history |
| GET | `/loyalty/tiers` | public | Loyalty tier definitions |
| GET | `/admin/loyalty-tiers` | admin | List tiers (admin) |
| POST | `/admin/loyalty-tiers` | admin | Create tier |
| PUT | `/admin/loyalty-tiers/{tier_id}` | admin | Update tier |

### Wallet & Payments

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/wallet` | customer | Get wallet balance |
| POST | `/wallet/topup` | customer | Top up wallet (stub) |
| GET | `/wallet/transactions` | customer | Wallet transaction history |
| GET | `/payments/methods` | customer | List saved payment methods |
| POST | `/payments/methods` | customer | Add payment method |
| POST | `/payments/create-intent` | customer | Create payment intent (stub) |
| POST | `/payments/confirm` | customer | Confirm payment (stub) |

### Cart

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/cart` | customer | Get current cart |
| POST | `/cart/items` | customer | Add item to cart |
| PUT | `/cart/items/{item_id}` | customer | Update cart item quantity |
| DELETE | `/cart/items/{item_id}` | customer | Remove from cart |
| DELETE | `/cart` | customer | Clear entire cart |

### Reports

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/reports/revenue` | admin, store_owner | Revenue report (filterable by date/store) |
| GET | `/admin/reports/sales` | admin, store_owner | Sales breakdown |
| GET | `/admin/reports/popular` | admin, store_owner | Popular items report |
| GET | `/admin/reports/loyalty` | admin | Loyalty points report |
| GET | `/admin/reports/inventory` | admin, store_owner | Inventory report + low stock |

### Marketing Campaigns

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/marketing/campaigns` | admin | List campaigns (filterable) |
| POST | `/admin/marketing/campaigns` | admin | Create campaign |
| PUT | `/admin/marketing/campaigns/{id}` | admin | Update campaign |
| DELETE | `/admin/marketing/campaigns/{id}` | admin | Cancel campaign |

### Feedback

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| POST | `/feedback` | customer | Submit feedback |
| GET | `/admin/feedback` | admin | List all feedback |
| GET | `/admin/feedback/stats` | admin | Feedback statistics |
| GET | `/admin/feedback/{id}` | admin | Get feedback detail |
| POST | `/admin/feedback/{id}/reply` | admin | Reply to feedback |

### Notifications

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/notifications` | customer | List own notifications |
| PUT | `/notifications/read-all` | customer | Mark all as read |
| PUT | `/notifications/{id}/read` | customer | Mark one as read |

### System & Config

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/admin/audit-log` | admin | View audit trail |
| GET | `/admin/broadcasts` | admin | List broadcasts |
| POST | `/admin/broadcasts` | admin | Send broadcast |
| GET | `/admin/banners` | admin | Manage promo banners |
| POST | `/admin/banners` | admin | Create banner |
| PUT | `/admin/banners/{id}` | admin | Update banner |
| DELETE | `/admin/banners/{id}` | admin | Delete banner |
| GET | `/banners` | public | Active banners (customer app) |
| GET | `/promos` | public | Active promos + vouchers |
| GET | `/splash` | public | Splash screen content |
| PUT | `/splash` | admin, store_owner | Update splash screen |
| GET | `/config` | public | App configuration |
| PUT | `/admin/config` | admin | Update app config |
| POST | `/upload/image` | admin, store_owner | Upload image file |

### User Profile

| Method | Path | ACL | Description |
|--------|------|-----|-------------|
| GET | `/users/me` | customer | Get own profile |
| PUT | `/users/me` | customer | Update profile |
| PUT | `/users/me/avatar` | customer | Upload avatar |
| GET | `/users/me/addresses` | customer | List saved addresses |
| POST | `/users/me/addresses` | customer | Add address |
| PUT | `/users/me/addresses/{id}` | customer | Update address |
| DELETE | `/users/me/addresses/{id}` | customer | Delete address |

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
| GET | `/referral/code` | customer | Get my referral code |
| POST | `/referral/apply` | customer | Apply referral code |
| GET | `/favorites` | customer | List my favorites |
| POST | `/favorites/{item_id}` | customer | Add to favorites |
| DELETE | `/favorites/{item_id}` | customer | Remove from favorites |

---

## Common Request/Response Patterns

### Authentication
```json
// POST /auth/login-password
{ "email": "admin@loyaltysystem.uk", "password": "admin123" }

// Response
{ "access_token": "eyJ...", "refresh_token": "eyJ...", "token_type": "bearer" }
```

### Pagination
```json
// Request: ?page=1&page_size=20
// Response:
{ "orders": [...], "total": 21, "page": 1, "page_size": 20 }
```

### Order Creation
```json
// POST /orders
{
  "store_id": 1,
  "order_type": "dine_in",
  "table_id": 5,
  "payment_method": "wallet",
  "notes": "Less sugar please"
}
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

### PIN Rate Limiting
```json
// 429 Too Many Requests (after 5 wrong PINs in 5 minutes)
{ "detail": "Too many PIN attempts. Try again after 5 minutes." }
```

---

## Security Features

- **JWT Token Blacklist**: Tokens include a `jti` claim. On logout, the JTI is stored in `token_blacklist` table. Every request checks if the token's JTI is blacklisted.
- **PIN Rate Limiting**: Staff clock-in PIN attempts are rate-limited to 5 per 5 minutes per staff member (in-memory tracking).
- **Soft Deletes**: Menu items, vouchers, and rewards use `deleted_at` timestamp instead of hard deletion. Menu items also set `is_available=false`.
- **Order Cancellation Rollback**: Cancelling an order reverses loyalty points earned (creates a reversal `LoyaltyTransaction` with negative points).
