"""add_assistant_manager_to_staffrole_enum

Revision ID: 6546b42e617a
Revises: a1b2c3d4e5f6
Create Date: 2026-04-13 15:02:03.180170

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '6546b42e617a'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add 'assistant_manager' to the staffrole enum
    # Must be placed AFTER 'manager' and BEFORE 'barista' in PostgreSQL enum order
    op.execute("ALTER TYPE staffrole ADD VALUE IF NOT EXISTS 'assistant_manager' BEFORE 'barista'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values directly.
    # To revert, you would need to recreate the enum type — typically not done in production.
    # Leaving downgrade as a no-op is safe since 'assistant_manager' simply won't be used.
    pass
