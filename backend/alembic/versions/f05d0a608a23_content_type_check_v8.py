"""content_type_check_v8

Add CHECK constraint to information_cards.content_type to enforce
valid values at the database level.

Revision ID: f05d0a608a23
Revises: daa03ba00ba7
Create Date: 2026-04-25 15:30:00.000000
"""
from typing import Sequence, Union

from alembic import op

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from app import migration_utils as au

revision: str = 'f05d0a608a23'
down_revision: Union[str, None] = 'daa03ba00ba7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if not au.constraint_exists('information_cards', 'ck_info_card_content_type'):
        op.create_check_constraint(
            'ck_info_card_content_type',
            'information_cards',
            "content_type IN ('system', 'information', 'product', 'promotion')"
        )


def downgrade() -> None:
    if au.constraint_exists('information_cards', 'ck_info_card_content_type'):
        op.drop_constraint('ck_info_card_content_type', 'information_cards', type_='check')
