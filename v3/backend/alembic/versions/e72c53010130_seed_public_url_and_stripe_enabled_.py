"""seed public url and stripe enabled config keys

Revision ID: e72c53010130
Revises: 2708dd8b5359
Create Date: 2026-07-03 15:21:32.040502

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'e72c53010130'
down_revision = '2708dd8b5359'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Seed platform_config rows required for payment-gateway and public URL handling."""
    op.execute("""
        INSERT INTO platform_config (config_key, config_value, value_type, environment, is_sensitive, is_editable)
        VALUES
            ('app.public_url', to_jsonb('https://app.lokaespresso.com'::text), 'string', 'all', false, true),
            ('admin.public_url', to_jsonb('https://admin.lokaespresso.com'::text), 'string', 'all', false, true),
            ('staff.public_url', to_jsonb('https://staff.lokaespresso.com'::text), 'string', 'all', false, true),
            ('stripe.enabled', to_jsonb('true'::text), 'boolean', 'all', false, true),
            ('hitpay.base_url', to_jsonb('https://api.hit-pay.com'::text), 'string', 'all', false, true),
            ('hitpay.enabled', to_jsonb('false'::text), 'boolean', 'all', false, true),
            ('hitpay.payment_methods', to_jsonb('["duitnow","touch_n_go","paynow_online"]'::text), 'json', 'all', false, true)
        ON CONFLICT (config_key, environment) DO NOTHING;
    """)


def downgrade() -> None:
    """Remove seeded rows."""
    op.execute("""
        DELETE FROM platform_config
        WHERE config_key IN (
            'app.public_url', 'admin.public_url', 'staff.public_url',
            'stripe.enabled', 'hitpay.base_url', 'hitpay.enabled', 'hitpay.payment_methods'
        );
    """)
