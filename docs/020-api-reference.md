# FNB Super-App — API Reference

> Last updated: 2026-04-26 (Sessions 4–5) | Base URL: `https://admin.loyaltysystem.uk/api/v1`
> ~230 route handlers total. Session 4 added inventory management, wallet ledger, and compliance model tables (CRUD endpoints planned for Phase 2).

## Validation

All request bodies use **Pydantic v2 schemas** with `from_attributes = True`. Validation errors return `422 Unprocessable Entity` with structured error details.

## Authentication

All authenticated endpoints require:

```text
Authorization: Bearer <access-token>
```

### Auth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login-password` | Email/password login for admin/staff/dashboard users |
| POST | `/auth/send-otp` | Create OTP session for customer login |
| POST | `/auth/verify-otp` | Verify OTP and issue tokens |
| POST | `/auth/register` | Complete customer profile after OTP login |
| POST | `/auth/refresh` | Rotate refresh token and issue new access token |
| POST | `/auth/logout` | Revoke access token and optional refresh token |
| POST | `/auth/device-token` | Register device token |
| DELETE | `/auth/device-token` | Unregister device token |
| GET | `/admin/otps` | Admin/testing OTP lookup |

### Auth Contract Notes

- `POST /auth/send-otp` returns:
  - `message`
  - `phone`
  - `session_id`
  - `retry_after_seconds`
  - `expires_in_seconds`
- `POST /auth/verify-otp` accepts:
  - `phone`
  - `code`
  - optional `session_id`
- Token responses now include both snake_case and camelCase token fields for compatibility.

## Users

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/me` | Get current user profile |
| PUT | `/users/me` | Update current user profile |
| DELETE | `/users/me` | Delete own account (soft-delete, sets `is_active=False`) |
| PUT | `/users/me/avatar` | Update avatar |
| GET | `/users/me/addresses` | List saved addresses |
| POST | `/users/me/addresses` | Create saved address |
| PUT | `/users/me/addresses/{id}` | Update saved address |
| DELETE | `/users/me/addresses/{id}` | Delete saved address |

## Stores, Menu, Tables

### Stores

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stores` | List active stores |
| GET | `/stores/{store_id}` | Get store details |
| GET | `/menu/categories` | List universal menu categories |
| GET | `/menu/items` | List universal menu items |
| GET | `/stores/{store_id}/pickup-slots` | Pickup slot suggestions |
| GET | `/stores/{store_id}/tables` | List store tables |

### Public Menu Endpoints

These are the customer-facing PWA menu endpoints.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/menu/categories` | List menu categories (universal) |
| GET | `/menu/items` | List menu items (universal) |
| GET | `/menu/items/search` | Search items |
| GET | `/menu/items/popular` | Popular items |
| GET | `/menu/items/{item_id}/customizations` | Public customization options |

### Menu Model Note

- Menu is **universal** — same categories, items, and prices across all stores.
- There is no `store_id` on `menu_categories` or `menu_items`.
- The `store_id` on cart/checkout/order records the *fulfillment store*, not the menu source.

### Table Scan / Dine-in

| Method | Path | Description |
|--------|------|-------------|
| POST | `/tables/scan` | Scan table QR and return store/table context (QR must be active, not expired) |
| GET | `/tables/{table_id}` | Get table details |
| POST | `/tables/{table_id}/release` | Release table after dine-in completion |

**QR Scan Rules:**
- Table must have a `qr_token` set (QR must have been generated)
- Table must be `is_active=True`
- QR codes expire 30 minutes after generation
- Tables without QR cannot be scanned (returns 403 "This table is not active")

## Cart & Checkout

### Cart

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cart` | Get current cart |
| POST | `/cart/items` | Add item to cart |
| PUT | `/cart/items/{item_id}` | Update quantity |
| DELETE | `/cart/items/{item_id}` | Remove item |
| DELETE | `/cart` | Clear cart |

### Checkout Helper

| Method | Path | Description |
|--------|------|-------------|
| POST | `/checkout` | Validate discount and return checkout summary/token |

### Order Creation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/orders` | Create order from current cart |
| GET | `/orders` | List orders |
| GET | `/orders/{order_id}` | Get order + timeline |
| POST | `/orders/{order_id}/confirm` | Confirm dine-in order |
| POST | `/orders/{order_id}/apply-voucher` | Apply voucher to pending order |
| POST | `/orders/{order_id}/cancel` | Cancel order |
| POST | `/orders/{order_id}/reorder` | Rebuild cart from an order |
| PATCH | `/orders/{order_id}/status` | Update order status |
| PATCH | `/orders/{order_id}/payment-status` | Update payment status directly |
| POST | `/orders/{order_id}/pos-synced` | Staff marks order as manually re-keyed into POS |
| POST | `/orders/{order_id}/delivery-dispatched` | Staff marks order as manually booked with courier |
| GET | `/order-tracking/{order_id}/track` | Public/current tracking summary (actual tracking route; `/orders/tracking/{order_id}` is not used) |

### Order Flow Notes

#### Flow A — Pickup / Delivery
- `pending -> confirmed -> preparing -> ready -> completed` (staff confirms; wallet payments auto-advance)
- `pending -> paid -> confirmed -> ...` (wallet payment path)
- delivery may also move through `out_for_delivery`
- current wallet payment flow uses `/payments/create-intent` + `/payments/confirm`

#### Flow B — Dine-in
- `pending -> confirmed -> preparing -> ready -> paid -> completed`
- payment happens after fulfillment phase

## Wallet, Payments, Loyalty

### Wallet

| Method | Path | Description |
|--------|------|-------------|
| GET | `/wallet` | Cash wallet balance only |
| POST | `/wallet/topup` | Internal/mock topup path used before real PG |
| POST | `/wallet/deduct` | Explicit wallet deduction helper |
| GET | `/wallet/transactions` | Wallet transaction history |

### Combined Customer Wallet Projection

| Method | Path | Description |
|--------|------|-------------|
| GET | `/me/wallet` | Rewards + vouchers + cash + loyalty points |

### Payments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/payments/methods` | List saved payment methods |
| POST | `/payments/methods` | Add payment method metadata |
| DELETE | `/payments/methods/{method_id}` | Delete payment method |
| POST | `/payments/create-intent` | Create internal payment attempt |
| POST | `/payments/confirm` | Confirm wallet payment |

### Payment Contract Notes

- `POST /payments/create-intent` accepts:
  - `order_id`
  - `method`
  - optional `provider`
  - optional `idempotency_key`
- `POST /payments/confirm` accepts:
  - `payment_id`
  - optional `transaction_id`
  - optional `provider_reference`
- Real PG is still mocked; these endpoints are the internal contract to integrate against.

### Payment & Wallet Webhooks

| Method | Path | Description |
|--------|------|-------------|
| POST | `/wallet/webhook/pg-payment` | Provider-style wallet topup webhook |
| POST | `/wallet/webhook/order-payment` | Provider-style order payment webhook |

### Loyalty

| Method | Path | Description |
|--------|------|-------------|
| GET | `/loyalty/balance` | Get points balance + tier |
| GET | `/loyalty/history` | Loyalty transactions |
| GET | `/loyalty/tiers` | Public loyalty tiers |
| GET | `/admin/loyalty-tiers` | Admin list loyalty tiers |
| POST | `/admin/loyalty-tiers` | Create tier |
| PUT | `/admin/loyalty-tiers/{tier_id}` | Update tier |

## Rewards, Vouchers, Promotions, Surveys, Content

### Rewards

| Method | Path | Description |
|--------|------|-------------|
| GET | `/rewards` | Public rewards catalog |
| GET | `/rewards/{reward_id}` | Reward details |
| POST | `/rewards/{reward_id}/redeem` | Redeem reward with points |
| GET | `/admin/rewards` | Admin rewards list |
| POST | `/admin/rewards` | Create reward |
| PUT | `/admin/rewards/{reward_id}` | Update reward |
| DELETE | `/admin/rewards/{reward_id}` | Soft-delete reward |

### Vouchers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vouchers/me` | Current user's voucher instances |
| POST | `/vouchers/validate` | Validate voucher code |
| POST | `/vouchers/use/{code}` | Consume voucher instance |
| DELETE | `/vouchers/me/{voucher_instance_id}` | Discard own voucher |
| GET | `/admin/vouchers` | Admin vouchers list |
| POST | `/admin/vouchers` | Create voucher |
| PUT | `/admin/vouchers/{voucher_id}` | Update voucher |
| DELETE | `/admin/vouchers/{voucher_id}` | Soft-delete voucher |

### Promotions / Surveys / Content

| Method | Path | Description |
|--------|------|-------------|
| GET | `/splash` | Get current active splash content |
| PUT | `/splash` | Update splash content |
| DELETE | `/splash` | Deactivate splash content |
| GET | `/promos/banners` | Active PWA banners |
| GET | `/promos/banners/{banner_id}` | Banner detail |
| GET | `/promos/banners/{banner_id}/status` | Banner interaction status |
| POST | `/promos/banners/{banner_id}/claim` | Claim linked voucher |
| GET | `/surveys/{survey_id}` | Survey details |
| POST | `/surveys/{survey_id}/submit` | Submit survey |
| GET | `/content/information` | Information cards |
| GET | `/content/legal/terms` | Terms content |
| GET | `/content/legal/privacy` | Privacy content |
| GET | `/content/version` | Current PWA version info |
| GET | `/content/notifications` | Customer notification feed |

### Admin Content / PWA Operations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/content/cards` | List information cards |
| POST | `/admin/content/cards` | Create information card |
| GET | `/admin/content/cards/{card_id}` | Get content card |
| PUT | `/admin/content/cards/{card_id}` | Update content card |
| DELETE | `/admin/content/cards/{card_id}` | Delete content card |
| GET | `/admin/banners` | List banners |
| POST | `/admin/banners` | Create banner |
| PUT | `/admin/banners/{banner_id}` | Update banner |
| DELETE | `/admin/banners/{banner_id}` | Delete banner |
| POST | `/admin/pwa/rebuild` | Rebuild customer PWA |
| POST | `/admin/pwa/clear-cache` | Clear PWA cache artifacts |
| GET | `/admin/pwa/version` | Get current deployed PWA version |

## Feedback, Notifications, Referrals, Favorites

| Method | Path | Description |
|--------|------|-------------|
| POST | `/feedback` | Submit customer feedback |
| GET | `/admin/feedback` | List feedback |
| GET | `/admin/feedback/stats` | Feedback summary |
| GET | `/admin/feedback/{feedback_id}` | Get single feedback |
| POST | `/admin/feedback/{feedback_id}/reply` | Admin reply to feedback |
| PUT | `/admin/feedback/{feedback_id}/reply` | Update admin reply |
| PUT | `/admin/feedback/{feedback_id}` | Update own feedback |
| DELETE | `/admin/feedback/{feedback_id}` | Delete own feedback |
| GET | `/notifications` | List own notifications |
| PUT | `/notifications/read-all` | Mark all notifications read |
| PUT | `/notifications/{id}/read` | Mark one notification read |
| GET | `/referral/code` | Get own referral code |
| POST | `/referral/apply` | Apply referral code |
| GET | `/favorites` | List favorites |
| POST | `/favorites/{item_id}` | Add favorite |
| DELETE | `/favorites/{item_id}` | Remove favorite |

## Admin / System / Reports

### Admin Marketing

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/marketing/campaigns` | List marketing campaigns |
| GET | `/admin/marketing/campaigns/{campaign_id}` | Get single campaign |
| POST | `/admin/marketing/campaigns` | Create campaign |
| PUT | `/admin/marketing/campaigns/{campaign_id}` | Update campaign |
| DELETE | `/admin/marketing/campaigns/{campaign_id}` | Delete campaign |

### Admin Surveys

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/surveys` | List surveys |
| GET | `/admin/surveys/{survey_id}` | Get survey with questions |
| POST | `/admin/surveys` | Create survey |
| PUT | `/admin/surveys/{survey_id}` | Update survey |
| DELETE | `/admin/surveys/{survey_id}` | Delete survey |
| GET | `/admin/surveys/{survey_id}/responses` | List survey responses |
| GET | `/admin/surveys/{survey_id}/responses/export` | Export responses as CSV |

### Admin Staff

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/hq-staff` | List HQ staff |
| POST | `/admin/hq-staff` | Create HQ staff member |
| GET | `/admin/stores/{store_id}/staff` | List store staff |
| POST | `/admin/stores/{store_id}/staff` | Create store staff member |
| PUT | `/admin/staff/{staff_id}` | Update staff member |
| DELETE | `/admin/staff/{staff_id}` | Deactivate staff member |
| POST | `/admin/staff/{staff_id}/clock-in` | Clock in (PIN required) |
| POST | `/admin/staff/{staff_id}/clock-out` | Clock out |
| GET | `/admin/stores/{store_id}/shifts` | List staff shifts |
| POST | `/admin/staff/{staff_id}/reset-password` | Reset staff password |

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/dashboard` | Dashboard summary |
| GET | `/admin/orders` | Admin orders list (filter: store_id, status, order_type, table_id, search) |
| GET | `/admin/customers` | Customer list |
| GET | `/admin/customers/{user_id}` | Customer detail |
| GET | `/admin/customers/{user_id}/orders` | Customer order history |
| GET | `/admin/customers/{user_id}/loyalty-history` | Customer loyalty transactions |
| GET | `/admin/customers/{user_id}/wallet-history` | Customer wallet transactions |
| POST | `/admin/customers/{user_id}/adjust-points` | Award/deduct loyalty points |
| POST | `/admin/customers/{user_id}/award-voucher` | Award voucher to customer |
| POST | `/admin/customers/{user_id}/set-tier` | Manually set loyalty tier |
| POST | `/admin/customers/{user_id}/approve-profile` | Approve pending customer profile |
| PUT | `/admin/customers/{user_id}` | Update customer profile |
| POST | `/admin/wallet/topup` | In-store wallet top-up (find by phone, atomic credit) |
| DELETE | `/admin/customers/reset` | Reset all customer data |
| GET | `/admin/reports/revenue` | Revenue report |
| GET | `/admin/reports/loyalty` | Loyalty report |
| GET | `/admin/reports/inventory` | Inventory report |
| GET | `/admin/reports/marketing` | Marketing report |
| GET | `/admin/reports/marketing/paginated` | Marketing report (paginated) |
| GET | `/admin/reports/csv` | CSV export |
| GET | `/admin/audit-log` | Audit trail |
| GET | `/admin/broadcasts` | Notification broadcasts |
| POST | `/admin/broadcasts` | Create/send broadcast |
| GET | `/admin/broadcasts/{broadcast_id}` | Get single broadcast |
| PUT | `/admin/broadcasts/{broadcast_id}` | Update broadcast |
| DELETE | `/admin/broadcasts/{broadcast_id}` | Delete broadcast (not if sent) |
| POST | `/admin/broadcasts/{broadcast_id}/send` | Send a scheduled broadcast |
| PATCH | `/admin/broadcasts/{id}/archive` | Archive broadcast |
| PUT | `/admin/config` | Update app config |
| POST | `/admin/system/init-hq` | Initialize HQ |
| DELETE | `/admin/system/reset` | Reset data while preserving core structure |

### Menu Management (Universal)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/categories` | Create category |
| PUT | `/admin/categories/{cat_id}` | Update category |
| DELETE | `/admin/categories/{cat_id}` | Soft-delete category |
| POST | `/admin/items` | Create menu item |
| PUT | `/admin/items/{item_id}` | Update menu item |
| DELETE | `/admin/items/{item_id}` | Soft-delete menu item |
| GET | `/admin/items/{item_id}/customizations` | List customization options |
| POST | `/admin/items/{item_id}/customizations` | Create customization option |
| PUT | `/admin/customizations/{option_id}` | Update customization option |
| DELETE | `/admin/customizations/{option_id}` | Deactivate customization option |

### Inventory Management (Session 4)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/stores/{store_id}/inventory-categories` | List inventory categories for a store |
| POST | `/admin/stores/{store_id}/inventory-categories` | Create inventory category |
| PUT | `/admin/stores/{store_id}/inventory-categories/{cat_id}` | Update inventory category |
| DELETE | `/admin/stores/{store_id}/inventory-categories/{cat_id}` | Soft-delete inventory category |
| GET | `/admin/stores/{store_id}/inventory` | List inventory items for a store (optional category_id filter) |
| POST | `/admin/stores/{store_id}/inventory` | Create inventory item |
| PUT | `/admin/stores/{store_id}/inventory/{item_id}` | Update inventory item |
| PATCH | `/admin/stores/{store_id}/inventory/{item_id}/toggle` | Toggle item active/inactive |
| DELETE | `/admin/stores/{store_id}/inventory/{item_id}` | Delete inventory item |
| POST | `/admin/stores/{store_id}/inventory/{item_id}/adjust` | Adjust inventory quantity (received/waste/transfer/adjustment) — creates ledger entry |
| GET | `/admin/stores/{store_id}/inventory/{item_id}/ledger` | Item-level inventory movement ledger |
| GET | `/admin/stores/{store_id}/inventory-ledger` | Store-wide paginated inventory ledger (filters: from_date, to_date, movement_type) |
| POST | `/admin/system/backfill-inventory-ledger` | Backfill inventory ledger entries for items missing history |
| GET | `/admin/stores/{store_id}/inventory/low-stock` | List items below reorder level |

### Wallet & Ledger (Admin)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/wallet/topup` | In-store wallet top-up (find by phone, atomic credit) |
| GET | `/admin/customers/{user_id}/wallet` | Customer wallet status with rewards and vouchers (POS view) |
| GET | `/admin/customers/{user_id}/wallet-history` | Paginated wallet transaction history |
| GET | `/admin/customers/{user_id}/loyalty-history` | Paginated loyalty transaction history |
| POST | `/admin/customers/{user_id}/adjust-points` | Award/deduct loyalty points |
| POST | `/admin/customers/{user_id}/award-voucher` | Award voucher to customer |
| POST | `/admin/customers/{user_id}/set-tier` | Manually set loyalty tier |
| POST | `/admin/customers/{user_id}/use-reward/{ur_id}` | Staff marks customer reward as used (POS) |
| POST | `/admin/customers/{user_id}/use-voucher/{uv_id}` | Staff marks customer voucher as used (POS) |

### Compliance Model Endpoints (Phase 2)

The following models and DB migrations are complete (Sessions 4–5). CRUD route handlers are planned for Phase 2:

| Model | Table | Status |
|-------|-------|--------|
| DeliveryZone | `delivery_zones` | Model + migration ready |
| Allergen | `allergens` | Model + migration ready |
| MenuItemAllergen | `menu_item_allergens` | Model + migration ready |
| TaxRate | `tax_rates` | Model + migration ready |
| ModifierGroup | `modifier_groups` | Model + migration ready |
| ModifierOption | `modifier_options` | Model + migration ready |
| RecipeItem | `recipe_items` | Model + migration ready |
| Reservation | `reservations` | Model + migration ready |

### Store & Table Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/stores` | List all stores |
| POST | `/admin/stores` | Create store |
| PUT | `/admin/stores/{store_id}` | Update store |
| DELETE | `/admin/stores/{store_id}` | Deactivate store |
| PATCH | `/admin/stores/{store_id}/toggle` | Toggle store active/inactive |
| GET | `/admin/stores/{store_id}/tables` | List tables (sorted active-first, includes active_order per table) |
| POST | `/admin/stores/{store_id}/tables` | Create table (no QR auto-generated) |
| PUT | `/admin/stores/{store_id}/tables/{table_id}` | Update table |
| DELETE | `/admin/stores/{store_id}/tables/{table_id}` | Soft-delete table |
| POST | `/admin/stores/{store_id}/tables/{table_id}/generate-qr` | Generate QR for PENDING table |
| GET | `/admin/stores/{store_id}/tables/{table_id}/qr-image` | Download QR as PNG |
| POST | `/admin/stores/{store_id}/tables/{table_id}/generate-qr` | Regenerate QR (invalidates old) |
| PATCH | `/admin/orders/{order_id}/delivery-tracking` | Set courier name/phone, tracking URL, ETA |

**Table QR Workflow:**
1. Create table → status is PENDING (no QR)
2. Click "Generate QR" → QR generated with 30-min expiry, table becomes ACTIVE
3. Download/print QR and place on table
4. Customer scans to place dine-in order
5. Order completes → table released back to ACTIVE

## Webhook Security

Current provider-style webhook endpoints expect either:

1. `X-API-Key` matching backend config when signing secret is not configured, or
2. signed webhook headers when signing secret is configured.

Relevant env values:

- `WEBHOOK_API_KEY`
- `WEBHOOK_SIGNING_SECRET`

## Notes Before Real Provider Integration

1. Payment, delivery, and POS integrations are still mock/provider-simulation based.
2. These backend routes are the internal contracts that should remain stable while real providers are added.
3. Customer seeds and local lifecycle testing should use these routes, not ad hoc direct DB mutations.
