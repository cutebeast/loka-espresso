"""add_duration_ms_to_splash_screens

Revision ID: f7g8h9i0j1k2
Revises: 0e1f2g3h4i5j
Create Date: 2026-05-26 03:26:48.512198

"""
from alembic import op
import sqlalchemy as sa


revision = 'f7g8h9i0j1k2'
down_revision = '0e1f2g3h4i5j'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('splash_screens', sa.Column('duration_ms', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('splash_screens', 'duration_ms')
