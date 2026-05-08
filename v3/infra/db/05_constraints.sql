-- FNB Enterprise v3 — Deferred Constraints & Foreign Keys
-- Some FKs could not be created inline due to table creation order

-- ============================================================
-- Menu → Inventory deferred FKs
-- ============================================================
ALTER TABLE menu_item_recipes
    ADD CONSTRAINT fk_recipes_inventory_item
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE;

-- ============================================================
-- Orders → Staff deferred FKs
-- ============================================================
ALTER TABLE order_line_items
    ADD CONSTRAINT fk_order_lines_served_by
    FOREIGN KEY (served_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;

ALTER TABLE order_fulfillment
    ADD CONSTRAINT fk_fulfillment_assigned_staff
    FOREIGN KEY (assigned_staff_id) REFERENCES staff_profiles(id) ON DELETE SET NULL;

-- ============================================================
-- Table Status → Orders/Staff deferred FKs
-- ============================================================
ALTER TABLE table_status_snapshot
    ADD CONSTRAINT fk_table_status_order
    FOREIGN KEY (current_order_id) REFERENCES orders(id) ON DELETE SET NULL;

ALTER TABLE table_status_snapshot
    ADD CONSTRAINT fk_table_status_server
    FOREIGN KEY (server_staff_id) REFERENCES staff_profiles(id) ON DELETE SET NULL;

-- ============================================================
-- Content → Survey deferred FK
-- ============================================================
ALTER TABLE content_blocks
    ADD CONSTRAINT fk_content_blocks_survey
    FOREIGN KEY (survey_id) REFERENCES survey_definitions(id) ON DELETE SET NULL;

-- ============================================================
-- Payment → Payment Method deferred FK
-- ============================================================
ALTER TABLE payments
    ADD CONSTRAINT fk_payments_method
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL;

-- ============================================================
-- Checkout → Voucher/Reward deferred FKs
-- ============================================================
ALTER TABLE checkout_sessions
    ADD CONSTRAINT fk_checkout_voucher
    FOREIGN KEY (applied_voucher_id) REFERENCES voucher_definitions(id) ON DELETE SET NULL;

ALTER TABLE checkout_sessions
    ADD CONSTRAINT fk_checkout_reward
    FOREIGN KEY (applied_reward_id) REFERENCES reward_catalog(id) ON DELETE SET NULL;

-- ============================================================
-- Loyalty → Reward Catalog deferred FK
-- ============================================================
ALTER TABLE loyalty_points_ledger
    ADD CONSTRAINT fk_loyalty_ledger_reward_catalog
    FOREIGN KEY (reward_catalog_id) REFERENCES reward_catalog(id) ON DELETE SET NULL;

-- ============================================================
-- Notification → Campaign deferred FK
-- ============================================================
ALTER TABLE notification_messages
    ADD CONSTRAINT fk_notification_campaign
    FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns(id) ON DELETE SET NULL;

-- ============================================================
-- Additional CHECK constraints that reference other tables
-- (Most CHECK constraints are inline; add cross-table ones here)
-- ============================================================

-- Ensure store assignments don't overlap with deleted admins
-- (Enforced by partial indexes and application logic)

-- Ensure staff termination_date >= hire_date
ALTER TABLE staff_profiles
    ADD CONSTRAINT chk_staff_termination_after_hire
    CHECK (termination_date IS NULL OR termination_date >= hire_date);

-- Ensure purchase order actual_delivery >= expected_delivery
ALTER TABLE purchase_orders
    ADD CONSTRAINT chk_po_actual_after_expected
    CHECK (actual_delivery IS NULL OR actual_delivery >= expected_delivery);

-- Ensure survey response nps_score is valid when present
ALTER TABLE survey_responses
    ADD CONSTRAINT chk_survey_nps_range
    CHECK (nps_score IS NULL OR (nps_score >= 0 AND nps_score <= 10));

-- Ensure quiet hours are valid
ALTER TABLE notification_preferences
    ADD CONSTRAINT chk_quiet_hours
    CHECK (quiet_hours_start IS NULL OR quiet_hours_end IS NULL OR quiet_hours_start != quiet_hours_end);
