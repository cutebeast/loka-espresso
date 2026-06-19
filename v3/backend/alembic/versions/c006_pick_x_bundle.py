"""pick_x_bundle_type

Revision ID: c006_pick_x_bundle
Revises: c005_order_addon_discount
Create Date: 2026-06-18 08:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'c006_pick_x_bundle'
down_revision = 'c005_order_addon_discount'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('bundle_products',
        sa.Column('pick_count', sa.Integer(), nullable=True)
    )
    op.add_column('bundle_products',
        sa.Column('allow_duplicates', sa.Boolean(), nullable=False, server_default='false')
    )


def downgrade() -> None:
    op.drop_column('bundle_products', 'allow_duplicates')
    op.drop_column('bundle_products', 'pick_count')
