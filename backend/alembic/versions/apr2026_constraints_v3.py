"""Phase 2: DB constraints and robustness

Revision ID: apr2026_constraints_v3
Revises: apr2026_optimizations_v2
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'apr2026_constraints_v3'
down_revision = 'apr2026_optimizations_v2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_unique_constraint('uq_payments_provider_reference', 'payments', ['provider_reference'])
    op.create_unique_constraint('uq_payments_idempotency_key', 'payments', ['idempotency_key'])

    op.execute("ALTER TABLE cart_items ADD CONSTRAINT ck_cart_items_quantity CHECK (quantity > 0)")
    op.execute("ALTER TABLE cart_items ADD CONSTRAINT ck_cart_items_unit_price CHECK (unit_price >= 0)")

    op.execute("ALTER TABLE wallets ADD CONSTRAINT ck_wallets_balance CHECK (balance >= 0)")

    op.create_index('ix_checkout_tokens_expires', 'checkout_tokens', ['expires_at'])


def downgrade():
    op.drop_index('ix_checkout_tokens_expires', table_name='checkout_tokens')
    op.execute("ALTER TABLE wallets DROP CONSTRAINT IF EXISTS ck_wallets_balance")
    op.execute("ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS ck_cart_items_unit_price")
    op.execute("ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS ck_cart_items_quantity")
    op.drop_constraint('uq_payments_idempotency_key', 'payments', type_='unique')
    op.drop_constraint('uq_payments_provider_reference', 'payments', type_='unique')
