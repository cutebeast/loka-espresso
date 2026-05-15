# Admin Portal v3 — Master Documentation

**Last updated:** 2026-05-15  
**Status:** Production — 107 pages, 35 backend endpoint files, 24 translatable entities, 7 migrations

---

## 1. System Architecture

```
admin.loyaltysystem.uk (Caddy reverse proxy)
  ├── /api/v1/* → backend :13800 (FastAPI)
  └── /*         → admin-portal-v3 :3010 (Next.js 16)
```

| Component | Technology | Port | PM2 Name |
|-----------|-----------|------|----------|
| Backend | FastAPI + SQLAlchemy async | 13800 | `v3-backend` |
| Admin Portal | Next.js 16 (Static + Dynamic) | 3010 | `admin-portal-v3` |
| Database | PostgreSQL | 5432 | — |
| Reverse Proxy | Caddy | 80/443 | — |

### Build & Deploy

```bash
# Admin portal
cd /root/fnb-super-app/v3/admin-portal
rm -rf .next && npx next build
pm2 stop admin-portal-v3 && pm2 delete admin-portal-v3
pm2 start npm --name admin-portal-v3 -- start -- -p 3010

# Backend (auto-migrates on start via docker-entrypoint.sh)
pm2 restart v3-backend
```

### Key Design Decisions

- **Zero Tailwind CSS** — all pages use custom CSS classes (`df-grid`, `df-field`, `df-label`, `df-actions`, `data-table`, `page-header`, etc.)
- **Full-page Create/Edit** — no drawer/modal forms on CRUD entities
- **Language Tabs** — EN source + 4 locale tabs (MS, ZH, TA, TR) on all edit pages
- **Translation chain**: MiniMax → DeepL → DeepSeek (creds in `platform_config`)
- **All New + Edit pages are layout-consistent**: `df-grid` forms, `df-actions` with Cancel + Save buttons
- **Gallery system**: `image_gallery_urls` (JSONB) + `gallery_video_url` (VARCHAR) on 5 marketing tables, separate from single `image_url`
- **API helpers**: `api.get` auto-extracts `data.items` → array; `api.getRaw` returns `data` as-is; `api.upload` for file uploads with token refresh; many endpoints return direct arrays — use `Array.isArray(d) ? d : (d.items||[])`
- **Token refresh**: 401 handler tries `POST /admin/auth/refresh` before redirecting to `/login`

---

## 2. Frontend Routes (107 pages, 94 unique routes)

### Root / Auth
| Route | Type | Description |
|-------|------|-------------|
| `/` | Static | Dashboard |
| `/login` | Static | Admin login |

### Company — Stores
| Route | Type |
|-------|------|
| `/stores` | List |
| `/stores/[id]` | Edit + translations |
| `/stores/new` | Create |
| `/stores/settings` | Store-level config |

### Company — Menu (5 sub-sections)
| Route | Type |
|-------|------|
| `/menu/categories` + `/[id]` + `/new` | CRUD |
| `/menu/items` + `/[id]` + `/new` | CRUD |
| `/menu/allergens` + `/[id]` + `/new` | CRUD |
| `/menu/dietary-tags` + `/[id]` + `/new` | CRUD |
| `/menu/tax-categories` + `/[id]` + `/new` | CRUD |

### Company — Loyalty
| Route | Type |
|-------|------|
| `/loyalty/tiers` + `/[id]` + `/new` | CRUD |
| `/loyalty/accounts` | Static list |
| `/loyalty/ledger` | Static ledger |
| `/loyalty/settings` | Config |

### Company — Marketing
| Route | Type |
|-------|------|
| `/rewards` + `/[id]` + `/new` | CRUD |
| `/promotions` + `/[id]` + `/new` | CRUD (Promo Banners) |
| `/vouchers` + `/[id]` + `/new` | CRUD |
| `/vouchers/report` | Redemption report |
| `/surveys` + `/[id]` + `/new` | CRUD |
| `/surveys/report` | Response report |
| `/referrals` | Referral list |
| `/referrals/settings` | Config |
| `/checkins` | Daily check-in list |
| `/checkins/settings` | Config |
| `/marketing/campaigns` + `/[id]` + `/new` | CRUD |
| `/marketing/campaigns/settings` | Config |

### Company — Content
| Route | Type |
|-------|------|
| `/content/info-cards` + `/[id]` + `/new` | CRUD |
| `/content/products` + `/[id]` + `/new` | CRUD |
| `/content/events` + `/[id]` + `/new` | CRUD |
| `/content/events/report` | RSVP report |
| `/content/system` + `/[id]` + `/new` | CRUD (System Pages) |
| `/content/pwa-splash` + `/[id]` + `/new` | CRUD (Splash Screens) |

### Company — Reports / Settings / Translations
| Route | Type |
|-------|------|
| `/reports` | Placeholder |
| `/audit-log` | Audit trail |
| `/settings` | Global config (`platform_config`) |
| `/settings/reservations` | Reservation SMS/WhatsApp config |
| `/translations` | Translation management |

### Support — Customers
| Route | Type |
|-------|------|
| `/customers` | List |
| `/customers/[id]` | 8-tab detail (Profile, Orders, Loyalty, Wallet, Rewards, Vouchers, Consents, Devices) |
| `/customers/consents` | Consent list |
| `/customers/devices` | Device list |

### Support — Notifications / Feedback
| Route | Type |
|-------|------|
| `/notifications` + `/[id]` + `/new` | CRUD |
| `/notifications/report` | Delivery report |
| `/notifications/templates` + `/[id]` + `/new` | CRUD |
| `/feedback` | Customer feedback list |

### Store Operations
| Route | Type |
|-------|------|
| `/orders` | List |
| `/orders/[id]` | Detail + status log + adjustments |
| `/tables` | Dining tables + QR codes |
| `/inventory/categories` + `/[id]` + `/new` | CRUD |
| `/inventory/items` + `/[id]` + `/new` | CRUD |
| `/inventory/suppliers` + `/[id]` + `/new` | CRUD |
| `/inventory/movements` | Movement log (read-only) |
| `/inventory/purchase-orders` | PO list + receive/cancel |
| `/staff` + `/[id]` + `/new` | CRUD |
| `/staff/time-events` | Clock-in/out log |
| `/staff/tips` | Tip allocation list |
| `/reservations` | Reservation list |

---

## 3. Backend Admin Endpoints (35 files)

| File | Resources |
|------|-----------|
| `auth.py` | Admin login/logout, token refresh, change password |
| `checkins.py` | Customer daily check-ins CRUD |
| `config.py` | `GET/PUT /config` with optional `?prefix=` filter, type-aware parsing |
| `consents.py` | Customer consents list |
| `content_sections.py` | Content sections CRUD + batch update |
| `customers.py` | Customer full CRUD (POST, GET list, GET/{id}, PATCH, DELETE) + actions (adjust-points, award-voucher, set-tier, approve-profile) + sub-resources (orders, loyalty-history, wallet-history) |
| `dashboard.py` | KPI metrics, order trends |
| `devices.py` | Customer devices list |
| `dietary_tags.py` | Dietary tags CRUD |
| `event_cards.py` | Event cards CRUD + translations |
| `feedback.py` | Feedback entries list |
| `info_cards.py` | Info cards CRUD + translations + gallery |
| `inventory.py` | Inventory categories + items CRUD (with translations) |
| `inventory_movement.py` | Movement log list |
| `loyalty.py` | Tiers CRUD, accounts, ledger |
| `marketing.py` | Campaigns CRUD |
| `menu.py` | Menu categories, items (with modifiers/options/allergens/dietary-tags), allergens, dietary tags, tax categories — all CRUD |
| `notifications.py` | Notifications + templates CRUD |
| `orders.py` | Orders list, detail, status update |
| `product_cards.py` | Product cards CRUD + translations + gallery |
| `promo_banners.py` | Promo banners CRUD + translations + gallery |
| `purchase_orders.py` | PO list, create, receive (auto-fills lines), cancel |
| `referrals.py` | Referral events list |
| `reservations.py` | Reservation CRUD + status |
| `rewards.py` | Reward catalog CRUD + translations + gallery |
| `splash_screens.py` | Splash screens CRUD + translations + gallery |
| `staff.py` | Staff profiles CRUD, shifts |
| `stores.py` | Stores CRUD + operating hours + settings |
| `surveys.py` | Survey CRUD (questions embedded), responses list, **export endpoint** (`GET /{id}/responses/export`) |
| `system_pages.py` | System pages CRUD + translations |
| `time_events.py` | Staff time events list + verify |
| `tips.py` | Tip allocations list |
| `vouchers.py` | Voucher definitions CRUD |
| `wallet.py` | Wallet list, adjust, topup, deduct |

### Public Endpoints (customer-facing)
| File | Route |
|------|-------|
| `public/rsvp.py` | `POST /events/{id}/rsvp` — customer RSVP registration, increments `event_cards.rsvp_count` |
| `public/menu.py` | `GET /menu/stores/{id}` — public menu (global, not per-store filtered) |
| `public/store.py` | `GET /stores` — active store list |

---

## 4. Database Models (91 classes, 21 category files)

### Identity (`iam.py`)
`IAMPrincipal`, `AdminAccount`, `IAMRole`, `IAMPermission`, `RolePermission`, `RoleAssignment`, `StoreAssignment`, `TokenBlacklist`, `APICredentials`

### Store (`store.py`)
`Store`, `StoreOperatingHours`, `StoreSpecialHours`, `StoreConfiguration`, `DiningTable`, `TableStatusSnapshot`, `Reservation`

### Customer (`customer.py`)
`Customer`, `CustomerConsent`, `CustomerAddress`, `CustomerDevice`, `ReferralEvent`

### Staff (`staff.py`)
`StaffProfile`, `StaffShift`, `StaffTimeEvent`, `TipAllocation`

### Platform (`platform.py`)
`PlatformConfig`, `AuditLog`, `ScheduledJob`, `DataRetentionPolicy`, `SystemHealthMetric`

### Content (`info_card.py`)
`InformationCard`, `SystemPage`, `ProductCard`, `EventCard`, `EventRsvp`, `PromoBanner`, `ContentSection`, `SplashScreen`

### Menu (`menu.py`)
`MenuCategory`, `MenuItem`, `TaxCategory`, `MenuModifierGroup`, `MenuModifierOption`, `MenuVariant`, `Allergen`, `MenuItemAllergen`, `MenuItemRecipe`, `DietaryTag`, `MenuItemDietaryTag`

### Inventory (`inventory.py`)
`InventoryCategory`, `InventoryItem`, `Supplier`, `InventoryMovementLog`, `PurchaseOrder`, `PurchaseOrderLine`

### Cart (`cart.py`)
`CustomerCart`, `CartLineItem`, `CheckoutSession`

### Order (`order.py`)
`Order`, `OrderLineItem`, `OrderStatusLog`, `OrderAdjustment`, `OrderFulfillment`

### Payment (`payment.py`)
`Payment`, `PaymentEvent`, `PaymentMethod`, `Refund`

### Loyalty (`loyalty.py`)
`LoyaltyTier`, `LoyaltyAccount`, `LoyaltyPointsLedger`

### Wallet (`wallet.py`)
`Wallet`, `WalletLedgerEntry`

### Reward (`reward.py`)
`RewardCatalog`, `CustomerReward`

### Voucher (`voucher.py`)
`VoucherDefinition`, `CustomerVoucher`

### Marketing (`marketing.py`)
`MarketingCampaign`, `CampaignAnalytics`

### Survey (`survey.py`)
`SurveyDefinition` (with `reward_voucher_id` FK to voucher_definitions), `SurveyQuestion`, `SurveyResponse`, `SurveyAnswer`

### Notification (`notification.py`)
`AdminNotification`, `NotificationTemplate`, `NotificationMessage`, `NotificationDeliveryLog`, `NotificationPreference`

### Translation (`translation.py`)
`Translation`, `TranslationCache`

### Feedback (`feedback.py`)
`FeedbackEntry`

### Check-in (`checkin.py`)
`CustomerDailyCheckin`

---

## 5. Translation System

### TRANSLATABLE_ENTITIES (24 total)

```
menu_items:               item_name, description, long_description
information_cards:        title, short_description, long_description
product_cards:            title, short_description, long_description
event_cards:              title, short_description, long_description
voucher_definitions:      display_title, description, short_description, long_description
stores:                   store_name
inventory_items:          item_name, description
inventory_categories:     category_name, description
menu_modifier_groups:     group_name
menu_modifier_options:    option_name
menu_categories:          category_name
allergens:                display_name, description
dietary_tags:             display_name
tax_categories:           category_name
loyalty_tiers:            display_name
reward_catalog:           reward_name, short_description, long_description, how_to_redeem, terms_and_conditions
promo_banners:            title, short_description
survey_definitions:       survey_name, description
survey_questions:         question_text
system_pages:             title, body_text
splash_screens:           title, subtitle
marketing_campaigns:      campaign_name, body_content
notification_templates:   title, body
notification_messages:    title, body
```

**Supported locales:** `en` (source), `ms` (Bahasa Malaysia), `zh` (Chinese), `ta` (Tamil), `tr` (Turkish)

**Translation cascade:** `delete_translations(db, table_name, record_id)` called on all DELETE endpoints. Survey questions and menu modifier translations cascade correctly.

**Race condition protection:** `auto_translate_record()` wraps select+upsert in an `IntegrityError` retry loop.

**Translation chain:** MiniMax → DeepL (`ms`, `zh`, `tr`) → DeepSeek (fallback). Credentials in `platform_config` table.

---

## 6. Alembic Migration Chain

```
ec330b37f15a  →  1e9a963c2ce2  →  f3d2b1a4c5e6  →  a4b5c6d7e8f9  →  a7fe1d86571d  →  b1c2d3e4f5a6  →  c2d3e4f5a6b7
(baseline v3)    (notifications)   (feedback)      (marketing cols)  (gallery+video)  (enum fixes)     (event_rsvps)
```

---

## 7. Schema Modules (152 Pydantic v2 classes, 22 files)

| Module | Classes | Key Schemas |
|--------|---------|-------------|
| `base.py` | 6 | `BaseSchema`, `TimestampedSchema`, `APIResponse`, `PaginatedResponse` |
| `auth.py` | 13 | `AdminLogin`, `TokenResponse`, `AdminProfileOut` |
| `customer.py` | 9 | `CustomerProfileOut`, `CustomerUpdate` |
| `store.py` | 14 | `StoreOut`, `StoreCreate`, `StoreOperatingHoursBase`, `DiningTableOut`, `StoreConfigurationBase` |
| `menu.py` | 18 | `MenuItemOut`, `MenuCategoryOut`, `AllergenOut`, `DietaryTagOut`, `TaxCategoryOut` |
| `cart.py` | 6 | `CartOut`, `CartLineItemOut` |
| `order.py` | 8 | `OrderOut`, `OrderCreate`, `OrderAdjustmentOut` |
| `payment.py` | 7 | `PaymentOut`, `PaymentMethodBase` |
| `wallet.py` | 3 | `WalletOut`, `WalletLedgerEntryOut` |
| `loyalty.py` | 9 | `LoyaltyTierOut`, `LoyaltyAccountOut` (with `color_hex`, `tier_key`) |
| `voucher.py` | 5 | `VoucherDefinitionOut` |
| `audit.py` | 1 | `AuditLogOut` |
| `notification.py` | 6 | `AdminNotificationOut`, `NotificationTemplateOut` |
| `content.py` | 30 | `InfoCard*`, `ProductCard*`, `EventCard*`, `SystemPage*`, `PromoBanner*`, `SplashScreen*`, `ContentSection*` |
| `marketing.py` | 3 | `MarketingCampaignOut` |
| `referral.py` | 2 | `ReferralEventOut` |
| `reservation.py` | 3 | `ReservationOut` |
| `survey.py` | 9 | `SurveyDefinitionOut`, `SurveyResponseOut` |
| `translation.py` | 6 | `TranslationOut`, `TranslateRequest`, `TranslateResponse` |
| `inventory.py` | 12 | `InventoryItemOut`, `InventoryCategoryOut`, `SupplierOut` |
| `feedback.py` | 4 | `FeedbackEntryOut` |
| `staff.py` | 6 | `StaffProfileOut`, `TipAllocationOut` |

---

## 8. Sidebar Structure (63 navigation items)

### Company
- Stores (Store Locations, Store Settings)
- Menu (Categories, Items, Allergens, Dietary Tags, Tax Categories)
- Loyalty (Tiers, Accounts, Ledger, Settings)
- Marketing (Rewards, Promotions, Vouchers, Voucher Report, Surveys, Survey Report, Referrals, Referral Settings, Check-ins, Check-in Settings, Campaigns, Campaign Settings)
- Content (Info Cards, Products, Events, Event RSVP Report, System Pages, PWA Splash)
- Settings (App Settings, Reservation Settings)
- Notifications (Notifications List, Templates, Report)
- **Standalone:** Dashboard, Reports, Audit Log, Translations

### Support
- Customers (List, Consents, Devices)
- Feedback

### Store Operations
- Orders, Tables
- Inventory (Categories, Items, Suppliers, Movements, Purchase Orders)
- Staff (List, Time Events, Tips)
- Reservations

---

## 9. Key Features

### Order Processing
- Delivery fee, service charge, and tax rate read from `store_configuration` (keys: `order.delivery_fee`, `order.service_charge`, `order.tax_rate`)
- Tip allocation auto-created when `tip_amount > 0` (`TipAllocation` record with `allocation_type="fixed"`)
- Order detail page renders adjustments table (Type, Amount, Reason, Date)
- PO receive auto-fills all lines at full quantity when no line items specified

### Gallery System
- `GalleryUpload` component on edit pages: info-cards, products, events, promo-banners, pwa-splash, rewards
- Separate upload buttons for images (multi-file) and video (single file)
- Backend endpoint field lists include `image_gallery_urls` + `gallery_video_url` on all 5 content entity endpoints

### Position / Sort Order
- Present on stores, info-cards, products, events, promotions, rewards
- Consistently placed after basic identifying fields (near top of form)
- Stores has dedicated "Sort Order" section

### Audit Log
- Frontend queries with `date_from`/`date_to` (not `from`/`to`)
- Backend `GET /admin/audit-log` accepts `action`, `resource_type`, `severity`, `date_from`, `date_to` query params

### Platform Config
- `GET /admin/config` supports optional `?prefix=` filter (e.g., `?prefix=reservation.`)
- `PUT /admin/config?key=...&value=...` parses value by type: string, json, integer, float, boolean
- Reservation settings page uses query params (not JSON body)

### API Consistency
- All backend pagination uses `per_page` (unified from `page_size`)
- All deletes return `200 OK + {"id": N, "deleted": true}` (including staff)
- `api.ts` has `upload()` for multipart + `fetchRaw()` for blob responses — all pages use centralized helpers
- 34 live exports in `api.ts`, zero dead wrapper functions

### RSVP System
- `EventRsvp` model with unique constraint on `(event_id, customer_id)`
- `POST /api/v1/events/{id}/rsvp` (customer-facing) validates capacity, prevents duplicates, increments `rsvp_count`
- Admin event detail shows `rsvp_count` and `rsvp_max_capacity`

---

## 10. Quality Metrics

| Metric | Value |
|--------|-------|
| Frontend pages | 107 (`page.tsx` files) |
| Unique routes | 94 |
| Backend endpoint files | 35 |
| Database model classes | 91 |
| Schema modules | 22 (152 classes) |
| Alembic migrations | 7 (linear chain) |
| Translatable entities | 24 |
| Sidebar nav items | 63 |
| TypeScript errors | 0 (`tsc --noEmit` clean) |
| Tailwind classes | 0 (verified — all custom CSS) |
| CSS files | 7 (`src/styles/`) — 1,132 lines total |
| Dead API exports | 0 (verified by grep across `src/app/` + `src/components/`) |
