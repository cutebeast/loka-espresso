# FNB Super-App — Database Schema

> Last updated: 2026-04-25 | PostgreSQL 16 | Database: `fnb` | 54 tables | 85+ FKs | 1 trigger | Manual-mode POS/3PL columns added

## Enums

| Enum | Values | Used By |
|------|--------|---------|
| `staffrole` | `manager`, `assistant_manager`, `barista`, `cashier`, `delivery` | `staff.role` |
| `ordertype` | `dine_in`, `pickup`, `delivery` | `orders.order_type` |
| `orderstatus` | `pending`, `paid`, `confirmed`, `preparing`, `ready`, `out_for_delivery`, `completed`, `cancelled` | `orders.status`, `order_status_history.status` |
| `discounttype` | `percent`, `fixed`, `free_item` | `vouchers.discount_type` |
| `rewardtype` | `free_item`, `discount_voucher`, `custom` | `rewards.reward_type` |
| `txtype` | `earn`, `redeem`, `expire` | `loyalty_transactions.type` |
| `wallettxtype` | `topup`, `payment`, `refund`, `promo_credit`, `admin_adjustment` | `wallet_transactions.type` |
| `movement_type` | `received`, `waste`, `transfer_out`, `transfer_in`, `cycle_count`, `adjustment` | `inventory_movements.movement_type` |

> **Note**: Enums match the actual database implementation. No `cashback` value exists in the current schema.

## Triggers

| Trigger | Table | Event | Purpose |
|---------|-------|-------|---------|
| `trg_order_status_occupancy` | `orders` | AFTER INSERT OR UPDATE OF status | Auto-updates `table_occupancy_snapshot` when dine-in orders become active/completed |

## Schema Files by Domain

The full schema is split into domain-specific files for maintainability:

| File | Domain | Tables |
|------|--------|--------|
| [02a-acl.md](02a-acl.md) | Access Control (ACL) | `user_types`, `roles`, `role_user_type`, `user_store_access`, `permissions`, `role_permissions` |
| [02b-users.md](02b-users.md) | Users & Auth | `users`, `user_addresses`, `device_tokens`, `token_blacklist`, `otp_sessions` |
| [02c-stores.md](02c-stores.md) | Stores & Tables | `stores`, `store_tables`, `table_occupancy_snapshot` |
| [02d-menu.md](02d-menu.md) | Menu & Inventory | `menu_categories`, `menu_items`, `customization_options`, `inventory_categories`, `inventory_items`, `inventory_movements` |
| [02e-orders.md](02e-orders.md) | Orders & Payments | `orders`, `order_items`, `order_status_history`, `cart_items`, `payments`, `checkout_tokens` |

### Session 2 Schema Additions
- `cart_items.customization_hash` (SHA-256 of sorted option IDs) with unique constraint `uq_cart_item_identity` on `(user_id, store_id, item_id, customization_hash)`
- `information_cards.action_url`, `action_type`, `action_label` for promotion popup CTA support
- `audit_log.method`, `path`, `status_code`, `user_agent`, `request_id` with supporting indexes
| [02f-loyalty.md](02f-loyalty.md) | Loyalty, Rewards, Wallet | `loyalty_accounts`, `loyalty_transactions`, `loyalty_tiers`, `rewards`, `user_rewards`, `wallets`, `wallet_transactions`, `payment_methods` |
| [02g-marketing.md](02g-marketing.md) | Vouchers, Promos, Surveys | `vouchers`, `user_vouchers`, `promo_banners`, `surveys`, `survey_questions`, `survey_responses`, `survey_answers` |
| [02h-staff.md](02h-staff.md) | Staff & Shifts | `staff`, `staff_shifts`, `pin_attempts` |
| [02i-social.md](02i-social.md) | Social & Content | `favorites`, `referrals`, `feedback`, `notifications`, `notification_broadcasts`, `marketing_campaigns`, `information_cards` |

### `information_cards`

Content cards with `slug` (unique, URL-friendly identifier) and `gallery_urls` (array of image URLs).
| [02j-system.md](02j-system.md) | System Config | `app_config`, `splash_content`, `audit_log` |

## Seed Data Summary

> Data as of 2026-04-15 after ACL re-seed.

| Entity | Count | Details |
|--------|-------|---------|
| Stores | 6 | id=0 HQ, id=1 Loka Espresso KLCC, id=2 Loka Espresso Pavilion, id=3 Loka Espresso Cheras, id=4 Loka Espresso PJ, id=5 Loka Espresso Bangi |
| Users | 22 | 3 HQ, 7 Store Mgmt, 12 Store, 5 Customers |
| Staff | 21 | 4 KLCC, 4 Pavilion, 4 Cheras, 4 PJ, 4 Bangi, 1 HQ |
| user_store_access | 8 | Scoped store assignments |
| user_types | 4 | HQ Management, Store Management, Store, Customer |
| roles | 7 | Admin, Brand Owner, Manager, Asst Manager, Staff, Customer, HQ Staff |
| permissions | 23 | Granular permissions |
| role_permissions | 83 | Role↔Permission mappings |
| Tables | 28 | 13 KLCC, 10 KLCC Park, 5 Cheras |
| Menu Categories | 10 | Coffee, Tea, Pastries, Specialties |
| Menu Items | 35 | Full drink/pastry menu |
| Customization Options | 0 | — |
| Checkout Tokens | — | Temporary checkout discount tokens |
| Information Cards | — | Content cards with slug and gallery URLs |
| Inventory Items | 31 | Stock levels |
| Loyalty Tiers | 4 | Bronze, Silver, Gold, Platinum |
| Rewards | 8 | Free items, discounts |
| Vouchers | 8 | Promo codes |

### Login Credentials (all password: `admin123`)

| Email | User Type | Role | Store Access |
|-------|-----------|------|-------------|
| `admin@loyaltysystem.uk` | HQ Management | Admin | Global |
| `hq_mgr_1@fnb.com` | HQ Management | Brand Owner | Global |
| `hq_mgr_2@fnb.com` | HQ Management | HQ Staff | Global |
| `hq_staff_1@fnb.com` | HQ Management | HQ Staff | Global |
| `mgr_klcc@fnb.com` | Store Management | Manager | KLCC |
| `astmgr_klcc@fnb.com` | Store Management | Asst Manager | KLCC |
| `mgr_pavilion@fnb.com` | Store Management | Manager | Pavilion |
| `astmgr_pavilion@fnb.com` | Store Management | Asst Manager | Pavilion |
| `mgr_cheras@fnb.com` | Store Management | Manager | Cheras |
| `mgr_pj@fnb.com` | Store Management | Manager | PJ |
| `mgr_bangi@fnb.com` | Store Management | Manager | Bangi |
| `staff_klcc_1@fnb.com` | Store | Staff | KLCC |
| `staff_klcc_2@fnb.com` | Store | Staff | KLCC |
| `staff_klcc_3@fnb.com` | Store | Staff | KLCC |
| `staff_pavilion_1@fnb.com` | Store | Staff | Pavilion |
| `staff_pavilion_2@fnb.com` | Store | Staff | Pavilion |
| `staff_pavilion_3@fnb.com` | Store | Staff | Pavilion |
| `staff_cheras_1@fnb.com` | Store | Staff | Cheras |
| `staff_cheras_2@fnb.com` | Store | Staff | Cheras |
| `staff_cheras_3@fnb.com` | Store | Staff | Cheras |
| `staff_pj_1@fnb.com` | Store | Staff | PJ |
| `staff_pj_2@fnb.com` | Store | Staff | PJ |
| `staff_pj_3@fnb.com` | Store | Staff | PJ |
| `staff_bangi_1@fnb.com` | Store | Staff | Bangi |
| `staff_bangi_2@fnb.com` | Store | Staff | Bangi |
| `staff_bangi_3@fnb.com` | Store | Staff | Bangi |
| `customer_1@example.com` | Customer | Customer | — |
| `customer_2@example.com` | Customer | Customer | — |
| `customer_3@example.com` | Customer | Customer | — |
| `customer_4@example.com` | Customer | Customer | — |
| `customer_5@example.com` | Customer | Customer | — |
