# Loka Espresso PWA — Agent Documentation

> This document tracks the design system, architecture, and conventions for the customer PWA at `app.loyaltysystem.uk`.

---

## 1. Design System

### Single Source of Truth

| File | Purpose |
|---|---|
| `src/lib/tokens.ts` | All brand colors, semantic colors, shadows, alpha scales |
| `src/app/globals.css` | Tailwind v4 theme + CSS utility classes |

**Rule:** Never define local `LOKA` objects in components. Import from `src/lib/tokens.ts`.

### Brand Colors

```
Primary:      #384B16  (dark olive)
Primary Dark: #2A3910
Primary Light:#4A6A1D
Copper:       #D18E38  (accent)
Brown:        #57280D
Text Primary: #1B2023
Background:   #E4EAEF
Card:         #FFFFFF
```

### CSS Utility Classes (globals.css)

| Class | Usage |
|---|---|
| `.loka-h1` through `.loka-h6` | Typography headings |
| `.loka-body`, `.loka-body-sm`, `.loka-caption` | Body text |
| `.loka-surface` | Standard white card with shadow |
| `.loka-surface-elevated` | Card with stronger shadow |
| `.loka-chip-*` | Status chips (success/warning/danger/info/primary/copper) |
| `.loka-store-pill` | Primary-green store pill |
| `.loka-btn-primary` | Full-width pill CTA |
| `.loka-page-header` | Page header bar |
| `.loka-back-btn` | Circular back button |

---

## 2. UI Primitives (`src/components/ui/`)

All primitives use Tailwind classes + tokens. No inline styles.

| Component | File | Variants / Props |
|---|---|---|
| `Button` | `Button.tsx` | primary/secondary/outline/ghost × sm/md/lg |
| `IconButton` | `IconButton.tsx` | default/primary/ghost/subtle × sm/md/lg |
| `FAB` | `FAB.tsx` | Floating action button (fixed bottom-right) |
| `PrimaryActionButton` | `shared/PrimaryActionButton.tsx` | Full-width pill with loading state |
| `Input` | `Input.tsx` | Text input with label, error, icons |
| `Textarea` | `Input.tsx` | Multi-line input |
| `SearchBar` | `SearchBar.tsx` | Search with clear button, focus ring |
| `Select` | `Select.tsx` | Custom dropdown with checkmark |
| `DatePicker` | `DatePicker.tsx` | Month calendar with min/max dates |
| `Checkbox` | `Checkbox.tsx` | Check toggle |
| `Radio` | `Radio.tsx` | Single-select radio |
| `Toggle` | `Toggle.tsx` | iOS-style switch with spring animation |
| `Modal` | `Modal.tsx` | Bottom sheet + center variants |
| `ConfirmDialog` | `ConfirmDialog.tsx` | Destructive + standard confirmation |
| `InfoPopup` | `InfoPopup.tsx` | Single-action info alert |
| `ActionSheet` | `ActionSheet.tsx` | Bottom sheet list of choices |
| `Toast` | `Toast.tsx` | Success/error/info toast (used by uiStore) |
| `Badge` | `Badge.tsx` | 7 color variants |
| `StatusChip` | `StatusChip.tsx` | 10 status variants with optional dot |
| `StorePill` | `StorePill.tsx` | Primary-green store pill with MapPin |
| `SurfaceCard` | `SurfaceCard.tsx` | default/elevated/pressed/gradient |
| `SectionHeader` | `SectionHeader.tsx` | Title + optional "See All" action |
| `Avatar` | `Avatar.tsx` | Image or initials, 4 sizes, gradient fallback |
| `Divider` | `Divider.tsx` | full/inset/middle |
| `Carousel` | `Carousel.tsx` | Swipeable with dots, arrows, autoplay |
| `Skeleton` | `Skeleton.tsx` | Generic + card + product skeletons |
| `PageHeader` | `shared/PageHeader.tsx` | Back button + title |

---

## 3. Backend Changes (Information Cards)

### Database

**Table:** `information_cards`

| Column | Type | Notes |
|---|---|---|
| `slug` | `VARCHAR(255)`, nullable, indexed | Human-readable URL identifier |
| `gallery_urls` | `JSONB`, nullable | Array of additional image URLs |

### Migrations

- `04aa2eaf646d` — Add `slug` to information_cards
- `41c93302d76f` — Add `gallery_urls` (JSONB) to information_cards

### API Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /content/information` | Public | List active cards |
| `GET /content/information/{slug}` | Public | Fetch single card by slug (QR deep-link) |
| `POST /upload/information-image` | Admin | Upload image to `uploads/information/` |
| `POST /upload/marketing-image` | Admin | Upload image to `uploads/marketing/` |
| `CRUD /admin/content/cards` | Admin | Full card management with `slug` + `gallery_urls` |

### Slug Generation

- Auto-generated from title: `"The Art of Baklava"` → `the-art-of-baklava`
- Admin can override with custom slug (e.g., `baklava-art`)
- Stored in DB, returned in all API responses

### Gallery Images

- Cover image: `image_url` (single, shown in list + article header)
- Gallery: `gallery_urls` (array, shown as swipeable carousel in article detail)
- Both stored as relative paths: `/uploads/information/filename.jpg`
- Resolved to full URL via `resolveAssetUrl()` in frontend

---

## 4. QR Code Deep-Linking

### URL Format

```
https://app.loyaltysystem.uk/?slug={slug}#information
```

Example:
```
https://app.loyaltysystem.uk/?slug=history-of-pide#information
```

### Flow

1. Customer scans QR → opens URL
2. `AppShell` parses `?slug=` on mount, stores in ref
3. Query params cleaned from URL immediately
4. Customer goes through auth flow (splash → phone → OTP → profile)
5. After `handleAuthDone()`, app navigates to `#information` with `selectedInfoSlug`
6. `InformationPage` fetches article by slug via `/content/information/{slug}`
7. Article opens automatically

### Customer Journey

```
Scan QR (curiosity) → Splash screen → Login → Auto-open article → Registered user
```

---

## 5. Image Handling

### Upload Flow

| Source | Endpoint | Destination |
|---|---|---|
| Admin → Info Card Cover | `POST /upload/information-image` | `uploads/information/` |
| Admin → Info Card Gallery | `POST /upload/information-image` | `uploads/information/` |
| Admin → Marketing | `POST /upload/marketing-image` | `uploads/marketing/` |

**Important:** Docker mounts `./uploads:/app/uploads` from project root (`/root/fnb-super-app/uploads/`), NOT `backend/uploads/`.

### PWA Display

- **List view:** `image_url` shown as 88×88 thumbnail
- **Article detail:**
  - Single image → static cover (aspect-video)
  - Multiple images (`gallery_urls`) → `ImageCarousel` component with swipe + dots

### ImageCarousel Component

- Swipe left/right to navigate
- Dot pagination at bottom
- Arrow indicators (subtle)
- Touch gesture support

---

## 6. File Structure Conventions

```
customer-app/src/
├── app/
│   ├── globals.css          # Design system CSS + Tailwind theme
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # AppShell entry
├── components/
│   ├── ui/                  # 21 reusable primitives
│   ├── shared/              # PageHeader, PrimaryActionButton, etc.
│   ├── menu/                # MenuPage, ItemCard, etc.
│   ├── checkout/            # Checkout flow components
│   ├── auth/                # Auth flow components
│   └── profile/             # Profile sub-pages
├── stores/                  # Zustand stores (auth, cart, ui, wallet, config)
├── hooks/                   # Custom React hooks
├── lib/
│   ├── api.ts               # API client + types
│   ├── tokens.ts            # Design tokens (SSOT)
│   └── ...                  # Utilities
```

---

## 7. Rules for Next Agent

1. **No inline styles for layout** — Use Tailwind utilities. Inline styles only for truly dynamic values (conditional colors, dynamic widths).
2. **No local LOKA objects** — Always import from `@/lib/tokens`.
3. **Use primitives** — Don't reinvent `SurfaceCard`, `StatusChip`, etc.
4. **Images go to `uploads/information/`** for info cards, `uploads/marketing/` for promos.
5. **Add `slug` when creating information cards** — Auto-generated but overridable.
6. **Test Cloudflare cache** — New images may need cache-busting (rename files) if they 404 initially.
