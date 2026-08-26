"""add eghl payment provider

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-08-26 18:10:00.000000

Adds 'eghl' (GHL Systems Malaysia hosted payment page) to the payment_provider
enum and seeds its platform_config keys (mirrors the hitpay config-gating
pattern: disabled by default, password marked sensitive).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f3a4b5c6d7e8'
down_revision = 'e2f3a4b5c6d7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'eghl' to the PostgreSQL enum if it is not already present.
    op.execute("ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'eghl'")

    # Seed editable eGHL gateway config keys. Values default to empty/disabled
    # so the admin portal (Settings → Payment Gateway) can fill them in without
    # a redeploy. api_base_url defaults to the TEST hosted page; switch to
    # https://pay.e-ghl.com/IPGSG/Payment.aspx for live.
    keys = [
        # (config_key, config_value JSON literal, value_type, is_sensitive)
        ("eghl.enabled", "false", "boolean", False),
        ("eghl.merchant_id", '""', "string", False),
        ("eghl.password", '""', "string", True),
        ("eghl.api_base_url", '"https://test2pay.ghl.com/IPGSG/Payment.aspx"', "string", False),
        ("eghl.payment_methods", '["card", "fpx"]', "json", False),
    ]
    for key, value, value_type, is_sensitive in keys:
        op.execute(
            sa.text(
                """
                INSERT INTO platform_config (
                    config_key,
                    config_value,
                    value_type,
                    environment,
                    is_sensitive,
                    is_editable
                )
                VALUES (
                    :key,
                    CAST(:value AS jsonb),
                    :value_type,
                    'all',
                    :is_sensitive,
                    true
                )
                ON CONFLICT DO NOTHING
                """
            ).bindparams(
                key=key,
                value=value,
                value_type=value_type,
                is_sensitive=is_sensitive,
            )
        )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM platform_config
            WHERE config_key IN (
                'eghl.enabled',
                'eghl.merchant_id',
                'eghl.password',
                'eghl.api_base_url',
                'eghl.payment_methods'
            )
            """
        )
    )
    # Enum values cannot be removed in PostgreSQL without recreating the type.
    # A full recreation is omitted here because it cascades to dependent columns.
