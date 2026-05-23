-- FNB Enterprise v3 — Indexes
-- 232+ indexes across all domains
-- Run after 03_tables.sql

-- ============================================================
-- IAM Indexes
-- ============================================================
CREATE INDEX idx_iam_principals_type ON iam_principals(principal_type);
CREATE INDEX idx_iam_principals_status ON iam_principals(status);
CREATE INDEX idx_iam_principals_deleted_at ON iam_principals(deleted_at) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_admin_accounts_email ON admin_accounts(email) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_admin_accounts_principal ON admin_accounts(principal_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_admin_accounts_is_active ON admin_accounts(is_active);
CREATE INDEX idx_admin_accounts_locked_until ON admin_accounts(locked_until);

CREATE UNIQUE INDEX idx_iam_roles_key ON iam_roles(role_key);
CREATE INDEX idx_iam_roles_scope ON iam_roles(scope_level);

CREATE UNIQUE INDEX idx_iam_permissions_key ON iam_permissions(permission_key);
CREATE INDEX idx_iam_permissions_resource_action ON iam_permissions(resource, action);

CREATE INDEX idx_role_permission_granted_by ON role_permission(granted_by);

CREATE INDEX idx_role_assignments_assignee ON role_assignments(assignee_id);
CREATE INDEX idx_role_assignments_role ON role_assignments(role_id);
CREATE INDEX idx_role_assignments_effective ON role_assignments(effective_from, effective_to);
CREATE INDEX idx_role_assignments_active ON role_assignments(is_active) WHERE is_active = true;

CREATE INDEX idx_store_assignments_assignee ON store_assignments(assignee_id);
CREATE INDEX idx_store_assignments_store ON store_assignments(store_id);
CREATE INDEX idx_store_assignments_primary ON store_assignments(assignee_id) WHERE is_primary = true;

CREATE INDEX idx_api_credentials_principal ON api_credentials(principal_id);
CREATE UNIQUE INDEX idx_api_credentials_key_hash ON api_credentials(api_key_hash);
CREATE INDEX idx_api_credentials_active ON api_credentials(is_active) WHERE is_active = true;

-- ============================================================
-- Customer Indexes
-- ============================================================
CREATE UNIQUE INDEX idx_customers_phone ON customers(phone_number) WHERE phone_number IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_customers_email ON customers(email_address) WHERE email_address IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_customers_referral_code ON customers(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX idx_customers_referred_by ON customers(referred_by_customer_id);
CREATE INDEX idx_customers_segment ON customers(customer_segment);
CREATE INDEX idx_customers_lifetime_value ON customers(lifetime_value DESC);
CREATE INDEX idx_customers_created_at ON customers(created_at DESC);
CREATE INDEX idx_customers_deleted_at ON customers(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_consents_customer ON customer_consents(customer_id);
CREATE INDEX idx_customer_consents_type ON customer_consents(consent_type);
CREATE INDEX idx_customer_consents_status ON customer_consents(status);
CREATE UNIQUE INDEX idx_customer_consents_unique ON customer_consents(customer_id, consent_type, consent_version);

CREATE INDEX idx_customer_addresses_customer ON customer_addresses(customer_id);
CREATE UNIQUE INDEX idx_customer_addresses_default ON customer_addresses(customer_id) WHERE is_default = true AND deleted_at IS NULL;
CREATE INDEX idx_customer_addresses_geo ON customer_addresses USING GIST (point(longitude::float, latitude::float));
CREATE INDEX idx_customer_addresses_country ON customer_addresses(country_code);

CREATE INDEX idx_customer_devices_customer ON customer_devices(customer_id);
CREATE UNIQUE INDEX idx_customer_devices_fingerprint ON customer_devices(device_fingerprint);
CREATE INDEX idx_customer_devices_active ON customer_devices(is_active) WHERE is_active = true;

-- ============================================================
-- Store Indexes
-- ============================================================
CREATE UNIQUE INDEX idx_stores_code ON stores(store_code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_stores_slug ON stores(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_stores_brand ON stores(brand_name);
CREATE INDEX idx_stores_active ON stores(is_active);
CREATE INDEX idx_stores_geo ON stores USING GIST (point(longitude::float, latitude::float));
CREATE INDEX idx_stores_country ON stores(country_code);

CREATE INDEX idx_store_hours_store_day ON store_operating_hours(store_id, day_of_week);
CREATE INDEX idx_store_hours_closed ON store_operating_hours(is_closed) WHERE is_closed = true;

CREATE INDEX idx_store_special_store_date ON store_special_hours(store_id, special_date);

CREATE INDEX idx_store_config_store_key ON store_configuration(store_id, config_key);

CREATE INDEX idx_dining_tables_store ON dining_tables(store_id);
CREATE UNIQUE INDEX idx_dining_tables_qr ON dining_tables(qr_code_token);
CREATE UNIQUE INDEX idx_dining_tables_store_number ON dining_tables(store_id, table_number) WHERE deleted_at IS NULL;

CREATE INDEX idx_table_status_store ON table_status_snapshot(store_id);
CREATE INDEX idx_table_status_order ON table_status_snapshot(current_order_id);
CREATE INDEX idx_table_status_staff ON table_status_snapshot(server_staff_id);

-- ============================================================
-- Menu Indexes
-- ============================================================
CREATE INDEX idx_menu_categories_store ON menu_categories(store_id);
CREATE INDEX idx_menu_categories_parent ON menu_categories(parent_category_id);
CREATE UNIQUE INDEX idx_menu_categories_store_slug ON menu_categories(store_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_menu_categories_display ON menu_categories(display_order);
CREATE INDEX idx_menu_categories_deleted ON menu_categories(deleted_at) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_menu_items_code ON menu_items(item_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_menu_items_store_category ON menu_items(store_id, category_id);
CREATE INDEX idx_menu_items_available ON menu_items(is_available) WHERE is_available = true AND deleted_at IS NULL;
CREATE INDEX idx_menu_items_featured ON menu_items(is_featured) WHERE is_featured = true AND deleted_at IS NULL;
CREATE INDEX idx_menu_items_search ON menu_items USING GIN (search_vector);
CREATE INDEX idx_menu_items_dietary ON menu_items USING GIN (dietary_tags);
CREATE INDEX idx_menu_items_deleted ON menu_items(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX idx_modifier_groups_item ON menu_modifier_groups(menu_item_id);
CREATE INDEX idx_modifier_groups_order ON menu_modifier_groups(display_order);

CREATE INDEX idx_modifier_options_group ON menu_modifier_options(modifier_group_id);
CREATE INDEX idx_modifier_options_default ON menu_modifier_options(is_default) WHERE is_default = true;

CREATE INDEX idx_menu_variants_parent ON menu_variants(parent_item_id);
CREATE UNIQUE INDEX idx_menu_variants_sku ON menu_variants(variant_sku);

CREATE INDEX idx_recipes_item ON menu_item_recipes(menu_item_id);
CREATE INDEX idx_recipes_variant ON menu_item_recipes(menu_variant_id);
CREATE INDEX idx_recipes_inventory ON menu_item_recipes(inventory_item_id);
CREATE UNIQUE INDEX idx_recipes_unique ON menu_item_recipes(menu_item_id, menu_variant_id, inventory_item_id);

-- ============================================================
-- Inventory Indexes
-- ============================================================
CREATE INDEX idx_inv_categories_store ON inventory_categories(store_id);
CREATE INDEX idx_inv_categories_parent ON inventory_categories(parent_category_id);
CREATE UNIQUE INDEX idx_inv_categories_store_slug ON inventory_categories(store_id, slug);

CREATE UNIQUE INDEX idx_inventory_code ON inventory_items(item_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_store_category ON inventory_items(store_id, category_id);
CREATE INDEX idx_inventory_store ON inventory_items(store_id);
CREATE INDEX idx_inventory_low_stock ON inventory_items(current_stock, reorder_level) WHERE current_stock <= reorder_level;
CREATE INDEX idx_inventory_supplier ON inventory_items(supplier_id);

CREATE INDEX idx_suppliers_store ON suppliers(store_id);
CREATE INDEX idx_suppliers_name ON suppliers(supplier_name);

CREATE INDEX idx_inv_movement_item ON inventory_movement_log(inventory_item_id);
CREATE INDEX idx_inv_movement_store ON inventory_movement_log(store_id);
CREATE INDEX idx_inv_movement_type ON inventory_movement_log(movement_type);
CREATE INDEX idx_inv_movement_reference ON inventory_movement_log(reference_type, reference_id);
CREATE INDEX idx_inv_movement_created ON inventory_movement_log USING BRIN (created_at);

CREATE INDEX idx_purchase_orders_store ON purchase_orders(store_id);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE UNIQUE INDEX idx_purchase_orders_number ON purchase_orders(po_number);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);

CREATE INDEX idx_po_lines_order ON purchase_order_lines(purchase_order_id);
CREATE INDEX idx_po_lines_item ON purchase_order_lines(inventory_item_id);

-- ============================================================
-- Cart & Checkout Indexes
-- ============================================================
CREATE UNIQUE INDEX idx_customer_carts_unique ON customer_carts(customer_id, store_id);
CREATE INDEX idx_customer_carts_activity ON customer_carts(last_activity_at);

CREATE INDEX idx_cart_lines_cart ON cart_line_items(cart_id);
CREATE INDEX idx_cart_lines_item ON cart_line_items(menu_item_id);

CREATE UNIQUE INDEX idx_checkout_token_hash ON checkout_sessions(token_hash);
CREATE INDEX idx_checkout_customer ON checkout_sessions(customer_id);
CREATE INDEX idx_checkout_expires ON checkout_sessions(expires_at) WHERE is_completed = false;

-- ============================================================
-- Order Indexes
-- ============================================================
CREATE UNIQUE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX idx_orders_store_status_created ON orders(store_id, status, created_at DESC);
CREATE INDEX idx_orders_table ON orders(dining_table_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_created ON orders USING BRIN (created_at);
CREATE INDEX idx_orders_channel ON orders(order_channel);

CREATE INDEX idx_order_lines_order ON order_line_items(order_id);
CREATE INDEX idx_order_lines_menu_item ON order_line_items(menu_item_id);
CREATE INDEX idx_order_lines_fulfillment ON order_line_items(fulfillment_status);

CREATE INDEX idx_order_status_log_order ON order_status_log(order_id);
CREATE INDEX idx_order_status_log_created ON order_status_log USING BRIN (created_at);

CREATE INDEX idx_order_adjustments_order ON order_adjustments(order_id);
CREATE INDEX idx_order_adjustments_type ON order_adjustments(adjustment_type);

-- ============================================================
-- Fulfillment Indexes
-- ============================================================
CREATE UNIQUE INDEX idx_fulfillment_order ON order_fulfillment(order_id);
CREATE INDEX idx_fulfillment_status ON order_fulfillment(status);
CREATE INDEX idx_fulfillment_provider ON order_fulfillment(delivery_provider);
CREATE INDEX idx_fulfillment_assigned ON order_fulfillment(assigned_staff_id);

-- ============================================================
-- Payment Indexes
-- ============================================================
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE UNIQUE INDEX idx_payments_idempotency ON payments(idempotency_key);
CREATE INDEX idx_payments_provider_tx ON payments(provider_transaction_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_settled ON payments(settled_at);
CREATE INDEX idx_payments_created ON payments USING BRIN (created_at);

CREATE INDEX idx_payment_events_payment ON payment_events(payment_id);
CREATE INDEX idx_payment_events_created ON payment_events USING BRIN (created_at);

CREATE INDEX idx_payment_methods_customer ON payment_methods(customer_id);
CREATE UNIQUE INDEX idx_payment_methods_default ON payment_methods(customer_id) WHERE is_default = true AND is_active = true AND deleted_at IS NULL;
CREATE INDEX idx_payment_methods_active ON payment_methods(is_active) WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX idx_refunds_payment ON refunds(payment_id);
CREATE INDEX idx_refunds_order ON refunds(order_id);
CREATE INDEX idx_refunds_status ON refunds(status);
CREATE INDEX idx_refunds_created ON refunds USING BRIN (created_at);

-- ============================================================
-- Wallet Indexes
-- ============================================================
CREATE UNIQUE INDEX idx_wallets_customer ON wallets(customer_id);
CREATE INDEX idx_wallets_frozen ON wallets(is_frozen);

CREATE INDEX idx_wallet_ledger_wallet ON wallet_ledger_entries(wallet_id);
CREATE INDEX idx_wallet_ledger_reference ON wallet_ledger_entries(reference_type, reference_id);
CREATE INDEX idx_wallet_ledger_created ON wallet_ledger_entries USING BRIN (created_at);

-- ============================================================
-- Loyalty Indexes
-- ============================================================
CREATE UNIQUE INDEX idx_loyalty_tiers_key ON loyalty_tiers(tier_key);
CREATE INDEX idx_loyalty_tiers_min_points ON loyalty_tiers(min_lifetime_points);
CREATE INDEX idx_loyalty_tiers_sort ON loyalty_tiers(sort_order);

CREATE UNIQUE INDEX idx_loyalty_accounts_customer ON loyalty_accounts(customer_id);
CREATE INDEX idx_loyalty_accounts_tier ON loyalty_accounts(current_tier_id);

CREATE INDEX idx_loyalty_ledger_account ON loyalty_points_ledger(loyalty_account_id);
CREATE INDEX idx_loyalty_ledger_customer ON loyalty_points_ledger(customer_id);
CREATE INDEX idx_loyalty_ledger_order ON loyalty_points_ledger(order_id);
CREATE INDEX idx_loyalty_ledger_event ON loyalty_points_ledger(event_type);
CREATE INDEX idx_loyalty_ledger_expires ON loyalty_points_ledger(expires_at);
CREATE INDEX idx_loyalty_ledger_created ON loyalty_points_ledger USING BRIN (created_at);

-- ============================================================
-- Rewards & Vouchers Indexes
-- ============================================================
CREATE UNIQUE INDEX idx_reward_catalog_key ON reward_catalog(reward_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_reward_catalog_store ON reward_catalog(store_id);
CREATE INDEX idx_reward_catalog_type ON reward_catalog(reward_type);
CREATE INDEX idx_reward_catalog_active ON reward_catalog(is_active) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX idx_reward_catalog_tier ON reward_catalog(minimum_tier_id);
CREATE INDEX idx_reward_catalog_deleted ON reward_catalog(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_rewards_customer ON customer_rewards(customer_id);
CREATE INDEX idx_customer_rewards_catalog ON customer_rewards(reward_catalog_id);
CREATE UNIQUE INDEX idx_customer_rewards_code ON customer_rewards(redemption_code);
CREATE INDEX idx_customer_rewards_status ON customer_rewards(status);
CREATE INDEX idx_customer_rewards_expires ON customer_rewards(expires_at);
CREATE INDEX idx_customer_rewards_order ON customer_rewards(order_id);

CREATE UNIQUE INDEX idx_voucher_definitions_code ON voucher_definitions(voucher_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_voucher_definitions_store ON voucher_definitions(store_id);
CREATE INDEX idx_voucher_definitions_type ON voucher_definitions(voucher_type);
CREATE INDEX idx_voucher_definitions_scope ON voucher_definitions(scope);
CREATE INDEX idx_voucher_definitions_valid ON voucher_definitions(valid_from, valid_until);
CREATE INDEX idx_voucher_definitions_active ON voucher_definitions(is_active) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX idx_voucher_definitions_deleted ON voucher_definitions(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_vouchers_customer ON customer_vouchers(customer_id);
CREATE INDEX idx_customer_vouchers_definition ON customer_vouchers(voucher_definition_id);
CREATE INDEX idx_customer_vouchers_status ON customer_vouchers(status);
CREATE INDEX idx_customer_vouchers_expires ON customer_vouchers(expires_at);
CREATE INDEX idx_customer_vouchers_order ON customer_vouchers(order_id);

-- ============================================================
-- Marketing Indexes
-- ============================================================
CREATE UNIQUE INDEX idx_campaigns_key ON marketing_campaigns(campaign_key);
CREATE INDEX idx_campaigns_store ON marketing_campaigns(store_id);
CREATE INDEX idx_campaigns_status ON marketing_campaigns(status);
CREATE INDEX idx_campaigns_scheduled ON marketing_campaigns(scheduled_at);
CREATE INDEX idx_campaigns_type ON marketing_campaigns(campaign_type);

CREATE UNIQUE INDEX idx_campaign_analytics_campaign ON campaign_analytics(campaign_id);

-- ============================================================
-- Content Indexes
-- ============================================================
-- NOTE: content_blocks table was intentionally removed and replaced with
-- separate tables (info_cards, product_cards, event_cards, etc.).
-- These indexes are kept commented for reference only.
-- CREATE UNIQUE INDEX idx_content_blocks_key ON content_blocks(block_key) WHERE deleted_at IS NULL;
-- CREATE INDEX idx_content_blocks_store ON content_blocks(store_id);
-- CREATE INDEX idx_content_blocks_type ON content_blocks(content_type);
-- CREATE INDEX idx_content_blocks_date ON content_blocks(start_date, end_date);
-- CREATE INDEX idx_content_blocks_active ON content_blocks(is_active) WHERE is_active = true;
-- CREATE INDEX idx_content_blocks_order ON content_blocks(display_order);

CREATE INDEX idx_splash_screens_store ON splash_screens(store_id);
CREATE INDEX idx_splash_screens_active ON splash_screens(is_active) WHERE is_active = true;
CREATE INDEX idx_splash_screens_date ON splash_screens(active_from, active_until);

-- ============================================================
-- Survey Indexes
-- ============================================================
CREATE UNIQUE INDEX idx_survey_definitions_key ON survey_definitions(survey_key);
CREATE INDEX idx_survey_definitions_active ON survey_definitions(is_active) WHERE is_active = true;

CREATE INDEX idx_survey_questions_survey ON survey_questions(survey_id);
CREATE INDEX idx_survey_questions_order ON survey_questions(display_order);

CREATE INDEX idx_survey_responses_survey ON survey_responses(survey_id);
CREATE INDEX idx_survey_responses_customer ON survey_responses(customer_id);
CREATE INDEX idx_survey_responses_nps ON survey_responses(nps_score);
CREATE INDEX idx_survey_responses_retention ON survey_responses(data_retention_until);
CREATE INDEX idx_survey_responses_created ON survey_responses USING BRIN (created_at);

CREATE INDEX idx_survey_answers_response ON survey_answers(response_id);
CREATE INDEX idx_survey_answers_question ON survey_answers(question_id);

-- ============================================================
-- Notification Indexes
-- ============================================================
CREATE INDEX idx_notification_messages_customer ON notification_messages(customer_id);
CREATE INDEX idx_notification_messages_type ON notification_messages(message_type);
CREATE INDEX idx_notification_messages_unread ON notification_messages(customer_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notification_messages_campaign ON notification_messages(campaign_id);
CREATE INDEX idx_notification_messages_expires ON notification_messages(expires_at);

CREATE INDEX idx_notification_delivery_message ON notification_delivery_log(message_id);
CREATE INDEX idx_notification_delivery_status ON notification_delivery_log(status);
CREATE INDEX idx_notification_delivery_channel ON notification_delivery_log(channel);

CREATE INDEX idx_notification_prefs_customer ON notification_preferences(customer_id);

-- ============================================================
-- Staff Indexes
-- ============================================================
CREATE INDEX idx_staff_profiles_store ON staff_profiles(store_id);
CREATE UNIQUE INDEX idx_staff_profiles_employee_id ON staff_profiles(employee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_staff_profiles_role ON staff_profiles(role);
CREATE INDEX idx_staff_profiles_active ON staff_profiles(is_active) WHERE is_active = true;
CREATE INDEX idx_staff_profiles_deleted ON staff_profiles(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX idx_staff_time_events_staff ON staff_time_events(staff_id);
CREATE INDEX idx_staff_time_events_store ON staff_time_events(store_id);
CREATE INDEX idx_staff_time_events_type ON staff_time_events(event_type);
CREATE INDEX idx_staff_time_events_timestamp ON staff_time_events(event_timestamp);

CREATE INDEX idx_tip_allocations_order ON tip_allocations(order_id);
CREATE INDEX idx_tip_allocations_staff ON tip_allocations(staff_id);

-- ============================================================
-- Platform Indexes
-- ============================================================
CREATE UNIQUE INDEX idx_platform_config_key ON platform_config(config_key);
CREATE INDEX idx_platform_config_env ON platform_config(environment);

CREATE INDEX idx_audit_log_principal ON audit_log(principal_id);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_log_store ON audit_log(store_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_severity ON audit_log(severity);
CREATE INDEX idx_audit_log_created ON audit_log USING BRIN (created_at);
CREATE INDEX idx_audit_log_request_id ON audit_log(request_id);

CREATE INDEX idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at);
CREATE INDEX idx_scheduled_jobs_active ON scheduled_jobs(is_active) WHERE is_active = true;

CREATE INDEX idx_health_metrics_name ON system_health_metrics(metric_name, bucket_start DESC);
CREATE INDEX idx_health_metrics_store ON system_health_metrics(store_id);
CREATE INDEX idx_health_metrics_dimensions ON system_health_metrics USING GIN (dimensions);

-- ============================================================
-- Reservation Indexes
-- ============================================================
CREATE INDEX idx_reservations_store ON reservations(store_id);
CREATE INDEX idx_reservations_customer ON reservations(customer_id);
CREATE INDEX idx_reservations_date ON reservations(reservation_date);
CREATE INDEX idx_reservations_table ON reservations(dining_table_id);
CREATE INDEX idx_reservations_status ON reservations(status);

-- ============================================================
-- Missing composite indexes (added during audit remediation)
-- ============================================================
CREATE INDEX idx_wallet_ledger_wallet_created ON wallet_ledger_entries(wallet_id, created_at DESC);
CREATE INDEX idx_loyalty_ledger_account_created ON loyalty_points_ledger(loyalty_account_id, created_at DESC);
CREATE INDEX idx_customer_vouchers_customer_status ON customer_vouchers(customer_id, status);
CREATE INDEX idx_order_lines_order_item ON order_line_items(order_id, menu_item_id);
CREATE INDEX idx_payments_order_status ON payments(order_id, status);
CREATE INDEX idx_menu_items_store_available ON menu_items(store_id, is_available) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_items_store_supplier ON inventory_items(store_id, supplier_id);
