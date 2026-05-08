-- FNB Enterprise v3 — Row Level Security Policies
-- Enable RLS on tenant-scoped and customer-scoped tables

-- ============================================================
-- Helper function to set app context
-- ============================================================
CREATE OR REPLACE FUNCTION set_app_context(key text, value text)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.' || key, value, false);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Customers
-- ============================================================
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_customer_isolation ON customers
    FOR ALL TO app_user
    USING (id = current_setting('app.current_customer_id', true)::bigint);

CREATE POLICY customers_admin_bypass ON customers
    FOR ALL TO admin_user
    USING (true);

-- ============================================================
-- Customer Addresses
-- ============================================================
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_addresses_isolation ON customer_addresses
    FOR ALL TO app_user
    USING (customer_id = current_setting('app.current_customer_id', true)::bigint);

CREATE POLICY customer_addresses_admin ON customer_addresses
    FOR ALL TO admin_user
    USING (true);

-- ============================================================
-- Customer Devices
-- ============================================================
ALTER TABLE customer_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_devices_isolation ON customer_devices
    FOR ALL TO app_user
    USING (customer_id = current_setting('app.current_customer_id', true)::bigint);

-- ============================================================
-- Orders
-- ============================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_customer_isolation ON orders
    FOR ALL TO app_user
    USING (customer_id = current_setting('app.current_customer_id', true)::bigint);

CREATE POLICY orders_store_staff ON orders
    FOR ALL TO admin_user
    USING (store_id = current_setting('app.current_store_id', true)::int);

-- ============================================================
-- Order Line Items
-- ============================================================
ALTER TABLE order_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_lines_customer ON order_line_items
    FOR ALL TO app_user
    USING (order_id IN (
        SELECT id FROM orders WHERE customer_id = current_setting('app.current_customer_id', true)::bigint
    ));

CREATE POLICY order_lines_staff ON order_line_items
    FOR ALL TO admin_user
    USING (order_id IN (
        SELECT id FROM orders WHERE store_id = current_setting('app.current_store_id', true)::int
    ));

-- ============================================================
-- Wallets
-- ============================================================
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallets_customer_isolation ON wallets
    FOR ALL TO app_user
    USING (customer_id = current_setting('app.current_customer_id', true)::bigint);

CREATE POLICY wallets_admin ON wallets
    FOR ALL TO admin_user
    USING (true);

-- ============================================================
-- Wallet Ledger Entries
-- ============================================================
ALTER TABLE wallet_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallet_ledger_customer ON wallet_ledger_entries
    FOR ALL TO app_user
    USING (wallet_id IN (
        SELECT id FROM wallets WHERE customer_id = current_setting('app.current_customer_id', true)::bigint
    ));

CREATE POLICY wallet_ledger_admin ON wallet_ledger_entries
    FOR ALL TO admin_user
    USING (true);

-- ============================================================
-- Payment Methods
-- ============================================================
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_methods_customer ON payment_methods
    FOR ALL TO app_user
    USING (customer_id = current_setting('app.current_customer_id', true)::bigint);

CREATE POLICY payment_methods_admin ON payment_methods
    FOR ALL TO admin_user
    USING (true);

-- ============================================================
-- Notification Messages
-- ============================================================
ALTER TABLE notification_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_messages_customer ON notification_messages
    FOR ALL TO app_user
    USING (customer_id = current_setting('app.current_customer_id', true)::bigint);

CREATE POLICY notification_messages_admin ON notification_messages
    FOR ALL TO admin_user
    USING (true);

-- ============================================================
-- Loyalty Accounts
-- ============================================================
ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY loyalty_accounts_customer ON loyalty_accounts
    FOR ALL TO app_user
    USING (customer_id = current_setting('app.current_customer_id', true)::bigint);

CREATE POLICY loyalty_accounts_admin ON loyalty_accounts
    FOR ALL TO admin_user
    USING (true);

-- ============================================================
-- Customer Rewards
-- ============================================================
ALTER TABLE customer_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_rewards_isolation ON customer_rewards
    FOR ALL TO app_user
    USING (customer_id = current_setting('app.current_customer_id', true)::bigint);

CREATE POLICY customer_rewards_admin ON customer_rewards
    FOR ALL TO admin_user
    USING (true);

-- ============================================================
-- Customer Vouchers
-- ============================================================
ALTER TABLE customer_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_vouchers_isolation ON customer_vouchers
    FOR ALL TO app_user
    USING (customer_id = current_setting('app.current_customer_id', true)::bigint);

CREATE POLICY customer_vouchers_admin ON customer_vouchers
    FOR ALL TO admin_user
    USING (true);

-- ============================================================
-- Customer Carts
-- ============================================================
ALTER TABLE customer_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_carts_isolation ON customer_carts
    FOR ALL TO app_user
    USING (customer_id = current_setting('app.current_customer_id', true)::bigint);

CREATE POLICY customer_carts_admin ON customer_carts
    FOR ALL TO admin_user
    USING (true);

-- ============================================================
-- Cart Line Items
-- ============================================================
ALTER TABLE cart_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY cart_lines_isolation ON cart_line_items
    FOR ALL TO app_user
    USING (cart_id IN (
        SELECT id FROM customer_carts WHERE customer_id = current_setting('app.current_customer_id', true)::bigint
    ));

CREATE POLICY cart_lines_admin ON cart_line_items
    FOR ALL TO admin_user
    USING (true);
