"""schema v8: cart customization_option_ids, pin_attempts table

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-04-13

Changes:
- Add customization_option_ids (JSON) to cart_items for normalized add-on tracking
- Create pin_attempts table for database-backed PIN rate limiting
"""
from alembic import op
import sqlalchemy as sa

revision = "e2f3a4b5c6d7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add customization_option_ids column to cart_items
    op.add_column(
        "cart_items",
        sa.Column("customization_option_ids", sa.JSON, nullable=True),
    )

    # Create pin_attempts table for database-backed rate limiting
    op.create_table(
        "pin_attempts",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("staff_id", sa.Integer, sa.ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("attempted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_pin_attempts_staff_window",
        "pin_attempts",
        ["staff_id", "attempted_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_pin_attempts_staff_window", table_name="pin_attempts")
    op.drop_table("pin_attempts")
    op.drop_column("cart_items", "customization_option_ids")
