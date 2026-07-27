"""staff_task_recurring

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-27

Adds recur_interval_days to staff_tasks — NULL/0 = one-off task; N = the
task repeats every N days (1 = daily, 7 = weekly). Completing a recurring
task auto-creates the next occurrence (due_date + interval).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "staff_tasks",
        sa.Column("recur_interval_days", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_staff_tasks_recur_interval_days",
        "staff_tasks",
        "recur_interval_days IS NULL OR recur_interval_days >= 1",
    )


def downgrade() -> None:
    op.drop_constraint("ck_staff_tasks_recur_interval_days", "staff_tasks", type_="check")
    op.drop_column("staff_tasks", "recur_interval_days")
