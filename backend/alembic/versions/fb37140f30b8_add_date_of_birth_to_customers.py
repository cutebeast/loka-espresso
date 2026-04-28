"""add_date_of_birth_to_customers

Revision ID: fb37140f30b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-28 18:42:23.716239

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'fb37140f30b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('customers', sa.Column('date_of_birth', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('customers', 'date_of_birth')
