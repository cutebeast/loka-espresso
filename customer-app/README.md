# FNB Super App — Customer PWA

Progressive Web App for Loka Espresso customers. Browse menus, place orders, earn loyalty points, redeem rewards, and manage wallets.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Pure CSS (modular, no Tailwind)
- **State**: Zustand stores (auth, cart, ui, wallet, config)
- **PWA**: Service worker, manifest, offline banner
- **API**: FastAPI backend at `/api/v1`

## Getting Started

```bash
cp .env.example .env.local
# Edit .env.local with your values
npm install
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_PROXY` | — | Backend API proxy URL |
| `NEXT_PUBLIC_ADMIN_URL` | — | Admin dashboard URL |
| `NEXT_PUBLIC_APP_URL` | — | PWA app URL |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | — | Web push VAPID key |
| `NEXT_PUBLIC_OTP_BYPASS` | `false` | Enable OTP bypass in dev |

## Architecture

- **AppShell** manages auth flow and page routing
- **Auth flow**: Splash → Phone → OTP → Profile → Main app
- **Page router** uses hash-based navigation (`#menu`, `#cart`, etc.)
- **Offline support**: Service worker with retry countdown banner
- **Design system**: `src/lib/tokens.ts` (single source of truth for colors/shadows)

## Project Structure

```
src/
├── app/              # App entry (page.tsx, layout.tsx, globals.css)
├── components/
│   ├── ui/           # 21 reusable primitives (Button, Modal, etc.)
│   ├── shared/       # PageHeader, PrimaryActionButton, OfflineBanner
│   ├── home/         # Home page sub-components
│   ├── menu/         # Menu page components
│   ├── checkout/     # Checkout flow components
│   ├── auth/         # Auth flow components
│   └── profile/      # Profile sub-pages
├── stores/           # Zustand state management
├── hooks/            # Custom React hooks
├── lib/              # api.ts, tokens.ts, utilities
└── styles/           # Modular CSS (38 files, no framework)
```

## Design Rules

- **No Tailwind** — Pure CSS utility classes from `utilities.css`
- **No inline styles for layout** — Use CSS utility classes
- **No local LOKA objects** — Always import from `@/lib/tokens`
- **Use primitives** — Don't reinvent SurfaceCard, StatusChip, etc.

## Related Documentation

- [PWA Ordering Journey](../docs/21-pwa-ordering-journey.md)
- [Environment Configuration](../docs/12-environment.md)
- [API Reference](../docs/03-api-reference.md)
