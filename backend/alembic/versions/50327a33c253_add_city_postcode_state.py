"""add city postcode state to customer_addresses

Revision ID: 50327a33c253
Revises: 1d7ce9c8cb6c
Create Date: 2026-05-02 03:17:56.030717
"""
from alembic import op
import sqlalchemy as sa

revision = '50327a33c253'
down_revision = '1d7ce9c8cb6c'

def upgrade():
    op.add_column('customer_addresses', sa.Column('city', sa.String(100), nullable=True))
    op.add_column('customer_addresses', sa.Column('postcode', sa.String(10), nullable=True))
    op.add_column('customer_addresses', sa.Column('state', sa.String(50), nullable=True))

def downgrade():
    op.drop_column('customer_addresses', 'state')
    op.drop_column('customer_addresses', 'postcode')
    op.drop_column('customer_addresses', 'city')
