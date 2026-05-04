# PWA Development Guide

> Customer-facing PWA at `app.loyaltysystem.uk`

## Architecture
- Next.js 16 with Zustand state management
- Pure CSS (no Tailwind), self-contained `*-v2.css` per page
- OTP auth via httpOnly cookies, JWT token refresh interceptor
- IndexedDB persistence for store selection and cart

## Pages (26 total)
All pages use self-contained `*-v2.css` files. See [001-project-state.md](001-project-state.md) for full list.

## Key Patterns

### Bottom Sheets
- `ui/BottomSheet.tsx` — swipeable bottom sheet (`bs-overlay`, `sheet-*` classes in `globals.css`)
- `ui/Modal.tsx` — login/center modal (`modal-*` classes in `login-v2.css`)

### Display Cards
- Gradient stats cards: `linear-gradient(135deg, var(--loka-primary), var(--loka-primary-light))`
- Tier badges: metallic gradients per tier
- Progress bars: 6px height, green→copper fill

### Tab Bars
- Pill tabs: 40px radius, primary bg on active, 13px font
- Used in: Rewards, Promotions, Information, My Rewards, History

### Detail Pages
- Hero image + back button + type tag
- Playfair title (20px), meta row, description
- Sticky bottom action button (12px radius)

## Dine-in Flow
See [001-project-state.md](001-project-state.md) section 6.

## State Management
- Zustand stores: `authStore`, `walletStore`, `uiStore`, `cartStore`, `orderStore`
- `uiStore` uses IndexedDB persistence via `idbStorage`

## API Client
- Axios with 30s timeout
- Auto-refresh token interceptor
- `api.ts` exports all TypeScript interfaces
