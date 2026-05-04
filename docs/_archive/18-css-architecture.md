# CSS Architecture

> **Last Updated:** 2026-04-27

## No Framework

This project does **NOT** use Tailwind CSS. It uses a hand-crafted pure CSS system with:

- **Design Tokens:** `variables.css` (95 CSS custom properties) — single source of truth
- **Utility Classes:** `utilities.css` (~400 classes with Tailwind-compatible naming)
- **Component Styles:** `components.css` — shared component primitives (buttons, chips, badges)
- **Page Styles:** Per-page CSS files for layout-specific styling

## File Structure (Customer PWA)

```
src/styles/
├── variables.css          # Design tokens (colors, radii, shadows, typography)
├── base.css              # Reset, animations, safe area handling
├── utilities.css         # Pure CSS utility classes
├── components.css        # Shared component primitives
├── auth.css              # Auth flow screens
├── home-header.css       # Status bar, header, greeting
├── home-wallet.css       # Wallet balance cards
├── home-carousel.css     # Promotional carousels
├── home-cards.css        # Category cards
├── home-products.css     # Product card grids
├── home-bottom-nav.css   # Tab bar, install banner
├── menu-browse.css       # Menu browsing page (was home-menu.css)
├── info-cards.css        # Information article pages (was home-info.css)
├── account.css           # Profile, wallet, rewards, history, settings (was home-account.css)
├── orders.css            # Cart, checkout, orders list, order detail (was home-orders.css)
├── cart.css              # Cart-specific styles (split from orders.css)
├── checkout.css          # Checkout-specific styles (split from orders.css)
├── orders-list.css       # Orders list styles (split from orders.css)
├── order-detail.css      # Order detail/tracking styles (split from orders.css)
├── profile.css           # Profile page (split from account.css)
├── wallet.css            # Wallet page (split from account.css)
├── my-rewards.css        # Rewards page (split from account.css)
├── history.css           # History page (split from account.css)
├── payment-methods.css   # Payment methods (split from account.css)
├── settings.css          # Settings page (split from account.css)
├── qr-scanner.css        # QR scanner (split from menu-browse.css)
├── menu-grid.css         # Menu grid and items (split from menu-browse.css)
├── category-nav.css      # Category navigation (split from menu-browse.css)
└── customize-sheet.css   # Item customization bottom sheet (split from menu-browse.css)
```

## Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#384B16` | Brand primary (dark olive) |
| `--color-primary-dark` | `#2A3910` | Hover/pressed states |
| `--color-primary-light` | `#4A6A1D` | Light accents |
| `--color-copper` | `#D18E38` | Accent color |
| `--color-bg` | `#E4EAEF` | Page background |
| `--color-white` | `#FFFFFF` | Card backgrounds |

TypeScript access via `@/lib/tokens.ts` — always import LOKA from there, never redefine locally.

## Admin Frontend

```
frontend/src/styles/
├── theme.css              # Theme variables (--color-primary, etc.)
├── base.css               # Reset, typography, form elements
├── layout.css             # Sidebar, content area, responsive breakpoints, admin shell
├── components.css         # Buttons, cards, badges, tables, modals, forms, stats
├── mobile-guard.css       # MobilePageGuard "Desktop Only" styles
├── dashboard.css          # DashboardPage (db-*)
├── orders.css             # OrdersPage (op-*)
├── menu-admin.css         # MenuPage (mp-*)
├── tables-admin.css       # TablesPage, QRCodeGenerator (tp-*)
├── kitchen-display.css    # KitchenDisplayPage (kdp-*)
├── inventory-admin.css    # InventoryPage (ip-*)
├── staff-admin.css        # StaffPage (sp-*)
├── vouchers.css           # VouchersPage (vp-*)
├── rewards.css            # RewardsPage (rp-*)
├── promotions.css         # PromotionsPage, BannerManager (pp-*)
├── customers.css          # CustomersPage (cp-*)
├── feedback.css           # FeedbackPage (fb-*), SurveyReportPage (srp-*)
├── notifications.css      # NotificationsPage (np-*)
├── wallet-topup.css       # WalletTopUpPage (wtup-*)
├── pos-terminal.css       # POSTerminalPage (ptp-*)
├── information.css        # InformationPage (inf-*)
├── reports.css            # SalesReportsPage (mrp-*), SurveysPage (sv-*)
├── settings-admin.css     # SettingsPage (stp-*)
├── sidebar.css            # Sidebar styles
└── login.css              # LoginScreen styles
```

### Admin CSS Conventions

- **Prefix per page**: Each page has a unique numbered prefix (`kdp-*`, `ptp-*`, `tp-*`, `wtup-*`, etc.)
- **No duplicate prefixes across pages**: Collision prevention (e.g., `ip-*` is InventoryPage only, InformationPage uses `inf-*`)
- **Mobile-first**: Every class MUST have a mobile base style outside `@media`. Desktop overrides inside `@media (min-width: 768px)`
- **No `!important` in page CSS files**: Layout overrides (`.tables-grid`, `.wallet-topup-grid`, etc.) live in `components.css` wrapped in `@media (max-width: 767px)`
- **Named classes** for reusable patterns: `kdp-order-card`, `kdp-action-btn`, `tp-table-active`, `tp-qr-placeholder`

### Admin Layout Classes

| Class | Usage |
|-------|-------|
| `.admin-main-content` | Flex container with responsive margin-left for sidebar |
| `.admin-header` | Top header bar with responsive padding |
| `.admin-main` | Scrollable content area with mobile bottom padding |
| `.mobile-menu-btn` | Hamburger toggle — **hidden on mobile** (Service Crew can't access sidebar) |
| `.sidebar-backdrop` | Overlay — **hidden on mobile** |

### Responsive Breakpoints (Admin)

| Breakpoint | Behavior |
|------------|----------|
| < 768px | Sidebar hidden, bottom nav (4 tabs), stacked grids, "Desktop Only" for non-service pages |
| 768-1023px | Sidebar collapsed (icons only), 2-column grids |
| ≥ 1024px | Full sidebar with labels, full grid layout |

## PostCSS

Both apps use `autoprefixer` via PostCSS (`postcss.config.mjs`). No Tailwind plugin is configured.
