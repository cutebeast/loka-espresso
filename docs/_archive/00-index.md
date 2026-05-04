# Loka Espresso — Documentation Index
**Last Updated:** 2026-05-04 | **Status:** Phase 2 UI/UX v2 complete — all 26 PWA pages self-contained, brand-wide color refactoring done, ESLint passed. Ready for dine-in flow.

---

## Current State

The codebase includes:
- `backend/` — FastAPI with PostgreSQL, Alembic, JWT, OTP auth, wallet, orders, loyalty, marketing, notification templates, QR scan bridge
- `frontend/` — Admin Next.js app (hash router, desktop + mobile service crew)
- `customer-app/` — Customer PWA Next.js app (Zustand, pure CSS, 26 pages v2)
- `scripts/seed/` — Modular API-driven seed scripts
- `docs/` — This documentation

**Pre-provider**: OTP uses bypass mode until Twilio integration. Wallet top-up and payments use mock PG tooling. Delivery and POS use mock providers. All documented below reflect current internal contracts.

---

## Key Documents

### Project State (latest)
- **[00-project-state-2026-05-04.md](00-project-state-2026-05-04.md)** — Complete project state: brand design system, CSS architecture, icon system, component patterns, page status, architecture decisions. **Read this first.**

### Brand & Design
- **[11-ui-ux-guidelines.md](11-ui-ux-guidelines.md)** — Original UI/UX guidelines (for historical reference)
- **[18-css-architecture.md](18-css-architecture.md)** — CSS architecture and conventions
- **[19-responsive-design-guide.md](19-responsive-design-guide.md)** — Responsive design patterns

### Core System
- **[01-architecture.md](01-architecture.md)** — System architecture, runtime topology
- **[02-database-schema.md](02-database-schema.md)** — Schema overview
- **[03-api-reference.md](03-api-reference.md)** — API contract reference

### Domain Models
- **[02a-acl.md](02a-acl.md)** — Access control
- **[02b-users.md](02b-users.md)** — Users (admin + customer)
- **[02c-stores.md](02c-stores.md)** — Stores
- **[02d-menu.md](02d-menu.md)** — Menu
- **[02e-orders.md](02e-orders.md)** — Orders
- **[02f-loyalty.md](02f-loyalty.md)** — Loyalty & rewards
- **[02g-marketing.md](02g-marketing.md)** — Marketing
- **[02h-staff.md](02h-staff.md)** — Staff
- **[02i-social.md](02i-social.md)** — Social & referral
- **[02j-system.md](02j-system.md)** — System config

### Operations
- **[04-testing-guide.md](04-testing-guide.md)** — Test accounts, seed flow
- **[07-deployment-guide.md](07-deployment-guide.md)** — Deployment & rebuild
- **[09-troubleshooting.md](09-troubleshooting.md)** — Troubleshooting
- **[12-environment.md](12-environment.md)** — Environment config

### Frontend
- **[20-admin-frontend-guide.md](20-admin-frontend-guide.md)** — Admin frontend
- **[21-pwa-ordering-journey.md](21-pwa-ordering-journey.md)** — PWA ordering journey

### Archive (historical)
- `_archive/` — Old session logs and outdated docs
