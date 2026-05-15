"""add_feedback_entries

Revision ID: f3d2b1a4c5e6
Revises: 1e9a963c2ce2
Create Date: 2026-05-10 22:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "f3d2b1a4c5e6"
down_revision: Union[str, None] = "1e9a963c2ce2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "feedback_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("store_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("rating", sa.SmallInteger(), nullable=False, server_default="5"),
        sa.Column("admin_reply", sa.Text(), nullable=True),
        sa.Column("replied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replied_by", sa.Integer(), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["replied_by"], ["admin_accounts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_feedback_rating"),
    )
    op.create_index("ix_feedback_entries_customer_id", "feedback_entries", ["customer_id"])
    op.create_index("ix_feedback_entries_store_id", "feedback_entries", ["store_id"])


def downgrade() -> None:
    op.drop_table("feedback_entries")
