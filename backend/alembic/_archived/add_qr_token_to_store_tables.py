"""Add qr_token column to store_tables for secure QR codes

Revision ID: add_qr_token_to_store_tables
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'add_qr_token_to_store_tables'
down_revision = 'f2a1c3b4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('store_tables', sa.Column('qr_token', sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column('store_tables', 'qr_token')
