# Responsive Design Guide

> **Last Updated:** 2026-04-27

## Breakpoints

| Name | Width Range | Target |
|------|-------------|--------|
| Mobile | < 768px | Smartphones (iOS Safari, Android Chrome) |
| Tablet | 768px - 1023px | iPads, Android tablets |
| Desktop | ≥ 1024px | Laptops, monitors |

## Admin Frontend

### Mobile (< 768px) — Service Crew Only

Mobile view is **restricted to 4 pages** for Service Crew. All other pages show a "Desktop Only" message via `MobilePageGuard`.

**Mobile-supported pages:**
- Order Station (`#kitchen`) — update order status
- POS Terminal (`#posterminal`) — burn vouchers/rewards
- Tables (`#tables`) — QR code management
- Wallet Top-Up (`#walletTopup`) — in-store top-up

**Mobile layout:**
- Sidebar hidden (hamburger button removed)
- Bottom navigation bar with 4 tabs (Station, POS, Tables, Wallet)
- Content takes full width, single-column layouts
- Touch-friendly sizing (min 44px targets)
- Modals become full-screen bottom sheets
- All per-page CSS classes have mobile-first base styles

**MobilePageGuard:** Wraps `PageRenderer` — if current page is not in the supported set on mobile, renders:
```
Desktop Only
This page is not available on mobile. Please use a desktop browser for full access.
[Available on mobile: Order Station, POS Terminal, Tables, Wallet Top-Up]
```

### Tablet (768px - 1023px)
- Sidebar collapses to icons only (72px)
- Two-column grids for KPIs and cards
- Moderately-sized modals (540px)
- All pages accessible

### Desktop (≥ 1024px)
- Full sidebar with text labels (260px)
- Multi-column dashboard layouts
- Full-size modals and drawers
- All pages accessible

## Customer PWA

### Mobile (< 768px)
- Phone-frame container (max-width 430px)
- Single-column layouts
- Portrait lock on very small landscape screens
- Bottom navigation with safe area insets

### Tablet (768px - 1023px)
- Wider container (max-width 768px)
- Two-column grids for products and rewards
- No portrait lock

### Desktop (≥ 1024px)
- Centered layout (max-width 1024px)
- Three-column product grid
- Two-column order history

## Implementation

Use the `useMediaQuery` hook in `frontend/src/hooks/useMediaQuery.ts`:
```tsx
import { useIsMobile, useIsTablet, useIsDesktop } from '@/hooks/useMediaQuery';
// Render mobile-specific UI when useIsMobile() returns true
```

For CSS-only responsive behavior, use `@media` queries in CSS files.

## CSS Mobile-First Rules

1. **Every class needs a mobile base style** outside `@media` — no class should exist only inside `@media (min-width: 768px)`
2. **Desktop overrides** go inside `@media (min-width: 768px)`
3. **Mobile layout overrides** (`.tables-grid`, `.wallet-topup-grid`, etc.) go in `components.css` inside `@media (max-width: 767px)` — never use `!important` outside this wrapper
4. **Touch targets**: Minimum 44px height/width on mobile
5. **Font sizes**: Mobile base should be 1-2px smaller than desktop
