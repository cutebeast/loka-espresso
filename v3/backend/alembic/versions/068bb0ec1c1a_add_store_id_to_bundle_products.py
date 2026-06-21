"""add store_id to bundle products

Revision ID: 068bb0ec1c1a
Revises: c010_audit_principal_index
Create Date: 2026-06-21 14:17:58.020633

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '068bb0ec1c1a'
down_revision = 'c010_audit_principal_index'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('bundle_products', sa.Column('store_id', sa.Integer(), nullable=True))
    op.create_index('ix_bundle_products_store_id', 'bundle_products', ['store_id'])
    op.create_foreign_key(
        'fk_bundle_products_store_id',
        'bundle_products',
        'stores',
        ['store_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_bundle_products_store_id', 'bundle_products', type_='foreignkey')
    op.drop_index('ix_bundle_products_store_id', table_name='bundle_products')
    op.drop_column('bundle_products', 'store_id')
