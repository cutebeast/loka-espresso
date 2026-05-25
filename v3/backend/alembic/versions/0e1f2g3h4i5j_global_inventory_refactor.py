"""Global inventory refactor: move stock fields from InventoryItem→InventoryStock, remove store_id from categories"""
from alembic import op
import sqlalchemy as sa

revision = '0e1f2g3h4i5j'
down_revision = '060b141b5548'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('inventory_stock',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('inventory_item_id', sa.Integer(), nullable=False),
        sa.Column('store_id', sa.Integer(), nullable=False),
        sa.Column('current_stock', sa.Numeric(10, 4), nullable=False, server_default='0'),
        sa.Column('reserved_stock', sa.Numeric(10, 4), nullable=False, server_default='0'),
        sa.Column('reorder_level', sa.Numeric(10, 4), nullable=False, server_default='0'),
        sa.Column('reorder_quantity', sa.Numeric(10, 4), nullable=False, server_default='0'),
        sa.Column('par_level', sa.Numeric(10, 4), nullable=False, server_default='0'),
        sa.Column('storage_location', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(['inventory_item_id'], ['inventory_items.id'],
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_inventory_stock_item', 'inventory_stock', ['inventory_item_id'])
    op.create_index('ix_inventory_stock_store', 'inventory_stock', ['store_id'])

    op.add_column('inventory_items', sa.Column('store_id_temp', sa.Integer(), nullable=True))
    op.execute("""
        INSERT INTO inventory_stock (inventory_item_id, store_id, current_stock, reserved_stock,
            reorder_level, reorder_quantity, par_level, storage_location)
        SELECT id, store_id, current_stock, reserved_stock, reorder_level, reorder_quantity,
            par_level, storage_location
        FROM inventory_items
        WHERE store_id IS NOT NULL
    """)

    op.drop_constraint('inventory_items_store_id_fkey', 'inventory_items', type_='foreignkey')
    op.drop_column('inventory_items', 'current_stock')
    op.drop_column('inventory_items', 'reserved_stock')
    op.drop_column('inventory_items', 'reorder_level')
    op.drop_column('inventory_items', 'reorder_quantity')
    op.drop_column('inventory_items', 'par_level')
    op.drop_column('inventory_items', 'storage_location')

    op.drop_constraint('inventory_categories_store_id_fkey', 'inventory_categories',
                       type_='foreignkey')
    op.drop_column('inventory_categories', 'store_id')


def downgrade() -> None:
    op.add_column('inventory_categories',
                  sa.Column('store_id', sa.Integer(), nullable=True))
    op.execute("UPDATE inventory_categories SET store_id = 1")
    op.create_foreign_key('inventory_categories_store_id_fkey', 'inventory_categories', 'stores',
                          ['store_id'], ['id'], ondelete='CASCADE')
    op.alter_column('inventory_categories', 'store_id', nullable=False)

    op.add_column('inventory_items', sa.Column('current_stock', sa.Numeric(10, 4),
                  nullable=False, server_default='0'))
    op.add_column('inventory_items', sa.Column('reserved_stock', sa.Numeric(10, 4),
                  nullable=False, server_default='0'))
    op.add_column('inventory_items', sa.Column('reorder_level', sa.Numeric(10, 4),
                  nullable=False, server_default='0'))
    op.add_column('inventory_items', sa.Column('reorder_quantity', sa.Numeric(10, 4),
                  nullable=False, server_default='0'))
    op.add_column('inventory_items', sa.Column('par_level', sa.Numeric(10, 4),
                  nullable=False, server_default='0'))
    op.add_column('inventory_items', sa.Column('storage_location', sa.String(50), nullable=True))

    op.execute("""
        UPDATE inventory_items i
        SET current_stock = COALESCE(s.current_stock, 0),
            reserved_stock = COALESCE(s.reserved_stock, 0),
            reorder_level = COALESCE(s.reorder_level, 0),
            reorder_quantity = COALESCE(s.reorder_quantity, 0),
            par_level = COALESCE(s.par_level, 0),
            storage_location = s.storage_location
        FROM inventory_stock s
        WHERE s.inventory_item_id = i.id AND s.store_id = 1
    """)

    op.drop_table('inventory_stock')
