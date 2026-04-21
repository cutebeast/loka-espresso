# FNB Super-App — Alignment Verification

> Last updated: 2026-04-21 | Purpose: verify current contract alignment, not claim launch perfection

## What Is Aligned

### Backend model / schema direction
- backend models and Alembic migrations are aligned around the current PostgreSQL schema
- recent pre-integration hardening added:
  - richer OTP session metadata
  - richer payment metadata
  - richer delivery metadata on orders

### Active apps
- `frontend/` merchant/admin app is active
- `customer-app/` customer PWA is active
- both build successfully against the current backend contract

### Seed flow
- `scripts/seed/` remains the supported modular verification layer
- seed scripts were updated to the current auth/payment/wallet/order contracts in this pass

## Important Non-Claims

The following are **not** currently claimed as fully solved:

1. real provider integrations
   - PG still mocked
   - delivery still mocked
   - POS still mocked
   - Twilio not integrated yet

2. distributed idempotency
   - current middleware remains in-memory, not multi-instance durable

3. full automated regression coverage
   - builds and seed flows exist
   - conventional test-suite coverage is still limited

## Current Alignment Notes

### Customer wallet endpoints
- `GET /wallet` = cash wallet balance and transactions domain
- `GET /me/wallet` = combined customer wallet projection (cash + rewards + vouchers + loyalty points)

### Menu model
- customer/store-facing menu routes remain store-addressed
- universal HQ menu model remains the effective source of menu content

### Payment model
- Flow A wallet settlement uses:
  - `POST /payments/create-intent`
  - `POST /payments/confirm`
- PG mock tooling can still drive webhook-style settlement simulation

### Delivery model
- order records now carry delivery metadata needed for current mock lifecycle testing:
  - provider status
  - external delivery id
  - ETA
  - courier data
  - tracking URL

## Current Gaps Still Outside "Aligned" Status

1. some historical docs still contain audit-era or certification-era language and should not be treated as a release signoff
2. local scripted runtime uses `8765` backend port while some deployment docs reference `8000` for production/systemd examples
3. mock integrations are intentionally simple and not a substitute for real provider contracts

## Practical Verification Sources

Use these as the current source of truth:

1. `backend/app/`
2. `customer-app/src/`
3. `frontend/src/`
4. `scripts/seed/`
5. `scripts/fnb-manage.sh`

## Current Conclusion

The system is aligned enough for the next implementation phase:

- real PG integration
- real Twilio integration
- real third-party delivery integration
- real third-party POS integration

It should **not** be described as fully production-certified or fully complete yet.
