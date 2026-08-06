"""allow negative inventory stock — sales/waste never blocked by stock level

Business decision 2026-08-07: the counter never refuses a sale because stock
wasn't keyed; stock may go negative and ops reconcile from movement logs.

Revision ID: s9a0b1c2d3e4
Revises: r8f9a0b1c2d3
Create Date: 2026-08-07
"""
from alembic import op

revision = "s9a0b1c2d3e4"
down_revision = "r8f9a0b1c2d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF EXISTS: the baseline migration never actually created this CHECK in
    # the live DB (model/DB drift); drop it wherever it does exist.
    op.execute("ALTER TABLE inventory_stock DROP CONSTRAINT IF EXISTS ck_inventory_stock_current_stock")


def downgrade() -> None:
    op.execute("UPDATE inventory_stock SET current_stock = 0 WHERE current_stock < 0")
    op.create_check_constraint(
        "ck_inventory_stock_current_stock", "inventory_stock", "current_stock >= 0"
    )
