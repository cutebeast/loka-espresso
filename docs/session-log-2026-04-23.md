# Session Log — 2026-04-23
## FNB Super App — Auth Flow & Hub Layout Redesign

---

## Environment
- **Backend**: FastAPI on port 3002 (Docker: `fnb-backend`)
- **Admin Frontend**: Next.js 16 on port 3001 (Docker: `fnb-frontend`)
- **Customer PWA**: Next.js 16 on port 3003 (Docker: `fnb-customer-app`)
- **Domains**: `admin.loyaltysystem.uk`, `app.loyaltysystem.uk`
- **Reverse Proxy**: Caddy (`/etc/caddy/sites/fnb-app.conf`)
- **Styling**: Pure CSS with design tokens in `src/lib/tokens.ts` and CSS custom properties. No Tailwind.

**Critical deployment note**: The customer PWA runs in a Docker container. File edits on the host filesystem do NOT affect the running app until:
1. `docker compose build customer-app` (rebuilds image)
2. `docker compose up -d --force-recreate customer-app` (restarts container)
3. Browser must clear service worker cache (PWA caches aggressively)

---

## What Was Accomplished

### 1. Bottom Navigation Finalized
- **File**: `customer-app/src/components/BottomNav.tsx`
- 5 tabs: Home | Menu | Rewards | Orders | Profile
- Cart removed as a tab (becomes sub-page accessible from Menu/Header)

### 2. HubHeader Built
- **File**: `customer-app/src/components/ui/HubHeader.tsx`
- 5 variants: `home` | `menu` | `rewards` | `orders` | `profile`
- Home: greeting + name + tier + QR scan icon
- Menu: title + search icon
- Rewards: title + points display
- Orders: title + refresh icon
- Profile: title + settings icon
- Notification bell with unread badge on all variants except profile
- Uses pure CSS classes, no inline styles

### 3. DashboardHeader Deprecated
- **File**: `customer-app/src/components/ui/DashboardHeader.tsx`
- Now a thin backward-compat wrapper around HubHeader
- All hub pages should migrate to HubHeader directly

### 4. AppShell Integration
- **File**: `customer-app/src/components/AppShell.tsx`
- Home page wrapped in `HubLayout` with live `HubHeader`
- Notification click navigates to `NotificationsPage` (fully built backend + frontend)
- QR scanner opens from Home header
- `profile` removed from `SUB_PAGES` (now has its own bottom-nav tab)

### 5. Auth Components Partially Rewritten
- **Files**: `SplashScreen.tsx`, `PhoneInput.tsx`, `OTPInput.tsx`, `ProfileSetup.tsx`
- Migrated from inline styles to CSS classes
- Local LOKA objects removed (single source of truth: `src/lib/tokens.ts`)

### 6. globals.css Fixed
- **File**: `customer-app/src/app/globals.css`
- Removed phone mockup frame (`max-width: 430px`, `border-radius`, `height: 780px`)
- Now full viewport: `width: 100%`, `height: 100vh / 100dvh`
- Added `.loka-btn-primary`, `.loka-input`, `.loka-input-wrapper`, `.loka-auth-container`, `.loka-auth-brand`, etc.

### 7. PhoneInput Final Fixes
- **File**: `customer-app/src/components/auth/PhoneInput.tsx`
- `formatPhone()` strips leading `60` country code (browser autofill) AND leading `0` (Malaysian mobile format)
- Consistent 3-3-4 formatting: `10 290 5388`
- Added `onInput` handler to catch autofill events that bypass `onChange`
- Country selector gap: explicit `style` props (`marginRight: 12`, `paddingRight: 12`, `borderRight`)
- Input-to-button gap: single `mb-6` (24px) on wrapper, no double margin
- Build verified: compiled JS contains all changes

---

## Known Issues & Pending Work

### High Priority
| Issue | File(s) | Status |
|-------|---------|--------|
| OTPInput still has 22 inline `style={{` occurrences | `OTPInput.tsx` | Not started |
| HomePage still has 75 inline styles | `HomePage.tsx` | Not started |
| ProfilePage needs HubLayout | `ProfilePage.tsx` | Not started |

### Medium Priority
| Issue | File(s) | Status |
|-------|---------|--------|
| 27 files still have local LOKA objects or heavy inline styles | Various | In progress |
| PromotionsPage inline back button | `PromotionsPage.tsx` | Not started |
| InformationPage inline back button | `InformationPage.tsx` | Not started |

### Low Priority
| Issue | File(s) | Status |
|-------|---------|--------|
| Back button standardization across all sub-pages | Various | Partial (DetailLayout, ActionLayout done) |
| Service worker cache busting automation | `public/sw.js`, `public/manifest.json` | Manual for now |

---

## Key Architectural Decisions

1. **No store pill in headers**: Store selection only matters at checkout (pickup/delivery). Dine-in knows store from QR scan.
2. **No 3-dot menu**: Every feature has a proper home. A 3-dot with 1 item is poor UX.
3. **Notifications are fully built**: Backend API, `NotificationsPage.tsx`, `Notification` model, `ServiceWorkerRegistrar`, `sw.js` with push handler.
4. **PWA is full viewport**: Phone mockup frame removed. Targets actual mobile users.
5. **Design tokens**: `src/lib/tokens.ts` is single source of truth. CSS custom properties in `globals.css` mirror these values.

---

## Build & Deploy Commands

```bash
# Rebuild customer PWA Docker image
cd /root/fnb-super-app
docker compose build customer-app

# Restart container with new image
docker compose up -d --force-recreate customer-app

# Verify running container
docker ps | grep customer
docker logs --tail 20 fnb-customer-app

# Update PWA version (cache busting)
# Manually edit public/manifest.json + public/sw.js, then rebuild
```

---

## How to Clear PWA Cache (For Testing)

1. Chrome DevTools → Application → Service Workers → "Unregister"
2. Or: Chrome DevTools → Application → Storage → "Clear site data"
3. Or hard-refresh twice: `Ctrl+Shift+R`

---

## Next Session Priority List

1. **Migrate OTPInput** — Remove all 22 inline styles, convert to CSS classes + data attributes
2. **Migrate HomePage** — Remove 75 inline styles, integrate HubLayout properly
3. **Migrate ProfilePage** — Wrap in HubLayout with profile-variant HubHeader
4. **Continue auth page cleanup** — SplashScreen, ProfileSetup any remaining inline styles
5. **Audit remaining 27 files** for local LOKA objects and inline style migration

---

## Git Status
- Branch: clean at `c12fa51` (redesign reverted)
- All changes are uncommitted working tree changes
- Recommendation: Commit after completing auth component cleanup
