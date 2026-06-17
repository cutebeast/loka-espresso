"""add_bundle_products

Revision ID: c001_bundle_products
Revises: a95e99792003
Create Date: 2026-06-17 09:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'c001_bundle_products'
down_revision = 'a95e99792003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'bundle_products',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('bundle_type', sa.String(30), nullable=False, server_default='combo'),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('image_url', sa.String(500), nullable=True),
        sa.Column('bundle_price', sa.Numeric(10, 2), nullable=False),
        sa.Column('category_id', sa.Integer(), sa.ForeignKey('menu_categories.id', ondelete='SET NULL'), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('end_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('max_per_order', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('image_gallery_urls', postgresql.JSONB(), nullable=True),
        sa.Column('gallery_video_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'bundle_product_components',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('bundle_product_id', sa.Integer(), sa.ForeignKey('bundle_products.id', ondelete='CASCADE'), nullable=False),
        sa.Column('menu_item_id', sa.Integer(), sa.ForeignKey('menu_items.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('default_quantity', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('is_required', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_swappable', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('swap_group', sa.Integer(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
    )

    op.create_table(
        'bundle_component_modifiers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('bundle_product_component_id', sa.Integer(), sa.ForeignKey('bundle_product_components.id', ondelete='CASCADE'), nullable=False),
        sa.Column('modifier_option_id', sa.Integer(), sa.ForeignKey('menu_modifier_options.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('price_adjustment', sa.Numeric(10, 2), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'),
    )

    op.add_column('cart_line_items', sa.Column('bundle_product_id', sa.Integer(), sa.ForeignKey('bundle_products.id', ondelete='SET NULL'), nullable=True))
    op.add_column('cart_line_items', sa.Column('bundle_component_id', sa.Integer(), sa.ForeignKey('bundle_product_components.id', ondelete='SET NULL'), nullable=True))
    op.create_index('idx_cart_line_items_bundle_product_id', 'cart_line_items', ['bundle_product_id'])

    op.add_column('order_line_items', sa.Column('bundle_product_id', sa.Integer(), sa.ForeignKey('bundle_products.id', ondelete='SET NULL'), nullable=True))
    op.create_index('idx_order_line_items_bundle_product_id', 'order_line_items', ['bundle_product_id'])

    op.execute("""
        INSERT INTO menu_categories (category_name, slug, description, is_available, is_featured, display_order, created_at, updated_at)
        SELECT 'Combo', 'bundle_combo', 'Combo meal bundles', true, true, 0, NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE slug = 'bundle_combo')
    """)


def downgrade() -> None:
    op.execute("DELETE FROM menu_categories WHERE slug = 'bundle_combo'")
    op.drop_index('idx_order_line_items_bundle_product_id', table_name='order_line_items')
    op.drop_column('order_line_items', 'bundle_product_id')
    op.drop_index('idx_cart_line_items_bundle_product_id', table_name='cart_line_items')
    op.drop_column('cart_line_items', 'bundle_component_id')
    op.drop_column('cart_line_items', 'bundle_product_id')
    op.drop_table('bundle_component_modifiers')
    op.drop_table('bundle_product_components')
    op.drop_table('bundle_products')
