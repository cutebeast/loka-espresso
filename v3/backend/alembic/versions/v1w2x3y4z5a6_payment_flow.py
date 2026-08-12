"""payment_flow on orders — separate prepaid vs pay-after-meal flows

Revision ID: v1w2x3y4z5a6
"""
from alembic import op
import sqlalchemy as sa

revision = "v1w2x3y4z5a6"
down_revision = "u1c2d3e4f5a6"  # previous head
branch_labels = None
depends_on = None


def upgrade() -> None:
    payment_flow_enum = sa.Enum("prepaid", "pay_after_meal", name="payment_flow")
    payment_flow_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "orders",
        sa.Column(
            "payment_flow",
            sa.Enum("prepaid", "pay_after_meal", name="payment_flow"),
            nullable=False,
            server_default="prepaid",
        ),
    )

    # Backfill: dine-in orders from non-kiosk channels are open tabs (pay after meal)
    op.execute("""
        UPDATE orders SET payment_flow = 'pay_after_meal'
        WHERE order_type = 'dine_in'
        AND order_channel != 'kiosk'
        AND status NOT IN ('cancelled_by_customer', 'cancelled_by_merchant', 'refunded')
    """)

    op.create_index(
        "ix_orders_payment_flow_status",
        "orders",
        ["payment_flow", "status", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_orders_payment_flow_status", table_name="orders")
    op.drop_column("orders", "payment_flow")
    sa.Enum(name="payment_flow").drop(op.get_bind(), checkfirst=True)
