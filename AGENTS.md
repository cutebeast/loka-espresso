# FNB Super App — Agent Documentation

## Project Overview

Multi-app F&B platform for Loka Espresso:
- **Backend**: FastAPI (Python) at `/api/v1`
- **Admin Frontend**: Next.js 16 (Hash router, pure CSS)
- **Customer PWA**: Next.js 16 (Zustand, pure CSS)

## Key Commands

```bash
# Backend
cd backend && uvicorn app.main:app --reload

# Migrations
cd backend && alembic upgrade head
cd backend && alembic revision --autogenerate -m "description"

# Seed database
cd backend && python scripts/seed.py

# Frontend builds
cd frontend && npm run dev
cd customer-app && npm run dev

# Docker (rebuild + deploy)
docker compose up -d --build frontend
docker compose up -d --build backend
docker compose up -d              # all services
```

## Project Conventions

### Backend
- SQLAlchemy async with mapped_column
- Pydantic v2 schemas with `from_attributes = True`
- FastAPI dependency injection for auth/db
- Response keys use `"message"` consistently
- Paginated list endpoints return `{ items: [...], total, page, page_size }`
- Audit logging via `log_action()`
- Single baseline migration + incremental migrations

### Frontend (Admin)
- No CSS framework — pure CSS in `src/styles/`
- Hash-based routing via `useHashRouter`
- `merchant-api.tsx` for all API calls with token refresh
- Mobile-first responsive via `@media (min-width: 768px)`
- **Mobile view is Service Crew only** — 4 pages: Order Station, POS Terminal, Tables, Wallet Top-Up
- All other pages show "Desktop Only" message on mobile
- Sidebar hidden on mobile (hamburger button removed)
- QR codes generated client-side via `qrcode` npm library (no server fetch for QR images)

### Customer PWA
- No Tailwind — pure CSS utilities from `utilities.css`
- Zustand stores for state management
- Design tokens in `src/lib/tokens.ts` (single source of truth)
- No inline styles for layout

## Session Changes (2026-04-27)

### Phase 1: API Path Fixes
- `MenuPage.tsx`: `POST /categories` → `POST /admin/categories`
- `MenuPage.tsx`: `POST /menu` → `POST /admin/items`

### Phase 2: Response Key Fixes (14 total)
- `useMerchantData.ts`: `fetchMenu` — added `data.items` extraction for categories and menu items
- `useMerchantData.ts`: `fetchInventory` — added `data.items` extraction
- `useMerchantData.ts`: Removed dead fallback keys (`data.stores`, `data.orders`, `data.tables`, `data.tiers`)
- `InventoryPage.tsx`: Categories fetch — added `data.items` fallback
- `SurveysPage.tsx`: Survey list — `data.surveys` → `data.items || data.surveys`
- `SurveysPage.tsx`: Voucher dropdown — `d.vouchers` → `d.items || d.vouchers`
- `InformationPage.tsx`: Cards — `data.cards` → `data.items || data.cards`
- `StaffPage.tsx`: Removed dead `data.staff` fallback
- `KitchenDisplayPage.tsx`: Removed dead `data.orders` fallback
- `POSTerminalPage.tsx`: Removed dead `data.customers` fallback

### Phase 3: CSS Collision Fixes
- Renamed `ip-*` → `inf-*` in `information.css` + `InformationPage.tsx` (was colliding with InventoryPage)
- Renamed `sp-*` → `sv-*` in `SurveysPage.tsx` + added `sv-*` CSS in `reports.css` (was colliding with StaffPage)
- Deduplicated `srp-*` in `reports.css` (mobile-first + desktop overrides)
- Fixed `tp-32` missing `display: grid` in `tables-admin.css`
- Wrapped mobile layout overrides in `components.css` in `@media (max-width: 767px)` — prevents breaking desktop

### Phase 4: Error Handling
- 36 silent `catch {}` blocks → all now log `console.error` with descriptive messages
- `InventoryPage.tsx`: Toggle uses `PATCH /admin/stores/{id}/inventory/{id}/toggle` instead of PUT
- `apiFetch`: 404s suppressed from console logging (reduces noise from expected missing resources)

### Phase 5: QR Code System Overhaul
- Installed `qrcode` npm package for client-side QR generation
- QR codes generated client-side from `table.qr_code_url` — zero server requests for QR images
- `useQrImages` hook: cache key includes `qr_generated_at` to detect regeneration
- Store switch: clears all QR state immediately (prevents stale data fetches)
- Expired QRs show placeholder instead of spinner or 404 errors
- Placeholder CSS: `.tp-qr-placeholder` with dashed border + QR icon

### Phase 6: Mobile View — Service Crew
- `MobileBottomNav`: 4 tabs only — Station, POS, Tables, Wallet
- `MobilePageGuard`: Shows "Desktop Only" for all pages except the 4 service crew pages
- Sidebar hamburger button: `display: none` on mobile
- Sidebar backdrop: `display: none` on mobile
- Kitchen Display CSS: Full mobile-first base styles added for all ~60 classes
- POS Terminal CSS: Full mobile-first base styles added for all ~50 classes
- Tables CSS: Already had mobile base styles (only needed `!important` fix)
- Wallet Top-Up CSS: Already had mobile base styles (only needed `!important` fix)
- Collapsible guide sections on Kitchen Display and Tables pages

### Phase 7: Profile Update + DB Fix
- `PUT /users/me` endpoint: added phone update support
- `UserUpdate` schema: added `phone: Optional[str] = None`
- DB fix: `ALTER TABLE user_vouchers ADD COLUMN reserved_at TIMESTAMP WITH TIME ZONE` (fixes 500 on wallet endpoint)
- `ProfileUpdateModal.tsx`: new component — name + phone (email disabled)
- `useAuth.ts`: stores user profile state (name, phone, email)
- Header: 3 icon buttons (Profile, Password, Logout). Notification bell hidden on mobile.

### Phase 8: Customer Search Unification
- Created shared `CustomerSearchForm.tsx` — used by POS Terminal and Wallet Top-Up
- Shows multiple results on partial match instead of auto-picking first
- Wallet Top-Up now fetches `GET /admin/customers/{id}` after selection for accurate `wallet_balance`

### Phase 9: Sidebar Navigation + Toggle
- Orders moved from Counter Operations to Store Management
- Bottom nav reordered: Tables, Station, POS, Top Up
- Sidebar toggle: replaced tiny `sb-toggle` with in-sidebar hamburger (`sb-hamburger-toggle`)
- Removed orphan `mobile-menu-btn` and `sb-toggle` CSS entirely

### Phase 10: Drawer Form UI/UX Overhaul
- Created `df-*` shared form pattern (grids, fields, labels, hints, actions)
- Drawer default width: 600px → 720px. All hardcoded widths removed.
- Menu item form: Name | Price / Description / Category / Image File / Available | Featured
- Inventory New: Stock Name | Unit / Category / Opening Stock | Reorder Level
- Inventory Adjust: Movement Type | Qty / Note+Attachment
- Staff: Name | Type / Email | Role / Store Assignments | PIN
- Menu item image upload: `apiUpload('/upload/image')` → `uploads/menu/`
- Category modals: both have Name + Slug fields (slug auto-generated, editable)

### Phase 19: User Table Split
- Split `users` table → `admin_users` (28 records) + `customers` (30 records)
- New models: `AdminUser`, `Customer`, `CustomerAddress`, `CustomerDeviceToken`
- Auth system: polymorphic `get_current_user` (checks `user_type` claim in JWT)
- JWT tokens now include `user_type: "admin"` or `"customer"` claim
- 52 endpoint files updated (admin → AdminUser, customer → Customer)
- Backend: `temp_password` returned in staff creation, delete handles both Staff and AdminUser
- DB: sequence reset, `user_vouchers.reserved_at` column added, `token_blacklist.user_type` added

### Phase 20: Staff Page Fixes
- Create button: added missing `onClick={handleSubmit}`
- Drawer close: success path now calls `closeForm()` instead of no-op `setViewMode()`
- Delete: handles HQ users without staff records (falls back to admin_users)
- Status toggle: removed from table (only via Edit form to prevent accidental deactivation)
- Notice boxes: unified styling (`cdp-notice`), auto-fade after 2 minutes

### Phase 22: Final Audit + Orphan Cleanup (2026-04-28)
- **Backend — `_blacklist_token`**: Fixed missing function that blocked logout + token refresh (HTTP 500 → NameError)
- **Backend — DeviceToken → CustomerDeviceToken**: Migrated `POST/DELETE /auth/device-token` from legacy `device_tokens` to `customer_device_tokens`
- **Backend — InventoryMovement FK**: `created_by` FK changed `users.id` → `admin_users.id`
- **Backend — MarketingCampaign FK**: `created_by` FK changed `users.id` → `admin_users.id`; `creator` relationship changed `User` → `AdminUser`
- **Backend — UserAddress orphan**: Deleted unused model + `user_addresses` DB table reference (data already in `customer_addresses` after Phase 19 migration)
- **Backend — `GET /auth/session`**: New endpoint returning `{"authenticated": bool}` (always 200, no 401) — frontend `checkAuth` now uses this instead of `/users/me` to eliminate browser console 401 warnings
- **Frontend — LoginScreen**: Added `autoComplete="current-password"` to password input (fixes Chrome DOM warning)
- **Frontend — Survey create validation**: Added empty question text check + at-least-one-filled guard
- **Frontend — Survey list**: Questions column reads `question_count` (what backend actually sends) instead of `questions?.length`
- **Frontend — Survey edit**: Fetches `GET /admin/surveys/{id}` to load full questions before populating edit form (prevents data loss)
- **Frontend — Survey reply button**: Removed redundant `fa-chart-bar` button (Survey Reports tab serves same purpose)
- **Frontend — CustomerDetailPage**: Stale fallback keys fixed (`data.orders`/`data.history`/`data.transactions` → `data.items`)
- **Frontend — SurveyReportPage**: Fixed `apiFetch` call passing raw `token` string instead of `undefined`
- **Frontend — BannerManager**: Misleading fallback shapes fixed (`{ surveys: [] }` → `{ items: [] }`)
- **Frontend — Rewards/Vouchers/Surveys backend bug**: User name resolution now uses `Customer` model instead of `AdminUser` (was always returning "Unknown"/"Anonymous")
- **Frontend — System reset**: Targets `customers` + `customer_addresses` + `customer_device_tokens` instead of legacy `users` + `user_addresses` + `device_tokens`
- **Frontend — Broadcasts**: Uses `CustomerDeviceToken` instead of legacy `DeviceToken`
- **CSS**: `staff-admin.css` deduplicated (~60 lines of overridden declarations removed), `promotions.css` sp-0/sp-10/sp-11/sp-15/sp-20 moved to `@media` block
- **Docs updated**: `02b-users.md` (split tables), `02h-staff.md` (FK fix)

### Phase 11: CRM & Marketing Section Cleanup
- Action bar alignment: all 6 drawer forms → shared `df-actions` (right-aligned buttons)
- Dead response keys removed: `data.surveys`, `d.vouchers`, `data.cards`
- SurveysPage `sp-*` → `sv-*` CSS prefix rename
- Staff table: 9 → 5 columns (Staff, Contact, Stores, Status, Actions)
- Inventory table: 7 → 4 columns (Ingredient, Stock, Status, Actions)
- Password reset: HQ staff without Staff record uses `user_id` fallback, copy-friendly result

### Phase 12: Customer Detail Page Consistency
- All 6 tabs use shared `cdp-*` CSS classes
- Manage tab: 3 different prefixes → unified `ActionCard` with `cdp-action-card`
- Orders/Loyalty/Wallet: added `<h4>` headers with icons
- Rewards: 6 pairs of duplicate CSS → shared `cdp-item-list`/`cdp-item-card`
- Profile tab: `cdp-profile-grid` + `cdp-field-list`/`cdp-field-row`
- Mobile responsive: `@media (max-width: 767px)` for stacked layouts
- Notification bell removed from header (admin doesn't need it)

### Phase 13: Drawer Conversions (Surveys, Notifications, Loyalty Rules, Store Settings)
- SurveysPage: inline page-replacing form → `<Drawer>` with `df-*`
- NotificationsPage: inline expandable EditForm → `<Drawer>` with `df-*`
- LoyaltyRulesPage: Add inline card + Edit Modal → both use `<Drawer>` with shared `TierForm`
- StoreSettingsPage: Add/Edit replaced entire page → both use `<Drawer>` with shared `StoreForm`

### Phase 14: Date Format Fixes
- BannerManager: `slice(0, 16)` → `slice(0, 10)` for `type="date"`
- InformationPage: `slice(0, 10)` → `slice(0, 16)` for `type="datetime-local"`
- All 6 date inputs verified correct against their input types

### Phase 15: SurveyReportPage srp-* Collision Fix
- Renamed all classes to `srpt-*` to avoid collision with desktop `@media` overrides
- Added dedicated CSS in `reports.css` with mobile-first base + desktop grid

### Phase 16: Image Upload — Remove All URL Text Inputs
- StoreSettingsPage: Image URL text input → file upload + `apiUpload('/upload/marketing-image')`
- AddBannerModal: Image URL text input → file upload + `apiUpload('/upload/marketing-image')`
- All image inputs now use file upload (zero URL text inputs remain)

### Phase 17: Audit Log + Customers Table Restructure
- Audit Log: 6 → 4 columns (Timestamp+IP, Who, Location, Action+Status)
- Customers: 9 → 5 columns (Customer, Contact, Tier&Points, Activity, Actions)
- FeedbackPage: 3 empty catches → `console.error`

### Phase 18: Tables QR + CSS Cleanup
- QR codes: client-side generation via `qrcode` npm, zero server requests
- QR placeholder for expired/missing codes
- `apiFetch`: 404s suppressed from console
- Sidebar toggle: orphan CSS removed, only `sb-hamburger-toggle` remains
- Drawer default width: 600px → 720px
- `settings-admin.css`: unclosed `@media` block fixed, brace balance corrected

## Documentation

See `docs/00-index.md` for full documentation index.

## Important

- Docker mounts `./uploads:/app/uploads` from project root
- **UPLOAD_DIR = `/app/uploads`** (Docker-compatible path in `.env` and `config.py`)
- Images organized by type: `/uploads/information/`, `/uploads/products/`, `/uploads/menu/`, `/uploads/marketing/`, `/uploads/avatars/`, `/uploads/splash/`, `/uploads/inventory/`
- **Filenames use UUID** (`uuid4().hex + extension`) — no collision risk
- **No image processing** on upload (resize/crop not implemented) — recommend 1200px wide JPEG/PNG for best results
- OTP bypass enabled in dev — disable in production
- Caddy handles HTTPS and reverse proxy in production
- Deploy frontend: `docker compose up -d --build frontend`
- Deploy backend: `docker compose up -d --build backend`
- **Auto-migration on deploy:** `docker-entrypoint.sh` runs `alembic upgrade head` before starting FastAPI

### Phase 23: Customer PWA Guest Journey + Store Management + Referral (2026-04-29)

#### Guest Journey Fixes
- `useAuthFlow.ts`: `PUBLIC_PAGES` now includes `cart`, `rewards`, `help-support`, `settings` (guest access without sign-in)
- `usePageRouter.ts`: `GUEST_RESTRICTED` covers all 14 auth-only pages; bottom nav triggers sign-in sheet instead of navigating
- `GuestGate.tsx`: Checks only `isAuthenticated` (not `isGuest`) — content only renders after login completes
- `WalletCard`: Uses `isAuthenticated` check — stays guest view until actual login
- `useNotifications.ts`: Only fetches unread count when `isAuthenticated` (no 401 for guests)
- `api.ts`: interceptor no longer reloads page on 422 refresh failures (guest users)
- 11 pages: unguarded API calls on mount now check `isAuthenticated` first

#### Store Management UI Consistency
- All pages: active/inactive uses `fa-toggle-on`/`fa-toggle-off` icon (green #16A34A / gray #9CA3AF) in Actions column
- MenuPage: Add-ons as separate column, status merged into Actions with toggle icon
- InventoryPage: duplicate Status column removed, stock status inline in Stock column
- StaffPage: Status badge column removed, toggle icon added to Actions; null ID fallback for HQ staff
- Menu/Inventory categories: toggle icon on each category row, delete button removed (soft-delete via toggle)
- Menu page cards: description removed, add button compact pill, price nowrap
- Dead code removed: `AddStaffModal.tsx`, `UserAddress` model, `ItemCard.tsx`

#### Referral System (Loyalty Points)
- Reward changed from wallet credit (RM) to loyalty points
- `commerce.py`: `credit_referral_points()` credits `LoyaltyAccount` + logs `LoyaltyTransaction`
- Config keys: `referral_reward_points` (default 50), `referral_min_orders` (default 1)
- PWA: `ReferralPage` with share code, stats, invited users list, copy/share buttons
- PWA navigation: `#referral` page accessible from Profile menu
- Backend: `require_role()` fixed for Customer users (no `role_id` column — uses `hasattr` guard)

#### Content Type System
- Renamed `content_type = 'promotion'` → `'event'` (avoiding confusion with promo banners)
- Admin InformationPage: Type column filter + content_type dropdown in form
- PWA homepage: separate Experiences + Products carousels (interleaved: info→product→info)
- `PromotionPopup` (splash): fetches `content_type=event`, shows 1 latest event card, transparent bg, 88vw×85vh
- PWA InformationPage: `contentType` prop filters listing by type, dynamic page title ("Products" vs "Experiences")
- Event form: hides all non-essential fields (image + title + is_active only)

#### DOB + Customization System
- `customers.date_of_birth` column added (migration `fb37140f30b8`)
- Admin CustomerDetail: DOB field in profile + edit form
- PWA AccountDetails: DOB date picker + `UserUpdate` schema
- `customization_options.option_type` column added (migration `f58ca7da748d`)
- Admin CustomizationManager: Option Type dropdown (Size, Milk, Sweetness, Add-on, Temperature, General)
- PWA: add-to-cart immediate (no sheet), "Add-ons" button per cart item opens customize sheet
- PWA: `customization_count` returned in menu items list for feature detection

#### CSS Cleanup
- `staff-admin.css`: ~60 lines of overridden CSS removed, merged into single block
- `cart.css`: qty buttons 32×32 (was 44×44), remove button moved to header, add-ons button + qty same row
- `menu-grid.css`: add button compact pill, price `white-space: nowrap`, add-ons column
- `home-cards.css`: promo title white text with Playfair Display, stronger text-shadow, darker overlay
- `profile.css`: modal overlay `display: none` (was `opacity: 0` — fixed backdrop-filter leak)
- `my-rewards-detail.css`: `rd-empty` empty state CSS added (was unstyled)

#### Backend Fixes
- `docker-entrypoint.sh`: auto-runs `alembic upgrade head` before FastAPI startup
- `Auth: _blacklist_token()` implemented (was missing — blocked logout)
- `Auth: _normalize_phone()`, `_validate_phone()` defined (were missing — crashed OTP login)
- `Auth: OTP rate-limit constants` defined (were missing — crashed OTP verify)
- `Auth: DeviceToken` → `CustomerDeviceToken` for device-token endpoints
- `referral.py`: `User` → `Customer` model queries (2x NameError fix)
- `GET /content/stores`: new public endpoint returning active stores with lat/lng
- `change-password`: `hasattr` guard for Customer (no `password_hash`)
- `InventoryMovement` + `MarketingCampaign`: FK `users.id` → `admin_users.id`
- PWA overlays: all CSS backdrops verified — no residual blur leaks
- CSP header: added `worker-src 'self' blob:` for QR scanner web workers
