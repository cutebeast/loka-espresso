"""
SEED SCRIPT: verify_seed_00_full_reset.py
Purpose: Full system reset - wipe all data and recreate admin user + ACL
APIs tested: Direct DB operations (SQL TRUNCATE), POST /auth/login-password (admin verification)
Status: CERTIFIED-2026-04-19 | API-only implementation (except Step 00 which uses SQL for reset)
Dependencies: None (this IS the clean state)
Flow: 
  1. Truncate all tables via SQL (handling FK constraints)
  2. Recreate user_types, roles, role_user_type mappings (ACL)
  3. Create admin user with hashed password
  4. Verify admin can login
  5. Verify all operational tables empty
NO direct customer data inserts - admin created via SQL for bootstrap only.
"""

import sys, os, time
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import api_post, print_header
import db_validate


def reset_database():
    """Truncate all tables using raw SQL to bypass FK constraints."""
    conn = db_validate.get_conn()
    try:
        cur = conn.cursor()
        
        # Disable foreign key checks temporarily
        cur.execute("SET session_replication_role = replica;")
        
        # Get all tables
        cur.execute("""
            SELECT tablename FROM pg_tables 
            WHERE schemaname = 'public'
            AND tablename NOT IN ('alembic_version')
        """)
        tables = [row[0] for row in cur.fetchall()]
        
        print(f"[*] Truncating {len(tables)} tables...")
        
        # Truncate all tables
        for table in tables:
            try:
                cur.execute(f'TRUNCATE TABLE "{table}" CASCADE')
            except Exception as e:
                print(f"  Warning: Error truncating {table}: {e}")
        
        # Re-enable foreign key checks
        cur.execute("SET session_replication_role = DEFAULT;")
        
        conn.commit()
        print(f"  ✓ All tables truncated")
        return True
    except Exception as e:
        conn.rollback()
        raise RuntimeError(f"Database reset failed: {e}")
    finally:
        conn.close()


def create_acl_data():
    """Create ACL data (user_types, roles, permissions, role_user_type mappings)."""
    conn = db_validate.get_conn()
    try:
        cur = conn.cursor()
        
        # Create user types
        user_types = [
            (1, 'hq_management', 'HQ Management'),
            (2, 'store_management', 'Store Management'),
            (3, 'store', 'Store'),
            (4, 'customer', 'Customer')
        ]
        for id, name, desc in user_types:
            cur.execute('''
                INSERT INTO user_types (id, name, description) 
                VALUES (%s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            ''', (id, name, desc))
        print(f"  ✓ User types created")
        
        # Create roles
        roles = [
            (1, 'ADMIN'),
            (2, 'BRAND_OWNER'),
            (3, 'MANAGER'),
            (4, 'ASSISTANT_MANAGER'),
            (5, 'STAFF'),
            (6, 'CUSTOMER'),
            (7, 'HQ_STAFF')
        ]
        for id, name in roles:
            cur.execute('''
                INSERT INTO roles (id, name)
                VALUES (%s, %s)
                ON CONFLICT (id) DO NOTHING
            ''', (id, name))
        print(f"  ✓ Roles created")
        
        # Create permissions (23 standard permissions)
        # Schema: id, name, resource, action
        permissions = [
            (1, 'Manage Users', 'users', 'manage'),
            (2, 'Manage Stores', 'stores', 'manage'),
            (3, 'Manage Menu', 'menu', 'manage'),
            (4, 'Manage Inventory', 'inventory', 'manage'),
            (5, 'Manage Staff', 'staff', 'manage'),
            (6, 'View Reports', 'reports', 'view'),
            (7, 'Manage Settings', 'settings', 'manage'),
            (8, 'Process Orders', 'orders', 'process'),
            (9, 'Manage Vouchers', 'vouchers', 'manage'),
            (10, 'Manage Rewards', 'rewards', 'manage'),
            (11, 'Manage Loyalty', 'loyalty', 'manage'),
            (12, 'View Dashboard', 'dashboard', 'view'),
            (13, 'Manage Tables', 'tables', 'manage'),
            (14, 'View Orders', 'orders', 'view'),
            (15, 'Update Order Status', 'order_status', 'update'),
            (16, 'Manage Payments', 'payments', 'manage'),
            (17, 'View Customers', 'customers', 'view'),
            (18, 'Manage Marketing', 'marketing', 'manage'),
            (19, 'View Inventory', 'inventory', 'view'),
            (20, 'Adjust Inventory', 'inventory', 'adjust'),
            (21, 'Place Order', 'orders', 'place'),
            (22, 'View Own Profile', 'profile', 'view_own'),
            (23, 'Edit Own Profile', 'profile', 'edit_own'),
        ]
        for id, name, resource, action in permissions:
            cur.execute('''
                INSERT INTO permissions (id, name, resource, action)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            ''', (id, name, resource, action))
        print(f"  ✓ Permissions created ({len(permissions)})")
        
        # Create role_user_type mappings
        mappings = [
            (1, 1), (2, 1), (7, 1),  # HQ roles
            (3, 2), (4, 2),  # Store management
            (5, 3),  # Store staff
            (6, 4)   # Customer
        ]
        for role_id, user_type_id in mappings:
            cur.execute('''
                INSERT INTO role_user_type (role_id, user_type_id)
                VALUES (%s, %s)
                ON CONFLICT DO NOTHING
            ''', (role_id, user_type_id))
        print(f"  ✓ Role-user type mappings created")
        
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        raise RuntimeError(f"ACL creation failed: {e}")
    finally:
        conn.close()


def create_admin_user():
    """Create admin user with hashed password."""
    conn = db_validate.get_conn()
    try:
        cur = conn.cursor()
        
        # Hash password using bcrypt directly
        import bcrypt
        password_hash = bcrypt.hashpw('admin123'.encode(), bcrypt.gensalt()).decode()
        
        cur.execute('''
            INSERT INTO users (id, email, name, password_hash, user_type_id, role_id, is_active, phone_verified)
            VALUES (1, 'admin@loyaltysystem.uk', 'System Admin', %s, 1, 1, true, true)
            ON CONFLICT (id) DO NOTHING
        ''', (password_hash,))
        
        conn.commit()
        print(f"  ✓ Admin user created: admin@loyaltysystem.uk / admin123")
        return True
    except Exception as e:
        conn.rollback()
        raise RuntimeError(f"Admin creation failed: {e}")
    finally:
        conn.close()


def run():
    """Full system reset and admin recreation."""
    print_header("STEP 00: Full System Reset")
    
    # Step 1: Truncate all tables
    print("[*] Step 1: Truncating all database tables...")
    reset_database()
    
    # Step 2: Create ACL data
    print("\n[*] Step 2: Creating ACL data (user_types, roles, mappings)...")
    create_acl_data()
    
    # Step 3: Create admin user
    print("\n[*] Step 3: Creating admin user...")
    create_admin_user()
    
    # Step 4: Verify admin login
    print("\n[*] Step 4: Verifying admin can login...")
    time.sleep(1)
    login = api_post("/auth/login-password", json={
        "email": "admin@loyaltysystem.uk",
        "password": "admin123",
    })
    if login.status_code != 200:
        raise RuntimeError(f"Admin login failed after reset: {login.status_code} {login.text}")
    print(f"  ✓ Admin login successful")
    
    # Step 5: Verify clean state
    print("\n[*] Step 5: Validating clean database state...")
    
    print("    Checking ACL tables...")
    ok, count, msg = db_validate.validate_acl_tables()
    if not ok:
        raise RuntimeError(f"ACL validation failed: {msg}")
    print(f"    ✓ {msg}")
    
    print("    Checking operational tables empty...")
    ok, count, msg = db_validate.validate_tables_empty_except_audit()
    if not ok:
        raise RuntimeError(f"Table empty check failed: {msg}")
    print(f"    ✓ {msg}")
    
    print("\n[✓] STEP 00 complete - clean state achieved")
    print("    Admin: admin@loyaltysystem.uk / admin123")


if __name__ == "__main__":
    try:
        run()
        print("\n[SUCCESS] verify_seed_00_full_reset.py")
    except RuntimeError as e:
        print(f"\n[FAILED] {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        sys.exit(1)
