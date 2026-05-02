"""add building to customer_addresses

Revision ID: d4e5f6a7b8c9
Revises: 50327a33c253
Create Date: 2026-05-02 03:26:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = '50327a33c253'

def upgrade():
    op.add_column('customer_addresses', sa.Column('building', sa.String(100), nullable=True))

def downgrade():
    op.drop_column('customer_addresses', 'building')
