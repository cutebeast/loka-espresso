"""Fix marketing entity fields for PWA listing/detail pattern

- Rename promo_banners.subtitle → short_description
- Add long_description to rewards, vouchers, promo_banners
- Drop dead target_url from promo_banners
- Update action_type default from 'detail_image' to 'detail'
"""
from alembic import op
import sqlalchemy as sa

revision = "marketing_pwa_v3"
down_revision = "marketing_terms_v2"
branch_labels = None
depends_on = None


def upgrade():
    # --- promo_banners ---
    # Rename subtitle → short_description
    op.alter_column("promo_banners", "subtitle", new_column_name="short_description")
    # Add long_description
    op.add_column("promo_banners", sa.Column("long_description", sa.Text, nullable=True))
    # Drop dead target_url
    op.drop_column("promo_banners", "target_url")
    # Fix action_type default
    op.execute("UPDATE promo_banners SET action_type = 'detail' WHERE action_type = 'detail_image'")

    # --- rewards ---
    op.add_column("rewards", sa.Column("short_description", sa.String(500), nullable=True))
    op.add_column("rewards", sa.Column("long_description", sa.Text, nullable=True))
    # Move existing description → short_description if not null
    op.execute("UPDATE rewards SET short_description = description WHERE short_description IS NULL AND description IS NOT NULL")

    # --- vouchers ---
    op.add_column("vouchers", sa.Column("short_description", sa.String(500), nullable=True))
    op.add_column("vouchers", sa.Column("long_description", sa.Text, nullable=True))
    op.execute("UPDATE vouchers SET short_description = description WHERE short_description IS NULL AND description IS NOT NULL")


def downgrade():
    # vouchers
    op.drop_column("vouchers", "long_description")
    op.drop_column("vouchers", "short_description")

    # rewards
    op.drop_column("rewards", "long_description")
    op.drop_column("rewards", "short_description")

    # promo_banners
    op.add_column("promo_banners", sa.Column("target_url", sa.String(500), nullable=True))
    op.drop_column("promo_banners", "long_description")
    op.alter_column("promo_banners", "short_description", new_column_name="subtitle")
