"""Add staff_profile lockout columns and order FK indexes.

Revision ID: d4e5f6a7b8c9
Revises: 3a7c53b0e67b
Create Date: 2026-05-23 06:00:00

Adds:
  - staff_profiles.failed_login_count (Integer, default 0)
  - staff_profiles.locked_until (DateTime)
  - Check constraint: failed_login_count >= 0
  - Indexes on orders: customer_id, store_id, dining_table_id, cancelled_by_staff_id
"""
from alembic import op
import sqlalchemy as sa


revision = "d4e5f6a7b8c9"
down_revision = "3a7c53b0e67b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── staff_profiles lockout columns ──
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'staff_profiles' AND column_name = 'failed_login_count'
            ) THEN
                ALTER TABLE staff_profiles ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0;
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'staff_profiles' AND column_name = 'locked_until'
            ) THEN
                ALTER TABLE staff_profiles ADD COLUMN locked_until TIMESTAMP WITH TIME ZONE;
            END IF;
        END $$;
    """)
    op.execute("""
        ALTER TABLE staff_profiles
        DROP CONSTRAINT IF EXISTS ck_staff_profiles_failed_login_count
    """)
    op.execute("""
        ALTER TABLE staff_profiles
        ADD CONSTRAINT ck_staff_profiles_failed_login_count
        CHECK (failed_login_count >= 0)
    """)

    # ── Order FK indexes ──
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_orders_customer_id ON orders (customer_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_orders_store_id ON orders (store_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_orders_dining_table_id ON orders (dining_table_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_orders_cancelled_by_staff_id ON orders (cancelled_by_staff_id)
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS ix_orders_cancelled_by_staff_id
    """)
    op.execute("""
        DROP INDEX IF EXISTS ix_orders_dining_table_id
    """)
    op.execute("""
        DROP INDEX IF EXISTS ix_orders_store_id
    """)
    op.execute("""
        DROP INDEX IF EXISTS ix_orders_customer_id
    """)
    op.execute("""
        ALTER TABLE staff_profiles
        DROP CONSTRAINT IF EXISTS ck_staff_profiles_failed_login_count
    """)
    op.execute("""
        ALTER TABLE staff_profiles DROP COLUMN IF EXISTS locked_until
    """)
    op.execute("""
        ALTER TABLE staff_profiles DROP COLUMN IF EXISTS failed_login_count
    """)
