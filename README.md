# FNB Super App — Loka Espresso

Full-stack F&B ordering and loyalty platform. Active: **v3** (Round 17, 2026-06-03).

| Component | Stack | URL |
|-----------|-------|-----|
| Backend API | FastAPI + SQLAlchemy async | — |
| Admin Portal | Next.js 16 (120 pages) | admin.loyaltysystem.uk |
| Staff Portal | Next.js 16 (16 pages) | staff.loyaltysystem.uk |
| Customer PWA | Next.js 16 (26 pages) | app.loyaltysystem.uk |
| Database | PostgreSQL 16 | — |
| Reverse Proxy | Caddy | Auto HTTPS |

All code is in `v3/`. TypeScript 0 errors. E2E 23 passed. All 3 domains HTTPS 200.

## Quick Start

```bash
cd v3
# Backend
cd backend && uvicorn app.main:app --reload --port 13800

# Frontends (separate terminals)
cd admin-portal && npm run dev     # → localhost:13830
cd staff-portal && npm run dev     # → localhost:13820
cd customer-pwa && npm run dev     # → localhost:13810

# E2E Tests
cd e2e-tests && python3 -m pytest -v
```

## Structure

```
v3/
├── backend/          # FastAPI (37 endpoint files, 24 models)
├── admin-portal/     # Admin dashboard
├── staff-portal/     # Staff POS + operations
├── customer-pwa/     # Customer mobile PWA
├── e2e-tests/        # Pytest API-level tests
├── infra/            # Docker compose + Caddy
├── docs/             # Documentation
└── scripts/          # Seed scripts
```

## Key Features

- **Passwordless customer auth**: Phone + OTP, auto-register on first login
- **POS terminal**: Full checkout with wallet, voucher, reward, tip entry
- **Kitchen display**: Real-time kanban with audio alerts
- **Table management**: QR codes, dine-in ordering
- **Loyalty + wallet**: Points ledger with FIFO expiry, double-entry wallet
- **Inventory**: Global catalog + per-store stock levels
- **Translation system**: 5 languages (en/ms/zh/ta/tr), 6,975 records, live sync
- **Pure CSS**: Brand design system with warm Turkish coffee palette

## Documentation

- [v3 README](v3/README.md) — full system overview with all 17 audit rounds
- [AGENTS.md](AGENTS.md) — agent quick-reference
- [Design System](v3/docs/070-design-system.md) — brand tokens and design spec
