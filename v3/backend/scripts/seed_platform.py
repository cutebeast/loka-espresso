#!/usr/bin/env python3
"""Seed platform config and data-retention policies."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from scripts._db_utils import confirm, get_db, guard_production


CONFIGS = [
    ("app.name", '"LOKA Espresso"', "string", "all", False, False),
    ("app.currency", '"MYR"', "string", "all", False, True),
    ("app.currency_symbol", '"RM"', "string", "all", False, True),
    ("currency.default", '"MYR"', "string", "all", False, True),
    ("app.support_phone", '"+60127889314"', "string", "all", False, True),
    ("app.support_email", '"support@lokaespresso.my"', "string", "all", False, True),
    # Public portal URLs — used for payment provider redirect/return URLs.
    ("app.public_url", '"https://app.lokaespresso.com"', "string", "all", False, True),
    ("admin.public_url", '"https://admin.lokaespresso.com"', "string", "all", False, True),
    ("staff.public_url", '"https://staff.lokaespresso.com"', "string", "all", False, True),
    ("otp.bypass_enabled", "true", "boolean", "all", False, True),
    ("otp.bypass_code", '"000000"', "string", "all", True, True),
    ("otp.expiry_minutes", "5", "integer", "all", False, True),
    ("otp.max_send_per_hour", "5", "integer", "all", False, True),
    # Time clock: auto-close stale open shifts so a forgotten clock-out never
    # blocks the next clock-in (threshold hours, backdated for payroll).
    ("timeclock.auto_clockout_enabled", "true", "boolean", "all", False, True),
    ("timeclock.auto_clockout_hours", "16", "integer", "all", False, True),
    ("order.auto_confirm", "true", "boolean", "all", False, True),
    ("order.preparation_time_minutes", "10", "integer", "all", False, True),
    # Staff cash top-ups capture no payment — non-manager roles are capped at
    # this amount per top-up (store managers are uncapped).
    ("wallet.staff_topup_max_amount", '"200.00"', "decimal", "all", False, True),
    ("store.default_pickup_lead_minutes", "15", "integer", "all", False, True),
    ("store.default_delivery_radius_km", "10.0", "decimal", "all", False, True),
    ("store.default_base_delivery_fee", "5.00", "decimal", "all", False, True),
    ("store.default_minimum_order_amount", "20.00", "decimal", "all", False, True),
    ("store.tax_registration", '"SST-123456789"', "string", "all", False, True),
    ("integration.pos_provider", '"Square"', "string", "all", False, True),
    ("integration.delivery_provider", '"GrabExpress"', "string", "all", False, True),
    ("integration.deepseek_api_key", '""', "string", "all", True, True),
    ("integration.deepseek_model", '"deepseek-v4-flash"', "string", "all", False, True),
    ("integration.deepseek_fallback_model", '"deepseek-v4-pro"', "string", "all", False, True),
    ("integration.resend_api_url", '"https://api.resend.com/emails"', "string", "all", False, True),
    ("integration.resend_use_test_credentials", "false", "boolean", "all", False, True),
    ("integration.resend_api_key", '""', "string", "all", True, True),
    ("integration.resend_from_email", '"Loka Espresso <noreply@lokaespresso.my>"', "string", "all", False, True),
    ("integration.resend_test_api_key", '""', "string", "all", True, True),
    ("integration.resend_test_from_email", '"Loka Espresso Test <noreply@lokaespresso.my>"', "string", "all", False, True),
    ("integration.resend_webhook_secret", '""', "string", "all", True, True),
    # Transactional order receipt emails (via Resend) — OFF by default until
    # verified live; toggle in Admin → Settings. Uses the integration.resend_*
    # credentials above.
    ("email.receipts_enabled", "false", "boolean", "all", False, True),
    ("integration.twilio_api_url", '"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"', "string", "all", False, True),
    ("integration.twilio_use_test_credentials", "false", "boolean", "all", False, True),
    ("integration.twilio_account_sid", '""', "string", "all", False, True),
    ("integration.twilio_auth_token", '""', "string", "all", True, True),
    ("integration.twilio_from_number", '""', "string", "all", False, True),
    ("integration.twilio_whatsapp_from", '""', "string", "all", False, True),
    ("integration.twilio_test_account_sid", '""', "string", "all", False, True),
    ("integration.twilio_test_auth_token", '""', "string", "all", True, True),
    ("integration.twilio_test_from_number", '""', "string", "all", False, True),
    ("integration.twilio_test_whatsapp_from", '""', "string", "all", False, True),
    ("integration.twilio_verify_account_sid", '""', "string", "all", False, True),
    ("integration.twilio_verify_auth_token", '""', "string", "all", True, True),
    ("integration.twilio_verify_service_sid", '""', "string", "all", False, True),
    ("integration.twilio_verify_use_test_credentials", "false", "boolean", "all", False, True),
    ("integration.twilio_verify_test_account_sid", '""', "string", "all", False, True),
    ("integration.twilio_verify_test_auth_token", '""', "string", "all", True, True),
    ("stripe.enabled", "false", "boolean", "all", False, True),
    ("stripe.automatic_tax_enabled", "false", "boolean", "all", False, True),
    # Hosted-checkout routing: 'stripe' = real Stripe checkout; 'simulator' =
    # our local simulated checkout page (also auto-active when no keys set).
    ("stripe.checkout_mode", '"stripe"', "string", "all", False, True),
    # Payment method lists are JSON arrays (payment-gateway page edits them;
    # the PUT endpoint 404s on unknown keys, so the rows must exist).
    ("stripe.payment_method_types", '["card", "fpx"]', "json", "all", False, True),
    ("hitpay.payment_methods", '["duitnow", "touch_n_go", "boost", "shopee_pay"]', "json", "all", False, True),
    # Stripe API keys — DB-first (services read platform_config before .env);
    # seeded empty so they appear in Admin → Settings → Payments. The boss
    # pastes live keys there at go-live (no .env edit, no redeploy).
    ("stripe.secret_key", '""', "string", "all", True, True),
    ("stripe.publishable_key", '""', "string", "all", False, True),
    ("stripe.webhook_secret", '""', "string", "all", True, True),
    # Stripe sandbox (test-mode) credentials — a separate environment with its
    # own keys. `<provider>.mode` = 'live' | 'sandbox' selects which set the
    # services use. Webhooks from EITHER environment are accepted (both
    # endpoints post to the same URL).
    ("stripe.mode", '"live"', "string", "all", False, True),
    ("stripe.sandbox_secret_key", '""', "string", "all", True, True),
    ("stripe.sandbox_publishable_key", '""', "string", "all", False, True),
    ("stripe.sandbox_webhook_secret", '""', "string", "all", True, True),
    ("hitpay.enabled", "false", "boolean", "all", False, True),
    ("hitpay.api_key", '""', "string", "all", True, True),
    ("hitpay.salt", '""', "string", "all", True, True),
    ("hitpay.api_base_url", '"https://api.hit-pay.com"', "string", "all", False, True),
    ("hitpay.mode", '"live"', "string", "all", False, True),
    ("hitpay.sandbox_api_key", '""', "string", "all", True, True),
    ("hitpay.sandbox_salt", '""', "string", "all", True, True),
    ("hitpay.sandbox_api_base_url", '"https://api.sandbox.hit-pay.com"', "string", "all", False, True),
    # eGHL (ADAPTIS — iPay88 NDes) payment gateway — preferred MY gateway
    # (card + FPX + eWallets via the ADAPTIS hosted page). `eghl.merchant_key`
    # is sensitive (HMAC-SHA512 signing key). `eghl.base_url` is the ADAPTIS
    # {BaseURL} from the merchant-approval email (no trailing path — the
    # service appends /entry/adaptishosted, /merchantrequery, /merchantrefund).
    ("eghl.enabled", "false", "boolean", "all", False, True),
    ("eghl.merchant_code", '""', "string", "all", False, True),
    ("eghl.merchant_key", '""', "string", "all", True, True),
    ("eghl.base_url", '""', "string", "all", False, True),
    ("eghl.payment_methods", '["card", "fpx"]', "json", "all", False, True),
    ("eghl.mode", '"live"', "string", "all", False, True),
    ("eghl.sandbox_merchant_code", '""', "string", "all", False, True),
    ("eghl.sandbox_merchant_key", '""', "string", "all", True, True),
    ("eghl.sandbox_base_url", '""', "string", "all", False, True),
    # GrabPay removed 2026-08-17 (never launched — simulator-only).
    # Web Push (VAPID) — DB-first since round 38 pass 8; seeded empty so they
    # appear in Admin → Settings → Web Push. Env vars remain the bootstrap
    # fallback (services fall back to .env when the DB row is empty).
    ("vapid.public_key", '""', "string", "all", False, True),
    ("vapid.private_key", '""', "string", "all", True, True),
    ("vapid.subject", '"mailto:support@lokaespresso.my"', "string", "all", False, True),
    # LHDN MyInvois e-invoicing — disabled by default; while `einvoice.enabled`
    # is false submissions are SIMULATED (see app/services/einvoice.py), the
    # same config-gated pattern as stripe/hitpay.
    ("einvoice.enabled", "false", "boolean", "all", False, True),
    ("einvoice.auto_issue", "false", "boolean", "all", False, True),
    ("einvoice.base_url", '"https://preprod-api.myinvois.hasil.gov.my"', "string", "all", False, True),
    ("einvoice.client_id", '""', "string", "all", False, True),
    ("einvoice.client_secret", '""', "string", "all", True, True),
    ("einvoice.tin", '"C00000000000"', "string", "all", False, True),
    ("einvoice.brn", '"200001000001"', "string", "all", False, True),
    ("einvoice.msic", '"56101"', "string", "all", False, True),
    ("einvoice.supplier_name", '"Loka Espresso"', "string", "all", False, True),
    ("einvoice.sst_number", '"SST-123456789"', "string", "all", False, True),
    ("einvoice.default_classification", '"999"', "string", "all", False, True),
    ("loyalty.points_per_currency", "1", "integer", "all", False, True),
    ("loyalty.welcome_bonus", "50", "integer", "all", False, True),
    ("loyalty.welcome_reward_type", '"voucher"', "string", "all", False, True),
    ("loyalty.welcome_reward_voucher_code", '"WELCOME-RM5"', "string", "all", False, True),
    # Daily check-in streak rewards (read by /checkin + admin check-in settings)
    ("checkin.daily_base_points", "10", "integer", "all", False, True),
    ("checkin.streak_increment", "2", "integer", "all", False, True),
    ("checkin.streak_7day_bonus", "20", "integer", "all", False, True),
    ("checkin.max_streak_days", "7", "integer", "all", False, True),
    ("notifications.retention_days", "30", "integer", "all", False, True),
    ("upload.max_size_mb", "10", "integer", "all", False, True),
    ("accounting.decimal_places", "2", "integer", "all", False, True),
    ("accounting.rounding_mode", '"ROUND_HALF_UP"', "string", "all", False, True),
    # Staff meal discount at POS — % or fixed RM off, set by the boss here and
    # applied by cashier/supervisor via the "Staff Meal" button at checkout.
    ("staffmeal.discount_type", '"percentage"', "string", "all", False, True),
    ("staffmeal.discount_value", "10", "decimal", "all", False, True),
    # KDS station routing — category slugs per station; "*" = every category
    # not explicitly claimed by another station (catches uncategorized items).
    (
        "kds.station_map",
        '{"bar": ["cafe-specialty-coffee", "beyond-coffee", "frappes", "fresh-juices", "mixed-juices", "beverage", "loka-specialty"], "kitchen": ["*"]}',
        "json",
        "all",
        False,
        True,
    ),
]

RETENTION_POLICIES = [
    ("notification_messages", 90, "delete", None),
    ("notification_delivery_log", 90, "delete", None),
    ("audit_log", 2555, "archive", "audit_log_archive"),
    ("system_health_metrics", 90, "delete", None),
    ("survey_responses", 1095, "anonymize", None),
    ("order_status_log", 2555, "archive", "order_status_log_archive"),
    ("wallet_ledger_entries", 2555, "archive", "wallet_ledger_archive"),
    ("loyalty_points_ledger", 2555, "archive", "loyalty_ledger_archive"),
]


async def seed():
    async with get_db() as db:
        await db.execute(
            text("""
                INSERT INTO platform_config
                    (config_key, config_value, value_type, environment, is_sensitive, is_editable)
                VALUES (:key, :value, :value_type, :environment, :sensitive, :editable)
                ON CONFLICT (config_key, environment) DO NOTHING
            """),
            [
                {
                    "key": key,
                    "value": value,
                    "value_type": value_type,
                    "environment": environment,
                    "sensitive": sensitive,
                    "editable": editable,
                }
                for key, value, value_type, environment, sensitive, editable in CONFIGS
            ],
        )

        await db.execute(
            text("""
                INSERT INTO data_retention_policies
                    (table_name, retention_days, purge_strategy, archive_table)
                VALUES (:table_name, :retention_days, :purge_strategy, :archive_table)
                ON CONFLICT (table_name) DO NOTHING
            """),
            [
                {
                    "table_name": table,
                    "retention_days": days,
                    "purge_strategy": strategy,
                    "archive_table": archive,
                }
                for table, days, strategy, archive in RETENTION_POLICIES
            ],
        )


async def main():
    parser = argparse.ArgumentParser(description="Seed platform config")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Seed platform config and retention policies?", args.yes):
        print("Aborted.")
        return

    await seed()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
