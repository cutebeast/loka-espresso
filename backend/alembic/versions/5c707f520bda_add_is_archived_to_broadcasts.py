"""add_is_archived_to_broadcasts

Revision ID: 5c707f520bda
Revises: e2f3a4b5c6d7
Create Date: 2026-04-14 07:22:49.981824

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5c707f520bda'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('notification_broadcasts', sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('notification_broadcasts', 'is_archived')
