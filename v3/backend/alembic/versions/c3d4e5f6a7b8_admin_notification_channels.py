"""admin_notification_channels

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-25

Adds admin_notifications.channels (JSONB list of delivery channels:
in_app / push_notification / sms / whatsapp). Default ["in_app"] keeps
existing behavior for rows created before this column existed.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "admin_notifications",
        sa.Column("channels", JSONB, nullable=False, server_default=sa.text('\'["in_app"]\'::jsonb')),
    )


def downgrade() -> None:
    op.drop_column("admin_notifications", "channels")
