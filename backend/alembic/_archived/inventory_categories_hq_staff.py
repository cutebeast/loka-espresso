"""Inventory categories + HQ staff (nullable store_id)

Revision ID: inv_cat_hq_staff
Revises: 4f94031ff6af
Create Date: 2026-04-14

"""
from alembic import op
import sqlalchemy as sa

revision = 'inv_cat_hq_staff'
down_revision = '4f94031ff6af'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create inventory_categories table
    op.create_table(
        'inventory_categories',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('store_id', sa.Integer, sa.ForeignKey('stores.id'), nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(100), nullable=True),
        sa.Column('display_order', sa.Integer, server_default='0'),
        sa.Column('is_active', sa.Boolean, server_default='true', nullable=False),
    )

    # 2. Migrate existing free-text categories into inventory_categories
    # Get distinct categories per store
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT DISTINCT store_id, category FROM inventory_items WHERE category IS NOT NULL AND category != ''")
    ).fetchall()

    # Create a mapping of (store_id, category_name) -> new category_id
    cat_map = {}
    for store_id, cat_name in rows:
        result = conn.execute(
            sa.text("INSERT INTO inventory_categories (store_id, name, slug, display_order, is_active) VALUES (:sid, :name, :slug, 0, true) RETURNING id"),
            {"sid": store_id, "name": cat_name, "slug": cat_name.lower().replace(" ", "-")}
        ).fetchone()
        cat_map[(store_id, cat_name)] = result[0]

    # 3. Add category_id column to inventory_items
    op.add_column('inventory_items', sa.Column('category_id', sa.Integer, sa.ForeignKey('inventory_categories.id'), nullable=True))

    # 4. Backfill category_id from the mapping
    for (store_id, cat_name), cat_id in cat_map.items():
        conn.execute(
            sa.text("UPDATE inventory_items SET category_id = :cid WHERE store_id = :sid AND category = :cname"),
            {"cid": cat_id, "sid": store_id, "cname": cat_name}
        )

    # 5. Drop the old free-text category column
    op.drop_column('inventory_items', 'category')

    # 6. Make staff.store_id nullable (for HQ staff without a store)
    op.alter_column('staff', 'store_id', nullable=True)


def downgrade() -> None:
    # Reverse: make store_id NOT NULL again
    op.alter_column('staff', 'store_id', nullable=False)

    # Re-add free-text category column
    op.add_column('inventory_items', sa.Column('category', sa.String(100), nullable=True))

    # Copy category names back from inventory_categories
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            UPDATE inventory_items i
            SET category = c.name
            FROM inventory_categories c
            WHERE i.category_id = c.id
        """)
    )

    # Drop category_id
    op.drop_column('inventory_items', 'category_id')

    # Drop inventory_categories table
    op.drop_table('inventory_categories')
