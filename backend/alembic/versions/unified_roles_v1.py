"""Unified user_type + role system

Revision ID: unified_roles_v1
Revises: inv_cat_hq_staff
Create Date: 2026-04-14

Old: users.role (userrole enum: admin, store_owner, hq_personnel, customer)
     staff.role (staffrole enum: manager, assistant_manager, barista, cashier, delivery)

New: users.user_type (usertype enum: customer, hq_management, store_management, store_staff)
     users.role (user_role enum: admin, brand_owner, staff, manager, assistant_manager, barista, cashier, delivery)

Mapping:
  users.role=admin              → user_type=hq_management, role=admin
  users.role=store_owner        → user_type=hq_management, role=brand_owner
  users.role=hq_personnel       → user_type=hq_management, role=staff
  users.role=customer + staff.manager → user_type=store_management, role=manager
  users.role=customer + staff.assistant_manager → user_type=store_management, role=assistant_manager
  users.role=customer + staff.barista → user_type=store_staff, role=barista
  users.role=customer + staff.cashier → user_type=store_staff, role=cashier
  users.role=customer + staff.delivery → user_type=store_staff, role=delivery
  users.role=customer + no staff → user_type=customer, role=NULL
"""
from alembic import op
import sqlalchemy as sa

revision = 'unified_roles_v1'
down_revision = 'inv_cat_hq_staff'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create new enum types
    usertype_values = "('customer', 'hq_management', 'store_management', 'store_staff')"
    user_role_values = "('admin', 'brand_owner', 'staff', 'manager', 'assistant_manager', 'barista', 'cashier', 'delivery')"

    op.execute(f"CREATE TYPE usertype AS ENUM {usertype_values}")
    op.execute(f"CREATE TYPE user_role AS ENUM {user_role_values}")

    # 2. Add new columns
    op.add_column('users', sa.Column('user_type', sa.Enum('customer', 'hq_management', 'store_management', 'store_staff', name='usertype'), nullable=True))
    op.add_column('users', sa.Column('new_role', sa.Enum('admin', 'brand_owner', 'staff', 'manager', 'assistant_manager', 'barista', 'cashier', 'delivery', name='user_role'), nullable=True))

    # 3. Migrate data
    conn = op.get_bind()

    # admin → hq_management / admin
    conn.execute(sa.text("UPDATE users SET user_type = 'hq_management', new_role = 'admin' WHERE role = 'admin'"))

    # store_owner → hq_management / brand_owner
    conn.execute(sa.text("UPDATE users SET user_type = 'hq_management', new_role = 'brand_owner' WHERE role = 'store_owner'"))

    # hq_personnel → hq_management / staff
    conn.execute(sa.text("UPDATE users SET user_type = 'hq_management', new_role = 'staff' WHERE role = 'hq_personnel'"))

    # Users linked to staff with manager role → store_management / manager
    conn.execute(sa.text("""
        UPDATE users SET user_type = 'store_management', new_role = 'manager'
        WHERE id IN (SELECT user_id FROM staff WHERE role = 'manager' AND user_id IS NOT NULL)
        AND user_type IS NULL
    """))

    # Users linked to staff with assistant_manager → store_management / assistant_manager
    conn.execute(sa.text("""
        UPDATE users SET user_type = 'store_management', new_role = 'assistant_manager'
        WHERE id IN (SELECT user_id FROM staff WHERE role = 'assistant_manager' AND user_id IS NOT NULL)
        AND user_type IS NULL
    """))

    # Users linked to staff with barista → store_staff / barista
    conn.execute(sa.text("""
        UPDATE users SET user_type = 'store_staff', new_role = 'barista'
        WHERE id IN (SELECT user_id FROM staff WHERE role = 'barista' AND user_id IS NOT NULL)
        AND user_type IS NULL
    """))

    # Users linked to staff with cashier → store_staff / cashier
    conn.execute(sa.text("""
        UPDATE users SET user_type = 'store_staff', new_role = 'cashier'
        WHERE id IN (SELECT user_id FROM staff WHERE role = 'cashier' AND user_id IS NOT NULL)
        AND user_type IS NULL
    """))

    # Users linked to staff with delivery → store_staff / delivery
    conn.execute(sa.text("""
        UPDATE users SET user_type = 'store_staff', new_role = 'delivery'
        WHERE id IN (SELECT user_id FROM staff WHERE role = 'delivery' AND user_id IS NOT NULL)
        AND user_type IS NULL
    """))

    # Remaining customers
    conn.execute(sa.text("UPDATE users SET user_type = 'customer' WHERE user_type IS NULL"))

    # 4. Set NOT NULL on user_type
    op.alter_column('users', 'user_type', nullable=False)

    # 5. Drop old role column, rename new_role to role
    op.drop_column('users', 'role')
    op.alter_column('users', 'new_role', new_column_name='role')


def downgrade() -> None:
    # Add back old role column
    op.add_column('users', sa.Column('role', sa.String(20), nullable=True))

    conn = op.get_bind()

    conn.execute(sa.text("UPDATE users SET role = 'admin' WHERE new_role = 'admin'"))
    conn.execute(sa.text("UPDATE users SET role = 'store_owner' WHERE new_role IN ('brand_owner', 'manager', 'assistant_manager')"))
    conn.execute(sa.text("UPDATE users SET role = 'hq_personnel' WHERE new_role = 'staff'"))
    conn.execute(sa.text("UPDATE users SET role = 'customer' WHERE user_type = 'customer'"))

    op.drop_column('users', 'new_role')
    op.drop_column('users', 'user_type')

    op.execute("DROP TYPE IF EXISTS usertype")
    op.execute("DROP TYPE IF EXISTS user_role")
