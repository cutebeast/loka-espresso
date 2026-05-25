"""expand_audit_action_enum

Revision ID: a1b2c3d4e5f6
Revises: f3d2b1a4c5e6
Create Date: 2026-05-25 03:40:00.000000
"""
from typing import Sequence, Union
from alembic import op


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'apply_voucher'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'apply_reward'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'wallet_payment'")


def downgrade() -> None:
    pass
