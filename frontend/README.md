# FNB Super App — Admin Frontend

Admin dashboard for managing stores, menus, orders, staff, inventory, customers, and marketing for the Loka Espresso loyalty platform.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Pure CSS (modular, no framework)
- **State**: React hooks + `useAuth`/`useHashRouter`
- **API**: FastAPI backend at `/api/v1`

## Getting Started

```bash
cp .env.example .env.local
# Edit .env.local with your API URL
npm install
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api/v1` | Backend API base URL |
| `NEXT_PUBLIC_APP_NAME` | `Loka Espresso` | Brand name |
| `NEXT_PUBLIC_LOGO_URL` | `/logo.png` | Logo path |
| `NEXT_PUBLIC_APP_DOMAIN` | `app.loyaltysystem.uk` | Customer PWA domain |
| `NEXT_PUBLIC_ADMIN_DOMAIN` | `admin.loyaltysystem.uk` | Admin domain |

## Architecture

- **Single-page app** with hash-based routing (`#dashboard`, `#orders`, etc.)
- **AuthGuard** component handles auth state and redirects
- **Modular CSS** in `src/styles/` — one file per page/feature
- **API layer** in `src/lib/merchant-api.tsx` with auto-refresh token handling

## Project Structure

```
src/
├── app/              # App entry (page.tsx, layout.tsx, globals.css)
├── components/       # Page components organized by feature
│   └── pages/        # Dashboard, orders, menu, staff, settings, etc.
├── hooks/            # useAuth, useHashRouter
├── lib/              # config.ts, merchant-api.tsx
└── styles/           # CSS modules (no framework)
```

## Related Documentation

- [Admin Frontend Guide](../docs/20-admin-frontend-guide.md)
- [Environment Configuration](../docs/12-environment.md)
- [API Reference](../docs/03-api-reference.md)
