"""Phase 2: DB constraints and robustness

Revision ID: apr2026_constraints_v3
Revises: apr2026_optimizations_v2
Create Date: 2026-04-25
"""
from alembic import op

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from app import migration_utils as au

revision = 'apr2026_constraints_v3'
down_revision = 'apr2026_optimizations_v2'
branch_labels = None
depends_on = None


def upgrade():
    # NOTE: uq_payments_provider_reference and uq_payments_idempotency_key
    # were removed from models; skip on fresh DBs to avoid issues with
    # duplicate COD provider_reference values.

    if not au.constraint_exists('cart_items', 'ck_cart_items_quantity') and not au.constraint_exists('cart_items', 'ck_cart_item_quantity_positive'):
        op.execute("ALTER TABLE cart_items ADD CONSTRAINT ck_cart_items_quantity CHECK (quantity > 0)")
    elif not au.constraint_exists('cart_items', 'ck_cart_items_quantity'):
        op.execute("ALTER TABLE cart_items ADD CONSTRAINT ck_cart_items_quantity CHECK (quantity > 0)")

    if not au.constraint_exists('cart_items', 'ck_cart_items_unit_price') and not au.constraint_exists('cart_items', 'ck_cart_item_unit_price_nonnegative'):
        op.execute("ALTER TABLE cart_items ADD CONSTRAINT ck_cart_items_unit_price CHECK (unit_price >= 0)")
    elif not au.constraint_exists('cart_items', 'ck_cart_items_unit_price'):
        op.execute("ALTER TABLE cart_items ADD CONSTRAINT ck_cart_items_unit_price CHECK (unit_price >= 0)")

    if not au.constraint_exists('wallets', 'ck_wallets_balance'):
        op.execute("ALTER TABLE wallets ADD CONSTRAINT ck_wallets_balance CHECK (balance >= 0)")

    if not au.index_exists('checkout_tokens', 'ix_checkout_tokens_expires'):
        op.create_index('ix_checkout_tokens_expires', 'checkout_tokens', ['expires_at'])


def downgrade():
    if au.index_exists('checkout_tokens', 'ix_checkout_tokens_expires'):
        op.drop_index('ix_checkout_tokens_expires', table_name='checkout_tokens')
    if au.constraint_exists('wallets', 'ck_wallets_balance'):
        op.execute("ALTER TABLE wallets DROP CONSTRAINT IF EXISTS ck_wallets_balance")
    if au.constraint_exists('cart_items', 'ck_cart_items_unit_price'):
        op.execute("ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS ck_cart_items_unit_price")
    if au.constraint_exists('cart_items', 'ck_cart_items_quantity'):
        op.execute("ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS ck_cart_items_quantity")
