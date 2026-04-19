"""ACL migration: user_types, roles, role_user_type, user_store_access, permissions, role_permissions

Revision ID: acl_v1
Revises: unified_roles_v1
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column
from sqlalchemy import String, Integer, Boolean, Text, DateTime, ForeignKey
from datetime import datetime, timezone

revision = 'acl_v1'
down_revision = 'unified_roles_v1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ===================================================================
    # 1. Create lookup tables
    # ===================================================================

    op.create_table('user_types',
        sa.Column('id', Integer, primary_key=True, autoincrement=False),
        sa.Column('name', String(50), nullable=False, unique=True),
        sa.Column('description', Text),
    )

    op.create_table('roles',
        sa.Column('id', Integer, primary_key=True, autoincrement=False),
        sa.Column('name', String(50), nullable=False, unique=True),
        sa.Column('typical_user_type_id', Integer, ForeignKey('user_types.id')),
    )

    op.create_table('role_user_type',
        sa.Column('role_id', Integer, ForeignKey('roles.id'), primary_key=True),
        sa.Column('user_type_id', Integer, ForeignKey('user_types.id'), primary_key=True),
    )

    # ===================================================================
    # 2. Seed lookup data
    # ===================================================================

    user_types_data = [
        (1, 'HQ Management', 'Corporate office users'),
        (2, 'Store Management', 'Area/regional managers, assistants'),
        (3, 'Store', 'In-store staff'),
        (4, 'Customer', 'End users'),
    ]
    op.bulk_insert(
        table('user_types', column('id', Integer), column('name', String), column('description', Text)),
        [{'id': r[0], 'name': r[1], 'description': r[2]} for r in user_types_data]
    )

    roles_data = [
        (1, 'Admin', 1),
        (2, 'Brand Owner', 1),
        (3, 'Manager', 2),
        (4, 'Assistant Manager', 2),
        (5, 'Staff', 3),
        (6, 'Customer', 4),
        (7, 'HQ Staff', 1),
    ]
    op.bulk_insert(
        table('roles', column('id', Integer), column('name', String), column('typical_user_type_id', Integer)),
        [{'id': r[0], 'name': r[1], 'typical_user_type_id': r[2]} for r in roles_data]
    )

    role_user_type_data = [
        # Admin -> HQ Management
        (1, 1),
        # Brand Owner -> HQ Management
        (2, 1),
        # Manager -> Store Management
        (3, 2),
        # Assistant Manager -> Store Management
        (4, 2),
        # Staff -> Store
        (5, 3),
        # Customer -> Customer
        (6, 4),
        # HQ Staff -> HQ Management
        (7, 1),
    ]
    op.bulk_insert(
        table('role_user_type', column('role_id', Integer), column('user_type_id', Integer)),
        [{'role_id': r[0], 'user_type_id': r[1]} for r in role_user_type_data]
    )

    # ===================================================================
    # 3. Add user_type_id and role_id columns to users table
    # ===================================================================

    op.add_column('users', sa.Column('user_type_id', Integer, ForeignKey('user_types.id'), nullable=True))
    op.add_column('users', sa.Column('role_id', Integer, ForeignKey('roles.id'), nullable=True))

    # ===================================================================
    # 4. Migrate data from enum columns to FK columns
    # ===================================================================

    # Mapping: old enum value -> new lookup table id
    user_type_map = {
        'hq_management': 1,
        'store_management': 2,
        'store_staff': 3,
        'customer': 4,
    }

    role_map = {
        'admin': 1,
        'brand_owner': 2,
        'manager': 3,
        'assistant_manager': 4,
        'barista': 5,
        'cashier': 5,
        'delivery': 5,
        'staff': 7,
        None: 6,  # customers with null role
    }

    conn = op.get_bind()

    # Update each user
    users = conn.execute(sa.text("SELECT id, user_type, role FROM users")).fetchall()
    for u in users:
        ut_id = user_type_map.get(u[1])
        r_id = role_map.get(u[2], 6)
        conn.execute(
            sa.text("UPDATE users SET user_type_id = :ut, role_id = :r WHERE id = :id"),
            {"ut": ut_id, "r": r_id, "id": u[0]}
        )

    # Make columns NOT NULL now that data is migrated
    op.alter_column('users', 'user_type_id', nullable=False)
    op.alter_column('users', 'role_id', nullable=False)

    # ===================================================================
    # 5. Create user_store_access table
    # ===================================================================

    op.create_table('user_store_access',
        sa.Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
        sa.Column('store_id', Integer, ForeignKey('stores.id'), primary_key=True),
        sa.Column('assigned_at', DateTime, default=lambda: datetime.now(timezone.utc)),
        sa.Column('assigned_by', Integer, ForeignKey('users.id'), nullable=True),
        sa.Column('is_primary', Boolean, default=False),
    )
    op.create_index('ix_user_store_access_user', 'user_store_access', ['user_id'])
    op.create_index('ix_user_store_access_store', 'user_store_access', ['store_id'])

    # ===================================================================
    # 6. Populate user_store_access from staff records
    #    Skip store_id=0 (HQ) since Admin/Brand Owner have global access
    #    Skip staff records with no user_id (no linked account)
    # ===================================================================

    staff_records = conn.execute(
        sa.text("SELECT user_id, store_id, is_active FROM staff WHERE user_id IS NOT NULL AND store_id > 0 AND is_active = true")
    ).fetchall()

    # Get admin user id for assigned_by
    admin_row = conn.execute(sa.text("SELECT id FROM users WHERE role_id = 1 LIMIT 1")).fetchone()
    admin_id = admin_row[0] if admin_row else 1

    for s in staff_records:
        # Check not already inserted (same user+store)
        exists = conn.execute(
            sa.text("SELECT 1 FROM user_store_access WHERE user_id = :uid AND store_id = :sid"),
            {"uid": s[0], "sid": s[1]}
        ).fetchone()
        if not exists:
            conn.execute(
                sa.text("INSERT INTO user_store_access (user_id, store_id, assigned_at, assigned_by) VALUES (:uid, :sid, NOW(), :aid)"),
                {"uid": s[0], "sid": s[1], "aid": admin_id}
            )

    # ===================================================================
    # 7. Create permissions table
    # ===================================================================

    op.create_table('permissions',
        sa.Column('id', Integer, primary_key=True),
        sa.Column('name', String(100), nullable=False, unique=True),
        sa.Column('resource', String(50), nullable=False),
        sa.Column('action', String(50), nullable=False),
    )

    permissions_data = [
        (1,  'view_dashboard',    'dashboard', 'view'),
        (2,  'manage_users',      'user',      'create,update,delete'),
        (3,  'view_sales',        'sales',     'view'),
        (4,  'manage_orders',     'order',     'view,update'),
        (5,  'view_orders',       'order',     'view'),
        (6,  'manage_menu',       'menu',      'create,update,delete'),
        (7,  'view_menu',         'menu',      'view'),
        (8,  'manage_inventory',  'inventory', 'create,update,delete'),
        (9,  'adjust_inventory',  'inventory', 'adjust'),
        (10, 'view_inventory',    'inventory', 'view'),
        (11, 'manage_marketing',  'marketing', 'create,update,delete'),
        (12, 'view_marketing',    'marketing', 'view'),
        (13, 'manage_tables',     'tables',    'create,update,delete'),
        (14, 'view_tables',       'tables',    'view'),
        (15, 'manage_rewards',    'rewards',   'create,update,delete'),
        (16, 'view_reports',      'reports',   'view'),
        (17, 'manage_settings',   'settings',  'create,update'),
        (18, 'view_audit_log',    'audit',     'view'),
        (19, 'manage_vouchers',   'vouchers',  'create,update,delete'),
        (20, 'manage_promotions', 'promotions','create,update,delete'),
        (21, 'view_customers',    'customers', 'view'),
        (22, 'manage_notifications', 'notifications', 'create,update,delete'),
        (23, 'manage_loyalty_rules', 'loyalty_rules', 'create,update'),
    ]
    op.bulk_insert(
        table('permissions', column('id', Integer), column('name', String), column('resource', String), column('action', String)),
        [{'id': r[0], 'name': r[1], 'resource': r[2], 'action': r[3]} for r in permissions_data]
    )

    # ===================================================================
    # 8. Create role_permissions table
    # ===================================================================

    op.create_table('role_permissions',
        sa.Column('role_id', Integer, ForeignKey('roles.id'), primary_key=True),
        sa.Column('permission_id', Integer, ForeignKey('permissions.id'), primary_key=True),
    )

    # Role permission assignments:
    # Admin (1) = ALL permissions
    # Brand Owner (2) = ALL permissions
    # HQ Staff (7) = view_dashboard, manage_orders, view_orders, view_menu, view_inventory,
    #                view_sales, view_reports, view_customers, view_marketing
    # Manager (3) = view_dashboard, manage_orders, view_orders, view_menu, adjust_inventory,
    #               view_inventory, manage_tables, view_tables, view_sales, view_reports, view_customers
    # Assistant Manager (4) = same as Manager
    # Staff (5) = view_dashboard, view_orders, manage_orders
    # Customer (6) = nothing (PWA only)

    all_permission_ids = list(range(1, 24))

    # Admin + Brand Owner get everything
    admin_perms = [{'role_id': rid, 'permission_id': pid} for rid in [1, 2] for pid in all_permission_ids]

    # HQ Staff
    hq_staff_perms = [1, 2, 4, 5, 7, 10, 3, 16, 21, 12, 6, 8]  # most things
    hq_staff_rows = [{'role_id': 7, 'permission_id': pid} for pid in hq_staff_perms]

    # Manager + Assistant Manager
    mgr_perms = [1, 4, 5, 7, 9, 10, 13, 14, 3, 16, 21]
    mgr_rows = [{'role_id': rid, 'permission_id': pid} for rid in [3, 4] for pid in mgr_perms]

    # Staff (barista, cashier, delivery)
    staff_perms = [1, 4, 5]
    staff_rows = [{'role_id': 5, 'permission_id': pid} for pid in staff_perms]

    all_role_perms = admin_perms + hq_staff_rows + mgr_rows + staff_rows
    op.bulk_insert(
        table('role_permissions', column('role_id', Integer), column('permission_id', Integer)),
        all_role_perms
    )


def downgrade() -> None:
    op.drop_table('role_permissions')
    op.drop_table('permissions')
    op.drop_table('user_store_access')
    op.drop_column('users', 'role_id')
    op.drop_column('users', 'user_type_id')
    op.drop_table('role_user_type')
    op.drop_table('roles')
    op.drop_table('user_types')
