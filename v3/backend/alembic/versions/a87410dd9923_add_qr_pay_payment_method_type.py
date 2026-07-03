"""add qr_pay payment method type

Revision ID: a87410dd9923
Revises: eb53e26f1fe7
Create Date: 2026-07-01 14:24:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a87410dd9923'
down_revision = 'eb53e26f1fe7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add qr_pay value to the payment_method_type enum."""
    op.execute("ALTER TYPE payment_method_type ADD VALUE IF NOT EXISTS 'qr_pay'")


def downgrade() -> None:
    """Removing an enum value is not supported in PostgreSQL; leave as-is."""
    pass
