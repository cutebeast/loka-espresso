"""schema_v3_fix_types_add_order_items_drop_delivery_addresses

Revision ID: 5c4afbe8e02b
Revises: 8cb8a6633870
Create Date: 2026-04-13 12:58:27.758260

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5c4afbe8e02b'
down_revision: Union[str, None] = '8cb8a6633870'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add order_items table (normalized line items for orders)
    op.create_table(
        'order_items',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('order_id', sa.Integer(), sa.ForeignKey('orders.id'), nullable=False, index=True),
        sa.Column('menu_item_id', sa.Integer(), sa.ForeignKey('menu_items.id'), nullable=True, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('unit_price', sa.DECIMAL(10, 2), nullable=False),
        sa.Column('customizations', sa.JSON(), nullable=True),
        sa.Column('line_total', sa.DECIMAL(10, 2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # 2. Add description column to loyalty_transactions
    op.add_column('loyalty_transactions', sa.Column('description', sa.Text(), nullable=True))

    # 3. Add user_id column to wallet_transactions for easier querying
    op.add_column('wallet_transactions', sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True, index=True))

    # 4. Fix payment_methods.is_default from integer to boolean
    op.alter_column('payment_methods', 'is_default',
                    existing_type=sa.Integer(),
                    type_=sa.Boolean(),
                    existing_nullable=True,
                    postgresql_using='is_default::boolean')

    # 5. Fix referrals.reward_amount from varchar to numeric
    op.alter_column('referrals', 'reward_amount',
                    existing_type=sa.String(50),
                    type_=sa.DECIMAL(10, 2),
                    existing_nullable=True,
                    postgresql_using='reward_amount::numeric(10,2)')

    # 6. Add is_default boolean column to user_addresses if missing lat/lng requirement
    # (user_addresses already has lat/lng as nullable, which is correct)

    # 7. Drop delivery_addresses table (unused duplicate of user_addresses)
    op.drop_table('delivery_addresses')


def downgrade() -> None:
    # Recreate delivery_addresses
    op.create_table(
        'delivery_addresses',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('label', sa.String(100), nullable=False),
        sa.Column('address', sa.Text(), nullable=False),
        sa.Column('lat', sa.DECIMAL(10, 7), nullable=False),
        sa.Column('lng', sa.DECIMAL(10, 7), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True)),
    )

    # Revert referrals.reward_amount
    op.alter_column('referrals', 'reward_amount',
                    existing_type=sa.DECIMAL(10, 2),
                    type_=sa.String(50),
                    existing_nullable=True)

    # Revert payment_methods.is_default
    op.alter_column('payment_methods', 'is_default',
                    existing_type=sa.Boolean(),
                    type_=sa.Integer(),
                    existing_nullable=True)

    # Remove added columns
    op.drop_column('wallet_transactions', 'user_id')
    op.drop_column('loyalty_transactions', 'description')

    # Drop order_items
    op.drop_table('order_items')
