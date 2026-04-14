"""promo_voucher_guards_v4

Add voucher_id to promo_banners (for 'detail' action type)
Add max_uses_per_user to vouchers (per-user redemption limit)
Add source + source_id to user_vouchers (track voucher origin)
"""
from alembic import op
import sqlalchemy as sa

revision = "promo_voucher_guards_v4"
down_revision = "marketing_pwa_v3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. promo_banners: voucher_id for "detail" action type
    op.add_column("promo_banners", sa.Column("voucher_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_promo_banners_voucher_id", "promo_banners", "vouchers", ["voucher_id"], ["id"])

    # 2. vouchers: max_uses_per_user (NULL = unlimited, default 1)
    op.add_column("vouchers", sa.Column("max_uses_per_user", sa.Integer(), nullable=True, server_default="1"))

    # 3. user_vouchers: source tracking
    op.add_column("user_vouchers", sa.Column("source", sa.String(30), nullable=True))
    op.add_column("user_vouchers", sa.Column("source_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_vouchers", "source_id")
    op.drop_column("user_vouchers", "source")
    op.drop_column("vouchers", "max_uses_per_user")
    op.drop_constraint("fk_promo_banners_voucher_id", "promo_banners", type_="foreignkey")
    op.drop_column("promo_banners", "voucher_id")
