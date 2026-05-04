# Environment vs. Database Config Audit Report

**Date:** 2026-05-04
**Status:** ✅ Completed

---

## Changes Made Today

### 1. Removed stale `OTP_BYPASS_ALLOWED`
- **`.env.example`**: Removed `OTP_BYPASS_ALLOWED=false` line
- **Already clean**: `.env` and `config.py` had no references (removed in prior round)
- **Reason**: OTP bypass has been DB-controlled via `AppConfig` (`otp_bypass_enabled` / `otp_bypass_code`) for some time. The env var was orphaned.

### 2. Moved `POS_API_URL` to DB-controllable
- **`backend/app/api/v1/endpoints/common/config.py`**: Added `pos_api_url` to `ALLOWED_CONFIG_KEYS`
- **`backend/app/api/v1/endpoints/common/order_confirm.py`**: Modified `_send_order_to_pos()` to query `AppConfig` as fallback when the env var is empty
  - Reads `settings.POS_API_URL` first (backward compatible)
  - Falls back to `AppConfig.key == "pos_api_url"` if env is unset
  - This lets admins switch POS providers or enable/disable sync without redeploying

### 3. Removed dead `pwa_phone_country_code`
- **`backend/app/api/v1/endpoints/common/config.py`**: Removed from `ALLOWED_CONFIG_KEYS`
- **`frontend/src/components/pages/system/PWASettingsPage.tsx`**: Removed the entire "Default Country Code" UI section (input field, save button, status indicators)
- **Reason**: The backend never read this key. It was in the allowlist and rendered in the admin UI, but had zero effect on any API behaviour.

---

## Test Results

```
17 passed, 1 skipped, 55 warnings in 1.03s
```
- All existing tests pass.
- The 1 skipped test is DB-dependent (skipped when Postgres unavailable).

---

## Env → DB Migration Matrix

| Variable | Decision | Rationale |
|---|---|---|
| `DATABASE_URL`, `DB_PASSWORD` | **Keep in env** | Infrastructure connection |
| `JWT_SECRET`, `JWT_SECRET_PREVIOUS`, `JWT_ALGORITHM`, `JWT_ISSUER`, `JWT_AUDIENCE` | **Keep in env** | Crypto infrastructure; secret rotation needs restart for safety |
| `JWT_EXPIRE_MINUTES`, `JWT_REFRESH_EXPIRE_DAYS` | **Keep in env** | Hot-path performance (read on every token creation). DB query would add latency. |
| `UPLOAD_DIR`, `CUSTOMER_APP_DIR` | **Keep in env** | Filesystem paths tied to container layout |
| `ENVIRONMENT` | **Keep in env** | Deployment marker |
| `REDIS_URL` | **Keep in env** | Infrastructure connection |
| `CORS_ORIGINS` | **Keep in env** | Security boundary; validated at startup |
| `TWILIO_*`, `MAXMIND_*`, `WEBHOOK_*` | **Keep in env** | API credentials / secrets — never in DB |
| `ALLOW_CUSTOMER_RESET` | **Keep in env** | Safety guardrail. Harder to accidentally toggle via env than admin UI. |
| `POS_API_URL` | **Moved to DB** ✅ | Operational setting. Admin can now switch POS endpoints without redeploy. |
| `OTP_BYPASS_ALLOWED` | **Removed** 🗑️ | Orphaned — bypass is fully DB-controlled. |

---

## Already Properly DB-Controlled (no action needed)

- `otp_bypass_enabled`, `otp_bypass_code`
- `delivery_fee`, `min_order_delivery`, `min_order`, `min_order_amount`
- `currency`, `currency_symbol`, `earn_rate`, `pickup_lead_minutes`
- `loyalty_enabled`, `loyalty_points_per_rmse`, `max_vouchers_per_user`
- `voucher_expiry_days`, `points_redemption_rate`
- `referral_reward_points`, `referral_min_orders`
- `pos_integration_enabled`, `delivery_integration_enabled`
- `payment_gateway_provider`
- `notification_retention_days`

---

## Remaining Deferred Item (Month 2+ Code Quality)

1. **Admin state management refactor** — Replace scattered `useState` with a centralized state pattern or reducer in the admin frontend.

Not security-critical.

---

## Completed Since Last Audit

| Item | Status |
|------|--------|
| Mega `useEffect` refactor (`page.tsx`) | ✅ Split into 7 per-page effects (2026-05-04) |
| ESLint 0 errors / 0 warnings | ✅ All 15 changed files clean (2026-05-04) |
| Full endpoint audit (175 endpoints) | ✅ Zero regressions (`docs/073-endpoint-audit.md`) |
| TypeScript 0 errors | ✅ Both frontends pass `tsc --noEmit` |

---

## Current Grade: A

- **17/18 tests passing** (1 skipped due to missing DB)
- **All security audit items resolved** (3 rounds, 32 findings addressed)
- **Secrets properly isolated** in `.env.local` (gitignored)
- **Redis middleware** active with auto-fallback to in-memory
- **Authenticated upload endpoint** available alongside public StaticFiles
- **ESLint clean**: 0 errors, 0 warnings
- **TypeScript clean**: 0 errors in both frontends
