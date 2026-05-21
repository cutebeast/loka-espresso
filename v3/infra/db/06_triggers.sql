-- FNB Enterprise v3 — Triggers & Functions

-- ============================================================
-- Auto-updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at column
CREATE TRIGGER trg_admin_accounts_updated_at BEFORE UPDATE ON admin_accounts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_iam_roles_updated_at BEFORE UPDATE ON iam_roles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_iam_permissions_updated_at BEFORE UPDATE ON iam_permissions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_role_assignments_updated_at BEFORE UPDATE ON role_assignments
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_store_assignments_updated_at BEFORE UPDATE ON store_assignments
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_api_credentials_updated_at BEFORE UPDATE ON api_credentials
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_customer_addresses_updated_at BEFORE UPDATE ON customer_addresses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_customer_devices_updated_at BEFORE UPDATE ON customer_devices
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_stores_updated_at BEFORE UPDATE ON stores
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_store_operating_hours_updated_at BEFORE UPDATE ON store_operating_hours
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_store_configuration_updated_at BEFORE UPDATE ON store_configuration
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_dining_tables_updated_at BEFORE UPDATE ON dining_tables
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_table_status_updated_at BEFORE UPDATE ON table_status_snapshot
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_menu_categories_updated_at BEFORE UPDATE ON menu_categories
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_menu_items_updated_at BEFORE UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_inventory_categories_updated_at BEFORE UPDATE ON inventory_categories
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_inventory_items_updated_at BEFORE UPDATE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_customer_carts_updated_at BEFORE UPDATE ON customer_carts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_order_fulfillment_updated_at BEFORE UPDATE ON order_fulfillment
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_payment_methods_updated_at BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_wallets_updated_at BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_loyalty_tiers_updated_at BEFORE UPDATE ON loyalty_tiers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_loyalty_accounts_updated_at BEFORE UPDATE ON loyalty_accounts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_reward_catalog_updated_at BEFORE UPDATE ON reward_catalog
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_voucher_definitions_updated_at BEFORE UPDATE ON voucher_definitions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_marketing_campaigns_updated_at BEFORE UPDATE ON marketing_campaigns
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_campaign_analytics_updated_at BEFORE UPDATE ON campaign_analytics
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_content_blocks_updated_at BEFORE UPDATE ON content_blocks
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_splash_screens_updated_at BEFORE UPDATE ON splash_screens
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_survey_definitions_updated_at BEFORE UPDATE ON survey_definitions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_staff_profiles_updated_at BEFORE UPDATE ON staff_profiles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_platform_config_updated_at BEFORE UPDATE ON platform_config
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_scheduled_jobs_updated_at BEFORE UPDATE ON scheduled_jobs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_data_retention_policies_updated_at BEFORE UPDATE ON data_retention_policies
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- Order status change → insert into order_status_log
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_log_order_status_change()
RETURNS TRIGGER AS $$
DECLARE
    _actor_type VARCHAR(20);
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        _actor_type := COALESCE(current_setting('app.current_actor_type', true), 'system');
        IF _actor_type NOT IN ('customer','staff','system','webhook') THEN
            _actor_type := 'system';
        END IF;
        INSERT INTO order_status_log (order_id, from_status, to_status, actor_type, created_at)
        VALUES (NEW.id, OLD.status, NEW.status, _actor_type, now());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_status_log AFTER UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION trigger_log_order_status_change();

-- ============================================================
-- Table occupancy auto-update on dine-in orders
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_update_table_occupancy()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.dining_table_id IS NOT NULL THEN
        IF NEW.status IN ('pending', 'confirmed', 'preparing', 'ready_for_pickup') THEN
            UPDATE table_status_snapshot
            SET current_order_id = NEW.id,
                status = 'occupied',
                updated_at = now()
            WHERE table_id = NEW.dining_table_id;
        ELSIF NEW.status IN ('completed', 'cancelled_by_customer', 'cancelled_by_merchant') THEN
            UPDATE table_status_snapshot
            SET current_order_id = NULL,
                status = 'available',
                updated_at = now()
            WHERE table_id = NEW.dining_table_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_table_occupancy AFTER INSERT OR UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION trigger_update_table_occupancy();

-- ============================================================
-- Menu item search_vector auto-update
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_menu_item_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('simple', COALESCE(NEW.item_name, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'B') ||
        setweight(to_tsvector('simple', COALESCE(NEW.long_description, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_menu_items_search_vector BEFORE INSERT OR UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION trigger_menu_item_search_vector();
