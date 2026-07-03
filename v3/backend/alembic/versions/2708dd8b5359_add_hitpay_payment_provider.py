"""add hitpay payment provider

Revision ID: 2708dd8b5359
Revises: 2ee659bc4ae3
Create Date: 2026-07-02 18:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2708dd8b5359'
down_revision = '2ee659bc4ae3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'hitpay' to the PostgreSQL enum if it is not already present.
    op.execute("ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'hitpay'")


def downgrade() -> None:
    # Enum values cannot be removed in PostgreSQL without recreating the type.
    # A full recreation is omitted here because it cascades to dependent columns.
    pass
