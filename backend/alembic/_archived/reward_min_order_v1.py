"""schema v10: add min_order to rewards

Revision ID: reward_min_order_v1
Revises: b4c5d6e7f8a9
Create Date: 2026-04-16

Changes:
- Add min_order (DECIMAL 10,2, default 0) to rewards table
  Minimum cart total required to redeem this reward.
  0 = no minimum spend required.
- Add min_order (DECIMAL 10,2, nullable) to user_rewards table
  Snapshot of the min_order at time of reward grant.
"""
from alembic import op
import sqlalchemy as sa

revision = "reward_min_order_v1"
down_revision = "b4c5d6e7f8a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "rewards",
        sa.Column("min_order", sa.DECIMAL(10, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "user_rewards",
        sa.Column("min_order", sa.DECIMAL(10, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_rewards", "min_order")
    op.drop_column("rewards", "min_order")
