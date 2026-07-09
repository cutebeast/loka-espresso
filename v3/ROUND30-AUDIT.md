# FNB Super App v3 — Round 30 Deep Audit Report

**Date:** 2026-07-09  
**Scope:** All three portals (Admin, Staff, Customer PWA)  
**Method:** Systematic page-by-page audit: API endpoint coverage, error handling, loading states, help article mapping

---

## Table of Contents
1. [Admin Portal](#1-admin-portal)
2. [Staff Portal](#2-staff-portal)
3. [Customer PWA](#3-customer-pwa)
4. [Cross-Cutting Issues Fixed](#4-cross-cutting-issues-fixed)
5. [Help Article Coverage Gaps](#5-help-article-coverage-gaps)

---

## 1. Admin Portal

**103 page files, 136 unique routes, ~277 backend admin endpoints across 43 feature groups**

### Audit Legend
- **H** = Help article coverage (Y=exists, N=missing)
- **E** = Error handling (✓=good, ✗=missing/broken)
- **L** = Loading state (✓=good, ✗=missing)
- **B** = Error boundary (✓=wrapped, ✗=none)

### Feature: Dashboard
| Route | Component | API Endpoints | H | E | L | B | Remarks |
|-------|-----------|---------------|---|---|---|---|---------|
| `/` | DashboardPage | `GET /admin/stores`, `GET /admin/dashboard/metrics` | Y | ✓ | ✓ | ✓ | Clean. Uses `useCurrency` hook. |

### Feature: Stores
| Route | Component | API Endpoints | H | E | L | B | Remarks |
|-------|-----------|---------------|---|---|---|---|---------|
| `/stores` | StoresPage | `GET /admin/stores`, `DELETE /admin/stores/:id` | Y | ✓ | ✓ | ✓ | Uses `api.getRaw` instead of `api.get` — items may be undefined |
| `/stores/new` | NewStorePage | `POST /admin/stores` | Y | ✗ | ✓ | ✓ | Success msg rendered with error styling; no client-side validation |
| `/stores/[id]` | StoreEditPage | `GET /admin/stores/:id`, `PATCH`, translations CRUD | Y | ✗ | ✓ | ✓ | **Critical**: non-404 errors logged but never shown to user. Translations upsert has no try/catch. |
| `/stores/settings` | StoreSettingsPage | `GET /admin/config`, `PUT /admin/config` | N | ✓ | ✓ | ✓ | No help article for store defaults config |

### Feature: Menu (20 route files)
| Route | Component | H | E | L | B | Remarks |
|-------|-----------|----|---|---|---|---|---------|
| `/menu` → redirect | MenuIndex | Y | ✓ | ✓ | ✓ | Redirects to `/menu/items` |
| `/menu/items` | MenuItemsPage | Y | ✓ | ✓ | ✓ | |
| `/menu/items/new` | NewMenuItemPage | Y | ✓ | ✓ | ✓ | No client validation for prices/negatives |
| `/menu/items/[id]` | EditMenuItemPage | Y | ✗ | ✓ | ✓ | Non-404 errors swallowed (console.error only). Inventory for store loaded without store selection. |
| `/menu/categories` | MenuCategoriesPage | Y | ✓ | ✓ | ✓ | |
| `/menu/categories/new` | NewMenuCategoryPage | Y | ✓ | ✓ | ✓ | |
| `/menu/categories/[id]` | EditMenuCategoryPage | Y | ✓ | ✓ | ✓ | |
| `/menu/bundle-products` | BundleProductsPage | Y | ✓ | ✓ | ✓ | |
| `/menu/bundle-products/new` | NewBundleProductPage | Y | ✓ | ✓ | ✓ | |
| `/menu/bundle-products/[id]` | EditBundleProductPage | Y | ✓ | ✓ | ✓ | Component validation `if (!c)` always false. Group removal index may miscalculate. |
| `/menu/allergens` | AllergensPage | Y | ✓ | ✓ | ✓ | |
| `/menu/allergens/new` | NewAllergenPage | Y | ✓ | ✓ | ✓ | |
| `/menu/allergens/[id]` | EditAllergenPage | Y | ✓ | ✓ | ✓ | |
| `/menu/dietary-tags` | DietaryTagsPage | Y | ✓ | ✓ | ✓ | |
| `/menu/dietary-tags/new` | NewDietaryTagPage | Y | ✓ | ✓ | ✓ | |
| `/menu/dietary-tags/[id]` | EditDietaryTagPage | Y | ✓ | ✓ | ✓ | |
| `/menu/tax-categories` | TaxCategoriesPage | Y | ✓ | ✓ | ✓ | |
| `/menu/tax-categories/new` | NewTaxCategoryPage | Y | ✓ | ✓ | ✓ | |
| `/menu/tax-categories/[id]` | EditTaxCategoryPage | Y | ✓ | ✓ | ✓ | |

### Feature: Inventory (14 route files)
| Route | Component | H | E | L | B | Remarks |
|-------|-----------|----|---|---|---|---|---------|
| `/inventory` → redirect | InventoryIndex | Y | ✓ | ✓ | ✓ | |
| `/inventory/items` | InventoryItemsPage | Y | ✓ | ✓ | ✓ | |
| `/inventory/items/new` | NewInventoryItemPage | Y | ✓ | ✓ | ✓ | |
| `/inventory/items/[id]` | EditInventoryItemPage | Y | ✗ | ✓ | ✓ | `saveAllTr` has zero try-catch; upload handler inline in JSX |
| `/inventory/categories` | InventoryCategoriesPage | Y | ✓ | ✓ | ✓ | |
| `/inventory/categories/new` | NewInventoryCategoryPage | Y | ✓ | ✓ | ✓ | |
| `/inventory/categories/[id]` | EditInventoryCategoryPage | Y | ✓ | ✓ | ✓ | |
| `/inventory/stocks` | InventoryStocksPage | Y | ✓ | ✓ | ✓ | |
| `/inventory/stocks/[id]` | EditStockPage | Y | ✓ | ✓ | ✓ | |
| `/inventory/suppliers` | SuppliersPage | Y | ✓ | ✓ | ✓ | |
| `/inventory/suppliers/new` | NewSupplierPage | Y | ✓ | ✓ | ✓ | |
| `/inventory/suppliers/[id]` | EditSupplierPage | Y | ✓ | ✓ | ✓ | |
| `/inventory/movements` | StockMovementsPage | Y | ✓ | ✓ | ✓ | |
| `/inventory/purchase-orders` | PurchaseOrdersPage | Y | ✓ | ✓ | ✓ | Two store filter dropdowns (top-level + drawer) can cause race conditions. |

### Feature: Staff (7 route files)
| Route | Component | H | E | L | B | Remarks |
|-------|-----------|----|---|---|---|---|---------|
| `/staff` | StaffPage | Y | ✓ | ✓ | ✓ | |
| `/staff/new` | NewStaffPage | Y | ✓ | ✓ | ✓ | |
| `/staff/[id]` | EditStaffPage | Y | ✓ | ✓ | ✓ | |
| `/staff/roles` | StaffRolesPage | Y | ✓ | ✓ | ✓ | |
| `/staff/attendance` | StaffTimeEventsPage | Y | ✓ | ✓ | ✓ | |
| `/staff/shifts` | StaffShiftsPage | Y | ✓ | ✓ | ✓ | Has inline instruction cards — good UX. |
| `/staff/tips` | StaffTipsPage | Y | ✓ | ✓ | ✓ | |

### Feature: Customers (4 route files)
| Route | Component | H | E | L | B | Remarks |
|-------|-----------|----|---|---|---|---|---------|
| `/customers` | CustomersPage | Y | ✓ | ✓ | ✓ | Debounced search |
| `/customers/[id]` | CustomerDetailPage | Y | ✗ | ✓ | ✓ | **Critical**: `fetchTab` has no try/catch — tab fetch failures are unhandled promises. Wallet topup/deduct also use `api.getRaw`. 795-line component. |
| `/customers/devices` | CustomerDevicesPage | N | ✓ | ✓ | ✓ | No help article |
| `/customers/consents` | CustomerConsentsPage | N | ✓ | ✓ | ✓ | No help article |

### Feature: Orders & Refunds (3 route files)
| Route | Component | H | E | L | B | Remarks |
|-------|-----------|----|---|---|---|---|---------|
| `/orders` | OrdersPage | Y | ✓ | ✓ | ✓ | |
| `/orders/[id]` | OrderDetailPage | Y | ✓ | ✓ | ✓ | `loadPayments` has no cancelled guard |
| `/refunds` | RefundsPage | Y | ✓ | ✓ | ✓ | No error.tsx/loading.tsx |

### Feature: Marketing & Promotions (17 route files across rewards/vouchers/promotions/surveys/referrals/marketing/checkins)

| Route | Component | H | E | L | B | Remarks |
|-------|-----------|----|---|---|---|---|---------|
| `/marketing` → redirect | MarketingIndex | Y | ✓ | ✓ | ✓ | |
| `/marketing/campaigns` | CampaignsPage | Y | ✓ | ✓ | ✓ | |
| `/marketing/campaigns/new` | NewCampaignPage | Y | ✓ | ✓ | ✓ | |
| `/marketing/campaigns/[id]` | EditCampaignPage | Y | ✗ | ✓ | ✓ | `api.getRaw` mismatch; non-404 errors silently swallowed; `handleSend` no loading state |
| `/marketing/campaigns/settings` | CampaignSettingsPage | N | ✓ | ✓ | ✓ | No help article |
| `/rewards` | RewardsPage | Y | ✓ | ✓ | ✓ | |
| `/rewards/new` | NewRewardPage | Y | ✓ | ✓ | ✓ | |
| `/rewards/[id]` | EditRewardPage | Y | ✗ | ✓ | ✓ | `upsertTranslation` no try-catch. `reward_name` mapped to wrong i18n key. |
| `/vouchers` | VouchersPage | Y | ✓ | ✓ | ✓ | |
| `/vouchers/new` | NewVoucherPage | Y | ✓ | ✓ | ✓ | |
| `/vouchers/[id]` | EditVoucherPage | Y | ✗ | ✓ | ✓ | Same `upsertTranslation` issue. `discount_value` reset on type change without confirmation. |
| `/vouchers/report` | VoucherReportPage | N | ✓ | ✓ | ✓ | No help article |
| `/promotions` | PromotionsPage | N | ✓ | ✓ | ✓ | No help article |
| `/promotions/new` | NewPromotionPage | N | ✓ | ✓ | ✓ | |
| `/promotions/[id]` | EditPromotionPage | N | ✓ | ✓ | ✓ | |
| `/surveys` | SurveysPage | N | ✓ | ✓ | ✓ | No help article |
| `/surveys/new` | NewSurveyPage | N | ✓ | ✓ | ✓ | |
| `/surveys/[id]` | EditSurveyPage | N | ✓ | ✓ | ✓ | Refetch after save gets question IDs — no error handling if refetch fails |
| `/surveys/report` | SurveyReportPage | N | ✓ | ✓ | ✓ | No help article |
| `/referrals` | ReferralsPage | N | ✓ | ✓ | ✓ | No pagination; hardcoded `per_page=100`. No help article. |
| `/referrals/settings` | ReferralSettingsPage | N | ✓ | ✓ | ✓ | Inefficient: fetches ALL config keys for one value |
| `/checkins` | CheckinsPage | N | ✓ | ✓ | ✓ | No pagination; errors silently swallowed. No help article. |
| `/checkins/settings` | CheckinSettingsPage | N | ✓ | ✓ | ✓ | Non-transactional save; hardcoded English labels |

### Feature: Content (16 route files)
| Route | Component | H | E | L | B | Remarks |
|-------|-----------|----|---|---|---|---|---------|
| `/content` → redirect | ContentIndex | Y | ✓ | ✓ | ✓ | |
| `/content/info-cards` | InfoCardsPage | Y | ✓ | ✓ | ✓ | No pagination |
| `/content/info-cards/new` | NewInfoCardPage | Y | ✓ | ✓ | ✓ | |
| `/content/info-cards/[id]` | EditInfoCardPage | Y | ✓ | ✓ | ✓ | |
| `/content/products` | ProductCardsPage | Y | ✓ | ✓ | ✓ | No pagination; missing alt text |
| `/content/products/new` | NewProductCardPage | Y | ✓ | ✓ | ✓ | |
| `/content/products/[id]` | EditProductCardPage | Y | ✓ | ✓ | ✓ | |
| `/content/events` | EventsPage | Y | ✓ | ✓ | ✓ | |
| `/content/events/new` | NewEventPage | Y | ✓ | ✓ | ✓ | |
| `/content/events/[id]` | EditEventPage | Y | ✓ | ✓ | ✓ | |
| `/content/events/report` | EventReportPage | Y | ✓ | ✓ | ✓ | |
| `/content/system` | SystemPagesPage | Y | ✓ | ✓ | ✓ | |
| `/content/system/new` | NewSystemPagePage | Y | ✓ | ✓ | ✓ | |
| `/content/system/[id]` | EditSystemPagePage | Y | ✓ | ✓ | ✓ | |
| `/content/pwa-splash` | PwaSplashScreenPage | N | ✓ | ✓ | ✓ | No help article. `fetch` shadows global fetch. |
| `/content/pwa-splash/new` | NewPwaSplashPage | N | ✓ | ✓ | ✓ | |
| `/content/pwa-splash/[id]` | EditPwaSplashPage | N | ✓ | ✓ | ✓ | |

### Feature: Other Admin Pages
| Route | Component | H | E | L | B | Remarks |
|-------|-----------|----|---|---|---|---|---------|
| `/reservations` | ReservationsPage | Y | ✓ | ✓ | ✓ | No status-change loading indicator |
| `/tables` | TablesPage | Y | ✓ | ✓ | ✓ | Has inline help guide. Duplicate `handleGenerateQr`/`handleRegenerateQr`. |
| `/feedback` | FeedbackPage | Y | ✓ | ✓ | ✓ | Good star rating chart |
| `/equipment` | EquipmentPage | Y | ✓ | ✓ | ✓ | |
| `/equipment/new` | NewEquipmentPage | Y | ✓ | ✓ | ✓ | |
| `/equipment/[id]` | EditEquipmentPage | Y | ✓ | ✓ | ✓ | |
| `/equipment/reports` | EquipmentReportsPage | Y | ✓ | ✓ | ✓ | |
| `/hygiene` | HygienePage | Y | ✓ | ✓ | ✓ | Hardcoded error strings |
| `/reports` | ReportsPage | Y | ✓ | ✓ | ✓ | Filter changes have no loading feedback. No debounce. |
| `/audit-log` | AuditLogPage | Y | ✓ | ✓ | ✓ | Clean implementation |
| `/settings` | SettingsPage | Y | ✗ | ✓ | ✓ | Optimistic update may leave stale state on reload failure. Boolean toggle fires immediately without confirmation. |
| `/settings/payment-gateway` | PaymentGatewayPage | N | ✓ | ✓ | ✓ | No help article |
| `/settings/twilio-verify` | TwilioVerifyPage | N | ✓ | ✓ | ✓ | No help article |
| `/settings/version-control` | VersionControlPage | N | ✓ | ✓ | ✓ | No help article |
| `/translations` | TranslationPage | Y | ✓ | ✓ | ✓ | Has inline help box |
| `/admins` | AdminUsersPage | Y | ✓ | ✓ | ✓ | Message classification fragile (`msg.includes("Failed")`) |
| `/admins/roles` | AdminRolesPage | Y | ✓ | ✓ | ✓ | Same fragile msg classification. Edit form doesn't reset after save. |
| `/profile` | AdminProfilePage | Y | ✓ | ✓ | ✓ | Clean. Uses `parseApiError`. |
| `/help` | AdminHelpReaderPage | N/A | ✓ | ✓ | ✓ | Help system self. ✓ has audience filter. |
| `/help/[slug]` | AdminHelpArticleDetailPage | N/A | ✓ | ✓ | ✓ | Uses `dangerouslySetInnerHTML`. |
| `/help-articles` | HelpArticlesPage | N/A | ✓ | ✓ | ✓ | CRUD list. ✓ fixed error handling in round 30. |
| `/help-articles/new` | NewHelpArticlePage | N/A | ✓ | ✓ | ✓ | |
| `/help-articles/[id]` | EditHelpArticlePage | N/A | ✓ | ✓ | ✓ | |

### Admin Portal Summary
- **Pages reviewed:** 103
- **Help coverage gaps:** ~28 pages without dedicated help articles — primarily settings sub-pages, operations pages (checkins/referrals/surveys), content sub-pages (pwa-splash)
- **Error handling issues:** stores/[id] (critical), customers/[id] (critical), marketing/campaigns/[id], rewards/[id], vouchers/[id], settings
- **API method mismatches:** ~8 pages use `api.getRaw` instead of `api.get` causing potential `undefined` access on `.items`
- **ErrorBoundary:** ✓ FIXED in round 30 — added to layout.tsx

---

## 2. Staff Portal

**21 page components, all 18 functional pages have help coverage (100%)**

### Audit Legend
- Same as admin portal

### Feature: Dashboard & Auth
| Route | Component | API Endpoints | H | E | L | B | Remarks |
|-------|-----------|---------------|---|---|---|---|---------|
| `/` | HomePage | `GET /staff/dashboard` | Y | ✓ | ✓ | ✓ | Clean. Uses `usePolling`. **Fixed in round 30**: added Help button to dashboard. |
| `/login` | LoginPage | `GET /stores`, `GET /staff/auth/names`, `POST /auth/login` | Y | ✓ | ✓ | ✓ | Good mounted guard. Hardcoded "Login failed" fallback. |
| `/profile` | ProfilePage | `GET /staff/auth/me`, `POST change-password/change-pin` | Y | ✓ | ✓ | ✓ | Admin-mode guard for security controls. |

### Feature: POS (2 pages)
| Route | Component | H | E | L | B | Remarks |
|-------|-----------|----|---|---|---|---|---------|
| `/pos` | PosPage | Y | ✗ | ✓ | ✓ | Store config fetch fails silently (console.error only). 823-line component. |
| `/pos/display` | PosDisplayPage | Y | ✗ | ✓ | ✓ | QR gen fails silently. Hardcoded "LOKA Espresso" default. |

### Feature: Kitchen (2 pages)
| Route | Component | H | E | L | B | Remarks |
|-------|-----------|----|---|---|---|---|---------|
| `/kitchen` | KitchenPage | Y | ✓ | ✓ | ✓ | Good. Kanban/list views, audio alerts, seq-based race protection. |
| `/kitchen/[id]` | KitchenDetailPage | Y | ✓ | ✓ | ✓ | **Fixed in round 30**: removed hardcoded RM currency prefix. `label === "Total"` comparison still fragile for i18n. |

### Feature: Orders & Tables
| Route | Component | H | E | L | B | Remarks |
|-------|-----------|----|---|---|---|---|---------|
| `/orders` | OrdersPage | Y | ✓ | ✓ | ✓ | Clean with tabs/filters |
| `/tables` | TablesPage | Y | ✓ | ✓ | ✓ | Hardcoded English in EmptyState descriptions |

### Feature: Operations (5 pages)
| Route | Component | H | E | L | B | Remarks |
|-------|-----------|----|---|---|---|---|---------|
| `/reservations` | ReservationsPage | Y | ✓ | ✓ | ✓ | Hardcoded English plural suffix |
| `/wallet` | WalletPage | Y | ✓ | ✓ | ✓ | Comprehensive — 9 API calls. Good PIN rate-limiting. |
| `/equipment` | EquipmentPage | Y | ✓ | ✓ | ✓ | Photo upload/preview |
| `/inventory` | InventoryPage | Y | ✓ | ✓ | ✓ | Inline reorder-level highlighting |
| `/grease-trap` | GreaseTrapPage | Y | ✓ | ✓ | ✓ | Before/after photo uploads |
| `/garbage` | GarbagePage | Y | ✓ | ✓ | ✓ | Photo upload/preview |
| `/wastage` | WastagePage | Y | ✓ | ✓ | ✓ | Reason values are hardcoded English in POST body |

### Feature: Personal (3 pages)
| Route | Component | H | E | L | B | Remarks |
|-------|-----------|----|---|---|---|---|---------|
| `/time-clock` | TimeClockPage | Y | ✓ | ✓ | ✓ | Good. Clean status machine, elapsed timer. |
| `/shifts` | ShiftsPage | Y | ✓ | ✗ | ✓ | Text-only loading (no SkeletonCard). `.then/.catch` chain instead of async/await. |
| `/tasks` | TasksPage | Y | ✓ | ✗ | ✓ | Text-only loading. Manual `setInterval` instead of `usePolling`. |

### Feature: Help (2 pages)
| Route | Component | H | E | L | B | Remarks |
|-------|-----------|----|---|---|---|---|---------|
| `/help` | StaffHelpPage | N/A | ✓ | ✓ | ✓ | **Fixed in round 30**: API unwrapping mismatch causing empty list |
| `/help/[slug]` | StaffHelpArticlePage | N/A | ✓ | ✓ | ✓ | **Fixed in round 30**: markdown `li` grouping. Uses `dangerouslySetInnerHTML` without sanitization. |

### Staff Portal Summary
- **Pages reviewed:** 21
- **Help coverage:** 100% (all 18 functional pages have help articles in `guide/staff/`)
- **Error handling:** 2 pages with swallowed errors (pos config, pos/display QR)
- **ErrorBoundary:** ✓ FIXED in round 30 — added to AuthProvider wrapper
- **Hardcoded strings:** RM currency ✓ fixed; reservation plural, wastage reason values, emptyState descriptions remain

---

## 3. Customer PWA

**26 page-level components, ~22 guide articles in `guide/customer/`**

### Feature: Core Experience
| Component | API Endpoints | H | E | L | B | Remarks |
|-----------|---------------|---|---|---|---|---------|
| HomePage | `GET /menu/items` (×2), `/promos/banners`, `/content/information`, `/content/products` | Y | ✓ | ✓ | ✓ | 3 fetchers with compound isLoading |
| MenuPage | `GET /menu/categories`, `/menu/items`, `/menu/bundle-products` | Y | ✓ | ✓ | ✓ | IntersectionObserver lifecycle complex but works |
| CartPage | `GET /menu/items/:id` | Y | ✓ | ✓ | ✓ | |
| CheckoutPage | `GET /payments/config`, `/menu/bundle-products`, `POST /payments/intent` (+cancel) | Y | ✓ | ✓ | ✓ | Good double-submit prevention. `saveDraft` called too frequently. |
| OrdersPage | `GET /orders` (×2), `POST /orders/:id/reorder`, `GET /cart/items` | Y | ✓ | ✓ | ✓ | **Fixed in round 30**: past pagination stale `pastPage` state |
| OrderDetailPage | `GET /orders/:id`, payment config/intent/confirm/cancel, reorder, cancel | Y | ✓ | ✓ | ✓ | Reorder polling fragile (setTimeout loop) |

### Feature: Loyalty & Wallet
| Component | API Endpoints | H | E | L | B | Remarks |
|-----------|---------------|---|---|---|---|---------|
| WalletPage | `GET /wallet/ledger/me`, `POST /wallet/topup/checkout` | Y | ✓ | ✓ | ✓ | Good `returnHandledRef` pattern |
| MyRewardsPage | (via walletStore) | Y | ✓ | ✓ | ✓ | Redundant double `refreshWallet` call |
| RewardsPage | `GET /rewards/catalog`, `POST /rewards/:id/redeem` | Y | ✓ | ✓ | ✓ | Clean |

### Feature: Profile & Settings
| Component | API Endpoints | H | E | L | B | Remarks |
|-----------|---------------|---|---|---|---|---------|
| ProfilePage | `GET /orders?per_page=3` | Y | ✓ | ✗ | ✓ | No loading indicator for recent orders |
| AccountDetailsPage | `GET /me`, `PUT /me`, `PUT /me/avatar` | Y | ✓ | ✗ | ✓ | No loading indicator for initial `/me` fetch. Dead `clearTimeout` return. |
| PaymentMethodsPage | `GET /payments/methods`, `DELETE /methods/:id`, `PUT /methods/:id/default` | Y | ✓ | ✓ | ✓ | Remove waits for API before UI update — correct |
| SettingsPage | `GET /content/legal/about`, `GET /version.json` | Y | ✓ | ✗ | ✓ | No loading indicator |
| SavedAddressesPage | Full CRUD `/me/addresses` | Y | ✓ | ✓ | ✓ | Good duplicate label prevention |
| NotificationsPage | `GET /config/bootstrap`, `/notifications/me`, `PATCH /notifications/me/:id/read` | Y | ✓ | ✓ | ✓ | Sequential mark-all-read |

### Feature: Content & Promotions
| Component | API Endpoints | H | E | L | B | Remarks |
|-----------|---------------|---|---|---|---|---------|
| PromotionsPage | `GET /promos/banners`, `/promos/banners/:id/status+claim`, survey get/post | Y | ✓ | ✓ | ✓ | Loads promotions on mount only — no retry button in empty state |
| InformationPage | `GET /content/information` (+ list and by-slug) | Y | ✓ | ✓ | ✓ | |
| EventsPage | `GET /content/events?limit=20`, `POST /events/:id/rsvp` | Y | ✓ | ✓ | ✓ | **Fixed in round 30**: silent error swallow now shows toast |
| LegalPage | `GET /content/legal/:key` | Y | ✓ | ✓ | ✓ | Hardcoded search placeholder language |
| ReservationsPage | `GET /reservations`, `/stores`, `POST /reservations`, `DELETE /reservations/:id` | Y | ✓ | ✓ | ✓ | |

### Feature: Other
| Component | API Endpoints | H | E | L | B | Remarks |
|-----------|---------------|---|---|---|---|---------|
| CheckinPage | `GET /checkin`, `POST /checkin` | Y | ✗ | ✓ | ✓ | **Intentionally** swallows load errors (user may not be logged in). All inline styles — inconsistent. |
| GuestPayPage | `GET /payments/guest-pay/:orderId`, `POST /payments/guest-pay/:orderId` | N | ✓ | ✓ | ✓ | **No help article** for critical walk-in payment flow. |
| HelpSupportPage | `GET /public/help/articles`, `POST /feedback` | Y | ✗ | ✓ | ✓ | **Fixed in round 30**: integrated with help_articles API. XSS risk from `dangerouslySetInnerHTML`. |
| AuthFlow | `POST /auth/resend-otp` + hooks | Y | ✓ | ✓ | ✓ | Good abstraction with `usePhoneAuth` hook |

### Customer PWA Summary
- **Components reviewed:** 26
- **Help coverage:** 25/26 (GuestPayPage is the only gap)
- **ErrorBoundary:** ✓ FIXED in round 30 — added to AppShell renderPage wrapper
- **Bugs fixed in round 30:** EventsPage silent swallow, OrdersPage pastPage pagination
- **Known issues remaining:** CheckinPage all inline styles, XSS in HelpSupportPage, no loading indicators on 3 profile subpages, GuestPayPage has no help article

---

## 4. Cross-Cutting Issues Fixed (Round 30)

| Fix | Portal(s) | Severity |
|-----|-----------|----------|
| Staff portal help page empty list (API pagination unwrapping) | Staff | CRITICAL |
| Customer PWA HelpSupportPage integrated with help_articles API | Customer | MEDIUM |
| Markdown renderer LI grouping in help article pages | Admin + Staff | MEDIUM |
| Missing `help.load_article_failed` in Alembic translation seed | Backend | LOW |
| `e.message` undefined crash in help-articles CRUD | Admin | LOW |
| Added Help button to staff dashboard (no nav link existed) | Staff | — |
| Added `dashboard.help` translation key | Staff + Backend | — |
| **Created ErrorBoundary components for all three portals** | All | CRITICAL |
| **Fixed hardcoded RM currency in kitchen detail page** | Staff | HIGH |
| **Fixed EventsPage silent error swallow** | Customer | HIGH |
| **Fixed OrdersPage pagination stale pastPage state** | Customer | HIGH |

---

## 5. Help Article Coverage Gaps

### Gaps that need new help articles (or sections added to existing ones):

| Portal | Missing Coverage | Suggested Actions |
|--------|-----------------|-------------------|
| Admin | `/stores/settings` (store defaults config) | Add section to `guide/admin/stores.md` |
| Admin | `/marketing/campaigns/settings` | Add section to `guide/admin/marketing.md` |
| Admin | `/checkins` + `/checkins/settings` | Add `guide/admin/checkins.md` |
| Admin | `/referrals` + `/referrals/settings` | Add section to `guide/admin/marketing.md` |
| Admin | `/surveys` (all 4 routes) | Create `guide/admin/surveys.md` |
| Admin | `/promotions` (all 3 routes) | Add section to `guide/admin/marketing.md` |
| Admin | `/vouchers/report` | Add section to `guide/admin/marketing.md` |
| Admin | `/content/pwa-splash` (all 3 routes) | Add section to `guide/admin/content.md` |
| Admin | `/customers/devices` + `/customers/consents` | Add section to `guide/admin/customers.md` |
| Admin | `/settings/payment-gateway`, `/settings/twilio-verify`, `/settings/version-control` | Add sections to `guide/admin/settings.md` |
| Customer | GuestPayPage (walk-in QR payment) | Create `guide/customer/guest-pay.md` or add to `checkout-and-payment.md` |

### Articles that exist and are properly mapped:
- **Admin:** dashboard, stores, menu, inventory, staff, customers, orders-and-refunds, marketing, loyalty, content, reports-and-audit, settings, translations, role-access-matrix — 14 files
- **Staff:** getting-started, pos-checkout, kitchen-display, orders-and-tables, reservations, wallet, time-clock-and-shifts, tasks, operations, hardware-peripherals, role-access-matrix — 11 files
- **Customer:** getting-started, menu-and-ordering, checkout-and-payment, orders-and-order-detail, promotions-and-rewards, profile-and-settings, wallet-and-loyalty, reservations-and-events, checkin-and-referral, information-and-events, help-and-support — 12 files
- **General:** index, faq — 2 files

---

## Remarks for Future Audits

- Audit status: **COMPLETE** for all three portals (103 admin pages + 21 staff pages + 26 customer PWA components)
- Admin portal pages marked above with remarks on error handling and missing help coverage
- Staff portal has 100% help coverage — no new articles needed
- Customer PWA has 1 gap (GuestPayPage)
- ErrorBoundary now wraps all three portals — any future crash will show a graceful fallback instead of a white screen
- The `api.getRaw` vs `api.get` mismatch documented above affects ~8 admin pages — these should be reviewed in a future round
- Translation `upsertTr` without try/catch affects 6 admin pages (menu/items/[id], menu/bundle-products/[id], inventory/items/[id], rewards/[id], vouchers/[id], surveys/[id]) — same boilerplate pattern, suggest refactoring to shared hook
