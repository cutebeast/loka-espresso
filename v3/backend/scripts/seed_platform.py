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
    ("app.currency", '"MYR"', "string", "all", False, False),
    ("app.support_phone", '"+60123456789"', "string", "all", False, True),
    ("app.support_email", '"support@lokaespresso.my"', "string", "all", False, True),
    ("otp.bypass_enabled", "false", "boolean", "all", True, True),
    ("otp.bypass_code", '"000000"', "string", "all", True, True),
    ("otp.expiry_minutes", "5", "integer", "all", False, True),
    ("otp.max_send_per_hour", "5", "integer", "all", False, True),
    ("order.auto_confirm", "true", "boolean", "all", False, True),
    ("order.preparation_time_minutes", "10", "integer", "all", False, True),
    ("store.default_pickup_lead_minutes", "15", "integer", "all", False, True),
    ("store.default_delivery_radius_km", "10.0", "decimal", "all", False, True),
    ("store.default_base_delivery_fee", "5.00", "decimal", "all", False, True),
    ("store.default_minimum_order_amount", "20.00", "decimal", "all", False, True),
    ("store.tax_registration", '"SST-123456789"', "string", "all", False, True),
    ("integration.pos_provider", '"Square"', "string", "all", False, True),
    ("integration.delivery_provider", '"GrabExpress"', "string", "all", False, True),
    ("integration.deepl_api_url", '"https://api-free.deepl.com/v2/translate"', "string", "all", False, True),
    ("integration.resend_api_url", '"https://api.resend.com/emails"', "string", "all", False, True),
    ("integration.twilio_api_url", '"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"', "string", "all", False, True),
    ("integration.twilio_verify_account_sid", '""', "string", "all", False, True),
    ("integration.twilio_verify_auth_token", '""', "string", "all", True, True),
    ("integration.twilio_verify_service_sid", '""', "string", "all", False, True),
    ("integration.twilio_verify_use_test_credentials", "false", "boolean", "all", False, True),
    ("integration.twilio_verify_test_account_sid", '""', "string", "all", False, True),
    ("integration.twilio_verify_test_auth_token", '""', "string", "all", True, True),
    ("stripe.webhook_secret", '""', "string", "all", True, True),
    ("hitpay.salt", '""', "string", "all", True, True),
    ("grabpay.webhook_secret", '""', "string", "all", True, True),
    ("loyalty.points_per_currency", "1", "integer", "all", False, True),
    ("loyalty.welcome_bonus", "50", "integer", "all", False, True),
    ("notifications.retention_days", "30", "integer", "all", False, True),
    ("upload.max_size_mb", "10", "integer", "all", False, True),
    ("accounting.decimal_places", "2", "integer", "all", False, True),
    ("accounting.rounding_mode", '"ROUND_HALF_UP"', "string", "all", False, True),
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
