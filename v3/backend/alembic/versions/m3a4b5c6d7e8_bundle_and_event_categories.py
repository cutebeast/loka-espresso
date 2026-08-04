"""bundle_categories and event_categories split from menu_categories

Revision ID: m3a4b5c6d7e8
Revises: l2f3a4b5c6d7
Create Date: 2026-08-04

menu_categories carried two pseudo-categories: "Combo" (id=40, unused) and
"Experiences & Workshops" (id=30, still referenced by workshop menu_items, so
the row must stay). This introduces dedicated bundle_categories and
event_categories tables, links bundle_products / menu_items to them, and marks
the two pseudo-categories as system rows (kept for item grouping, hidden from
management and public lists).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'm3a4b5c6d7e8'
down_revision = 'l2f3a4b5c6d7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bundle_categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=50), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "event_categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=50), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("slug"),
    )

    op.add_column(
        "bundle_products",
        sa.Column("bundle_category_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_bundle_products_bundle_category_id",
        "bundle_products", "bundle_categories",
        ["bundle_category_id"], ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "menu_items",
        sa.Column("event_category_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_menu_items_event_category_id",
        "menu_items", "event_categories",
        ["event_category_id"], ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "menu_categories",
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # Data migration: retire the pseudo-categories and seed the new tables.
    op.execute("UPDATE menu_categories SET is_system = true, is_available = false WHERE id = 40")
    op.execute("UPDATE menu_categories SET is_system = true WHERE id = 30")
    op.execute(
        "INSERT INTO bundle_categories (name, slug, display_order, is_active, created_at, updated_at) "
        "VALUES ('Combos', 'combos', 0, true, now(), now())"
    )
    op.execute(
        "INSERT INTO event_categories (name, slug, display_order, is_active, created_at, updated_at) "
        "VALUES ('Workshops', 'workshops', 0, true, now(), now()), "
        "('Experiences', 'experiences', 1, true, now(), now())"
    )
    op.execute(
        "UPDATE menu_items SET event_category_id = "
        "(SELECT id FROM event_categories WHERE slug = 'workshops') "
        "WHERE category_id = 30 AND deleted_at IS NULL"
    )


def downgrade() -> None:
    op.execute("UPDATE menu_items SET event_category_id = NULL WHERE category_id = 30")
    op.execute("UPDATE menu_categories SET is_system = false, is_available = true WHERE id = 40")
    op.execute("UPDATE menu_categories SET is_system = false WHERE id = 30")

    op.drop_column("menu_categories", "is_system")
    op.drop_constraint("fk_menu_items_event_category_id", "menu_items", type_="foreignkey")
    op.drop_column("menu_items", "event_category_id")
    op.drop_constraint("fk_bundle_products_bundle_category_id", "bundle_products", type_="foreignkey")
    op.drop_column("bundle_products", "bundle_category_id")
    op.drop_table("event_categories")
    op.drop_table("bundle_categories")
