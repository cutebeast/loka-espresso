"""add order idempotency key

Revision ID: d6077079b249
Revises: 068bb0ec1c1a
Create Date: 2026-06-21 14:20:17.617181

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd6077079b249'
down_revision = '068bb0ec1c1a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('idempotency_key', sa.String(length=255), nullable=True))
    op.create_index('ix_orders_idempotency_key', 'orders', ['idempotency_key'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_orders_idempotency_key', table_name='orders')
    op.drop_column('orders', 'idempotency_key')
