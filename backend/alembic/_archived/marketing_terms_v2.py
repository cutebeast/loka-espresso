"""Add terms and how_to_redeem to marketing entities, remove detail_image_url

- Add terms (JSON) and how_to_redeem (Text) to rewards
- Add terms (JSON) and how_to_redeem (Text) to vouchers
- Add terms (JSON) and how_to_redeem (Text) to promo_banners
- Remove detail_image_url from promo_banners
"""
from alembic import op
import sqlalchemy as sa

revision = "marketing_terms_v2"
down_revision = "marketing_group_v1"
branch_labels = None
depends_on = None


def upgrade():
    # rewards
    op.add_column("rewards", sa.Column("terms", sa.JSON, nullable=True))
    op.add_column("rewards", sa.Column("how_to_redeem", sa.Text, nullable=True))

    # vouchers
    op.add_column("vouchers", sa.Column("terms", sa.JSON, nullable=True))
    op.add_column("vouchers", sa.Column("how_to_redeem", sa.Text, nullable=True))

    # promo_banners
    op.add_column("promo_banners", sa.Column("terms", sa.JSON, nullable=True))
    op.add_column("promo_banners", sa.Column("how_to_redeem", sa.Text, nullable=True))
    op.drop_column("promo_banners", "detail_image_url")


def downgrade():
    op.add_column("promo_banners", sa.Column("detail_image_url", sa.String(500), nullable=True))
    op.drop_column("promo_banners", "how_to_redeem")
    op.drop_column("promo_banners", "terms")
    op.drop_column("vouchers", "how_to_redeem")
    op.drop_column("vouchers", "terms")
    op.drop_column("rewards", "how_to_redeem")
    op.drop_column("rewards", "terms")
