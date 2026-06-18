"""add_is_bundle_eligible_to_menu_items

Revision ID: c002_bundle_eligible
Revises: c001_bundle_products
Create Date: 2026-06-17 11:40:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'c002_bundle_eligible'
down_revision = 'c001_bundle_products'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('menu_items',
        sa.Column('is_bundle_eligible', sa.Boolean(), nullable=False, server_default='false')
    )


def downgrade() -> None:
    op.drop_column('menu_items', 'is_bundle_eligible')
