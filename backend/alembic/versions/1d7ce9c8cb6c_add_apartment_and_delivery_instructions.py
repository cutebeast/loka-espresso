"""add apartment and delivery_instructions to customer_addresses

Revision ID: 1d7ce9c8cb6c
Revises: f58ca7da748d
Create Date: 2026-05-01 20:02:50.088652

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '1d7ce9c8cb6c'
down_revision: Union[str, None] = 'f58ca7da748d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('customer_addresses', sa.Column('apartment', sa.String(100), nullable=True))
    op.add_column('customer_addresses', sa.Column('delivery_instructions', sa.String(300), nullable=True))


def downgrade() -> None:
    op.drop_column('customer_addresses', 'delivery_instructions')
    op.drop_column('customer_addresses', 'apartment')
