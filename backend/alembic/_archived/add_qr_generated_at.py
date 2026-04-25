"""Add qr_generated_at column to store_tables

Revision ID: add_qr_generated_at
"""
from alembic import op
import sqlalchemy as sa

revision = 'add_qr_generated_at'
down_revision = 'add_qr_token_to_store_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('store_tables', sa.Column('qr_generated_at', sa.DateTime(timezone=True), nullable=True))
    # Backfill: set qr_generated_at for tables that already have a qr_token
    op.execute("""
        UPDATE store_tables
        SET qr_generated_at = NOW()
        WHERE qr_token IS NOT NULL AND qr_generated_at IS NULL
    """)


def downgrade() -> None:
    op.drop_column('store_tables', 'qr_generated_at')
