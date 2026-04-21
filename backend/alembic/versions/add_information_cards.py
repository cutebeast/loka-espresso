"""Add information_cards table for PWA announcements

Creates the information_cards table following the same pattern as promo_banners
for general content/announcements on the PWA home screen.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "add_information_cards"
down_revision = "4f94031ff6af"  # Latest migration - merge point
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "information_cards",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("short_description", sa.String(500), nullable=True),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("action_type", sa.String(20), nullable=True, default="detail"),
        sa.Column("action_url", sa.String(500), nullable=True),
        sa.Column("long_description", sa.Text, nullable=True),
        sa.Column("image_url", sa.String(500), nullable=True),
        sa.Column("store_id", sa.Integer, sa.ForeignKey("stores.id"), nullable=True),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean, default=True, nullable=False),
        sa.Column("position", sa.Integer, default=0),
        sa.Column("created_at", sa.DateTime(timezone=True), default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade():
    op.drop_table("information_cards")
