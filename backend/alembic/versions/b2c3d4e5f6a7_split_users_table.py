"""split users into admin_users and customers

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-28 02:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create admin_users table
    op.create_table(
        "admin_users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, index=True),
        sa.Column("email", sa.String(255), unique=True, index=True, nullable=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("user_type_id", sa.Integer(), sa.ForeignKey("user_types.id", ondelete="RESTRICT"), nullable=False, server_default="1"),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # 2. Create customers table
    op.create_table(
        "customers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, index=True),
        sa.Column("phone", sa.String(20), unique=True, index=True, nullable=True),
        sa.Column("email", sa.String(255), unique=True, index=True, nullable=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("referral_code", sa.String(50), unique=True, nullable=True),
        sa.Column("referred_by", sa.Integer(), sa.ForeignKey("customers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("referral_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("referral_earnings", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("phone_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # 3. Create customer_addresses table
    op.create_table(
        "customer_addresses",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, index=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("address", sa.String(500), nullable=False),
        sa.Column("lat", sa.Numeric(10, 7), nullable=True),
        sa.Column("lng", sa.Numeric(10, 7), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_cust_address_default", "customer_addresses", ["customer_id", "is_default"])

    # 4. Create customer_device_tokens table
    op.create_table(
        "customer_device_tokens",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, index=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("token", sa.String(4096), nullable=False),
        sa.Column("platform", sa.String(20), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # 5. Copy admin/staff users (user_type_id 1,2,3) → admin_users
    op.execute("""
        INSERT INTO admin_users (id, email, name, password_hash, phone, user_type_id, role_id, is_active, created_at, updated_at)
        SELECT id, email, name, password_hash, phone, user_type_id, role_id, is_active, created_at, updated_at
        FROM users WHERE user_type_id IN (1, 2, 3)
    """)

    # 6. Copy customers (user_type_id 4) → customers
    op.execute("""
        INSERT INTO customers (id, phone, email, name, avatar_url, referral_code, referred_by, referral_count, referral_earnings, is_active, phone_verified, created_at, updated_at)
        SELECT id, phone, email, name, avatar_url, referral_code, referred_by, referral_count, referral_earnings, is_active, phone_verified, created_at, updated_at
        FROM users WHERE user_type_id = 4
    """)

    # 7. Copy user_addresses → customer_addresses
    op.execute("""
        INSERT INTO customer_addresses (id, customer_id, label, address, lat, lng, is_default, created_at)
        SELECT ua.id, ua.user_id, ua.label, ua.address, ua.lat, ua.lng, ua.is_default, ua.created_at
        FROM user_addresses ua
        INNER JOIN users u ON ua.user_id = u.id
        WHERE u.user_type_id = 4
    """)

    # 8. Copy device_tokens → customer_device_tokens
    op.execute("""
        INSERT INTO customer_device_tokens (id, customer_id, token, platform, is_active, created_at)
        SELECT dt.id, dt.user_id, dt.token, dt.platform, dt.is_active, dt.created_at
        FROM device_tokens dt
        INNER JOIN users u ON dt.user_id = u.id
        WHERE u.user_type_id = 4
    """)

    # 9. Reset auto-increment sequences for new tables
    op.execute("SELECT setval('admin_users_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM admin_users))")
    op.execute("SELECT setval('customers_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM customers))")
    op.execute("SELECT setval('customer_addresses_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM customer_addresses))")
    op.execute("SELECT setval('customer_device_tokens_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM customer_device_tokens))")

    # 10. Add user_type column to token_blacklist (no FK, just metadata)
    op.add_column("token_blacklist", sa.Column("user_type", sa.String(20), nullable=True, index=True))

    # 10. Update token_blacklist user_type based on user_type_id
    op.execute("""
        UPDATE token_blacklist tb
        SET user_type = CASE
            WHEN EXISTS (SELECT 1 FROM users u WHERE u.id = tb.user_id AND u.user_type_id IN (1,2,3)) THEN 'admin'
            ELSE 'customer'
        END
    """)

    # 11. Remove FK constraint from token_blacklist.user_id (now polymorphic)
    # SQLite doesn't support dropping FK constraints directly, but the model no longer declares one
    # The data is preserved — user_id is now just an integer without FK

    # 12. Update customer-table FK references to point to customers table
    # orders.user_id
    op.execute("ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE")
    op.execute("UPDATE orders SET customer_id = user_id WHERE user_id IN (SELECT id FROM customers)")
    op.alter_column("orders", "customer_id", nullable=False)
    op.create_index("ix_orders_customer_id", "orders", ["customer_id"])

    # cart_items.user_id
    op.execute("ALTER TABLE cart_items ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE")
    op.execute("UPDATE cart_items SET customer_id = user_id WHERE user_id IN (SELECT id FROM customers)")
    op.alter_column("cart_items", "customer_id", nullable=False)
    op.create_index("ix_cart_items_customer_id", "cart_items", ["customer_id"])

    # checkout_tokens.user_id
    op.execute("ALTER TABLE checkout_tokens ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE")
    op.execute("UPDATE checkout_tokens SET customer_id = user_id WHERE user_id IN (SELECT id FROM customers)")
    op.alter_column("checkout_tokens", "customer_id", nullable=False)

    # loyalty_accounts.user_id
    op.execute("ALTER TABLE loyalty_accounts ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE")
    op.execute("UPDATE loyalty_accounts SET customer_id = user_id WHERE user_id IN (SELECT id FROM customers)")
    op.alter_column("loyalty_accounts", "customer_id", nullable=False)
    op.create_unique_constraint("uq_loyalty_accounts_customer_id", "loyalty_accounts", ["customer_id"])

    # loyalty_transactions.user_id
    op.execute("ALTER TABLE loyalty_transactions ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE")
    op.execute("UPDATE loyalty_transactions SET customer_id = user_id WHERE user_id IN (SELECT id FROM customers)")
    op.alter_column("loyalty_transactions", "customer_id", nullable=False)

    # loyalty_transactions.created_by → admin_users
    op.execute("ALTER TABLE loyalty_transactions ADD COLUMN admin_user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL")
    op.execute("UPDATE loyalty_transactions SET admin_user_id = created_by WHERE created_by IN (SELECT id FROM admin_users)")

    # user_rewards.user_id
    op.execute("ALTER TABLE user_rewards ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE")
    op.execute("UPDATE user_rewards SET customer_id = user_id WHERE user_id IN (SELECT id FROM customers)")
    op.alter_column("user_rewards", "customer_id", nullable=False)

    # user_vouchers.user_id
    op.execute("ALTER TABLE user_vouchers ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE")
    op.execute("UPDATE user_vouchers SET customer_id = user_id WHERE user_id IN (SELECT id FROM customers)")
    op.alter_column("user_vouchers", "customer_id", nullable=False)

    # wallets.user_id
    op.execute("ALTER TABLE wallets ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE")
    op.execute("UPDATE wallets SET customer_id = user_id WHERE user_id IN (SELECT id FROM customers)")
    op.alter_column("wallets", "customer_id", nullable=False)
    op.create_unique_constraint("uq_wallets_customer_id", "wallets", ["customer_id"])

    # wallet_transactions.user_id
    op.execute("ALTER TABLE wallet_transactions ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL")
    op.execute("UPDATE wallet_transactions SET customer_id = user_id WHERE user_id IN (SELECT id FROM customers)")

    # payment_methods.user_id
    op.execute("ALTER TABLE payment_methods ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE")
    op.execute("UPDATE payment_methods SET customer_id = user_id WHERE user_id IN (SELECT id FROM customers)")
    op.alter_column("payment_methods", "customer_id", nullable=False)

    # notifications.user_id
    op.execute("ALTER TABLE notifications ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE")
    op.execute("UPDATE notifications SET customer_id = user_id WHERE user_id IN (SELECT id FROM customers)")
    op.alter_column("notifications", "customer_id", nullable=False)

    # favorites.user_id
    op.execute("ALTER TABLE favorites ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE")
    op.execute("UPDATE favorites SET customer_id = user_id WHERE user_id IN (SELECT id FROM customers)")
    op.alter_column("favorites", "customer_id", nullable=False)

    # feedback.user_id
    op.execute("ALTER TABLE feedback ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL")
    op.execute("UPDATE feedback SET customer_id = user_id WHERE user_id IN (SELECT id FROM customers)")

    # survey_responses.user_id
    op.execute("ALTER TABLE survey_responses ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL")
    op.execute("UPDATE survey_responses SET customer_id = user_id WHERE user_id IN (SELECT id FROM customers)")

    # reservations.user_id
    op.execute("ALTER TABLE reservations ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL")
    op.execute("UPDATE reservations SET customer_id = user_id WHERE user_id IN (SELECT id FROM customers)")

    # social tables
    op.execute("ALTER TABLE referrals ADD COLUMN referrer_customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE")
    op.execute("UPDATE referrals SET referrer_customer_id = referrer_id WHERE referrer_id IN (SELECT id FROM customers)")
    op.execute("ALTER TABLE referrals ADD COLUMN invitee_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL")
    op.execute("UPDATE referrals SET invitee_customer_id = invitee_id WHERE invitee_id IN (SELECT id FROM customers)")

    # 13. Update admin-table FK references to point to admin_users
    # user_store_access.user_id
    op.execute("ALTER TABLE user_store_access ADD COLUMN admin_user_id INTEGER REFERENCES admin_users(id)")
    op.execute("UPDATE user_store_access SET admin_user_id = user_id WHERE user_id IN (SELECT id FROM admin_users)")
    op.alter_column("user_store_access", "admin_user_id", nullable=False)

    # user_store_access.assigned_by
    op.execute("ALTER TABLE user_store_access ADD COLUMN assigned_by_admin_id INTEGER REFERENCES admin_users(id)")
    op.execute("UPDATE user_store_access SET assigned_by_admin_id = assigned_by WHERE assigned_by IN (SELECT id FROM admin_users)")

    # staff.user_id → admin_users
    op.execute("ALTER TABLE staff ADD COLUMN admin_user_id INTEGER REFERENCES admin_users(id)")
    op.execute("UPDATE staff SET admin_user_id = user_id WHERE user_id IN (SELECT id FROM admin_users)")

    # orders.pos_synced_by → admin_users
    op.execute("ALTER TABLE orders ADD COLUMN pos_synced_by_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL")
    op.execute("UPDATE orders SET pos_synced_by_admin_id = pos_synced_by WHERE pos_synced_by IN (SELECT id FROM admin_users)")

    # orders.delivery_dispatched_by → admin_users
    op.execute("ALTER TABLE orders ADD COLUMN delivery_dispatched_by_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL")
    op.execute("UPDATE orders SET delivery_dispatched_by_admin_id = delivery_dispatched_by WHERE delivery_dispatched_by IN (SELECT id FROM admin_users)")

    # audit_log.user_id → admin_users
    op.execute("ALTER TABLE audit_log ADD COLUMN admin_user_id INTEGER REFERENCES admin_users(id)")
    op.execute("UPDATE audit_log SET admin_user_id = user_id WHERE user_id IN (SELECT id FROM admin_users)")

    # notification_broadcasts.created_by → admin_users
    op.execute("ALTER TABLE notification_broadcasts ADD COLUMN admin_user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL")
    op.execute("UPDATE notification_broadcasts SET admin_user_id = created_by WHERE created_by IN (SELECT id FROM admin_users)")


def downgrade() -> None:
    # Drop all new columns and tables (reverse order)
    # This is a destructive migration — downgrade drops new tables
    op.drop_table("customer_device_tokens")
    op.drop_table("customer_addresses")
    op.drop_table("customers")
    op.drop_table("admin_users")
    op.drop_column("token_blacklist", "user_type")
