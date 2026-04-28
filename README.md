# FNB Super App

Full-stack food & beverage ordering and loyalty platform for Loka Espresso.

## Architecture

| Component | Technology | Port | URL |
|-----------|-----------|------|-----|
| Backend API | FastAPI (Python 3.12) | 8000 | `https://admin.loyaltysystem.uk/api/v1` |
| Admin Frontend | Next.js 16 | 3000 | `https://admin.loyaltysystem.uk` |
| Customer PWA | Next.js 16 | 3001 | `https://app.loyaltysystem.uk` |
| Database | PostgreSQL 16 | 5432 | `fnb` |
| Reverse Proxy | Caddy | 443/80 | Auto HTTPS |

## Quick Start

```bash
# Clone and set up environment
cp .env.example .env
# Edit .env with your values

# Start all services
docker compose up -d

# Run migrations
docker compose exec backend alembic upgrade head

# Seed the database
docker compose exec backend python scripts/seed.py
```

## Project Structure

```
├── backend/           # FastAPI backend
│   ├── app/
│   │   ├── api/v1/    # REST endpoints (common, admin, pwa)
│   │   ├── models/    # SQLAlchemy models (22 files)
│   │   ├── schemas/   # Pydantic schemas (19 files)
│   │   └── core/      # Config, security, database
│   └── alembic/       # Database migrations
├── frontend/          # Admin dashboard (Next.js)
│   └── src/
│       ├── app/       # Single-page app with hash routing
│       ├── components/# Page components
│       ├── styles/    # Modular CSS (no framework)
│       └── lib/       # API client, config, utilities
├── customer-app/      # Customer PWA (Next.js)
│   └── src/
│       ├── components/# Page + UI components
│       ├── stores/    # Zustand state management
│       ├── styles/    # Modular CSS (no Tailwind)
│       └── lib/       # API client, tokens, utilities
├── docs/              # Documentation (35+ files)
├── infra/             # Caddy config, deployment
├── scripts/           # Seed scripts, utilities
└── uploads/           # Uploaded files (Docker volume)
```

## Key Features

- **Customer PWA**: OTP auth, menu browsing, cart, checkout, order tracking, wallet, loyalty points, rewards, vouchers, promotions, surveys, referrals, favorites, QR table scanning
- **Admin Dashboard**: Store/menu/staff/table management, order management (KDS), POS terminal, inventory, customer management, marketing campaigns, broadcasts, loyalty tiers, reports, PWA management
- **API**: ~230 REST endpoints with Pydantic validation, JWT auth, role-based access control, audit logging

## Documentation

See [docs/00-index.md](docs/00-index.md) for the full documentation index.

Key docs:
- [Architecture](docs/01-architecture.md)
- [Database Schema](docs/02-database-schema.md)
- [API Reference](docs/03-api-reference.md)
- [Environment Configuration](docs/12-environment.md)
- [Admin Frontend Guide](docs/20-admin-frontend-guide.md)
- [PWA Ordering Journey](docs/21-pwa-ordering-journey.md)
