"""add recipient_name recipient_phone to orders

Revision ID: 9637531ea6dd
Revises: 50327a33c253
Create Date: 2026-05-02 12:45:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '9637531ea6dd'
down_revision = 'd4e5f6a7b8c9'

def upgrade():
    op.add_column('orders', sa.Column('recipient_name', sa.String(255), nullable=True))
    op.add_column('orders', sa.Column('recipient_phone', sa.String(20), nullable=True))

def downgrade():
    op.drop_column('orders', 'recipient_phone')
    op.drop_column('orders', 'recipient_name')
