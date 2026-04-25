"""schema v9: add voucher/reward/loyalty discount columns to orders

Revision ID: b4c5d6e7f8a9
Revises: acl_v1
Create Date: 2026-04-16

Changes:
- Add voucher_discount (DECIMAL 10,2, default 0) — applied first
- Add reward_discount (DECIMAL 10,2, default 0) — applied second
- Add loyalty_discount (DECIMAL 10,2, default 0) — applied last (tier-based)
- Add voucher_code (VARCHAR) — tracks which voucher instance was used
- Add reward_redemption_code (VARCHAR) — tracks which reward was used

Discount order at completion:
  subtotal + delivery_fee
    → minus voucher_discount  (1st)
    → minus reward_discount   (2nd)
    → minus loyalty_discount  (3rd, based on customer tier)
  = final total (rounded)

Loyalty tier discount rates (example):
  - Bronze: 0%
  - Silver: 5%
  - Gold: 10%
  - Platinum: 15%
"""
from alembic import op
import sqlalchemy as sa

revision = "b4c5d6e7f8a9"
down_revision = "acl_v1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("voucher_discount", sa.DECIMAL(10, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "orders",
        sa.Column("reward_discount", sa.DECIMAL(10, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "orders",
        sa.Column("loyalty_discount", sa.DECIMAL(10, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "orders",
        sa.Column("voucher_code", sa.String(100), nullable=True),
    )
    op.add_column(
        "orders",
        sa.Column("reward_redemption_code", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("orders", "reward_redemption_code")
    op.drop_column("orders", "voucher_code")
    op.drop_column("orders", "loyalty_discount")
    op.drop_column("orders", "reward_discount")
    op.drop_column("orders", "voucher_discount")