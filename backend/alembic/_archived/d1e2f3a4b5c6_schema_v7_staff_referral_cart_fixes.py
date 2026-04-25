"""schema v7: staff unique constraint, referral timing guard

Revision ID: d1e2f3a4b5c6
Revises: c8d9e0f1a2b3
Create Date: 2026-04-13

Changes:
- Drop old unique constraint (store_id, email) on staff
- Add partial unique index (store_id, user_id) WHERE user_id IS NOT NULL
"""
from alembic import op

revision = "d1e2f3a4b5c6"
down_revision = "c8d9e0f1a2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop email-based unique constraint
    op.drop_constraint("uq_staff_store_email", "staff", type_="unique")

    # Add partial unique index on (store_id, user_id) for non-null user_ids
    # This prevents the same user from having duplicate staff records at the same store
    op.execute(
        "CREATE UNIQUE INDEX uq_staff_store_user "
        "ON staff (store_id, user_id) "
        "WHERE user_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_staff_store_user")
    op.create_unique_constraint("uq_staff_store_email", "staff", ["store_id", "email"])
