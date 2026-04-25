# Responsive Design Guide

> **Last Updated:** 2026-04-25

## Breakpoints

| Name | Width Range | Target |
|------|-------------|--------|
| Mobile | < 768px | Smartphones (iOS Safari, Android Chrome) |
| Tablet | 768px - 1023px | iPads, Android tablets |
| Desktop | ≥ 1024px | Laptops, monitors |

## Admin Frontend

### Mobile (< 768px)
- Sidebar hidden, replaced by bottom navigation bar
- Content takes full width
- Single-column layouts
- Touch-friendly sizing (min 44px targets)
- Modals become full-screen bottom sheets
- Tables scroll horizontally with sticky first column

### Tablet (768px - 1023px)
- Sidebar collapses to icons only (72px)
- Two-column grids for KPIs and cards
- Moderately-sized modals (540px)

### Desktop (≥ 1024px)
- Full sidebar with text labels (260px)
- Multi-column dashboard layouts
- Full-size modals and drawers

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
