"""add customer stripe_customer_id

Revision ID: 2ee659bc4ae3
Revises: b2cecd6ceb55
Create Date: 2026-07-02 18:00:27.643514

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2ee659bc4ae3'
down_revision = 'b2cecd6ceb55'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'customers',
        sa.Column('stripe_customer_id', sa.String(255), nullable=True, unique=True)
    )
    op.create_index(
        'ix_customers_stripe_customer_id',
        'customers',
        ['stripe_customer_id'],
        unique=True
    )


def downgrade() -> None:
    op.drop_index('ix_customers_stripe_customer_id', table_name='customers')
    op.drop_column('customers', 'stripe_customer_id')
