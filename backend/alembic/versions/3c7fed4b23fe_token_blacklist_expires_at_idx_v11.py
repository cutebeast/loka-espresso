"""token_blacklist_expires_at_idx_v11

Revision ID: 3c7fed4b23fe
Revises: 0228b38b10ff
Create Date: 2026-04-25 21:56:07.325627

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import app.migration_utils as au


revision: str = '3c7fed4b23fe'
down_revision: Union[str, None] = '0228b38b10ff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if not au.index_exists('token_blacklist', 'ix_token_blacklist_expires_at'):
        op.create_index('ix_token_blacklist_expires_at', 'token_blacklist', ['expires_at'])


def downgrade() -> None:
    if au.index_exists('token_blacklist', 'ix_token_blacklist_expires_at'):
        op.drop_index('ix_token_blacklist_expires_at', table_name='token_blacklist')
