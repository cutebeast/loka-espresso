"""merge_inv_movements

Revision ID: 4f94031ff6af
Revises: customer_wallet_v5, inventory_movements_v1
Create Date: 2026-04-14 21:00:52.725165

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '4f94031ff6af'
down_revision: Union[str, None] = ('customer_wallet_v5', 'inventory_movements_v1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
