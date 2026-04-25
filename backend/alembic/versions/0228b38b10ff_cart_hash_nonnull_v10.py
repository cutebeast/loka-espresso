"""cart_hash_nonnull_v10

Make cart_items.customization_hash non-nullable with a deterministic
empty hash default. Prevents duplicate cart rows when no customizations
are selected.

Revision ID: 0228b38b10ff
Revises: fdf6d1ad53e3
Create Date: 2026-04-25 19:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import app.migration_utils as au

revision: str = '0228b38b10ff'
down_revision: Union[str, None] = 'fdf6d1ad53e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def upgrade() -> None:
    # Populate any remaining NULL hashes
    op.execute(text(f"UPDATE cart_items SET customization_hash = '{EMPTY_HASH}' WHERE customization_hash IS NULL"))

    # Alter column to non-nullable
    op.alter_column('cart_items', 'customization_hash',
                    existing_type=sa.VARCHAR(length=64),
                    nullable=False,
                    server_default=EMPTY_HASH)


def downgrade() -> None:
    op.alter_column('cart_items', 'customization_hash',
                    existing_type=sa.VARCHAR(length=64),
                    nullable=True,
                    server_default=None)
