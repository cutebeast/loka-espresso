"""schema v11: rename min_order → min_spend on rewards and vouchers

Revision ID: rename_min_order_to_min_spend
Revises: reward_min_order_v1
Create Date: 2026-04-16

Changes:
- Rename column min_order → min_spend on:
  - rewards.min_order
  - vouchers.min_order
  - user_rewards.min_order

This aligns the catalog-level column name with the per-user
instance field name (user_vouchers.min_spend was already used there),
and adopts min_spend as the universal name for "minimum spend required
to use this voucher/reward".
"""
from alembic import op
import sqlalchemy as sa

revision = "rename_min_order_to_min_spend"
down_revision = "reward_min_order_v1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # rewards table
    op.alter_column("rewards", "min_order", new_column_name="min_spend")
    # vouchers table
    op.alter_column("vouchers", "min_order", new_column_name="min_spend")
    # user_rewards table
    op.alter_column("user_rewards", "min_order", new_column_name="min_spend")


def downgrade() -> None:
    # user_rewards
    op.alter_column("user_rewards", "min_spend", new_column_name="min_order")
    # vouchers
    op.alter_column("vouchers", "min_spend", new_column_name="min_order")
    # rewards
    op.alter_column("rewards", "min_spend", new_column_name="min_order")
