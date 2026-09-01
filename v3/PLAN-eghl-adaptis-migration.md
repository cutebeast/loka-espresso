# eGHL → ADAPTIS (iPay88 NDes) Migration Plan

**Date:** 2026-09-01 · **Source:** iPay88 NDes Confluence docs
(Client Initiate ADAPTIS Hosted · PaymentId · Merchant Requery · Refund)

## 0. Current state (round 43) vs the new API

| Concern | Current (legacy iPay88) | ADAPTIS (new docs) |
|---|---|---|
| Endpoint | `eghl.gateway_url` (legacy hosted page) | `{BaseURL}/entry/adaptishosted` (POST form, web-redirect) |
| Signature | **SHA-256** lowercase hex, legacy field sequence (password + ServiceID + PaymentID + URLs + Amount + CurrencyCode + CustIP + PageTimeout) | **HMAC-SHA512** over `MerchantKey + MerchantCode + RefNo + Amount(stripped)` |
| Request fields | TransactionType/PymtMethod/ServiceID/PaymentID/…/HashValue | MerchantCode · RefNo · RequestType=10 · Amount (with separators) · Currency=MYR · ProdDesc · Customer{Name,Email,ContactNumber} · billing address · PaymentInfo.PaymentId · ResponseUrl · BackendUrl · AppDeepLink · Verification{SignatureType,Signature} |
| Callback | legacy TxnID/TxnStatus/HashValue fields | **Backend post = JSON, success-only** (authoritative) + frontend redirect |
| Requery | **none** | `POST {BaseURL}/merchantrequery` JSON; 1300/1400; limits: 7/day, ≤10 days |
| Refund | **manual** (`eghl_manual_{id}` — no gateway call) | `POST {BaseURL}/merchantrefund` JSON; RefundStatusId 3300/3440; unique RefNo = idempotent |
| Payment methods | legacy `eghl.payment_methods` strings | PaymentId map: card=2 · FPX all banks=16 · Boost=210 · GrabPay=523 · TnG=538 · Maybank PayQR=542 · ShopeePay=801 · Setel=912 |
| Tests | 9 unit tests (legacy hash vectors, checkout, enable flag) | rewrite vectors to HMAC-SHA512 ADAPTIS samples |
| Config | `eghl.enabled` false on dev (no creds) | replace keys; still disabled until merchant creds arrive |

**Net:** this is a full **migration of the eGHL provider from the legacy
gateway to ADAPTIS**, plus two new capabilities (Requery sweep + gateway
refund).

---

## Phase 1 — Config + service rewrite (foundation)

1. Replace settings keys (migration of existing values where possible):
   - `eghl.merchant_code` (MerchantCode) · `eghl.merchant_key` (MerchantKey) ·
     `eghl.base_url` ({BaseURL}) · `eghl.payment_methods` → list of method
     slugs mapped to the PaymentId table · keep `eghl.enabled`.
2. Rewrite signing in `services/eghl.py`:
   - `build_adaptis_signature(merchant_key, *fields)` → HMAC-SHA512 hex
     (lowercase — confirm exact case/hex form with the doc's Signature
     sections; **to-confirm item A**).
   - Requery: `MerchantKey + MerchantCode + RefNo + Amount(stripped)`
     (amount `1.00` → `100`).
   - Refund: `MerchantKey + MerchantCode + IpayId + RefNo +
     RefundAmount(stripped) + RefundCurrency`.
3. Rewrite `build_eghl_checkout_page` to emit the ADAPTIS hosted form
   (fields + Verification{SignatureType:"HMACSHA512", Signature}).
   - `RefNo` = our existing PaymentID (`EG{payment.id}` / `EGT{session.id}`)
     — fits the ≤50-char spec.
   - `ResponseUrl` = `{api}/payments/eghl/return` · `BackendUrl` =
     `{api}/webhooks/eghl` (ADAPTIS posts JSON on success only).
   - `PaymentId` omitted by default (merchant default method set); the
     method map is stored for a later per-method selection UI.
   - Keep the checkout token + auto-submit page mechanics (transport layer
     is unchanged).

## Phase 2 — Backend callback (success authority)

4. Rewrite `POST /webhooks/eghl` for the **JSON backend post**:
   - Parse `{MerchantCode, RefNo, Amount, Currency, TransId,
     TransactionStatusId, ...}`; verify the backend-post signature
     (same construction as the request — **to-confirm item B**).
   - Status map: `TransactionStatusId` per the appendix (1300 success,
     1400 fail; full table in Appendix doc — fetch it during implementation).
   - Idempotent capture → reuse the existing `_sync_order_payment_status`
     / wallet-topup completion paths (same as Stripe/HitPay webhooks).
   - Keep the frontend `resolve_eghl_return_redirect` (browser return is
     UX-only; the backend post is authoritative).
   - Store `TransId` on `Payment.provider_transaction_id` (currently holds
     the PaymentID — move PaymentID to `extra_metadata`).

## Phase 3 — Merchant Requery (the new hole-closer)

5. `requery_eghl_payment(db, payment)`:
   - POST JSON `/merchantrequery` `{MerchantCode, RefNo, Amount(stripped),
     Verification}`.
   - 1300 → capture (idempotent) · 1400 → fail · not-found → retry later.
   - Track requery count + timestamps in `payment.extra_metadata`
     (enforce 7/day, ≤10-day window — skip when exhausted, log).
6. Wire a **sweep**: extend the existing 5-min periodic task (or the
   payment-session limbo sweep) — for eGHL payments stuck in
   `pending_authorization` > 10 min with no callback, requery once per
   sweep cycle until resolved or limits hit. This covers the exact case
   doc (c) exists for: customer paid, ADAPTIS never reached both URLs.
7. Optional: a manual "Requery now" action on the admin order detail
   payment row (v1.1 — the sweep covers the core need).

## Phase 4 — Gateway refund

8. `refund_eghl_payment(db, payment, refund)`:
   - POST JSON `/merchantrefund` `{MerchantCode, RequestType:10,
     IpayId=TransId, RefNo=RF{refund.id} (unique, idempotent per doc),
     RefundAmount, RefundCurrency, Remark, Verification}`.
   - Map `RefundStatusId`: 3300 Refunded → mark refund completed +
     sync order (existing refund_payment post-steps) · 3440 Gateway
     Failed → mark failed, log `ErrorMessage` verbatim · other → pending
     (sweeper/requery-able later if needed).
9. Replace the `eghl_manual_{id}` branch in `refund_payment` with the
   gateway call; keep the 60-s duplicate guard + over-refund balance
   checks (existing, provider-agnostic).

## Phase 5 — Settings / admin UI

10. Payment Gateway settings: eGHL section fields → Merchant Code,
    Merchant Key, Base URL, and the PaymentId method picker (checkbox
    list, default = merchant default set). Keep `eghl.enabled` gate.
11. Re-seed the gateway settings guide page (admin guide).

## Phase 6 — Tests & verification

12. Unit (`tests/test_eghl_service.py` rewrite):
    - Signature vectors (use the doc's requery/refund sample strings —
      the requery doc gives a full sample; verify our HMAC output format
      matches `5d3d34…` style; **to-confirm item A**).
    - Checkout form fields (ADAPTIS names + Verification block).
    - Callback verification (valid / tampered / missing / wrong key).
    - Requery request + 1300/1400 mapping + 7/day & 10-day limit logic.
    - Refund request + 3300/3440 mapping + idempotent RefNo.
13. E2E: gated on real creds (UAT `{BaseURL}` + test MerchantKey). Plan a
    manual UAT checklist: hosted checkout → FPX/TnG → backend post
    capture → requery fallback (simulate by omitting callback) → refund.
14. Gates: unit suite, full E2E (eGHL disabled on dev — the 252 suite
    stays green), `alembic check`, tsc ×1 (no PWA change unless Phase 5
    touches admin only).

## Open confirmations (from the docs, to nail during implementation)

- **A — exact signature string/case**: the request & backend-post
  Signature sections were partially truncated in the anonymous Confluence
  view; confirm the precise concatenation + hex case against the full
  spec (samples exist in the requery/refund docs).
- **B — backend-post signature fields**: confirm whether it signs the
  same `MerchantKey+MerchantCode+RefNo+Amount(stripped)` set or includes
  TransId/status (fetch the full Client-Initiate Signature section).
- **C — TransactionStatusId appendix**: fetch the Appendix page for the
  full status table (beyond 1300/1400) for accurate mapping.

## Effort estimate

- Phase 1–2 (rewrite + callback): ~1 round
- Phase 3 (requery + sweep): ~1 round
- Phase 4 (refund): ~1 round
- Phase 5–6 (settings UI + tests + UAT): ~1 round

**Dependencies:** merchant UAT credentials (MerchantCode/MerchantKey/
BaseURL) before any live/UAT verification; the full rewrite is safe to
build now behind `eghl.enabled=false`.
