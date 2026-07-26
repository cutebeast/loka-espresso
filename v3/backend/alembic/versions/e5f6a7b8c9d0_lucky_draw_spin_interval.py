"""lucky_draw_spin_interval

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-26

Adds spin_interval_days to lucky_draw_campaigns — the free_daily type
grants `spins_per_day` free spins per rolling interval of N days
(1 = daily, 7 = weekly, 30 = monthly). Default 1 keeps current behavior.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lucky_draw_campaigns",
        sa.Column("spin_interval_days", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_check_constraint(
        "ck_lucky_draw_campaigns_spin_interval_days",
        "lucky_draw_campaigns",
        "spin_interval_days >= 1",
    )


def downgrade() -> None:
    op.drop_constraint("ck_lucky_draw_campaigns_spin_interval_days", "lucky_draw_campaigns", type_="check")
    op.drop_column("lucky_draw_campaigns", "spin_interval_days")
