# Admin Portal — FNB Super App v3

Admin dashboard for Loka Espresso — store management, menu, customers, staff, loyalty, marketing, inventory, and system configuration.

## Stack

- **Framework:** Next.js 16 (Turbopack) + TypeScript
- **Styling:** Pure CSS (no framework)
- **Port:** 13830

## Getting Started

```bash
npm install
npm run dev        # Development at http://localhost:13830
npm run build      # Production build
npx next start -p 13830  # Start production server
```

## Environment

```bash
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=/api/v1
```

## Routes

| Route | Description |
|-------|-------------|
| `/login` | Admin login |
| `/` | Dashboard with KPIs |
| `/profile` | View profile + change password |
| `/stores` | Store management |
| `/menu/*` | Menu categories, items, allergens, dietary tags, tax |
| `/loyalty/*` | Tiers, accounts, ledger, settings |
| `/marketing/*` | Rewards, promotions, vouchers, surveys, referrals, check-ins, campaigns |
| `/content/*` | Info cards, products, events, system pages, PWA splash |
| `/orders` | Order management |
| `/customers/*` | Customer management, consents, devices |
| `/staff/*` | Staff management, roles, shifts |
| `/inventory/*` | Inventory categories, items, suppliers, movements, purchase orders |
| `/notifications/*` | Notification templates, broadcast, report |
| `/feedback` | Customer feedback |
| `/reports` | Business reports |
| `/tables` | Table management |
| `/reservations` | Reservation management |
| `/refunds` | Refund management |
| `/equipment/*` | Equipment management |
| `/admins/*` | Admin listing + roles |
| `/translations` | PWA translation management |
| `/audit-log` | Audit trail |
| `/settings/*` | App settings, reservation settings, version control |
