"""add_slug_to_information_cards

Revision ID: 04aa2eaf646d
Revises: 609e5d64bfa6
Create Date: 2026-04-23 13:08:09.311373

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '04aa2eaf646d'
down_revision: Union[str, None] = '609e5d64bfa6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('information_cards', sa.Column('slug', sa.String(255), nullable=True))
    op.create_index('ix_information_cards_slug', 'information_cards', ['slug'], unique=False)

    # Auto-populate slugs from titles for existing rows
    op.execute("""
        UPDATE information_cards
        SET slug = lower(regexp_replace(
            regexp_replace(title, '[^a-zA-Z0-9\\s]', '', 'g'),
            '\\s+', '-', 'g'
        ))
        WHERE slug IS NULL;
    """)


def downgrade() -> None:
    op.drop_index('ix_information_cards_slug', table_name='information_cards')
    op.drop_column('information_cards', 'slug')
