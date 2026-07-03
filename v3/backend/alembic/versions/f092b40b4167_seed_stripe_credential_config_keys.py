"""seed stripe credential config keys

Revision ID: f092b40b4167
Revises: 2e68722ad51c
Create Date: 2026-07-02 16:45:34.691365

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f092b40b4167'
down_revision = '2e68722ad51c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    for key, is_sensitive in [
        ("stripe.secret_key", True),
        ("stripe.publishable_key", True),
        ("stripe.webhook_secret", True),
    ]:
        op.execute(
            sa.text(
                """
                INSERT INTO platform_config (
                    config_key, config_value, value_type, environment, is_sensitive, is_editable
                )
                VALUES (
                    :key,
                    '""'::jsonb,
                    'string',
                    'all',
                    :is_sensitive,
                    true
                )
                ON CONFLICT DO NOTHING
                """
            ).bindparams(key=key, is_sensitive=is_sensitive)
        )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM platform_config WHERE config_key IN ('stripe.secret_key', 'stripe.publishable_key', 'stripe.webhook_secret')"
        )
    )
