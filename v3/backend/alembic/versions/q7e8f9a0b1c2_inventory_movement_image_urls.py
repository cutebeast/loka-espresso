"""image_urls on inventory_movement_log — photo evidence for waste/adjustment reports

Revision ID: q7e8f9a0b1c2
Revises: p6d7e8f9a0b1
Create Date: 2026-08-07
"""
from alembic import op

revision = "q7e8f9a0b1c2"
down_revision = "p6d7e8f9a0b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE inventory_movement_log ADD COLUMN IF NOT EXISTS image_urls JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE inventory_movement_log DROP COLUMN IF EXISTS image_urls")
