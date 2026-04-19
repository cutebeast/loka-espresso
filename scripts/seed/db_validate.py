"""
DB Validation module for seed scripts.
READ-ONLY — Only SELECT queries, NO inserts/updates/deletes.
Used to validate that seed operations actually persisted data to DB.
"""
import os
import sys

# Add backend to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'backend'))

# Use psycopg2 for sync PostgreSQL access (validation only)
import psycopg2

# DB connection config from .env
DB_CONFIG = {
    "host": "localhost",
    "port": 5433,
    "database": "fnb",
    "user": "fnb",
    "password": "Tmkh6HsdsOdzBEadYhJ6rafm6Tv-qlbMpuKfYtGyaQrR_MxGq1R317ctuz6zYF1K",
}


def get_conn():
    """Get a raw psycopg2 connection for validation queries."""
    return psycopg2.connect(**DB_CONFIG)


def validate_step01_registered_customers(expected_count):
    """Validate that customers were created in DB.
    Returns (success, actual_count, message)"""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, name, email, phone FROM users WHERE role_id = 6 LIMIT %s", (expected_count + 10,))
        rows = cur.fetchall()
        cur.close()
        actual = len(rows)
        if actual >= expected_count:
            return True, actual, f"Found {actual} customers (expected {expected_count})"
        return False, actual, f"Only {actual} customers found, expected {expected_count}"
    finally:
        conn.close()


def validate_step02_wallet_balances(customer_ids, min_amount=50.0):
    """Validate that wallets were topped up.
    Returns (success, count, message)"""
    conn = get_conn()
    try:
        cur = conn.cursor()
        # Wallets with balance >= min_amount
        cur.execute(
            "SELECT COUNT(*) FROM wallets WHERE user_id = ANY(%s) AND balance >= %s",
            (list(customer_ids), min_amount)
        )
        count = cur.fetchone()[0]
        cur.close()
        if count >= len(customer_ids) * 0.9:  # Allow 10% margin
            return True, count, f"{count}/{len(customer_ids)} wallets have balance >= {min_amount}"
        return False, count, f"Only {count}/{len(customer_ids)} wallets topped up"
    finally:
        conn.close()


def validate_step03_orders_placed(customer_ids):
    """Validate that orders were created.
    Returns (success, count, message)"""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM orders WHERE user_id = ANY(%s)",
            (list(customer_ids),)
        )
        count = cur.fetchone()[0]
        cur.close()
        if count > 0:
            return True, count, f"Found {count} orders in DB"
        return False, 0, "No orders found in DB"
    finally:
        conn.close()


def validate_step04_orders_completed(customer_ids):
    """Validate that orders were completed.
    Returns (success, count, message)"""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM orders WHERE user_id = ANY(%s) AND status = 'completed'",
            (list(customer_ids),)
        )
        count = cur.fetchone()[0]
        cur.close()
        if count > 0:
            return True, count, f"Found {count} completed orders in DB"
        return False, 0, "No completed orders found in DB"
    finally:
        conn.close()


def validate_step05_loyalty_points(customer_ids):
    """Validate that loyalty points were awarded.
    Returns (success, total_points, message)"""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COALESCE(SUM(points), 0) FROM loyalty_transactions WHERE user_id = ANY(%s) AND type = 'earn'",
            (list(customer_ids),)
        )
        total = cur.fetchone()[0]
        cur.close()
        if total > 0:
            return True, int(total), f"Total loyalty points earned: {total}"
        return False, 0, "No loyalty points found"
    finally:
        conn.close()


def validate_step06_vouchers_claimed(customer_ids):
    """Validate that vouchers were claimed.
    Returns (success, count, message)"""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM user_vouchers WHERE user_id = ANY(%s)",
            (list(customer_ids),)
        )
        count = cur.fetchone()[0]
        cur.close()
        if count > 0:
            return True, count, f"Found {count} user_vouchers in DB"
        return False, 0, "No vouchers claimed"
    finally:
        conn.close()


def validate_step07_rewards_redeemed(customer_ids):
    """Validate that rewards were redeemed.
    Returns (success, count, message)"""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM user_rewards WHERE user_id = ANY(%s)",
            (list(customer_ids),)
        )
        count = cur.fetchone()[0]
        cur.close()
        if count > 0:
            return True, count, f"Found {count} user_rewards in DB"
        return False, 0, "No rewards redeemed"
    finally:
        conn.close()


def validate_tier_distribution(customer_ids):
    """Get tier distribution from DB.
    Returns dict with tier counts."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT la.tier, COUNT(*)
               FROM loyalty_accounts la
               WHERE la.user_id = ANY(%s)
               GROUP BY la.tier""",
            (list(customer_ids),)
        )
        rows = cur.fetchall()
        cur.close()
        dist = {t: c for t, c in rows}
        return dist
    finally:
        conn.close()


# ── Base Seed Validations ───────────────────────────────────────────────────────


def validate_acl_tables():
    """Validate ACL lookup tables are intact.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        checks = [
            ("user_types", 4),
            ("roles", 7),
            ("permissions", 23),
            ("role_user_type", 7),
        ]
        for table, expected in checks:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            actual = cur.fetchone()[0]
            if actual != expected:
                return False, actual, f"{table}: expected {expected}, got {actual}"
        cur.close()
        return True, 4, "4 user_types, 7 roles, 23 permissions, 7 role_user_type — all intact"
    finally:
        conn.close()


def validate_tables_empty():
    """Validate all operational tables are empty.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        tables = [
            "stores", "staff", "user_store_access",
            "menu_categories", "menu_items", "customization_options",
            "inventory_categories", "inventory_items", "inventory_movements",
            "orders", "order_items", "order_status_history", "payments", "cart_items",
            "wallets", "wallet_transactions",
            "loyalty_accounts", "loyalty_transactions", "loyalty_tiers",
            "user_vouchers", "vouchers", "user_rewards", "rewards",
            "promo_banners", "surveys", "survey_questions", "survey_responses",
            "marketing_campaigns", "notification_broadcasts", "notifications",
            "feedback", "favorites", "referrals",
            "staff_shifts",
            "splash_content",
        ]
        non_empty = []
        for table in tables:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            count = cur.fetchone()[0]
            if count > 0:
                non_empty.append(f"{table}({count})")
        cur.close()
        if non_empty:
            return False, len(non_empty), f"Non-empty tables: {', '.join(non_empty)}"
        return True, 0, f"All {len(tables)} operational tables are empty"
    finally:
        conn.close()


def validate_tables_empty_except_audit():
    """Validate all operational tables are empty EXCEPT audit_log.
    audit_log is excluded because API calls (like admin login) create audit entries.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        tables = [
            "stores", "staff", "user_store_access",
            "menu_categories", "menu_items", "customization_options",
            "inventory_categories", "inventory_items", "inventory_movements",
            "orders", "order_items", "order_status_history", "payments", "cart_items",
            "wallets", "wallet_transactions",
            "loyalty_accounts", "loyalty_transactions", "loyalty_tiers",
            "user_vouchers", "vouchers", "user_rewards", "rewards",
            "promo_banners", "surveys", "survey_questions", "survey_responses",
            "marketing_campaigns", "notification_broadcasts", "notifications",
            "feedback", "favorites", "referrals",
            "staff_shifts",
            "splash_content",
        ]
        non_empty = []
        for table in tables:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            count = cur.fetchone()[0]
            if count > 0:
                non_empty.append(f"{table}({count})")
        cur.close()
        if non_empty:
            return False, len(non_empty), f"Non-empty tables: {', '.join(non_empty)}"
        return True, 0, f"All {len(tables)} operational tables are empty (audit_log ignored)"
    finally:
        conn.close()


def validate_hq_store():
    """Validate HQ store exists with id=0.
    Returns (success, id_or_none, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, name, slug FROM stores WHERE id = 0")
        row = cur.fetchone()
        cur.close()
        if row:
            return True, row[0], f"HQ store exists: id={row[0]}, name={row[1]}, slug={row[2]}"
        return False, None, "HQ store (id=0) not found"
    finally:
        conn.close()


def validate_stores(expected_count):
    """Validate stores exist (excluding HQ).
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, name, slug, is_active FROM stores WHERE id != 0 ORDER BY id")
        rows = cur.fetchall()
        cur.close()
        if len(rows) >= expected_count:
            return True, len(rows), f"{len(rows)} physical stores (expected {expected_count})"
        return False, len(rows), f"Only {len(rows)} stores found, expected {expected_count}"
    finally:
        conn.close()


def validate_store_tables(store_id, min_count):
    """Validate store has at least min_count tables.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM store_tables WHERE store_id = %s AND is_active = true", (store_id,))
        count = cur.fetchone()[0]
        cur.close()
        if count >= min_count:
            return True, count, f"Store {store_id} has {count} active tables"
        return False, count, f"Store {store_id} has only {count} tables (expected >={min_count})"
    finally:
        conn.close()


def validate_menu_categories(store_id, expected_count):
    """Validate menu categories for a store.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM menu_categories WHERE store_id = %s",
            (store_id,)
        )
        count = cur.fetchone()[0]
        cur.close()
        if count >= expected_count:
            return True, count, f"Store {store_id}: {count} menu categories"
        return False, count, f"Store {store_id}: only {count} menu categories (expected >={expected_count})"
    finally:
        conn.close()


def validate_menu_items(store_id, expected_count):
    """Validate menu items for a store.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM menu_items WHERE store_id = %s AND deleted_at IS NULL",
            (store_id,)
        )
        count = cur.fetchone()[0]
        cur.close()
        if count >= expected_count:
            return True, count, f"Store {store_id}: {count} menu items"
        return False, count, f"Store {store_id}: only {count} menu items (expected >={expected_count})"
    finally:
        conn.close()


def validate_inventory_categories(store_id, expected_count):
    """Validate inventory categories for a store.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM inventory_categories WHERE store_id = %s AND is_active = true",
            (store_id,)
        )
        count = cur.fetchone()[0]
        cur.close()
        if count >= expected_count:
            return True, count, f"Store {store_id}: {count} inventory categories"
        return False, count, f"Store {store_id}: only {count} inventory categories (expected >={expected_count})"
    finally:
        conn.close()


def validate_inventory_items(store_id, expected_count):
    """Validate inventory items for a store.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM inventory_items WHERE store_id = %s AND is_active = true",
            (store_id,)
        )
        count = cur.fetchone()[0]
        cur.close()
        if count >= expected_count:
            return True, count, f"Store {store_id}: {count} inventory items"
        return False, count, f"Store {store_id}: only {count} inventory items (expected >={expected_count})"
    finally:
        conn.close()


def validate_staff_users():
    """Validate all staff users exist.
    Returns (success, total, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM users WHERE role_id != 6 AND id != 1")
        count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM staff WHERE is_active = true")
        staff_count = cur.fetchone()[0]
        cur.close()
        if count > 0 and staff_count > 0:
            return True, count, f"{count} non-customer users, {staff_count} active staff records"
        return False, count, f"No staff users found"
    finally:
        conn.close()


def validate_loyalty_tiers(expected_count):
    """Validate loyalty tiers exist.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM loyalty_tiers")
        count = cur.fetchone()[0]
        cur.close()
        if count >= expected_count:
            return True, count, f"{count} loyalty tiers"
        return False, count, f"Only {count} loyalty tiers (expected >={expected_count})"
    finally:
        conn.close()


def validate_config_keys(keys_dict):
    """Validate config key-value pairs exist.
    keys_dict: dict of {key: expected_value}
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        ok_keys = []
        for key, expected in keys_dict.items():
            cur.execute("SELECT value FROM app_config WHERE key = %s", (key,))
            row = cur.fetchone()
            if row:
                ok_keys.append(f"{key}={row[0]}")
            else:
                return False, 0, f"Config key '{key}' not found"
        cur.close()
        return True, len(ok_keys), f"Config OK: {', '.join(ok_keys)}"
    finally:
        conn.close()


def validate_user_store_access(store_id, expected_user_count):
    """Validate user_store_access entries for a store.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM user_store_access WHERE store_id = %s",
            (store_id,)
        )
        count = cur.fetchone()[0]
        cur.close()
        if count >= expected_user_count:
            return True, count, f"Store {store_id}: {count} user_store_access entries"
        return False, count, f"Store {store_id}: only {count} access entries (expected >={expected_user_count})"
    finally:
        conn.close()


def validate_rewards(expected_count):
    """Validate rewards exist in DB.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM rewards WHERE deleted_at IS NULL")
        count = cur.fetchone()[0]
        cur.close()
        if count >= expected_count:
            return True, count, f"{count} rewards in DB (expected {expected_count})"
        return False, count, f"Only {count} rewards found, expected {expected_count}"
    finally:
        conn.close()


def validate_reward_active_counts(active_count, inactive_count):
    """Validate active and inactive reward counts.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM rewards WHERE is_active = true AND deleted_at IS NULL")
        actual_active = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM rewards WHERE is_active = false AND deleted_at IS NULL")
        actual_inactive = cur.fetchone()[0]
        cur.close()
        if actual_active == active_count and actual_inactive == inactive_count:
            return True, actual_active + actual_inactive, f"{actual_active} active, {actual_inactive} inactive rewards"
        return False, actual_active + actual_inactive, f"Expected {active_count} active/{inactive_count} inactive, got {actual_active}/{actual_inactive}"
    finally:
        conn.close()


def validate_vouchers(expected_count):
    """Validate vouchers exist in DB.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM vouchers WHERE deleted_at IS NULL")
        count = cur.fetchone()[0]
        cur.close()
        if count >= expected_count:
            return True, count, f"{count} vouchers in DB (expected {expected_count})"
        return False, count, f"Only {count} vouchers found, expected {expected_count}"
    finally:
        conn.close()


def validate_voucher_expiry_counts(future_count, past_count):
    """Validate voucher expiry counts (valid_until future vs past).
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM vouchers WHERE deleted_at IS NULL AND valid_until > NOW()")
        actual_future = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM vouchers WHERE deleted_at IS NULL AND valid_until < NOW()")
        actual_past = cur.fetchone()[0]
        cur.close()
        if actual_future == future_count and actual_past == past_count:
            return True, actual_future + actual_past, f"{actual_future} future-valid, {actual_past} expired vouchers"
        return False, actual_future + actual_past, f"Expected {future_count} future/{past_count} past, got {actual_future}/{actual_past}"
    finally:
        conn.close()


def validate_surveys(expected_count):
    """Validate surveys exist in DB.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM surveys")
        count = cur.fetchone()[0]
        cur.close()
        if count >= expected_count:
            return True, count, f"{count} surveys in DB (expected {expected_count})"
        return False, count, f"Only {count} surveys found, expected {expected_count}"
    finally:
        conn.close()


def validate_survey_questions(expected_count):
    """Validate survey questions exist in DB.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM survey_questions")
        count = cur.fetchone()[0]
        cur.close()
        if count >= expected_count:
            return True, count, f"{count} survey questions in DB (expected {expected_count})"
        return False, count, f"Only {count} survey questions found, expected {expected_count}"
    finally:
        conn.close()


def validate_promo_banners(expected_count):
    """Validate promo banners exist in DB.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM promo_banners")
        count = cur.fetchone()[0]
        cur.close()
        if count >= expected_count:
            return True, count, f"{count} promo banners in DB (expected {expected_count})"
        return False, count, f"Only {count} promo banners found, expected {expected_count}"
    finally:
        conn.close()


def validate_customer_reset():
    """Validate customer-only reset: 0 customers, 0 orders, 0 customer wallets.
    Admin wallet (user_id=1) is excluded from the check.
    Returns (success, count, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM users WHERE role_id = 6")
        customers = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM orders")
        orders = cur.fetchone()[0]
        # Only count customer wallets (role_id=6 users), exclude admin's wallet
        cur.execute("SELECT COUNT(*) FROM wallets w JOIN users u ON w.user_id = u.id WHERE u.role_id = 6")
        wallets = cur.fetchone()[0]
        cur.close()
        if customers == 0 and orders == 0 and wallets == 0:
            return True, 0, f"0 customers, 0 orders, 0 customer wallets — clean state confirmed"
        return False, customers, f"customers={customers}, orders={orders}, customer_wallets={wallets} — expected all 0"
    finally:
        conn.close()


def validate_loyalty_points_strict(customer_ids):
    """Strict validation: verify loyalty_accounts.total_points_earned matches
    the sum of FLOOR((subtotal - discount + delivery_fee) * earn_rate * tier_multiplier) for each customer.
    earn_rate comes from app_config.loyalty_points_per_rmse (default 1).
    tier_multiplier comes from loyalty_tiers.points_multiplier (default 1.0).
    Returns (success, message)."""
    conn = get_conn()
    try:
        cur = conn.cursor()

        cfg_result = cur.execute("SELECT value FROM app_config WHERE key = 'loyalty_points_per_rmse'")
        cfg_row = cur.fetchone()
        earn_rate = int(cfg_row[0]) if cfg_row else 1

        cur.execute("""
            SELECT la.user_id, la.total_points_earned, la.points_balance, la.tier,
                   COALESCE(lt.points_multiplier, 1.0) as multiplier
            FROM loyalty_accounts la
            LEFT JOIN loyalty_tiers lt ON LOWER(la.tier) = LOWER(lt.name)
            WHERE la.user_id = ANY(%s)
        """, (list(customer_ids),))
        tier_data = {r[0]: (r[1], r[2], r[3], r[4]) for r in cur.fetchall()}

        cur.execute("""
            SELECT o.user_id,
                   COALESCE(SUM(FLOOR((o.subtotal - o.discount + o.delivery_fee) * %s * COALESCE(lt.points_multiplier, 1.0))), 0) as expected_points,
                   COUNT(o.id) as order_count
            FROM orders o
            LEFT JOIN loyalty_accounts la ON o.user_id = la.user_id
            LEFT JOIN loyalty_tiers lt ON LOWER(la.tier) = LOWER(lt.name)
            WHERE o.user_id = ANY(%s) AND o.status = 'completed'
            GROUP BY o.user_id
        """, (earn_rate, list(customer_ids),))
        expected = {r[0]: (int(r[1]), r[2]) for r in cur.fetchall()}

        mismatches = []
        for uid in expected:
            exp_earned, order_count = expected[uid]
            act_earned, _, tier, multiplier = tier_data.get(uid, (0, 0, "bronze", 1.0))
            if abs(exp_earned - act_earned) > 0:
                mismatches.append(f"user_id={uid}: tier={tier}({multiplier}x) expected={exp_earned} got={act_earned} diff={exp_earned - act_earned}")

        if mismatches:
            return False, f"Loyalty mismatch for {len(mismatches)}/{len(expected)} customers: {mismatches[:3]}..."
        return True, f"All {len(expected)} customers: loyalty = FLOOR((subtotal - discount + delivery_fee) * earn_rate * tier_multiplier)"
    finally:
        conn.close()

