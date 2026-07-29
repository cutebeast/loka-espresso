"""make_feedback_rating_nullable

Revision ID: 60077da51931
Revises: j0d1e2f3a4b5
Create Date: 2026-07-28 12:56:02.005843

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '60077da51931'
down_revision = 'j0d1e2f3a4b5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_feedback_rating", "feedback_entries", type_="check")
    op.alter_column("feedback_entries", "rating", existing_type=sa.SmallInteger(), nullable=True)
    op.create_check_constraint("ck_feedback_rating", "feedback_entries", "rating IS NULL OR (rating BETWEEN 1 AND 5)")


def downgrade() -> None:
    op.execute("UPDATE feedback_entries SET rating = 5 WHERE rating IS NULL")
    op.drop_constraint("ck_feedback_rating", "feedback_entries", type_="check")
    op.alter_column("feedback_entries", "rating", existing_type=sa.SmallInteger(), nullable=False)
    op.create_check_constraint("ck_feedback_rating", "feedback_entries", "rating BETWEEN 1 AND 5")
