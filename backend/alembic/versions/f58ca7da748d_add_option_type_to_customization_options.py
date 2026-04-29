"""add_option_type_to_customization_options

Revision ID: f58ca7da748d
Revises: fb37140f30b8
Create Date: 2026-04-29 14:15:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f58ca7da748d'
down_revision: Union[str, None] = 'fb37140f30b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('customization_options', sa.Column('option_type', sa.String(50), nullable=False, server_default=''))


def downgrade() -> None:
    op.drop_column('customization_options', 'option_type')
