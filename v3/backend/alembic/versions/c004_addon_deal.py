"""rename_bundle_promo_fields_to_addon_deal

Revision ID: c004_addon_deal
Revises: c003_bundle_promo
Create Date: 2026-06-18 07:30:00.000000

"""
from alembic import op

revision = 'c004_addon_deal'
down_revision = 'c003_bundle_promo'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('menu_items', 'is_bundle_promo_eligible', new_column_name='is_addon_deal_eligible')
    op.alter_column('menu_items', 'bundle_promo_discount_type', new_column_name='addon_discount_type')
    op.alter_column('menu_items', 'bundle_promo_discount_value', new_column_name='addon_discount_value')
    op.alter_column('menu_items', 'bundle_promo_product_ids', new_column_name='eligible_bundle_ids')


def downgrade() -> None:
    op.alter_column('menu_items', 'is_addon_deal_eligible', new_column_name='is_bundle_promo_eligible')
    op.alter_column('menu_items', 'addon_discount_type', new_column_name='bundle_promo_discount_type')
    op.alter_column('menu_items', 'addon_discount_value', new_column_name='bundle_promo_discount_value')
    op.alter_column('menu_items', 'eligible_bundle_ids', new_column_name='bundle_promo_product_ids')
