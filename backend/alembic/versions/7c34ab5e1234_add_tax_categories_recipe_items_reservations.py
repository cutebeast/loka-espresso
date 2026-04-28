"""Add tax_categories, recipe_items, and reservations tables.

Revision ID: 7c34ab5e1234
Revises: 6b92efcd789d
Create Date: 2026-04-26 14:00:00.000000
"""

from alembic import op
from sqlalchemy import text

revision = "7c34ab5e1234"
down_revision = "6b92efcd789d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create tax_rates, tax_categories, recipe_items, and reservations tables."""

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS tax_rates (
        id SERIAL NOT NULL,
        name VARCHAR(100) NOT NULL,
        rate DECIMAL(5, 4) NOT NULL,
        tax_type VARCHAR(50) NOT NULL DEFAULT 'percentage',
        is_inclusive BOOLEAN NOT NULL DEFAULT false,
        store_id INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS tax_categories (
        id SERIAL NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        tax_rate_id INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        UNIQUE (name),
        FOREIGN KEY(tax_rate_id) REFERENCES tax_rates (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS recipe_items (
        id SERIAL NOT NULL,
        menu_item_id INTEGER NOT NULL,
        inventory_item_id INTEGER NOT NULL,
        quantity DECIMAL(10, 4) NOT NULL,
        unit VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY(menu_item_id) REFERENCES menu_items (id) ON DELETE CASCADE,
        FOREIGN KEY(inventory_item_id) REFERENCES inventory_items (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL NOT NULL,
        store_id INTEGER NOT NULL,
        user_id INTEGER,
        table_id INTEGER,
        guest_name VARCHAR(255) NOT NULL,
        guest_phone VARCHAR(20),
        party_size INTEGER NOT NULL,
        reserved_at TIMESTAMP WITH TIME ZONE NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 60,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL,
        FOREIGN KEY(table_id) REFERENCES store_tables (id) ON DELETE SET NULL
    );"""))

    op.execute(text("CREATE INDEX IF NOT EXISTS ix_tax_categories_id ON tax_categories (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_recipe_items_id ON recipe_items (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_recipe_items_menu_item_id ON recipe_items (menu_item_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_recipe_items_inventory_item_id ON recipe_items (inventory_item_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_reservations_id ON reservations (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_reservations_store_id ON reservations (store_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_reservations_user_id ON reservations (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_reservations_reserved_at ON reservations (reserved_at);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_reservations_status ON reservations (status);"))


def downgrade() -> None:
    """Drop tables in reverse dependency order."""
    op.execute(text("DROP TABLE IF EXISTS reservations CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS recipe_items CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS tax_categories CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS tax_rates CASCADE;"))
