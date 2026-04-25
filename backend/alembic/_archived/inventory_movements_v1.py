"""inventory movements + hq_personnel role + inventory improvements

Revision ID: inventory_movements_v1
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM

revision = "inventory_movements_v1"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add hq_personnel to user_role enum
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'hq_personnel'")

    # 2. Create movement_type enum
    op.execute("CREATE TYPE movement_type AS ENUM ('received', 'waste', 'transfer_out', 'transfer_in', 'cycle_count', 'adjustment')")

    # 3. Create inventory_movements table
    op.create_table(
        "inventory_movements",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("store_id", sa.Integer, sa.ForeignKey("stores.id"), nullable=False, index=True),
        sa.Column("inventory_item_id", sa.Integer, sa.ForeignKey("inventory_items.id"), nullable=False, index=True),
        sa.Column("movement_type", ENUM("received", "waste", "transfer_out", "transfer_in", "cycle_count", "adjustment", name="movement_type", create_type=False), nullable=False),
        sa.Column("quantity", sa.DECIMAL(10, 2), nullable=False),
        sa.Column("balance_after", sa.DECIMAL(10, 2), nullable=False),
        sa.Column("note", sa.Text, nullable=False),
        sa.Column("attachment_path", sa.String(500), nullable=True),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_inv_movements_store_item", "inventory_movements", ["store_id", "inventory_item_id"])

    # 4. Add columns to inventory_items
    op.add_column("inventory_items", sa.Column("is_active", sa.Boolean, server_default="true", nullable=False))
    op.add_column("inventory_items", sa.Column("category", sa.String(100), nullable=True))

    # 5. Drop cost_per_unit
    op.drop_column("inventory_items", "cost_per_unit")


def downgrade():
    op.add_column("inventory_items", sa.Column("cost_per_unit", sa.DECIMAL(10, 2), nullable=True))
    op.drop_column("inventory_items", "category")
    op.drop_column("inventory_items", "is_active")
    op.drop_index("ix_inv_movements_store_item")
    op.drop_table("inventory_movements")
    op.execute("DROP TYPE movement_type")
