"""add_bundle_promo_fields_to_menu_items

Revision ID: c003_bundle_promo
Revises: c002_bundle_eligible
Create Date: 2026-06-17 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'c003_bundle_promo'
down_revision = 'c002_bundle_eligible'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('menu_items',
        sa.Column('is_bundle_promo_eligible', sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column('menu_items',
        sa.Column('bundle_promo_discount_type', sa.String(20), nullable=True)
    )
    op.add_column('menu_items',
        sa.Column('bundle_promo_discount_value', sa.Numeric(10, 4), nullable=True)
    )
    op.add_column('menu_items',
        sa.Column('bundle_promo_product_ids', postgresql.JSONB(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('menu_items', 'bundle_promo_product_ids')
    op.drop_column('menu_items', 'bundle_promo_discount_value')
    op.drop_column('menu_items', 'bundle_promo_discount_type')
    op.drop_column('menu_items', 'is_bundle_promo_eligible')
