"""seed stripe automatic tax config

Revision ID: 92e9be8274fc
Revises: 26ef29d9bd48
Create Date: 2026-07-06 05:55:48.480374

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '92e9be8274fc'
down_revision = '26ef29d9bd48'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Seed the Stripe automatic-tax toggle so it can be managed from the admin portal."""
    op.execute("""
        INSERT INTO platform_config (config_key, config_value, value_type, environment, is_sensitive, is_editable)
        VALUES
            ('stripe.automatic_tax_enabled', to_jsonb('false'::text), 'boolean', 'all', false, true)
        ON CONFLICT (config_key, environment) DO NOTHING;
    """)


def downgrade() -> None:
    """Remove the seeded row."""
    op.execute("""
        DELETE FROM platform_config WHERE config_key = 'stripe.automatic_tax_enabled';
    """)
