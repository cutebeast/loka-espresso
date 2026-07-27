"""payment_line_allocations (split bill)

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-27

Item-level split-bill support: each payment can carry allocations saying
which order line items (and how much of each) it pays for. This enables
split-by-item without splitting the order itself — the kitchen sees one
order while N payers settle their own shares.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'g7b8c9d0e1f2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_line_allocations",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "payment_id",
            sa.BigInteger(),
            sa.ForeignKey("payments.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "order_line_item_id",
            sa.BigInteger(),
            sa.ForeignKey("order_line_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Numeric(10, 3), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("payment_id", "order_line_item_id", name="uq_payment_line_allocations_payment_line"),
    )


def downgrade() -> None:
    op.drop_table("payment_line_allocations")
