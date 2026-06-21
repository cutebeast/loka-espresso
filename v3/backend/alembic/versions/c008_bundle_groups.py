"""add_bundle_groups_multi_course

Revision ID: c008_bundle_groups
Revises: c007_hygiene_reports
Create Date: 2026-06-20 08:35:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'c008_bundle_groups'
down_revision = 'c007_hygiene_reports'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'bundle_groups',
        sa.Column('id', sa.BigInteger(), primary_key=True),
        sa.Column('bundle_product_id', sa.Integer(), sa.ForeignKey('bundle_products.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('group_label', sa.String(100), nullable=False),
        sa.Column('group_description', sa.Text(), nullable=True),
        sa.Column('pick_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('min_pick', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('max_pick', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.add_column('bundle_product_components', sa.Column('bundle_group_id', sa.BigInteger(), sa.ForeignKey('bundle_groups.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_bundle_product_components_bundle_group_id', 'bundle_product_components', ['bundle_group_id'])

    op.drop_column('bundle_product_components', 'is_required')
    op.drop_column('bundle_product_components', 'is_swappable')
    op.drop_column('bundle_product_components', 'swap_group')

    op.add_column('order_line_items', sa.Column('bundle_component_id', sa.Integer(), sa.ForeignKey('bundle_product_components.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_order_line_items_bundle_component_id', 'order_line_items', ['bundle_component_id'])

    op.execute(sa.text("""
        DO $$ BEGIN
            ALTER TABLE bundle_products DROP CONSTRAINT IF EXISTS ck_bundle_products_bundle_type;
        EXCEPTION WHEN undefined_object THEN NULL;
        END $$
    """))
    op.create_check_constraint(
        'ck_bundle_products_bundle_type',
        'bundle_products',
        "bundle_type IN ('combo','value_meal','family_meal','breakfast_set','promotional','pick_x','multi_course')"
    )
    op.create_check_constraint(
        'ck_bundle_groups_pick_count',
        'bundle_groups',
        'pick_count > 0'
    )
    op.create_check_constraint(
        'ck_bundle_groups_min_pick',
        'bundle_groups',
        'min_pick >= 0'
    )
    op.create_check_constraint(
        'ck_bundle_groups_max_pick',
        'bundle_groups',
        'max_pick >= min_pick'
    )


def downgrade() -> None:
    op.execute(sa.text("""
        DO $$ BEGIN
            ALTER TABLE bundle_products DROP CONSTRAINT IF EXISTS ck_bundle_products_bundle_type;
        EXCEPTION WHEN undefined_object THEN NULL;
        END $$
    """))
    op.create_check_constraint(
        'ck_bundle_products_bundle_type',
        'bundle_products',
        "bundle_type IN ('combo','value_meal','family_meal','breakfast_set','promotional','pick_x')"
    )
    op.add_column('bundle_product_components', sa.Column('is_required', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('bundle_product_components', sa.Column('is_swappable', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('bundle_product_components', sa.Column('swap_group', sa.Integer(), nullable=True))
    op.drop_index('ix_bundle_product_components_bundle_group_id', table_name='bundle_product_components')
    op.drop_column('bundle_product_components', 'bundle_group_id')
    op.drop_table('bundle_groups')
    op.drop_column('order_line_items', 'bundle_component_id')
