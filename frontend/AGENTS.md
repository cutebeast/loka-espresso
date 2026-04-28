<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## FNB Admin Frontend — Agent Documentation

### Architecture
- Single-page Next.js 16 app with hash-based routing
- No CSS framework — all styles in `src/styles/` (modular, imported via `globals.css`)
- Auth via HTTP-only cookies + `useAuth` hook
- API layer: `src/lib/merchant-api.tsx` with auto-refresh token handling

### Key Conventions
- **Config**: Use `API_BASE_URL` from `src/lib/config.ts` — never `process.env` directly
- **CSS**: One file per page/feature in `src/styles/`, imported in `src/app/globals.css`
- **Routing**: `useHashRouter` hook — pages are conditional components in `page.tsx`
- **Components**: Organized by `src/components/pages/{feature}/`
- **UI Library**: 14 shared components in `src/components/ui/` (Button, Card, Select, Modal, DataTable, Charts, Drawer, etc.)
- **Dynamic Imports**: 22 pages use `next/dynamic` with `ssr: false` in `page.tsx`

### Important Files
- `src/lib/config.ts` — env vars and defaults
- `src/lib/merchant-api.tsx` — API client with auth (`apiFetch`, `apiUpload`, `formatRM`)
- `src/hooks/useAuth.ts` — auth state (token, role, user profile name/phone/email)
- `src/styles/globals.css` — CSS import index
- `src/app/page.tsx` — main app shell with hash router, header, modals

### Sidebar Navigation
- **Counter Operations**: Tables, Order Station, POS Terminal, Wallet Top-Up
- **Store Management**: Orders, Menu Management, Inventory, Staff
- **CRM & Marketing**: Customers, Rewards, Vouchers, Promotions, Information, Push Notifications, Feedback
- **Analytics**: Sales Reports, Marketing ROI
- **System & Config**: Store Settings, App Settings, PWA Settings, Loyalty Rules, Audit Log

Sidebar toggle: In-brand hamburger (`sb-hamburger-toggle` in sidebar header). Desktop only.

### Mobile View — Service Crew Only
Mobile view restricted to 4 pages. All others show "Desktop Only" via `MobilePageGuard`.

**Mobile-supported pages:**
- `kitchen` — Order Station: update order status
- `posterminal` — POS Terminal: burn vouchers/rewards
- `tables` — Tables: QR code management
- `walletTopup` — Wallet Top-Up: in-store top-up

**Bottom nav** (`MobileBottomNav.tsx`): 4 tabs — Tables, Station, POS, Top Up

**Mobile header**: Icon-only buttons — Profile, Password, Logout. No notification bell.

**Sidebar**: `display: none` on mobile. Hamburger removed. No way for service crew to access desktop pages.

### Profile Update
- `ProfileUpdateModal.tsx` — name + phone fields (email shown but disabled)
- Saves via `PUT /users/me` with `{ name, phone }`
- Updates `useAuth` state on success

### QR Code System — Client-Side Generation
QR codes generated entirely client-side using `qrcode` npm library. Frontend **never** fetches `/admin/stores/{id}/tables/{id}/qr-image`.

**Flow** (`tables/QRCodeGenerator.tsx`):
1. `useQrImages` hook receives tables from parent
2. Filters tables where `qr_code_url` AND `qr_generated_at` exist and are within 30-minute expiry
3. Generates QR data URLs client-side via `QRCode.toDataURL(table.qr_code_url)`
4. Cache key includes `qr_generated_at` — detects regeneration
5. Store switch clears all QR state immediately

**Display states:**
- No `qr_code_url` or expired → `.tp-qr-placeholder` (dashed border + QR icon)
- Active + generating → spinner
- Active + generated → QR image + countdown timer

### Customer Search
- `CustomerSearchForm.tsx` — shared component used by POS Terminal and Wallet Top-Up
- Exact match → auto-selects customer
- Partial match → shows list to tap
- Wallet Top-Up additionally fetches `GET /admin/customers/{id}` for accurate `wallet_balance`

### Drawer Forms (Menu, Inventory, Staff, Surveys, Notifications, Loyalty Rules, Store Settings, Banners, Rewards, Vouchers, Information)
All use shared `df-*` CSS pattern in `components.css`. Default width: **720px**.

| CSS Class | Purpose |
|-----------|---------|
| `df-section` | Section wrapper |
| `df-grid` | 2-column grid |
| `df-grid-3` | 3-column equal grid |
| `df-grid-3-wide` | 3-column (3fr 1fr 1fr) |
| `df-grid-2-wide-short` | 2-column (3fr 1fr) |
| `df-field` | Label → input → hint stack |
| `df-actions` | Bottom bar, buttons right-aligned |

**Form layouts:**
- Menu: Name | Price / Description / Category / Image File / Available | Featured
- Inventory New: Stock Name | Unit / Category / Opening Stock | Reorder Level
- Inventory Adjust: Movement Type | Qty / Note+Attachment
- Staff: Name | Type / Email | Role / Store Assignments | PIN
- Surveys: Title | Voucher / Description / Questions (dynamic) / Active | Cancel → Create
- Notifications (edit): Title | Audience / Body / Schedule Date | Time
- Loyalty Rules: Name | Sort Order / Min Points | Multiplier / Benefits section
- Store Settings: Name | Slug / Address / Phone | Pickup Lead / Location / Image / Integrations / Opening Hours
- Category modals: Both Menu and Inventory have Name + Slug fields (slug auto-generated, editable)
- Banner (create): Title / Image File / Target URL
- Rewards: Name / Description / Points | Image File
- Vouchers: Code | Type / Discount | Value / Dates / Min Spend

**Image upload**: All image inputs use file upload. No URL text inputs remain.
- Menu items: `apiUpload('/upload/image')` → `uploads/menu/`
- Marketing (banners, rewards, store): `apiUpload('/upload/marketing-image')` → `uploads/marketing/`
- Information: `apiUpload('/upload/information-image')` → `uploads/information/`

### Date Input Convention
- `type="date"` → `slice(0, 10)` format (`YYYY-MM-DD`)
- `type="datetime-local"` → `slice(0, 16)` format (`YYYY-MM-DDTHH:MM`)
- BannerManager, NotificationsPage, DateFilter: `type="date"`
- InformationPage, VouchersPage: `type="datetime-local"`

### Customer Detail Page
All 6 tabs use consistent CSS classes (`cdp-*`):
- `cdp-section-title` — section headings
- `cdp-profile-grid` + `cdp-field-list`/`cdp-field-row` — profile view
- `cdp-action-card` + `cdp-action-row`/`cdp-action-field-sm/md/lg` — manage dialogs
- `cdp-item-list`/`cdp-item-card` — reward/voucher cards
- `cdp-positive`/`cdp-negative` — value coloring
- `cdp-error`/`cdp-success` — alerts
- Mobile responsive: `@media (max-width: 767px)` for stacked layouts

### Table Column Conventions
- **Customers**: Customer (name+phone), Contact (email+joined), Tier & Points, Activity, Actions
- **Staff**: Staff (name+role), Contact (email+phone), Stores, Status, Actions
- **Inventory**: Ingredient (name+category), Stock (balance+unit+reorder), Status, Actions
- **Audit Log**: Timestamp (with IP), Who, Location, Action (with Status)
- **SurveyReport**: srpt-* prefix (avoids srp-* collision with desktop @media overrides)

### CSS Conventions
- **Prefix per page**: `kdp-*` (Kitchen), `ptp-*` (POS), `tp-*` (Tables), `wtup-*` (Wallet), `inf-*` (Information), `sv-*` (Surveys), etc.
- **No duplicate prefixes across pages**: Collision prevention
- **Named classes** for shared patterns: `kdp-order-card`, `tp-table-active`, `tp-qr-placeholder`
- **Mobile-first**: Every class MUST have mobile base style outside `@media`. Desktop overrides inside `@media (min-width: 768px)`
- **No `!important` in page CSS**: Layout overrides live in `components.css` wrapped in `@media (max-width: 767px)`
- **Guide sections**: All use same pattern — green card, `fa-circle-info`, chevron toggle, `showGuide` state

### Collapsible Guide Sections
All 4 mobile pages (Kitchen, POS, Tables, Wallet) have identical collapsible guides:
- Green card: `background: #F0FDF4; border: 1px solid #BBF7D0`
- Header: `fa-circle-info` icon + title + chevron
- Collapsed by default (`showGuide = false`)
- Content rendered via `{showGuide && (<div>...</div>)}`

### API Conventions
- All admin endpoints prefixed `/admin/` — e.g. `apiFetch('/admin/stores')`
- Paginated responses: `{ items: [...], total, page, page_size }` — always read `data.items`
- `apiFetch` does NOT log 404s (suppressed to reduce noise)
- `apiFetch` auto-refreshes on 401 using shared refresh promise
- Wallet balance: only available from `GET /admin/customers/{id}` (detail endpoint), NOT from list endpoint
- User table is split: `admin_users` (admin/staff) and `customers` (PWA users) — JWT `user_type` claim determines which table to query
- Staff creation returns `temp_password` in response — display in notice box with copy-to-clipboard
- Status toggle removed from staff table — only changeable via Edit form to prevent accidental deactivation

### Backend Fix
```sql
ALTER TABLE user_vouchers ADD COLUMN reserved_at TIMESTAMP WITH TIME ZONE;
```
Fixes 500 error on wallet endpoint — model has the column but DB didn't.

### Column Layout Convention (Phase 22)
- **Active/inactive toggle**: Uses `fa-toggle-on`/`fa-toggle-off` icon (green `#16A34A` when active, gray `#9CA3AF` when inactive)
- **Toggle is in Actions column** — not a separate Status column. Applies to: Information, Banners/Promotions, Vouchers, Rewards, Surveys
- **All pages follow**: Image | Title(desc) | (metadata) | Actions(toggle+edit+delete) pattern
- **Rewards**: Has Image column (was missing). Points + Type are separate columns.
- **Promotions/Banners**: Type column shows dates below type badge. Dates column removed.
- **Information**: Slug + Description columns removed. Short description shown under title.
- **Vouchers**: Status column removed. Toggle in Actions.
- **Surveys**: Status column removed. Toggle + chart-bar(removed) + edit + delete in Actions.
- **Survey Reports tab**: Now always visible in PromotionsPage (`showTabs = true`). Previously disappeared when navigating to it.

### Survey Create/Edit Fixes (Phase 22)
- **Create**: Validates at least one question with non-empty text before POST
- **Edit from list**: Fetches `GET /admin/surveys/{id}` to load full questions before opening edit drawer (list items have `question_count`, not `questions` array)
- **Questions column**: Reads `question_count` (integer) instead of `questions?.length` (always 0 from list items)

### Survey Feedback/Reply Button
- **Removed** the reply button (`fa-chart-bar`) from Surveys Actions column. Redundant — use the Survey Reports tab instead.

### Auth Session Check (Phase 22)
- **`useAuth.checkAuth()`** now calls `GET /auth/session` instead of `GET /users/me` for initial auth check
- `/auth/session` returns `{"authenticated": bool}` as 200 OK (never 401) — eliminates red console warnings on login page
- **LoginScreen**: Added `autoComplete="current-password"` to password input (fixes Chrome DOM warning)

### Backend / Admin API Fixes (Phase 22)
- **Rewards/Vouchers/Surveys user names**: Fixed `AdminUser` → `Customer` model query for user name resolution (was returning "Unknown"/"Anonymous" for all customer names)
- **Broadcasts**: Uses `CustomerDeviceToken` (`customer_device_tokens`) instead of legacy `DeviceToken` (`device_tokens`)
- **System reset**: Targets `customers` table instead of legacy `users` table
- **`/auth/device-token`**: Migrated from legacy `device_tokens` to `customer_device_tokens`
- **`_blacklist_token`**: Fixed missing function that blocked logout + token refresh
- **Order model**: Added `customer_id` column mapping alongside legacy `user_id`
- **InventoryMovement + MarketingCampaign**: FK `created_by` changed `users.id` → `admin_users.id`
- **Orphan cleanup**: Deleted `UserAddress` model (`user_addresses` table — data already in `customer_addresses`)

### Deleted Files (confirmed dead code)
- `src/styles/history.css`
- `src/styles/payment-methods.css`
- `src/styles/admin-extra.css`
- `src/components/modals/AddStaffModal.tsx` (pre-ACL staff form, replaced by StaffPage.tsx drawer)
