"""seed email receipts config key

Revision ID: b7c8d9e0f1a2
Revises: f3a4b5c6d7e8
Create Date: 2026-08-27 15:45:00.000000

Seeds the ``email.receipts_enabled`` platform_config key (default off) that
gates transactional order receipt emails sent via Resend on payment capture
(see app/services/email.py). Seeded so Admin → Settings can toggle it without
a redeploy — the config PUT endpoint 404s on unknown keys. Credentials are
reused from the existing integration.resend_* keys.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b7c8d9e0f1a2'
down_revision = 'f3a4b5c6d7e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    keys = [
        # (config_key, config_value JSON literal, value_type, is_sensitive)
        ("email.receipts_enabled", "false", "boolean", False),
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
                'email.receipts_enabled'
            )
            """
        )
    )
