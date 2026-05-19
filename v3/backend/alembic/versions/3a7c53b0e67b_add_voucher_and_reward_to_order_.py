"""Add voucher and reward to order adjustment types.

Revision ID: 3a7c53b0e67b
Revises: e636778a8401
Create Date: 2026-05-19 10:20:00
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "3a7c53b0e67b"
down_revision = "e636778a8401"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE order_adjustments
        DROP CONSTRAINT IF EXISTS order_adjustments_adjustment_type_check
    """)
    op.execute("""
        ALTER TABLE order_adjustments
        ADD CONSTRAINT order_adjustments_adjustment_type_check
        CHECK (adjustment_type IN ('refund','add_item','remove_item','tip_addition','discount_override','voucher','reward'))
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE order_adjustments
        DROP CONSTRAINT IF EXISTS order_adjustments_adjustment_type_check
    """)
    op.execute("""
        ALTER TABLE order_adjustments
        ADD CONSTRAINT order_adjustments_adjustment_type_check
        CHECK (adjustment_type IN ('refund','add_item','remove_item','tip_addition','discount_override'))
    """)
