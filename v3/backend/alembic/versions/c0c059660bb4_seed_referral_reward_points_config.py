"""seed referral reward points config

Revision ID: c0c059660bb4
Revises: f092b40b4167
Create Date: 2026-07-02 16:49:44.067396

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c0c059660bb4'
down_revision = 'f092b40b4167'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO platform_config (
                config_key, config_value, value_type, environment, is_sensitive, is_editable
            )
            VALUES (
                'loyalty.referral_reward_points',
                '50'::jsonb,
                'integer',
                'all',
                false,
                true
            )
            ON CONFLICT DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM platform_config WHERE config_key = 'loyalty.referral_reward_points'"
        )
    )
