# FNB Super App - Documentation Index
**Last Updated:** 2026-04-21 | **Status:** Pre-integration hardening complete, provider integrations pending

---

## Current State

The codebase currently includes:

- `backend/` FastAPI API with PostgreSQL, Alembic, JWT auth, OTP flow, wallet, order, loyalty, marketing, and webhook endpoints
- `frontend/` merchant/admin Next.js app
- `customer-app/` customer PWA Next.js app
- `scripts/seed/` modular API-driven seed and verification scripts
- mock provider scripts under:
  - `scripts/3rdparty_pg/`
  - `scripts/3rdparty_delivery/`
  - `scripts/external_pos/`

Current pre-provider posture:

- OTP delivery still uses backend-side OTP bypass/testing flow until Twilio integration
- wallet topup and provider payment flows still use mock PG tooling
- delivery lifecycle still uses mock delivery tooling
- external POS flow still uses mock POS tooling
- docs below reflect the current internal contract before real PG, Twilio, delivery, and POS integrations

---

## Recommended Reading Order

### Core System
1. **[01-architecture.md](01-architecture.md)** - system architecture, runtime topology, current integration boundaries
2. **[02-database-schema.md](02-database-schema.md)** - schema overview
3. **[03-api-reference.md](03-api-reference.md)** - current API contract reference

### Verification & Operations
4. **[04-testing-guide.md](04-testing-guide.md)** - current test accounts, seed flow, verification workflow
5. **[07-deployment-guide.md](07-deployment-guide.md)** - deployment and local rebuild workflow
6. **[09-troubleshooting.md](09-troubleshooting.md)** - runtime and seed troubleshooting

### Historical / Audit Context
7. **[05-alignment-verification.md](05-alignment-verification.md)** - current alignment summary and known drift boundaries
8. **[06-improvements-applied.md](06-improvements-applied.md)** - historical implementation log, not a launch signoff

### Detailed Schema
9. **[02a-acl.md](02a-acl.md)** - access control schema
10. **[02b-users.md](02b-users.md)** - users, OTP, device tokens, token blacklist
11. **[02c-stores.md](02c-stores.md)** - stores and tables
12. **[02d-menu.md](02d-menu.md)** - menu and inventory
13. **[02e-orders.md](02e-orders.md)** - orders and payments
14. **[02f-loyalty.md](02f-loyalty.md)** - loyalty, rewards, wallet
15. **[02g-marketing.md](02g-marketing.md)** - vouchers, promos, surveys, information cards
16. **[02h-staff.md](02h-staff.md)** - staff management
17. **[02i-social.md](02i-social.md)** - referral and favorites
18. **[02j-system.md](02j-system.md)** - config, notifications, audit

---

## Important Notes

- Do not treat historical "100% complete" notes in older documents as launch approval.
- The source of truth for rebuild/start workflow is now:
  - `scripts/fnb-manage.sh`
- The source of truth for modular seeding is now:
  - `scripts/seed/`
- The source of truth for mock integrations is now:
  - `scripts/3rdparty_pg/`
  - `scripts/3rdparty_delivery/`
  - `scripts/external_pos/`

---

## Current Priorities

1. Keep internal contracts stable.
2. Keep seed scripts aligned with current APIs.
3. Keep docs aligned with current code and runtime workflow.
4. Use mock provider scripts only as temporary integration simulators.
5. Real PG, Twilio, delivery-provider, and external POS integrations are the next phase.
