"""Merge multiple heads

Revision ID: d25bbe3d82ca
Revises: add_information_cards, add_performance_indexes_v1
Create Date: 2026-04-20 14:52:24.599735

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd25bbe3d82ca'
down_revision: Union[str, None] = ('add_information_cards', 'add_performance_indexes_v1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
