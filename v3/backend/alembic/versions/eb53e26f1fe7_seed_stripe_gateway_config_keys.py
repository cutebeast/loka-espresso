"""seed stripe gateway config keys

Revision ID: eb53e26f1fe7
Revises: e09513eac19c
Create Date: 2026-07-01 12:59:08.045532

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'eb53e26f1fe7'
down_revision = 'e09513eac19c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Seed editable Stripe gateway config keys.

    Values default to empty so the admin portal can fill them in without a
    redeploy.  Empty platform_config values fall back to .env when present.
    """
    keys = [
        ("stripe.secret_key", "string", True),
        ("stripe.publishable_key", "string", False),
        ("stripe.webhook_secret", "string", True),
    ]

    for key, value_type, is_sensitive in keys:
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
                    '""'::jsonb,
                    :value_type,
                    'all',
                    :is_sensitive,
                    true
                )
                ON CONFLICT DO NOTHING
                """
            ).bindparams(
                key=key,
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
                'stripe.secret_key',
                'stripe.publishable_key',
                'stripe.webhook_secret'
            )
            """
        )
    )
