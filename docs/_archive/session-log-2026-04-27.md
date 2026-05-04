# Session Log — 2026-04-27

> **Focus:** Admin frontend API fixes, response key fixes, CSS collision fixes, QR system overhaul, mobile service crew view, UI/UX improvements

---

## Phase 1: API Path Verification

Audited all 113 API calls across 43 frontend files against backend router (169 routes).

**Fixed (2 critical 404s):**
- `MenuPage.tsx:64` — `POST /categories` → `POST /admin/categories`
- `MenuPage.tsx:91` — `POST /menu` → `POST /admin/items`

All other endpoints verified correct.

---

## Phase 2: Response Key Verification

Found and fixed 14 response key breakages (6 CRITICAL, 8 HIGH).

**CRITICAL (empty pages):**
1. `useMerchantData.ts:113` — `setCategories(cats)` → added `data.items` extraction
2. `useMerchantData.ts:117` — `setMenuItems(json)` → added `data.items` extraction
3. `useMerchantData.ts:126` — `setInventory(json)` → added `data.items` extraction
4. `InventoryPage.tsx:80` — Categories: `Array.isArray(data) ? data : []` → added `data.items`
5. `SurveysPage.tsx:89` — Vouchers: `d.vouchers ?? []` → `d.items ?? d.vouchers ?? []`
6. `InformationPage.tsx:114` — `data.cards || []` → `data.items || data.cards || []`

**HIGH (dead fallback keys removed):**
7. `useMerchantData.ts:66` — removed `data.stores` fallback
8. `useMerchantData.ts:99` — removed `data.orders` fallback
9. `useMerchantData.ts:137` — removed `data.tables` fallback
10. `useMerchantData.ts:148` — removed `data.tiers` fallback
11. `StaffPage.tsx:98` — removed `data.staff` fallback
12. `KitchenDisplayPage.tsx:38` — removed `data.orders` fallback
13. `POSTerminalPage.tsx:82` — removed `data.customers` fallback
14. `SurveysPage.tsx:71` — `data.surveys` → `data.items || data.surveys`

---

## Phase 3: CSS Collision Fixes

**Prefix collisions resolved:**
- `ip-*` → `inf-*` in `information.css` + `InformationPage.tsx` (was colliding with InventoryPage's `ip-*` in `components.css`)
- `sp-*` → `sv-*` in `SurveysPage.tsx` + added `sv-*` definitions in `reports.css` (was colliding with StaffPage's `sp-*` in `staff-admin.css`)
- Deduplicated `srp-*` in `reports.css` — mobile-first base + desktop @media overrides

**Layout bugs fixed:**
- `tp-32` in `tables-admin.css` — added `display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`
- `components.css` mobile overrides — wrapped in `@media (max-width: 767px)` to prevent breaking desktop layouts

**Deleted dead CSS files:** `history.css`, `payment-methods.css`, `admin-extra.css` (confirmed dead code)

---

## Phase 4: Error Handling

**Silent catches:** 36 `catch {}` blocks across 18 files → all now log `console.error` with descriptive messages

**Inventory toggle:** Changed from `PUT /admin/stores/{id}/inventory/{id}` (full item body) to `PATCH /admin/stores/{id}/inventory/{id}/toggle` (just toggle)

**API error logging:** `apiFetch` no longer logs 404s to console (reduces noise from expected missing resources)

---

## Phase 5: QR Code System Overhaul

**Problem:** QR images fetched from server caused 404 errors for expired QR codes.

**Solution:** Client-side QR generation using `qrcode` npm package. Frontend **never** fetches `/admin/stores/{id}/tables/{id}/qr-image`.

**Implementation:**
- Installed `qrcode` npm package
- `useQrImages` hook generates QR data URLs client-side from `table.qr_code_url`
- Cache key includes `qr_generated_at` — detects regeneration, triggers re-generation
- Store switch clears all QR state immediately (prevents stale data)
- Expired QRs (no `qr_generated_at` or > 30 min) show placeholder instead of spinner
- Placeholder CSS: `.tp-qr-placeholder` with dashed border + QR icon + "No QR Code"

**Display states:**
| State | Render |
|-------|--------|
| No `qr_code_url` or expired | Placeholder |
| Active + generating | Spinner |
| Active + generated | QR image + countdown timer |

---

## Phase 6: Mobile Service Crew View

**Strategy:** Mobile view restricted to 4 pages for Service Crew. All other pages show "Desktop Only" message.

**Mobile-supported pages:**
| Page | Route | Purpose |
|------|-------|---------|
| Order Station | `#kitchen` | Update order status |
| POS Terminal | `#posterminal` | Burn vouchers/rewards |
| Tables | `#tables` | QR code management |
| Wallet Top-Up | `#walletTopup` | In-store top-up |

**Changes:**
- `MobileBottomNav.tsx` — 4 tabs: Tables, Station, POS, Top Up (matching sidebar order)
- `MobilePageGuard.tsx` — new component, wraps `PageRenderer`, shows "Desktop Only" for unsupported pages
- `mobile-guard.css` — new CSS file for guard styles
- Sidebar hamburger button — removed from page.tsx, hidden on mobile via CSS
- Sidebar backdrop — `display: none` on mobile
- Sidebar toggle — replaced with in-sidebar hamburger (`sb-hamburger-toggle`), old `sb-toggle` and `mobile-menu-btn` removed

**Mobile page CSS:**
- Kitchen Display: Full mobile-first base styles for all ~60 classes
- POS Terminal: Full mobile-first base styles for all ~50 classes
- Tables + Wallet Top-Up: Already had mobile base styles (only needed `!important` fix)

**Collapsible guide sections:** All 4 pages use same pattern — green card, `fa-circle-info` icon, chevron toggle, `showGuide` state, collapsed by default

**Header:** Mobile shows only 3 icon-only buttons (Profile, Password, Logout). Desktop adds notification bell and "Logout" text.

---

## Phase 7: Profile Update Feature

**Backend:**
- `UserUpdate` schema: added `phone: Optional[str] = None`
- `PUT /users/me` endpoint: added `if req.phone is not None: user.phone = req.phone`
- Database migration: `ALTER TABLE user_vouchers ADD COLUMN reserved_at TIMESTAMP WITH TIME ZONE` (fixes 500 error on wallet endpoint)

**Frontend:**
- `ProfileUpdateModal.tsx` — new component with name + phone inputs (email disabled, shown as read-only)
- `useAuth.ts` — stores `currentUserName`, `currentUserPhone`, `currentUserEmail`
- Header: 3 icon buttons — Profile, Password, Logout (no text on mobile, text on desktop)
- `desktop-only` class: hides notification bell and logout text on mobile

---

## Phase 8: Customer Search Unification

**Problem:** POS Terminal and Wallet Top-Up had different search UIs and both auto-picked the first result.

**Solution:** Created shared `CustomerSearchForm` component (`CustomerSearchForm.tsx`):
- Consistent styling via `customer-search.css`
- Exact match → auto-selects customer
- Partial match → shows list of results to tap
- No match → shows error message
- POS Terminal also passes QR Scanner as `children` prop

**Wallet balance fix:** After customer selection, Wallet Top-Up fetches `GET /admin/customers/{id}` to get accurate `wallet_balance` (list endpoint doesn't include it).

---

## Phase 9: Sidebar Navigation Reorganization

**Sidebar groups (desktop):**
- Counter Operations: Tables, Order Station, POS Terminal, Wallet Top-Up
- Store Management: **Orders**, Menu Management, Inventory, Staff
- CRM & Marketing: Customers, Rewards, Vouchers, Promotions, Information, Push Notifications, Feedback
- Analytics: Sales Reports, Marketing ROI
- System & Config: Store Settings, App Settings, PWA Settings, Loyalty Rules, Audit Log

**Bottom nav (mobile):** Tables, Station, POS, Top Up

**Sidebar toggle:** Replaced tiny `sb-toggle` circle with in-sidebar `sb-hamburger-toggle` (36×36px, fa-bars icon). Old `mobile-menu-btn` and `sb-toggle` removed entirely.

---

## Phase 10: Drawer Form UI/UX Overhaul

**Problem:** 3 forms (Menu, Inventory, Staff) had inconsistent layouts, wrong field proportions, inconsistent button placement.

**Solution:** Created shared drawer form pattern (`df-*` CSS classes):

| Class | Purpose |
|-------|---------|
| `df-section` | Section wrapper |
| `df-grid` | 2-column field grid |
| `df-grid-3` | 3-column equal grid |
| `df-grid-3-wide` | 3-column with first field wider (3fr 1fr 1fr) |
| `df-grid-2-wide-short` | 2-column with first field wider (3fr 1fr) |
| `df-field` | Label → input → hint vertical stack |
| `df-actions` | Bottom bar with border-top, buttons right-aligned |

**Drawer component:** Default width increased from 600px → 720px. All hardcoded widths removed from 9 drawers.

**Menu item form layout:**
| Row | Fields |
|-----|--------|
| 1 | Name (wide) \| Price (narrow) |
| 2 | Description (full width) |
| 3 | Category (full width) |
| 4 | Image File (full width) — NEW, uploads via `/upload/image` |
| 5 | Available \| Featured checkboxes |

**Menu/Inventory category modals:** Both have Name + Slug fields (slug auto-generated from name, editable for override).

**Inventory New form:**
| Row | Fields |
|-----|--------|
| 1 | Stock Name \| Unit |
| 2 | Category |
| 3 | Opening Stock \| Reorder Level |

**Inventory Adjustment form:**
| Row | Fields |
|-----|--------|
| 1 | Movement Type \| Quantity |
| 2 | Note/Reason \| Attachment |
| 3 | Cancel + Submit buttons |

**Staff form:**
| Row | Fields |
|-----|--------|
| 1 | Name (wide) \| User Type (narrow) |
| 2 | Email (wide) \| Role (narrow) |
| 3 | Store Assignments (wide) \| PIN Code (narrow) |

---

## Database Fix

```sql
ALTER TABLE user_vouchers ADD COLUMN reserved_at TIMESTAMP WITH TIME ZONE;
```

Fixes 500 error on `GET /admin/customers/{id}/wallet` — the `UserVoucher` model has `reserved_at` but the column was missing from the database.

---

## Files Modified

### Frontend Source (TSX)
- `src/app/page.tsx` — MobilePageGuard wrapper, profile modal, header icon-only buttons, removed mobile-menu-btn
- `src/hooks/useMerchantData.ts` — fixed 7 response key issues
- `src/hooks/useAuth.ts` — added user profile state (name, phone, email)
- `src/components/MobilePageGuard.tsx` — new file
- `src/components/MobileBottomNav.tsx` — 4 tabs, reordered
- `src/components/ProfileUpdateModal.tsx` — new file
- `src/components/pages/store-ops/MenuPage.tsx` — API paths, image upload, drawer form, category slug
- `src/components/pages/store-ops/InventoryPage.tsx` — response key, toggle endpoint, drawer form
- `src/components/pages/store-ops/KitchenDisplayPage.tsx` — removed dead fallback
- `src/components/pages/store-ops/StaffPage.tsx` — removed dead fallback, drawer form
- `src/components/pages/store-ops/TablesPage.tsx` — collapsible guide, QR fixes
- `src/components/pages/store-ops/POSTerminalPage.tsx` — removed dead fallback, collapsible guide, CustomerSearchForm
- `src/components/pages/store-ops/WalletTopUpPage.tsx` — collapsible guide, CustomerSearchForm, wallet balance fetch
- `src/components/pages/store-ops/CustomerSearchForm.tsx` — new shared component
- `src/components/pages/store-ops/tables/QRCodeGenerator.tsx` — client-side QR generation
- `src/components/pages/store-ops/tables/TableCard.tsx` — removed fetchFailed prop
- `src/components/pages/store-ops/pos-terminal/CheckoutPanel.tsx` — removed old always-visible guide
- `src/components/pages/marketing/SurveysPage.tsx` — 2 response key fixes, sp-* → sv-*
- `src/components/pages/marketing/InformationPage.tsx` — response key fix
- `src/components/modals/AddCategoryModal.tsx` — removed then restored slug field
- 11 modal files — silent catch fixes

### CSS Files
- `src/styles/kitchen-display.css` — full mobile-first rewrite
- `src/styles/pos-terminal.css` — full mobile-first rewrite + guide styles
- `src/styles/tables-admin.css` — mobile-first rewrite, grid fix, guide + placeholder styles
- `src/styles/information.css` — ip-* → inf-*
- `src/styles/reports.css` — srp-* dedup, sv-* additions
- `src/styles/components.css` — mobile overrides wrapped in @media, drawer form pattern (df-*), drawer panel improvements
- `src/styles/layout.css` — removed mobile-menu-btn, desktop-only class, header icon buttons
- `src/styles/sidebar.css` — removed sb-toggle, added sb-hamburger-toggle, overflow-x visible
- `src/styles/customer-search.css` — new file
- `src/styles/mobile-guard.css` — new file
- `src/styles/wallet-topup.css` — added guide styles
- `src/styles/inventory-admin.css` — grid improvements
- `src/styles/staff-admin.css` — form spacing improvements
- `src/app/globals.css` — added mobile-guard.css and customer-search.css imports

### Backend
- `app/schemas/user.py` — added `phone` to UserUpdate
- `app/api/v1/endpoints/common/users.py` — added phone update to PUT /users/me
- Database: `ALTER TABLE user_vouchers ADD COLUMN reserved_at TIMESTAMP WITH TIME ZONE`

### Documentation
- `frontend/AGENTS.md` — updated
- `AGENTS.md` (root) — updated
- `docs/20-admin-frontend-guide.md` — full rewrite
- `docs/18-css-architecture.md` — updated
- `docs/19-responsive-design-guide.md` — updated
- `docs/session-log-2026-04-27.md` — this file

### Dependencies
- Installed `qrcode` npm package + `@types/qrcode`

---

## Phase 11: CRM & Marketing Section Cleanup

**Audited 8 pages:** Rewards, Vouchers, Banners, Surveys, Information, Notifications, Feedback, Customers

**Action bar alignment (all 6 drawer forms):**
- Changed from custom CSS classes (`rfp-44`, `vfp-32`, `pp-21`, `sv-20`, `inf-23`, `ef-12`) → shared `df-actions`
- Buttons now right-aligned: checkbox (left via `marginRight: auto`) → Cancel → Submit
- Files: RewardsPage.tsx, VouchersPage.tsx, BannerManager.tsx, SurveysPage.tsx, InformationPage.tsx, NotificationsPage.tsx

**Dead response key cleanup:**
- `SurveysPage.tsx:71` — `data.surveys` removed from fallback
- `SurveysPage.tsx:89` — `d.vouchers` removed from fallback
- `InformationPage.tsx:114` — `data.cards` removed from fallback

**CSS prefix residue cleanup:**
- `SurveysPage.tsx` — 4 remaining `sp-*` classes renamed to `sv-*`: `sp-38`→`sv-38`, `sp-40`→`sv-40`, `sp-41`→`sv-41`, `sp-14`→`sv-14`

**Staff table restructured (9→5 columns):**
- Staff (name + role badge), Contact (email + phone), Stores, Status, Actions

**Inventory table restructured (7→4 columns):**
- Ingredient (name + category), Stock (balance + unit + reorder), Status, Actions

**Profile update:** `ProfileUpdateModal.tsx` — name + phone fields (email read-only)
**Password reset fix:** HQ staff without Staff record — uses `user_id` fallback, result shows copy-friendly email+password

**Backend fix:**
- `user_vouchers.reserved_at` column added (fixes 500 on wallet endpoint)
- `PUT /users/me` — added phone update
- `POST /admin/staff/{id}/reset-password` — handles both Staff.id and User.id

---

## Phase 12: Customer Detail Page — Full Consistency Overhaul

**All 6 tabs restructured with shared CSS classes:**

| Tab | Before | After |
|-----|--------|-------|
| Profile | Custom `cdp-*` classes, missing class on "Total Spent", edit form left-aligned | `cdp-profile-grid` + `cdp-field-list`/`cdp-field-row` for view, `df-*` for edit form. Right-aligned buttons. |
| Manage | 3 different CSS prefixes (`apd-*`, `avd-*`, `std-*`) for same pattern | Unified `ActionCard` component with `cdp-action-card`. All 3 dialogs use same card pattern. |
| Orders | No header, bare DataTable | `<h4>` header with icon + `df-section` wrapper |
| Loyalty | No header, hardcoded inline colors | `<h4>` header + `cdp-positive` class |
| Wallet | No header, hardcoded inline colors | `<h4>` header + `cdp-positive` class |
| Rewards | 6 pairs of duplicate CSS classes | Shared `cdp-item-list`, `cdp-item-card`, `cdp-code` |

**New shared CSS classes** (`settings-admin.css`):
- `cdp-loading`, `cdp-loading-spinner`, `cdp-empty`, `cdp-empty-text` — loading/empty states
- `cdp-header`, `cdp-header-card`, `cdp-avatar`, `cdp-name`, `cdp-subtitle` — header card
- `cdp-tab-bar`, `cdp-tab-btn` — tab navigation
- `cdp-section-title` — consistent section headings across all tabs
- `cdp-profile-grid`, `cdp-field-list`, `cdp-field-row`, `cdp-field-label` — profile layout
- `cdp-action-card`, `cdp-action-header`, `cdp-action-row`, `cdp-action-field`, `cdp-action-field-sm/md/lg` — manage dialogs
- `cdp-approve-card`, `cdp-approve-title`, `cdp-approve-desc` — approval cards
- `cdp-error`, `cdp-success`, `cdp-text-muted`, `cdp-text-success`, `cdp-text-error` — alerts/text colors
- `cdp-positive`, `cdp-negative` — value coloring
- `cdp-item-list`, `cdp-item-card`, `cdp-item-title`, `cdp-item-meta`, `cdp-code` — reward/voucher cards
- Mobile responsive: `@media (max-width: 767px)` for single-column grid, stacked action rows

**Notification bell removed** from header — admin doesn't need it (internal tool).

**Header buttons** — icon-only on all screens (Profile, Password, Logout). Removed `desktop-only` class and bell CSS.

---

## Phase 13: Drawer Conversions — Surveys, Notifications, Loyalty Rules, Store Settings

**SurveysPage** — inline page-replacing form → `<Drawer>` with `df-*` pattern. Title + Voucher (2-col), Description (full), Questions (dynamic add/remove, max 5), Active checkbox + buttons right-aligned.

**NotificationsPage** — inline expandable `EditForm` → `<Drawer>` with `df-*` pattern. Title + Audience (2-col), Body (full), Schedule Date + Time (2-col).

**LoyaltyRulesPage** — Add inline card + Edit Modal → both use `<Drawer>` with shared `TierForm`. Basic Info (Name + Sort Order / Min Points + Multiplier), Benefits (Discount + Free Delivery / Birthday + Options), Actions right-aligned.

**StoreSettingsPage** — Add/Edit both replaced entire page → both use `<Drawer>` with shared `StoreForm`. Basic Info (Name + Slug / Address), Contact (Phone + Pickup Lead), Location (Lat + Lng + Radius), Image (file upload), Integrations (checkboxes), Opening Hours (time picker), Actions right-aligned.

---

## Phase 14: Date Format Fixes

**BannerManager.tsx** — `slice(0, 16)` → `slice(0, 10)` for `type="date"` inputs (was giving `2024-11-01T00:00` instead of `2024-11-01`)
**InformationPage.tsx** — `slice(0, 10)` → `slice(0, 16)` for `type="datetime-local"` inputs (was giving `2024-11-01` instead of `2024-11-01T00:00`)

All 6 date inputs verified correct:
- BannerManager: `type="date"` + `slice(0, 10)` ✅
- InformationPage: `type="datetime-local"` + `slice(0, 16)` ✅
- VouchersPage: `type="datetime-local"` + `slice(0, 16)` ✅
- NotificationsPage: `type="date"` + `slice(0, 10)` ✅
- AddBroadcastModal: `type="date"` + empty init ✅
- DateFilter: `type="date"` + state-driven ✅

---

## Phase 15: SurveyReportPage srp-* Collision Fix

**Problem:** `srp-*` classes had conflicting definitions — `@media` section redefined them for a completely different context. On desktop, `srp-1` became `font-size: 24px` (error page title), but SurveyReportPage used it for row index. Layout was deformed on desktop.

**Fix:** Renamed all SurveyReportPage classes to `srpt-*`:
- `srp-1` → `srpt-idx`, `srp-2` → `srpt-name`, `srp-3` → `srpt-email`, `srp-4` → `srpt-date`
- `srp-9` → `srpt-title`, `srp-10` → `srpt-title-icon`, `srp-11` → `srpt-selector`
- `srp-12` → `srpt-empty`, `srp-13` → `srpt-stats`, `srp-14` → `srpt-stats-left`
- `srp-15` → `srpt-stats-icon`, `srp-16` → `srpt-stats-count`, `srp-17` → `srpt-stats-total`
- `srp-18` → `srpt-stats-page`, `srp-19` → `srpt-table`
- Added dedicated CSS in `reports.css` with mobile-first base + desktop grid overrides

---

## Phase 16: QR Code Console Noise Fix

**Problem:** Tables with `qr_code_url` set but QR data expired caused 404 errors in browser console. The `apiFetch` logged all non-200 responses.

**Fix:** `apiFetch` no longer logs 404s to console (`response.status !== 404`).

---

## Phase 17: Image Upload — Remove All URL Text Inputs

**Problem:** StoreSettingsPage and AddBannerModal asked users to paste image URLs instead of uploading files.

**Fix:**
- `StoreSettingsPage.tsx` — Image URL text input → file upload + `apiUpload('/upload/marketing-image')`
- `AddBannerModal.tsx` — Image URL text input → file upload + `apiUpload('/upload/marketing-image')`

All image inputs now use file upload (zero URL text inputs remain):
- MenuPage: `apiUpload('/upload/image')` ✅
- InformationPage: `ImageUploadField` + `apiUpload('/upload/information-image')` ✅
- BannerManager: `ImageUploadField` + `apiUpload('/upload/marketing-image')` ✅
- RewardsPage: file upload + `apiUpload('/upload/marketing-image')` ✅
- StoreSettingsPage: file upload + `apiUpload('/upload/marketing-image')` ✅
- AddBannerModal: file upload + `apiUpload('/upload/marketing-image')` ✅

---

## Phase 18: FeedbackPage + Remaining Cleanup

**FeedbackPage** — 3 empty `catch {}` blocks → `console.error` with messages. Page shows "No feedback yet" when API returns empty.

**Customers table** — restructured from 9 → 5 columns: Customer (name+phone), Contact (email+joined), Tier & Points (badge+points), Activity (spent+orders), Actions.

**Audit Log table** — restructured from 6 → 4 columns: Timestamp (with IP underneath), Who, Location, Action (with Status underneath).

**Sidebar toggle** — removed orphan `mobile-menu-btn` and `sb-toggle` CSS. Only `sb-hamburger-toggle` remains.

**Drawer default width** — 600px → 720px. All hardcoded widths removed from 9 drawers.

---

## Phase 19: User Table Split (admin_users + customers)

**Problem:** Single `users` table holds both admin/staff and customer accounts, differentiated by `user_type_id`. Bad for security and field management.

**Solution:** Split into two tables:

### New Models
- `admin_users` — admin/staff accounts (email + password auth, dashboard access)
- `customers` — customer accounts (OTP auth, PWA access)
- `customer_addresses` — replaces `user_addresses`
- `customer_device_tokens` — replaces `device_tokens`

### Migration (b2c3d4e5f6a7)
- Created new tables, copied data from `users` (user_type_id 1-3 → admin_users, 4 → customers)
- Added new FK columns on all referencing tables (customer_id, admin_user_id) while preserving old columns for backward compat
- Added `user_type` column to `token_blacklist` for polymorphic token lookup
- Reset auto-increment sequences for all new tables

### Auth System
- `get_current_user` now polymorphic: checks `user_type` claim in JWT to load from `admin_users` or `customers`
- Legacy tokens without `user_type` fall back to admin-first lookup
- JWT tokens now include `user_type: "admin"` or `"user_type": "customer"` claim
- `TokenBlacklist` — no FK constraint, `user_type` column added

### Endpoint Updates (52 files)
- All admin endpoints: `User` → `AdminUser` (24 files)
- All PWA/customer endpoints: `User` → `Customer` (10 files)
- Common endpoints: split by context (orders/wallet → Customer, config/upload → AdminUser)
- `users.py` — polymorphic profile endpoint (AdminUser or Customer)

### Backend Fixes
- `POST /admin/hq-staff` — now returns `temp_password` in response
- `POST /admin/stores/{id}/staff` — now returns `temp_password` in response
- `DELETE /admin/staff/{id}` — now handles both Staff records and AdminUser records (no more 404 for HQ users)
- `user_vouchers.reserved_at` column added (fixes 500 on wallet endpoint)
- `PUT /users/me` — added phone update support
- Sequence reset for all new tables (fixes duplicate key errors on creation)

---

## Phase 20: Staff Page Fixes

**Bug: Create button not working** — The Create button in the drawer had no `onClick={handleSubmit}` handler. Added it.

**Bug: Drawer not closing on success** — Success path called `setViewMode('list')` (no-op) instead of `closeForm()`. Fixed all 3 success paths to call `closeForm()`.

**Bug: Delete returning 404 for HQ users** — HQ users don't have `staff` records. Delete endpoint now falls back to `admin_users` table.

**Bug: Status toggle sending null ID** — HQ users don't have staff records, so `PUT /admin/staff/null` was called. Removed status toggle from table — status can only be changed via Edit form.

**UI: Staff Creation Notice** — Unified with Password Reset notice using `cdp-notice` CSS class. Both now:
- Green card with title, email, password, copy button
- Auto-fade after 2 minutes via CSS `animation: fadeOut 2min forwards` + `useEffect` timeout
- "Copy for WhatsApp / Email" button for easy sharing

---

## Verification

- TypeScript: `npx tsc --noEmit` — 0 errors
- ESLint: 0 errors, pre-existing warnings only
- Build: `npm run build` — compiled successfully
- Deploy: `docker compose up -d --build frontend backend` — running
- API endpoints: 27/27 tested pass
- All creation, edit, delete, and toggle operations verified
- All 26 sidebar pages verified for API correctness
- All drawer forms use `df-*` pattern with right-aligned buttons
- All image inputs use file upload (zero URL text inputs)
- All date inputs match their input type (`date` vs `datetime-local`)
- All table columns restructured for readability
- Mobile view restricted to 4 service crew pages
- QR codes generated client-side (zero server requests)
