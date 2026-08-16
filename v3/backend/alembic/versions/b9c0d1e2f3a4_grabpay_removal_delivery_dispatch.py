"""GrabPay removal + manual delivery dispatch columns.

GrabPay was removed 2026-08-17 (never launched — simulator-only). Both
`payments.provider` and `payment_methods.provider` use the shared PG enum
`payment_provider` — the enum is recreated without grabpay (0 rows used it).
The redundant CHECK that mirrored the enum is dropped; the enum is the
constraint.

Adds the manual delivery-dispatch columns to order_fulfillment: staff key
delivery orders into external systems (Lalamove/GrabExpress/…) manually from
the staff portal until a delivery API integration lands.

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-08-17
"""
import sqlalchemy as sa
from alembic import op

revision = "b9c0d1e2f3a4"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Enum recreation without grabpay (payments + payment_methods share
    #    payment_provider; the payments index depends on the type — drop it
    #    first, recreate after).
    op.execute("ALTER TABLE payment_methods DROP CONSTRAINT IF EXISTS ck_payment_methods_provider;")
    op.execute("DROP INDEX IF EXISTS idx_payments_provider;")
    op.execute("ALTER TABLE payments ALTER COLUMN provider TYPE text;")
    op.execute("ALTER TABLE payment_methods ALTER COLUMN provider TYPE text;")
    op.execute("DROP TYPE payment_provider;")
    op.execute("""
        CREATE TYPE payment_provider AS ENUM (
            'stripe','adyen','braintree','paypal','cash','store_credit',
            'internal_wallet','gcash','alipay','wechat_pay','hitpay'
        );
    """)
    op.execute(
        "ALTER TABLE payments ALTER COLUMN provider TYPE payment_provider USING provider::payment_provider;"
    )
    op.execute(
        "ALTER TABLE payment_methods ALTER COLUMN provider TYPE payment_provider USING provider::payment_provider;"
    )
    op.execute("CREATE INDEX idx_payments_provider ON payments (provider);")

    # 2. Manual delivery dispatch columns on order_fulfillment.
    op.add_column("order_fulfillment", sa.Column("delivery_dispatched_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("order_fulfillment", sa.Column("delivery_dispatched_by", sa.BigInteger(), nullable=True))
    op.execute("""
        ALTER TABLE order_fulfillment ADD CONSTRAINT fk_order_fulfillment_delivery_dispatched_by
        FOREIGN KEY (delivery_dispatched_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
    """)
    op.create_index("ix_order_fulfillment_delivery_provider", "order_fulfillment", ["delivery_provider"])


def downgrade() -> None:
    op.drop_index("ix_order_fulfillment_delivery_provider", table_name="order_fulfillment")
    op.execute("ALTER TABLE order_fulfillment DROP CONSTRAINT IF EXISTS fk_order_fulfillment_delivery_dispatched_by;")
    op.drop_column("order_fulfillment", "delivery_dispatched_by")
    op.drop_column("order_fulfillment", "delivery_dispatched_at")

    op.execute("DROP INDEX IF EXISTS idx_payments_provider;")
    op.execute("ALTER TABLE payments ALTER COLUMN provider TYPE text;")
    op.execute("ALTER TABLE payment_methods ALTER COLUMN provider TYPE text;")
    op.execute("DROP TYPE payment_provider;")
    op.execute("""
        CREATE TYPE payment_provider AS ENUM (
            'stripe','adyen','braintree','paypal','cash','store_credit',
            'internal_wallet','grabpay','gcash','alipay','wechat_pay','hitpay'
        );
    """)
    op.execute(
        "ALTER TABLE payments ALTER COLUMN provider TYPE payment_provider USING provider::payment_provider;"
    )
    op.execute(
        "ALTER TABLE payment_methods ALTER COLUMN provider TYPE payment_provider USING provider::payment_provider;"
    )
    op.execute("CREATE INDEX idx_payments_provider ON payments (provider);")
    op.execute("""
        ALTER TABLE payment_methods ADD CONSTRAINT ck_payment_methods_provider CHECK (
            provider IN ('stripe','adyen','braintree','paypal','cash','store_credit','internal_wallet','grabpay','gcash','alipay','wechat_pay','hitpay')
        );
    """)
