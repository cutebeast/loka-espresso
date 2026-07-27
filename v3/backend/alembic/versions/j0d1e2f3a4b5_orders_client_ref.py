"""orders.client_ref (POS offline mode)

Revision ID: j0d1e2f3a4b5
Revises: i9c0d1e2f3a4
Create Date: 2026-07-27

POS offline queue support: the staff portal generates a client_ref (UUID)
for every order it creates while offline. The partial unique index on
(store_id, client_ref) makes order creation replay-safe — a retried sync
returns the existing order instead of duplicating the sale.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'j0d1e2f3a4b5'
down_revision = 'i9c0d1e2f3a4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("client_ref", sa.String(length=64), nullable=True))
    op.create_index(
        "uq_orders_store_client_ref",
        "orders",
        ["store_id", "client_ref"],
        unique=True,
        postgresql_where=sa.text("client_ref IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_orders_store_client_ref",
        table_name="orders",
        postgresql_where=sa.text("client_ref IS NOT NULL"),
    )
    op.drop_column("orders", "client_ref")
