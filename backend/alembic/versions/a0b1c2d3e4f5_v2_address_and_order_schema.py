"""Phase 1 UI/UX v2: address + order schema updates (combined)

Combines:
- 1d7ce9c8cb6c: add apartment, delivery_instructions to customer_addresses
- 50327a33c253: add city, postcode, state to customer_addresses
- d4e5f6a7b8c9: add building to customer_addresses
- 9637531ea6dd: add recipient_name, recipient_phone to orders

Revision ID: a0b1c2d3e4f5
Revises: f58ca7da748d
Create Date: 2026-05-02 13:25:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'a0b1c2d3e4f5'
down_revision = 'f58ca7da748d'

def upgrade():
    # customer_addresses — new columns
    op.add_column('customer_addresses', sa.Column('apartment', sa.String(100), nullable=True))
    op.add_column('customer_addresses', sa.Column('delivery_instructions', sa.String(300), nullable=True))
    op.add_column('customer_addresses', sa.Column('city', sa.String(100), nullable=True))
    op.add_column('customer_addresses', sa.Column('postcode', sa.String(10), nullable=True))
    op.add_column('customer_addresses', sa.Column('state', sa.String(50), nullable=True))
    op.add_column('customer_addresses', sa.Column('building', sa.String(100), nullable=True))

    # orders — delivery contact fields
    op.add_column('orders', sa.Column('recipient_name', sa.String(255), nullable=True))
    op.add_column('orders', sa.Column('recipient_phone', sa.String(20), nullable=True))

def downgrade():
    op.drop_column('orders', 'recipient_phone')
    op.drop_column('orders', 'recipient_name')
    op.drop_column('customer_addresses', 'building')
    op.drop_column('customer_addresses', 'state')
    op.drop_column('customer_addresses', 'postcode')
    op.drop_column('customer_addresses', 'city')
    op.drop_column('customer_addresses', 'delivery_instructions')
    op.drop_column('customer_addresses', 'apartment')
