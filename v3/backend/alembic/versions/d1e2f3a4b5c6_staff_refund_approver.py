"""Staff refund approval — staff can process refunds at the counter.

Refund.approved_by is FK'd to admin_accounts only, so staff could never be a
refund approver. Adds approved_by_staff_id (FK staff_profiles) — exactly one
approver field is set per refund.

Revision ID: d1e2f3a4b5c6
Revises: b9c0d1e2f3a4
Create Date: 2026-08-22
"""
import sqlalchemy as sa
from alembic import op

revision = "d1e2f3a4b5c6"
down_revision = "b9c0d1e2f3a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("refunds", sa.Column("approved_by_staff_id", sa.BigInteger(), nullable=True))
    op.execute("""
        ALTER TABLE refunds ADD CONSTRAINT fk_refunds_approved_by_staff
        FOREIGN KEY (approved_by_staff_id) REFERENCES staff_profiles(id) ON DELETE SET NULL;
    """)
    op.create_index("ix_refunds_approved_by_staff_id", "refunds", ["approved_by_staff_id"])


def downgrade() -> None:
    op.drop_index("ix_refunds_approved_by_staff_id", table_name="refunds")
    op.execute("ALTER TABLE refunds DROP CONSTRAINT IF EXISTS fk_refunds_approved_by_staff;")
    op.drop_column("refunds", "approved_by_staff_id")
