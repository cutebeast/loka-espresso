"""schema v6 — token_blacklist, device_tokens.is_active

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-04-13 19:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c8d9e0f1a2b3'
down_revision: Union[str, None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Token blacklist for proper JWT logout
    op.create_table(
        'token_blacklist',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('jti', sa.String(255), nullable=False, unique=True, index=True),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Add is_active to device_tokens for dead token cleanup
    op.add_column('device_tokens', sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'))


def downgrade() -> None:
    op.drop_column('device_tokens', 'is_active')
    op.drop_table('token_blacklist')
