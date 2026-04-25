"""Add customization_hash to cart_items for customization-aware uniqueness.

Revision ID: apr2026_cart_identity_v4
Revises: apr2026_constraints_v3
Create Date: 2026-04-25 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'apr2026_cart_identity_v4'
down_revision: Union[str, None] = 'apr2026_constraints_v3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add customization_hash column
    op.add_column('cart_items', sa.Column('customization_hash', sa.String(length=64), nullable=True))
    op.create_index('ix_cart_items_customization_hash', 'cart_items', ['customization_hash'], unique=False)
    
    # Create unique constraint for cart line identity
    op.create_unique_constraint('uq_cart_item_identity', 'cart_items', ['user_id', 'store_id', 'item_id', 'customization_hash'])


def downgrade() -> None:
    op.drop_constraint('uq_cart_item_identity', 'cart_items', type_='unique')
    op.drop_index('ix_cart_items_customization_hash', table_name='cart_items')
    op.drop_column('cart_items', 'customization_hash')
