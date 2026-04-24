"""add_gallery_urls_to_information_cards

Revision ID: 41c93302d76f
Revises: 04aa2eaf646d
Create Date: 2026-04-23 13:08:09.311373

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '41c93302d76f'
down_revision: Union[str, None] = '04aa2eaf646d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'information_cards',
        sa.Column('gallery_urls', postgresql.JSONB(astext_type=sa.Text()), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('information_cards', 'gallery_urls')
