"""Add paid and out_for_delivery to orderstatus enum

Revision ID: add_paid_out_for_delivery
Revises: latest
Create Date: 2026-04-17

WARNING: PostgreSQL ALTER TYPE ... ADD VALUE cannot run inside a transaction.
This migration uses op.execute() with raw SQL and relies on render_as_batch=False
for PostgreSQL compatibility.
"""
from alembic import op
import sqlalchemy as sa

revision = 'add_paid_out_for_delivery'
down_revision = 'add_tier_sort_order'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'paid'")
    op.execute("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'out_for_delivery'")


def downgrade():
    pass