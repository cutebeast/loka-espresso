"""add_image_urls_to_maintenance_logs

Revision ID: 18e8ade63ebb
Revises: a1b2c3d4e5f6
Create Date: 2026-05-25 05:29:03.593233
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '18e8ade63ebb'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('equipment_maintenance_logs', sa.Column('image_urls', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('equipment_maintenance_logs', 'image_urls')
