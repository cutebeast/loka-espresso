"""add web_push_subscription to customer_devices

Revision ID: cffceac8e947
Revises: e72c53010130
Create Date: 2026-07-04 17:19:41.878883

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'cffceac8e947'
down_revision = 'e72c53010130'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('customer_devices', sa.Column('web_push_subscription', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('customer_devices', 'web_push_subscription')
