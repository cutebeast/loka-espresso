"""Add 6 compliance tables and 4 missing composite indexes.

Tables created: allergens, menu_item_allergens, delivery_zones,
modifier_groups, modifier_options. Indexes added for tax_rates (created in 7c34).

Indexes added: orders(order_type,status), menu_items(category_id,is_available,display_order),
user_vouchers(user_id,status), survey_responses(survey_id,created_at).

Revision ID: 8d56ef9012ab
Revises: 7c34ab5e1234
Create Date: 2026-04-26 14:30:00.000000
"""

from alembic import op
from sqlalchemy import text

revision = "8d56ef9012ab"
down_revision = "7c34ab5e1234"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create compliance tables and missing composite indexes."""

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS allergens (
        id SERIAL NOT NULL,
        name VARCHAR(100) NOT NULL,
        icon VARCHAR(50),
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        UNIQUE (name)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS delivery_zones (
        id SERIAL NOT NULL,
        store_id INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        zone_type VARCHAR(50) NOT NULL DEFAULT 'radius',
        delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
        min_order DECIMAL(10, 2) NOT NULL DEFAULT 0,
        estimated_minutes INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS modifier_groups (
        id SERIAL NOT NULL,
        menu_item_id INTEGER NOT NULL,
        name VARCHAR(100) NOT NULL,
        required BOOLEAN NOT NULL DEFAULT false,
        max_selections INTEGER NOT NULL DEFAULT 1,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY(menu_item_id) REFERENCES menu_items (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS modifier_options (
        id SERIAL NOT NULL,
        group_id INTEGER NOT NULL,
        name VARCHAR(100) NOT NULL,
        price_adjustment DECIMAL(10, 2) NOT NULL DEFAULT 0,
        is_default BOOLEAN NOT NULL DEFAULT false,
        is_available BOOLEAN NOT NULL DEFAULT true,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY(group_id) REFERENCES modifier_groups (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS menu_item_allergens (
        menu_item_id INTEGER NOT NULL,
        allergen_id INTEGER NOT NULL,
        PRIMARY KEY (menu_item_id, allergen_id),
        FOREIGN KEY(menu_item_id) REFERENCES menu_items (id) ON DELETE CASCADE,
        FOREIGN KEY(allergen_id) REFERENCES allergens (id) ON DELETE CASCADE
    );"""))

    op.execute(text("CREATE INDEX IF NOT EXISTS ix_allergens_id ON allergens (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_tax_rates_id ON tax_rates (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_tax_rates_store_id ON tax_rates (store_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_delivery_zones_id ON delivery_zones (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_delivery_zones_store_id ON delivery_zones (store_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_modifier_groups_id ON modifier_groups (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_modifier_groups_menu_item_id ON modifier_groups (menu_item_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_modifier_options_id ON modifier_options (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_modifier_options_group_id ON modifier_options (group_id);"))

    op.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_type_status ON orders (order_type, status);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_menu_items_category_available ON menu_items (category_id, is_available, display_order);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_user_vouchers_user_status ON user_vouchers (user_id, status);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_survey_responses_survey_created ON survey_responses (survey_id, created_at);"))


def downgrade() -> None:
    """Drop compliance tables in reverse dependency order."""
    op.execute(text("DROP TABLE IF EXISTS menu_item_allergens CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS modifier_options CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS modifier_groups CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS delivery_zones CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS allergens CASCADE;"))
