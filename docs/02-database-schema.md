# FNB Super-App — Database Schema

> Last updated: 2026-04-18 | PostgreSQL 16 | Database: `fnb` | 52 tables | 85+ FKs | 1 trigger

## Enums

| Enum | Values | Used By |
|------|--------|---------|
| `staffrole` | `manager`, `assistant_manager`, `barista`, `cashier`, `delivery` | `staff.role` |
| `ordertype` | `dine_in`, `pickup`, `delivery` | `orders.order_type` |
| `orderstatus` | `pending`, `confirmed`, `preparing`, `ready`, `completed`, `cancelled` | `orders.status`, `order_status_history.status` |
| `discounttype` | `percent`, `fixed`, `free_item` | `vouchers.discount_type` |
| `rewardtype` | `free_item`, `discount_voucher`, `custom` | `rewards.reward_type` |
| `txtype` | `earn`, `redeem`, `expire` | `loyalty_transactions.type` |
| `wallettxtype` | `topup`, `payment`, `refund`, `cashback`, `promo_credit`, `admin_adjustment` | `wallet_transactions.type` |
| `movement_type` | `received`, `waste`, `transfer_out`, `transfer_in`, `cycle_count`, `adjustment` | `inventory_movements.movement_type` |

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
| [02e-orders.md](02e-orders.md) | Orders & Payments | `orders`, `order_items`, `order_status_history`, `cart_items`, `payments` |
| [02f-loyalty.md](02f-loyalty.md) | Loyalty, Rewards, Wallet | `loyalty_accounts`, `loyalty_transactions`, `loyalty_tiers`, `rewards`, `user_rewards`, `wallets`, `wallet_transactions`, `payment_methods` |
| [02g-marketing.md](02g-marketing.md) | Vouchers, Promos, Surveys | `vouchers`, `user_vouchers`, `promo_banners`, `surveys`, `survey_questions`, `survey_responses`, `survey_answers` |
| [02h-staff.md](02h-staff.md) | Staff & Shifts | `staff`, `staff_shifts`, `pin_attempts` |
| [02i-social.md](02i-social.md) | Social & Content | `favorites`, `referrals`, `feedback`, `notifications`, `notification_broadcasts`, `marketing_campaigns` |
| [02j-system.md](02j-system.md) | System Config | `app_config`, `splash_content`, `audit_log` |

## Seed Data Summary

> Data as of 2026-04-15 after ACL re-seed.

| Entity | Count | Details |
|--------|-------|---------|
| Stores | 5 | id=0 HQ, id=1 ZUS KLCC, id=2 ZUS KLCC Park, id=3 ZUS Cheras, id=4 Test Store |
| Users | 15 | 3 HQ, 4 Store Mgmt, 3 Store, 5 Customers |
| Staff | 8 | 4 KLCC, 2 KLCC Park, 2 Cheras |
| user_store_access | 8 | Scoped store assignments |
| user_types | 4 | HQ Management, Store Management, Store, Customer |
| roles | 7 | Admin, Brand Owner, Manager, Asst Manager, Staff, Customer, HQ Staff |
| permissions | 23 | Granular permissions |
| role_permissions | 83 | Role↔Permission mappings |
| Tables | 28 | 13 KLCC, 10 KLCC Park, 5 Cheras |
| Menu Categories | 10 | Coffee, Tea, Pastries, Specialties |
| Menu Items | 34 | Full drink/pastry menu |
| Customization Options | 61 | Size, milk, sugar, etc. |
| Inventory Items | 31 | Stock levels |
| Loyalty Tiers | 4 | Bronze, Silver, Gold, Platinum |
| Rewards | 6 | Free items, discounts |
| Vouchers | 7 | Promo codes |

### Login Credentials (all password: `admin123`)

| Email | User Type | Role | Store Access |
|-------|-----------|------|-------------|
| `admin@loyaltysystem.uk` | HQ Management | Admin | Global |
| `store.owner@zus.my` | HQ Management | Brand Owner | Global |
| `staff@zus.com` | HQ Management | HQ Staff | Global |
| `raj.manager@zus.my` | Store Management | Manager | KLCC + Cheras |
| `siti@zus.my` | Store Management | Asst Manager | KLCC Park |
| `lisa.manager@zus.my` | Store Management | Manager | Cheras |
| `williamcft@gmail.com` | Store Management | Manager | KLCC |
| `priya.dashboard@zus.my` | Store | Staff | KLCC |
| `weijie@zus.my` | Store | Staff | KLCC |
| `john@test.com` | Store | Staff | KLCC |
| `ahmad.taher@email.my` | Customer | Customer | — |
