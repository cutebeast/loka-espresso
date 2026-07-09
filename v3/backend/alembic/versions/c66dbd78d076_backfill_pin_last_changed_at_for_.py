"""backfill pin_last_changed_at for existing staff

Revision ID: c66dbd78d076
Revises: b484c48f7e63
Create Date: 2026-07-09 05:29:40.006339

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c66dbd78d076'
down_revision = 'b484c48f7e63'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Grandfather existing staff: set pin_last_changed_at to now() so they are NOT
    # locked out by the new hard PIN-enforcement. New staff (created after this
    # migration) have pin_last_changed_at = NULL and will be forced to reset.
    op.execute(
        "UPDATE staff_profiles "
        "SET pin_last_changed_at = now() "
        "WHERE deleted_at IS NULL AND pin_last_changed_at IS NULL"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE staff_profiles SET pin_last_changed_at = NULL "
        "WHERE deleted_at IS NULL"
    )
