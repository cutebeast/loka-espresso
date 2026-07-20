"""add store display_key

Revision ID: f33d496b3c87
Revises: eb7cc845410d
Create Date: 2026-07-20 14:27:39.678803

Adds stores.display_key — a per-store shared secret authorising the public
POS customer-display poll (GET /staff/pos/display-state). Existing stores get
a random 32-char hex key.

NOTE: autogenerate also detected drift on feedback_entries.customer_id
(model says NOT NULL, DB is nullable). That drift is pre-existing and
intentional (guest feedback) — it is deliberately excluded here.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f33d496b3c87'
down_revision = 'eb7cc845410d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('stores', sa.Column('display_key', sa.String(length=64), nullable=True))
    # Backfill existing stores with a random hex key (32 chars)
    op.execute("UPDATE stores SET display_key = md5(random()::text || id::text) WHERE display_key IS NULL")
    op.alter_column('stores', 'display_key', nullable=False)


def downgrade() -> None:
    op.drop_column('stores', 'display_key')
