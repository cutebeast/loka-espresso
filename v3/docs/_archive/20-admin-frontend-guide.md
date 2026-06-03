# Admin Frontend Guide

> **Last Updated:** 2026-04-27 | **Location:** `frontend/` | **Framework:** Next.js 16 | **Styling:** Pure CSS (no Tailwind)

---

## Component Architecture

### Routing

The admin app uses **hash-based routing** via a custom `useHashRouter` hook. A single `page.tsx` entry point renders all 22 pages based on `window.location.hash`.

```
https://admin.loyaltysystem.uk/#dashboard
https://admin.loyaltysystem.uk/#orders
https://admin.loyaltysystem.uk/#menu
```

Pages are loaded via `next/dynamic` for code splitting:

```tsx
const MenuPage = dynamic(() => import('@/components/pages/store-ops/MenuPage'), { ssr: false });
```

Only `DashboardPage` and `OrdersPage` are eagerly imported (loaded on every visit).

### Page Components (22 pages)

All page components live under `src/components/pages/` organized by subdirectory:

```
src/components/pages/
├── overview/
│   ├── DashboardPage.tsx        # KPIs, charts, date-range picker
│   └── OrdersPage.tsx           # Order list, filters, status actions
├── store-ops/
│   ├── MenuPage.tsx             # Category/item CRUD, customization manager
│   ├── TablesPage.tsx           # Table grid, QR codes (client-side gen), occupancy
│   ├── KitchenDisplayPage.tsx   # Active order queue, auto-refresh
│   ├── InventoryPage.tsx        # Stock levels, adjustments
│   ├── StaffPage.tsx            # Staff CRUD, role assignment
│   ├── WalletTopUpPage.tsx      # Manual wallet top-up
│   ├── POSTerminalPage.tsx      # Burn vouchers/rewards for POS
│   └── pos-terminal/
│       ├── CartPanel.tsx
│       ├── CheckoutPanel.tsx
│       └── QRScanner.tsx
├── marketing/
│   ├── RewardsPage.tsx          # Reward CRUD
│   ├── VouchersPage.tsx         # Voucher CRUD, bulk actions
│   ├── CustomersPage.tsx        # Customer list, filters
│   ├── PromotionsPage.tsx       # Banner/broadcast management
│   ├── InformationPage.tsx      # Content card management
│   ├── NotificationsPage.tsx    # Push notification history
│   ├── FeedbackPage.tsx         # Customer feedback + reply
│   ├── SurveysPage.tsx          # Survey builder
│   ├── SurveyReportPage.tsx     # Survey analytics
│   └── promotions/
│       ├── BannerManager.tsx
│       └── BroadcastManager.tsx
├── analytics/
│   ├── SalesReportsPage.tsx     # Revenue, order volume charts
│   └── MarketingReportsPage.tsx # Campaign ROI, voucher usage
└── system/
    ├── SettingsPage.tsx         # Runtime config, feature flags
    ├── AuditLogPage.tsx         # Audit trail viewer
    ├── LoyaltyRulesPage.tsx     # Tier thresholds, earn rates
    ├── StoreSettingsPage.tsx    # Per-store configuration
    ├── PWASettingsPage.tsx      # PWA config, splash, OTP settings
    ├── CustomerDetailPage.tsx   # Single customer 360° view
    └── customer-detail/
        ├── CustomerInfo.tsx
        ├── WalletPanel.tsx
        ├── LoyaltyPanel.tsx
        └── OrderHistory.tsx
```

### Shared Components

```
src/components/
├── Sidebar.tsx              # Navigation sidebar (desktop only, hidden on mobile)
├── MobileBottomNav.tsx      # Bottom nav for mobile: Station, POS, Tables, Wallet
├── MobilePageGuard.tsx      # Shows "Desktop Only" for non-service-crew pages
├── AuthGuard.tsx            # Login gate, cookie-based auth check
├── LoginScreen.tsx          # Email/password login form
├── ErrorBoundary.tsx        # React error boundary
├── Modals.tsx               # Re-exports shared modal forms
├── ChangePasswordModal.tsx
├── CustomizationManager.tsx
└── modals/
    ├── AddBannerModal.tsx
    ├── AddBroadcastModal.tsx
    ├── AddCategoryModal.tsx
    ├── AddCustomizationModal.tsx
    ├── AddInventoryItemModal.tsx
    ├── AddItemModal.tsx
    ├── AddRewardModal.tsx
    ├── AddStaffModal.tsx
    ├── AddTableModal.tsx
    ├── AddVoucherModal.tsx
    └── FeedbackReplyModal.tsx
```

### UI Primitives

```
src/components/ui/
├── Badge.tsx
├── Button.tsx           # .btn-admin (4 variants × 3 sizes)
├── Card.tsx
├── Charts.tsx
├── DataTable.tsx        # .data-table responsive table
├── DateFilter.tsx
├── Drawer.tsx
├── FilterBar.tsx
├── Input.tsx            # .input-field, .textarea-field
├── KPICards.tsx
├── Modal.tsx
├── Pagination.tsx
├── Select.tsx
└── StoreSelector.tsx
```

---

## Mobile View — Service Crew Only

Mobile view is **restricted to 4 pages** for Service Crew. All other pages show a "Desktop Only" message via `MobilePageGuard`.

### Mobile-Supported Pages

| Page | Route | Purpose |
|------|-------|---------|
| Order Station | `#kitchen` | Manually update order status |
| POS Terminal | `#posterminal` | Scan customer ID or enter phone to burn vouchers/rewards before 3rd-party POS |
| Tables | `#tables` | Print QR codes, bring to tables for dine-in customers |
| Wallet Top-Up | `#walletTopup` | Assist customers with in-store top-up |

### Mobile Navigation

- **Bottom nav** (`MobileBottomNav.tsx`): 4 tabs — Station, POS, Tables, Wallet
- **Sidebar**: Hidden on mobile (`display: none` on hamburger button and backdrop)
- Service crew cannot access sidebar navigation or any desktop-only pages

### MobilePageGuard

Wraps `PageRenderer` in `page.tsx`. On mobile, if the current page is not in the supported set, renders a "Desktop Only" message with chips showing available pages.

```tsx
const MOBILE_SUPPORTED: Set<PageId> = new Set(['kitchen', 'posterminal', 'tables', 'walletTopup']);
```

---

## QR Code System — Client-Side Generation

QR codes are generated **entirely client-side** using the `qrcode` npm package. The frontend **never** fetches `/admin/stores/{id}/tables/{id}/qr-image` from the server — zero 404 errors.

### Flow

1. `useQrImages` hook (`tables/QRCodeGenerator.tsx`) receives tables from parent
2. Filters tables where `qr_code_url` AND `qr_generated_at` exist and are within 30-minute expiry
3. Generates QR data URLs via `QRCode.toDataURL(table.qr_code_url)`
4. Cache key includes `qr_generated_at` timestamps — detects regeneration and re-generates
5. On store switch, clears all QR state immediately to prevent stale data

### Display States

| State | Render |
|-------|--------|
| No `qr_code_url` | Placeholder (dashed border + QR icon + "No QR Code") |
| Expired (`qr_generated_at` > 30 min) | Placeholder |
| Active + generating | Spinner |
| Active + generated | QR image + countdown timer |

### Key Files

- `tables/QRCodeGenerator.tsx` — `useQrImages`, `useQrExpiry`, `QRCodeDisplay`, `formatDuration`
- `tables/TableCard.tsx` — Card component using QR display
- `tables/index.ts` — Re-exports
- `tables-admin.css` — Styles including `.tp-qr-placeholder`

---

## CSS File Organization

### Core Files

| File | Purpose |
|------|---------|
| `theme.css` | CSS custom properties (--color-primary, --color-copper, etc.) |
| `base.css` | Reset, typography, form element defaults |
| `layout.css` | Sidebar, content area, responsive breakpoints, admin shell |
| `components.css` | Buttons, cards, badges, tables, modals, forms, stats |

### Per-Page CSS Files (14 files)

| File | Page(s) | Prefix |
|------|---------|--------|
| `dashboard.css` | DashboardPage | `db-*` |
| `orders.css` | OrdersPage | `op-*` |
| `menu-admin.css` | MenuPage | `mp-*` |
| `tables-admin.css` | TablesPage, QRCodeGenerator | `tp-*` |
| `kitchen-display.css` | KitchenDisplayPage | `kdp-*` |
| `inventory-admin.css` | InventoryPage, InventoryLedgerPage | `ip-*` |
| `staff-admin.css` | StaffPage | `sp-*` |
| `vouchers.css` | VouchersPage | `vp-*` |
| `rewards.css` | RewardsPage | `rp-*` |
| `promotions.css` | PromotionsPage, BannerManager, BroadcastManager | `pp-*` |
| `customers.css` | CustomersPage, CustomerDetailPage | `cp-*` |
| `feedback.css` | FeedbackPage, SurveyReportPage | `fb-*`, `srp-*` |
| `notifications.css` | NotificationsPage | `np-*` |
| `wallet-topup.css` | WalletTopUpPage | `wtup-*` |
| `pos-terminal.css` | POSTerminalPage, QRScanner | `ptp-*` |
| `information.css` | InformationPage | `inf-*` |
| `reports.css` | SalesReportsPage, MarketingReportsPage | `mrp-*`, `sv-*` |
| `settings-admin.css` | SettingsPage, StoreSettingsPage, PWASettingsPage | `stp-*` |
| `mobile-guard.css` | MobilePageGuard | `mpg-*` |

### Additional CSS Files

| File | Purpose |
|------|---------|
| `sidebar.css` | Sidebar-specific styles |
| `login.css` | LoginScreen styles |

### CSS Conventions

- **Prefix per page**: Each page has a unique numbered prefix (`kdp-*`, `ptp-*`, `tp-*`, etc.)
- **No duplicate prefixes across pages**: Collision prevention
- **Named classes** for shared patterns: `kdp-order-card`, `kdp-action-btn`, `tp-table-active`
- **Mobile-first**: Every class MUST have a mobile base style outside `@media`. Desktop overrides inside `@media (min-width: 768px)`
- **No `!important` in page CSS**: Layout overrides live in `components.css` wrapped in `@media (max-width: 767px)`
- **Collapsible sections**: Use `showGuide` state + conditional render `{showGuide && (<div>...</div>)}`

### Import Order (in `globals.css`)

1. `theme.css` (tokens)
2. `base.css` (reset)
3. `layout.css` (shell)
4. `components.css` (primitives)
5. Per-page CSS files (14 files)
6. Marketing CSS files (6 files)
7. Shared UI CSS (`login.css`, `sidebar.css`, `wallet-topup.css`, `information.css`, `mobile-guard.css`)

---

## Environment Variables

Set in `frontend/.env` (or `.env.local`):

| Variable | Example | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_APP_NAME` | `Loka Espresso` | Brand name shown in sidebar/header |
| `NEXT_PUBLIC_APP_DOMAIN` | `app.loyaltysystem.uk` | Customer PWA domain (for links) |
| `NEXT_PUBLIC_ADMIN_DOMAIN` | `admin.loyaltysystem.uk` | Admin domain (for CORS, redirects) |
| `NEXT_PUBLIC_LOGO_URL` | `/logo.png` | Logo image path |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000/api/v1` | Backend API base URL |

All variables use the `NEXT_PUBLIC_` prefix and are embedded at build time.

---

## API Conventions

- All admin endpoints prefixed `/admin/` — e.g. `apiFetch('/admin/stores')`
- Paginated responses: `{ items: [...], total, page, page_size }` — always read `data.items`
- `apiFetch` does NOT log 404s to console (suppressed to reduce noise)
- `apiFetch` auto-refreshes on 401 using shared refresh promise (no race conditions)
- `apiUpload` for file uploads (multipart/form-data, no Content-Type header set manually)

---

## Responsive Design Standards

### Mobile-First Approach

All CSS is written mobile-first using `min-width` media queries:

```css
/* Mobile (default) — single column, bottom nav */
.card-grid { display: flex; flex-direction: column; }

/* Tablet — two columns */
@media (min-width: 768px) {
  .card-grid { grid-template-columns: repeat(2, 1fr); }
}

/* Desktop — full layout */
@media (min-width: 1024px) {
  .card-grid { grid-template-columns: repeat(3, 1fr); }
}
```

### Breakpoints

| Breakpoint | Width | Sidebar | Navigation | Grid |
|------------|-------|---------|------------|------|
| Mobile | < 768px | Hidden | Bottom nav (4 tabs) | Single column |
| Tablet | 768px–1023px | Collapsed (icons only, 72px) | Sidebar | Two columns |
| Desktop | ≥ 1024px | Full (labels, 260px) | Sidebar only | Multi-column |

### Touch Targets

Minimum interactive target size: **44px** on mobile.

---

## Page Breakdown by Subdirectory

### overview/

| Page | Route Hash | Data Source | Self-Fetching |
|------|-----------|-------------|---------------|
| DashboardPage | `#dashboard` | `GET /admin/dashboard` | No (parent fetches) |
| OrdersPage | `#orders` | `GET /admin/orders` | No (parent fetches) |

### store-ops/

| Page | Route Hash | Data Source | Self-Fetching | Mobile |
|------|-----------|-------------|---------------|--------|
| MenuPage | `#menu` | `GET /menu/categories`, `GET /menu/items` | No (parent fetches) | ❌ Desktop only |
| TablesPage | `#tables` | `GET /admin/stores/{id}/tables` | No (parent fetches) | ✅ Service crew |
| KitchenDisplayPage | `#kitchen` | `GET /admin/orders?status=...` | Yes (auto-refresh 30s) | ✅ Service crew |
| InventoryPage | `#inventory` | `GET /admin/stores/{id}/inventory` | No (parent fetches) | ❌ Desktop only |
| StaffPage | `#staff` | `GET /admin/hq-staff` or `GET /admin/stores/{id}/staff` | Yes | ❌ Desktop only |
| WalletTopUpPage | `#walletTopup` | `GET /admin/customers`, `POST /admin/wallet/topup` | Yes | ✅ Service crew |
| POSTerminalPage | `#posterminal` | `GET /admin/customers/{id}/wallet` | Yes | ✅ Service crew |

### marketing/

| Page | Route Hash | Data Source | Self-Fetching | Mobile |
|------|-----------|-------------|---------------|--------|
| RewardsPage | `#rewards` | `GET /admin/rewards` | Yes | ❌ Desktop only |
| VouchersPage | `#vouchers` | `GET /admin/vouchers` | Yes | ❌ Desktop only |
| CustomersPage | `#customers` | `GET /admin/customers` | Yes | ❌ Desktop only |
| PromotionsPage | `#promotions` | `GET /admin/banners`, `GET /admin/broadcasts` | Yes | ❌ Desktop only |
| InformationPage | `#information` | `GET /admin/content/cards` | Yes | ❌ Desktop only |
| NotificationsPage | `#notifications` | `GET /admin/broadcasts` | Yes | ❌ Desktop only |
| FeedbackPage | `#feedback` | `GET /admin/feedback` | Yes | ❌ Desktop only |
| SurveysPage | `#surveys` | `GET /admin/surveys` | Yes | ❌ Desktop only |

### analytics/

| Page | Route Hash | Data Source | Self-Fetching | Mobile |
|------|-----------|-------------|---------------|--------|
| SalesReportsPage | `#reports` | `GET /admin/reports/revenue` | Yes | ❌ Desktop only |
| MarketingReportsPage | `#marketingreports` | `GET /admin/reports/marketing` | Yes | ❌ Desktop only |

### system/

| Page | Route Hash | Data Source | Self-Fetching | Mobile |
|------|-----------|-------------|---------------|--------|
| SettingsPage | `#settings` | `GET /admin/config` | Yes | ❌ Desktop only |
| AuditLogPage | `#auditlog` | `GET /admin/audit-log` | Yes | ❌ Desktop only |
| LoyaltyRulesPage | `#loyaltyrules` | `GET /admin/loyalty-tiers` | No (parent fetches) | ❌ Desktop only |
| StoreSettingsPage | `#store` | `GET /admin/stores` | No (parent fetches) | ❌ Desktop only |
| PWASettingsPage | `#pwa` | `GET /admin/config`, `GET /admin/pwa/version` | Yes | ❌ Desktop only |
| CustomerDetailPage | `#customers?id=N` | `GET /admin/customers/{id}` | Yes | ❌ Desktop only |

---

## Auth Model

- Login: email + password via `POST /auth/login-password`
- Tokens: httpOnly cookies (no localStorage)
- All API calls use `credentials: 'include'`
- Role-based sidebar filtering via `user_type_id`
- `AuthGuard` component gates the entire dashboard

---

## State Management

- **Shared state:** `page.tsx` holds store selection, orders, categories, tables, inventory
- **Page-local state:** Self-fetching pages manage their own loading/data
- **No global store:** Admin uses `useState` + prop drilling (no Zustand/Redux)
- **Routing state:** `useHashRouter` hook syncs `window.location.hash` with `page` state

---

## Profile Update

- `ProfileUpdateModal.tsx` — name + phone fields (email shown but disabled, cannot be changed)
- Saves via `PUT /users/me` with `{ name, phone }`
- Updates `useAuth` state on success so header reflects changes immediately
- Header shows 3 icon-only buttons on mobile (Profile, Password, Logout)

---

## Customer Search

- `CustomerSearchForm.tsx` — shared component used by POS Terminal and Wallet Top-Up
- Searches via `GET /admin/customers?search=...`
- Exact phone match → auto-selects customer
- Partial match → shows list of matching customers to tap
- No match → error message
- POS Terminal also passes QR Scanner as `children` prop
- Wallet Top-Up fetches `GET /admin/customers/{id}` after selection for accurate `wallet_balance`

---

## Sidebar Navigation

**Desktop groups:**
- Counter Operations: Tables, Order Station, POS Terminal, Wallet Top-Up
- Store Management: Orders, Menu Management, Inventory, Staff
- CRM & Marketing: Customers, Rewards, Vouchers, Promotions, Information, Push Notifications, Feedback
- Analytics: Sales Reports, Marketing ROI
- System & Config: Store Settings, App Settings, PWA Settings, Loyalty Rules, Audit Log

**Bottom nav (mobile):** Tables, Station, POS, Top Up

**Sidebar toggle:** In-brand hamburger icon (`sb-hamburger-toggle` in sidebar header). Desktop only.

---

## Drawer Forms — All Pages

All drawer forms use shared `df-*` CSS pattern. Default width: **720px**. No hardcoded widths.

| CSS Class | Purpose |
|-----------|---------|
| `df-section` | Section wrapper |
| `df-grid` | 2-column grid |
| `df-grid-3` | 3-column equal grid |
| `df-grid-3-wide` | 3-column (3fr 1fr 1fr) |
| `df-grid-2-wide-short` | 2-column (3fr 1fr) |
| `df-field` | Label → input → hint stack |
| `df-label` | 13px bold label |
| `df-hint` | 12px muted helper text |
| `df-actions` | Bottom bar, buttons right-aligned |

**Form layouts:**

| Page | Layout |
|------|--------|
| Menu Item | Name \| Price / Description / Category / Image File / Available \| Featured |
| Menu Category | Name + Slug |
| Inventory New | Stock Name \| Unit / Category / Opening Stock \| Reorder Level |
| Inventory Adjust | Movement Type \| Qty / Note+Attachment |
| Staff | Name \| Type / Email \| Role / Store Assignments \| PIN |
| Surveys | Title \| Voucher / Description / Questions (dynamic, max 5) / Active checkbox |
| Notifications (edit) | Title \| Audience / Body / Schedule Date \| Time |
| Loyalty Rules | Name \| Sort Order / Min Points \| Multiplier / Benefits (Discount, Free Delivery, Birthday, Options) |
| Store Settings | Name \| Slug / Address / Phone \| Pickup Lead / Location / Image / Integrations / Opening Hours |
| Banners (create) | Title / Image File / Target URL |
| Rewards | Name / Points \| Description / Image File |
| Vouchers | Code \| Type / Discount \| Value / Dates / Min Spend |

**Image upload** — all image inputs use file upload (zero URL text inputs):
- Menu: `apiUpload('/upload/image')` → `uploads/menu/`
- Marketing (banners, rewards, store): `apiUpload('/upload/marketing-image')` → `uploads/marketing/`
- Information: `apiUpload('/upload/information-image')` → `uploads/information/`

**Date input convention:**
- `type="date"` → `slice(0, 10)` format
- `type="datetime-local"` → `slice(0, 16)` format

---

## Collapsible Guide Sections

All 4 mobile pages use identical collapsible guide pattern:
- Green card: `#F0FDF4` background, `#BBF7D0` border
- Header: `fa-circle-info` icon + title + chevron
- Collapsed by default (`showGuide = false`)
- Content conditionally rendered via `{showGuide && ...}`

---

## Customer Detail Page

All 6 tabs use consistent `cdp-*` CSS classes in `settings-admin.css`:

| Class Group | Purpose |
|-------------|---------|
| `cdp-section-title` | Section headings (all tabs) |
| `cdp-profile-grid` + `cdp-field-list`/`cdp-field-row` | Profile view layout |
| `cdp-action-card` + `cdp-action-row`/`cdp-action-field-sm/md/lg` | Manage tab dialogs |
| `cdp-item-list`/`cdp-item-card`/`cdp-code` | Reward/voucher cards |
| `cdp-positive`/`cdp-negative` | Value coloring |
| `cdp-error`/`cdp-success`/`cdp-text-muted`/`cdp-text-success`/`cdp-text-error` | Alerts |

Mobile responsive: `@media (max-width: 767px)` — single-column profile grid, stacked action rows.

---

## Table Column Conventions

| Page | Columns |
|------|---------|
| Customers | Customer (name+phone), Contact (email+joined), Tier & Points, Activity, Actions |
| Staff | Staff (name+role), Contact (email+phone), Stores, Status, Actions |
| Inventory | Ingredient (name+category), Stock (balance+unit+reorder), Status, Actions |
| Audit Log | Timestamp (with IP underneath), Who, Location, Action (with Status underneath) |
| SurveyReport | Uses `srpt-*` prefix (avoids `srp-*` collision with desktop @media overrides) |
