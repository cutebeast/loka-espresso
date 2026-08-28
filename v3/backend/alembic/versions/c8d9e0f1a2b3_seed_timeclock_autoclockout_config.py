"""seed timeclock auto clock-out config keys

Revision ID: c8d9e0f1a2b3
Revises: b6c7d8e9f0a1
Create Date: 2026-08-28 06:00:00.000000

Seeds ``timeclock.auto_clockout_enabled`` (default on) and
``timeclock.auto_clockout_hours`` (default 16) — gates the auto clock-out of
stale open shifts (staff who never clocked out could never clock in again).
Seeded so Admin → Settings can tune them without a redeploy — the config PUT
endpoint 404s on unknown keys.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c8d9e0f1a2b3'
down_revision = 'b6c7d8e9f0a1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    keys = [
        # (config_key, config_value JSON literal, value_type, is_sensitive)
        ("timeclock.auto_clockout_enabled", "true", "boolean", False),
        ("timeclock.auto_clockout_hours", "16", "integer", False),
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
                'timeclock.auto_clockout_enabled',
                'timeclock.auto_clockout_hours'
            )
            """
        )
    )
