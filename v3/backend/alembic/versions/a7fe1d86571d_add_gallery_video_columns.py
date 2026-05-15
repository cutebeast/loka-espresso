"""Add gallery, video, customer_segments, long_description, and description columns

Revision ID: a7fe1d86571d
Revises: 489e0319dcfe
Create Date: 2026-05-14 18:30:00
"""
from alembic import op

revision = 'a7fe1d86571d'
down_revision = 'a4b5c6d7e8f9'
branch_labels = None
depends_on = None

def upgrade():
    # --- Create customer_daily_checkins table ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS customer_daily_checkins (
            id BIGSERIAL PRIMARY KEY,
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            checkin_date TIMESTAMP WITH TIME ZONE NOT NULL,
            streak_count INTEGER NOT NULL DEFAULT 1,
            points_earned INTEGER NOT NULL DEFAULT 0,
            store_id INTEGER REFERENCES stores(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT uq_customer_checkin_date UNIQUE (customer_id, checkin_date)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_checkins_customer ON customer_daily_checkins(customer_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_checkins_date ON customer_daily_checkins(checkin_date)")
    # Gallery columns on marketing entities
    for table in ['reward_catalog', 'promo_banners', 'information_cards', 'product_cards', 'event_cards']:
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS image_gallery_urls JSONB")
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS gallery_video_url VARCHAR(500)")

    # Customer segments
    op.execute("ALTER TABLE reward_catalog ADD COLUMN IF NOT EXISTS customer_segments JSONB")
    op.execute("ALTER TABLE voucher_definitions ADD COLUMN IF NOT EXISTS customer_segments JSONB")

    # Long description on promo banners
    op.execute("ALTER TABLE promo_banners ADD COLUMN IF NOT EXISTS long_description TEXT")

    # Description fields on inventory
    op.execute("ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS description TEXT")
    op.execute("ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS description TEXT")

    # Store sort order
    op.execute("ALTER TABLE stores ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0")

    # Event fields
    op.execute("ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS location VARCHAR(255)")
    op.execute("ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS event_datetime TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS rsvp_enabled BOOLEAN DEFAULT FALSE")
    op.execute("ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS rsvp_max_capacity INTEGER")
    op.execute("ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS rsvp_count INTEGER DEFAULT 0")

    # Remove image_gallery_urls from menu_items (wrong placement)
    op.execute("ALTER TABLE menu_items DROP COLUMN IF EXISTS image_gallery_urls")

def downgrade():
    op.execute("DROP TABLE IF EXISTS customer_daily_checkins")
    for table in ['reward_catalog', 'promo_banners', 'information_cards', 'product_cards', 'event_cards']:
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS image_gallery_urls")
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS gallery_video_url")
    op.execute("ALTER TABLE reward_catalog DROP COLUMN IF EXISTS customer_segments")
    op.execute("ALTER TABLE voucher_definitions DROP COLUMN IF EXISTS customer_segments")
    op.execute("ALTER TABLE promo_banners DROP COLUMN IF EXISTS long_description")
    op.execute("ALTER TABLE inventory_categories DROP COLUMN IF EXISTS description")
    op.execute("ALTER TABLE inventory_items DROP COLUMN IF EXISTS description")
    op.execute("ALTER TABLE stores DROP COLUMN IF EXISTS position")
    for col in ['location', 'event_datetime', 'rsvp_enabled', 'rsvp_max_capacity', 'rsvp_count']:
        op.execute(f"ALTER TABLE event_cards DROP COLUMN IF EXISTS {col}")
