"""Add action fields to information_cards for promotion popup CTA support.

Revision ID: apr2026_content_actions_v5
Revises: apr2026_cart_identity_v4
Create Date: 2026-04-25 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'apr2026_content_actions_v5'
down_revision: Union[str, None] = 'apr2026_cart_identity_v4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('information_cards', sa.Column('action_url', sa.String(length=500), nullable=True))
    op.add_column('information_cards', sa.Column('action_type', sa.String(length=20), nullable=True))
    op.add_column('information_cards', sa.Column('action_label', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('information_cards', 'action_label')
    op.drop_column('information_cards', 'action_type')
    op.drop_column('information_cards', 'action_url')
