"""remove_cart_store_id_v9

Remove store_id from cart_items. Cart is now universal;
store selection happens at checkout/order only.

Also brings cart_items schema in sync: adds customization_hash
(if missing) and drops legacy customizations column (if present).

Revision ID: fdf6d1ad53e3
Revises: f05d0a608a23
Create Date: 2026-04-25 18:20:28.343325
"""
from typing import Sequence, Union
import hashlib
import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import app.migration_utils as au

revision: str = 'fdf6d1ad53e3'
down_revision: Union[str, None] = 'f05d0a608a23'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _hash_option_ids(option_ids):
    if not option_ids:
        return None
    sorted_ids = sorted(int(o) for o in option_ids)
    return hashlib.sha256(",".join(str(i) for i in sorted_ids).encode()).hexdigest()


def upgrade() -> None:
    # 1. Ensure customization_hash exists (models expect it)
    if not au.column_exists('cart_items', 'customization_hash'):
        op.add_column('cart_items', sa.Column('customization_hash', sa.String(length=64), nullable=True))
    if not au.index_exists('cart_items', 'ix_cart_items_customization_hash'):
        op.create_index('ix_cart_items_customization_hash', 'cart_items', ['customization_hash'])

    # 2. Populate customization_hash for existing rows
    conn = op.get_bind()
    result = conn.execute(text("SELECT id, customization_option_ids FROM cart_items WHERE customization_hash IS NULL"))
    for row in result.fetchall():
        cid, opt_ids = row
        # opt_ids may be a JSON string or Python list depending on driver
        if isinstance(opt_ids, str):
            opt_ids = json.loads(opt_ids) if opt_ids else None
        hash_val = _hash_option_ids(opt_ids)
        conn.execute(text("UPDATE cart_items SET customization_hash = :h WHERE id = :id"), {"h": hash_val, "id": cid})

    # 3. Drop old unique constraint that includes store_id
    if au.constraint_exists('cart_items', 'uq_cart_item_identity'):
        op.drop_constraint('uq_cart_item_identity', 'cart_items', type_='unique')

    # 4. Drop legacy customizations column (if present)
    if au.column_exists('cart_items', 'customizations'):
        op.drop_column('cart_items', 'customizations')

    # 5. Drop index on store_id
    if au.index_exists('cart_items', 'ix_cart_items_store_id'):
        op.drop_index('ix_cart_items_store_id', table_name='cart_items')

    # 6. Drop FK to stores
    if au.constraint_exists('cart_items', 'cart_items_store_id_fkey'):
        op.drop_constraint('cart_items_store_id_fkey', 'cart_items', type_='foreignkey')

    # 7. Drop store_id column
    if au.column_exists('cart_items', 'store_id'):
        op.drop_column('cart_items', 'store_id')

    # 8. Create new unique constraint without store_id
    if not au.constraint_exists('cart_items', 'uq_cart_item_identity'):
        op.create_unique_constraint(
            'uq_cart_item_identity',
            'cart_items',
            ['user_id', 'item_id', 'customization_hash']
        )


def downgrade() -> None:
    # Drop new unique constraint
    if au.constraint_exists('cart_items', 'uq_cart_item_identity'):
        op.drop_constraint('uq_cart_item_identity', 'cart_items', type_='unique')

    # Add store_id column back
    if not au.column_exists('cart_items', 'store_id'):
        op.add_column('cart_items', sa.Column('store_id', sa.INTEGER(), autoincrement=False, nullable=False, server_default='1'))
        op.execute("ALTER TABLE cart_items ALTER COLUMN store_id DROP DEFAULT")

    # Add FK back
    if not au.constraint_exists('cart_items', 'cart_items_store_id_fkey'):
        op.create_foreign_key('cart_items_store_id_fkey', 'cart_items', 'stores', ['store_id'], ['id'], ondelete='CASCADE')

    # Add index back
    if not au.index_exists('cart_items', 'ix_cart_items_store_id'):
        op.create_index('ix_cart_items_store_id', 'cart_items', ['store_id'])

    # Recreate old unique constraint with store_id
    if not au.constraint_exists('cart_items', 'uq_cart_item_identity'):
        op.create_unique_constraint(
            'uq_cart_item_identity',
            'cart_items',
            ['user_id', 'store_id', 'item_id', 'customization_hash']
        )
