"""customer_wallet_v5

Fill gaps between current schema and customer wallet requirements:

1. rewards catalog: Add validity_days
2. vouchers catalog: Add validity_days
3. user_rewards: Add status, expires_at, used_at, redemption_code, points_spent, reward_snapshot
4. user_vouchers: Add status, code, expires_at, used_at, discount_type, discount_value, min_spend
5. wallet_transactions: Add balance_after
"""
from alembic import op
import sqlalchemy as sa

revision = "customer_wallet_v5"
down_revision = "promo_voucher_guards_v4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. rewards catalog ──────────────────────────────────────────────
    op.add_column("rewards", sa.Column("validity_days", sa.Integer(), nullable=True, server_default="30"))

    # ── 2. vouchers catalog ─────────────────────────────────────────────
    op.add_column("vouchers", sa.Column("validity_days", sa.Integer(), nullable=True, server_default="30"))

    # ── 3. user_rewards (customer_rewards) ──────────────────────────────
    op.add_column("user_rewards", sa.Column("status", sa.String(20), nullable=True, server_default="available"))
    op.add_column("user_rewards", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_rewards", sa.Column("used_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_rewards", sa.Column("redemption_code", sa.String(50), nullable=True))
    op.add_column("user_rewards", sa.Column("points_spent", sa.Integer(), nullable=True))
    op.add_column("user_rewards", sa.Column("reward_snapshot", sa.JSON(), nullable=True))

    # ── 4. user_vouchers (customer_vouchers) ────────────────────────────
    op.add_column("user_vouchers", sa.Column("status", sa.String(20), nullable=True, server_default="available"))
    op.add_column("user_vouchers", sa.Column("code", sa.String(50), nullable=True))
    op.add_column("user_vouchers", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_vouchers", sa.Column("used_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_vouchers", sa.Column("discount_type", sa.String(20), nullable=True))
    op.add_column("user_vouchers", sa.Column("discount_value", sa.DECIMAL(10, 2), nullable=True))
    op.add_column("user_vouchers", sa.Column("min_spend", sa.DECIMAL(10, 2), nullable=True))

    # ── 5. wallet_transactions ──────────────────────────────────────────
    op.add_column("wallet_transactions", sa.Column("balance_after", sa.DECIMAL(10, 2), nullable=True))

    # ── Backfill existing data ──────────────────────────────────────────
    # user_rewards: set status based on is_used
    op.execute("UPDATE user_rewards SET status = 'used' WHERE is_used = true")
    op.execute("UPDATE user_rewards SET status = 'available' WHERE is_used = false OR is_used IS NULL")
    # Generate unique redemption codes for existing rows
    op.execute("UPDATE user_rewards SET redemption_code = 'RWD-' || id || '-' || substr(md5(random()::text), 1, 6) WHERE redemption_code IS NULL")
    # Set expires_at for existing available rewards (30 days from redeemed_at or now)
    op.execute("UPDATE user_rewards SET expires_at = COALESCE(redeemed_at, now()) + INTERVAL '30 days' WHERE expires_at IS NULL AND status = 'available'")
    # Set used_at for used rewards
    op.execute("UPDATE user_rewards SET used_at = COALESCE(redeemed_at, now()) WHERE used_at IS NULL AND status = 'used'")

    # user_vouchers: set status based on order_id
    op.execute("UPDATE user_vouchers SET status = 'used' WHERE order_id IS NOT NULL")
    op.execute("UPDATE user_vouchers SET status = 'available' WHERE order_id IS NULL")
    # Generate unique per-instance codes
    op.execute("UPDATE user_vouchers SET code = 'VCH-' || id || '-' || substr(md5(random()::text), 1, 6) WHERE code IS NULL")
    # Set expires_at for available vouchers (30 days from applied_at or now)
    op.execute("UPDATE user_vouchers SET expires_at = COALESCE(applied_at, now()) + INTERVAL '30 days' WHERE expires_at IS NULL AND status = 'available'")
    # Set used_at for used vouchers
    op.execute("UPDATE user_vouchers SET used_at = COALESCE(applied_at, now()) WHERE used_at IS NULL AND status = 'used'")
    # Snapshot discount details from voucher catalog
    op.execute("""
        UPDATE user_vouchers uv
        SET discount_type = v.discount_type::text,
            discount_value = v.discount_value,
            min_spend = v.min_order
        FROM vouchers v
        WHERE uv.voucher_id = v.id
          AND uv.discount_type IS NULL
    """)

    # ── Unique indexes ──────────────────────────────────────────────────
    op.create_index("ix_user_rewards_redemption_code", "user_rewards", ["redemption_code"], unique=True)
    op.create_index("ix_user_vouchers_code", "user_vouchers", ["code"], unique=True)


def downgrade() -> None:
    # Indexes
    op.drop_index("ix_user_vouchers_code")
    op.drop_index("ix_user_rewards_redemption_code")

    # wallet_transactions
    op.drop_column("wallet_transactions", "balance_after")

    # user_vouchers
    op.drop_column("user_vouchers", "min_spend")
    op.drop_column("user_vouchers", "discount_value")
    op.drop_column("user_vouchers", "discount_type")
    op.drop_column("user_vouchers", "used_at")
    op.drop_column("user_vouchers", "expires_at")
    op.drop_column("user_vouchers", "code")
    op.drop_column("user_vouchers", "status")

    # user_rewards
    op.drop_column("user_rewards", "reward_snapshot")
    op.drop_column("user_rewards", "points_spent")
    op.drop_column("user_rewards", "redemption_code")
    op.drop_column("user_rewards", "used_at")
    op.drop_column("user_rewards", "expires_at")
    op.drop_column("user_rewards", "status")

    # vouchers catalog
    op.drop_column("vouchers", "validity_days")

    # rewards catalog
    op.drop_column("rewards", "validity_days")
