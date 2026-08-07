-- Dev-server cleanup: wipes transactional/test data, keeps master data
-- (stores, menu items/categories, bundles, inventory items, suppliers,
--  accounts, config, translations, loyalty/voucher/reward definitions).
-- Usage: psql -h localhost -p 13334 -U fnb_user -d fnb_enterprise_v3 -f scripts/clear_transactional_data.sql
-- A pg_dump backup before running is recommended.

BEGIN;

-- 1. Transactional/activity data (orders graph, customer activity, staff
--    activity, ops reports, inventory transactions, engagement, logs)
TRUNCATE
  order_modification_logs, order_status_log, order_adjustments, order_fulfillment,
  order_line_items, payment_events, refunds, tip_allocations, payments, orders,
  loyalty_points_ledger, loyalty_accounts, wallet_ledger_entries, wallet_topup_sessions, wallets,
  customer_vouchers, customer_rewards, customer_daily_checkins, referral_events,
  customer_consents, customer_devices, customer_addresses, payment_methods,
  cart_line_items, customer_carts,
  staff_shifts, staff_time_events, staff_tasks, pos_sessions, table_status_snapshot,
  hygiene_reports, wastage_reports, equipment_maintenance_logs,
  inventory_movement_log, inventory_stock, purchase_order_lines, purchase_orders,
  feedback_entries, survey_answers, survey_responses, event_rsvps,
  lucky_draw_spins, lucky_draw_tickets, campaign_analytics,
  notification_delivery_log, notification_messages, admin_notifications,
  audit_log, reservations, system_health_metrics
RESTART IDENTITY CASCADE;

-- 2. Dead references from kept tables into soft-deleted rows
UPDATE reward_catalog SET menu_item_id=NULL WHERE menu_item_id IN (SELECT id FROM menu_items WHERE deleted_at IS NOT NULL);
UPDATE voucher_definitions SET menu_item_id=NULL WHERE menu_item_id IN (SELECT id FROM menu_items WHERE deleted_at IS NOT NULL);
UPDATE voucher_definitions SET category_id=NULL WHERE category_id IN (SELECT id FROM menu_categories WHERE deleted_at IS NOT NULL);
UPDATE bundle_products SET category_id=NULL WHERE category_id IN (SELECT id FROM menu_categories WHERE deleted_at IS NOT NULL);
UPDATE bundle_products SET bundle_category_id=NULL WHERE bundle_category_id IN (SELECT id FROM bundle_categories WHERE deleted_at IS NOT NULL);
UPDATE bundle_products SET store_id=NULL WHERE store_id IN (SELECT id FROM stores WHERE deleted_at IS NOT NULL);
UPDATE menu_categories SET parent_category_id=NULL WHERE parent_category_id IN (SELECT id FROM menu_categories WHERE deleted_at IS NOT NULL);
UPDATE menu_items SET tax_category_id=NULL WHERE tax_category_id IN (SELECT id FROM tax_categories WHERE deleted_at IS NOT NULL);
UPDATE menu_items SET event_category_id=NULL WHERE event_category_id IN (SELECT id FROM event_categories WHERE deleted_at IS NOT NULL);
UPDATE inventory_items SET category_id=NULL WHERE category_id IN (SELECT id FROM inventory_categories WHERE deleted_at IS NOT NULL);
UPDATE inventory_items SET supplier_id=NULL WHERE supplier_id IN (SELECT id FROM suppliers WHERE deleted_at IS NOT NULL);
UPDATE inventory_categories SET parent_category_id=NULL WHERE parent_category_id IN (SELECT id FROM inventory_categories WHERE deleted_at IS NOT NULL);
UPDATE customers SET referred_by_customer_id=NULL WHERE referred_by_customer_id IN (SELECT id FROM customers WHERE deleted_at IS NOT NULL);
UPDATE marketing_campaigns SET voucher_definition_id=NULL WHERE voucher_definition_id IN (SELECT id FROM voucher_definitions WHERE deleted_at IS NOT NULL);
UPDATE marketing_campaigns SET reward_catalog_id=NULL WHERE reward_catalog_id IN (SELECT id FROM reward_catalog WHERE deleted_at IS NOT NULL);
UPDATE survey_definitions SET reward_voucher_id=NULL WHERE reward_voucher_id IN (SELECT id FROM voucher_definitions WHERE deleted_at IS NOT NULL);
UPDATE promo_banners SET voucher_id=NULL WHERE voucher_id IN (SELECT id FROM voucher_definitions WHERE deleted_at IS NOT NULL);
UPDATE promo_banners SET survey_id=NULL WHERE survey_id IN (SELECT id FROM survey_definitions WHERE deleted_at IS NOT NULL);
UPDATE platform_config SET modified_by=NULL WHERE modified_by IN (SELECT id FROM admin_accounts WHERE deleted_at IS NOT NULL);
UPDATE voucher_definitions SET created_by=NULL WHERE created_by IN (SELECT id FROM admin_accounts WHERE deleted_at IS NOT NULL);
UPDATE marketing_campaigns SET created_by=NULL WHERE created_by IN (SELECT id FROM admin_accounts WHERE deleted_at IS NOT NULL);
UPDATE survey_definitions SET created_by=NULL WHERE created_by IN (SELECT id FROM admin_accounts WHERE deleted_at IS NOT NULL);
UPDATE role_permission SET granted_by=NULL WHERE granted_by IN (SELECT id FROM admin_accounts WHERE deleted_at IS NOT NULL);
UPDATE role_assignments SET assigned_by=NULL WHERE assigned_by IN (SELECT id FROM admin_accounts WHERE deleted_at IS NOT NULL);
DELETE FROM lucky_draw_segments WHERE voucher_definition_id IN (SELECT id FROM voucher_definitions WHERE deleted_at IS NOT NULL);
DELETE FROM bundle_product_components WHERE menu_item_id IN (SELECT id FROM menu_items WHERE deleted_at IS NOT NULL);

-- 3. Hard-delete soft-deleted rows
DELETE FROM bundle_products WHERE deleted_at IS NOT NULL;
DELETE FROM menu_items WHERE deleted_at IS NOT NULL;
DELETE FROM menu_categories WHERE deleted_at IS NOT NULL;
DELETE FROM bundle_categories WHERE deleted_at IS NOT NULL;
DELETE FROM bundle_types WHERE deleted_at IS NOT NULL;
DELETE FROM event_categories WHERE deleted_at IS NOT NULL;
DELETE FROM inventory_items WHERE deleted_at IS NOT NULL;
DELETE FROM inventory_categories WHERE deleted_at IS NOT NULL;
DELETE FROM suppliers WHERE deleted_at IS NOT NULL;
DELETE FROM customers WHERE deleted_at IS NOT NULL;
DELETE FROM staff_profiles WHERE deleted_at IS NOT NULL;
DELETE FROM voucher_definitions WHERE deleted_at IS NOT NULL;
DELETE FROM reward_catalog WHERE deleted_at IS NOT NULL;
DELETE FROM allergens WHERE deleted_at IS NOT NULL;
DELETE FROM tax_categories WHERE deleted_at IS NOT NULL;
DELETE FROM survey_definitions WHERE deleted_at IS NOT NULL;
DELETE FROM splash_screens WHERE deleted_at IS NOT NULL;
DELETE FROM dining_tables WHERE deleted_at IS NOT NULL;
DELETE FROM stores WHERE deleted_at IS NOT NULL;
DELETE FROM admin_accounts WHERE deleted_at IS NOT NULL;

-- 4. Orphaned translations (rows pointing at records that no longer exist)
DELETE FROM translations t WHERE t.table_name='menu_items' AND t.record_id NOT IN (SELECT id FROM menu_items);
DELETE FROM translations t WHERE t.table_name='menu_categories' AND t.record_id NOT IN (SELECT id FROM menu_categories);
DELETE FROM translations t WHERE t.table_name='menu_modifier_options' AND t.record_id NOT IN (SELECT id FROM menu_modifier_options);
DELETE FROM translations t WHERE t.table_name='menu_modifier_groups' AND t.record_id NOT IN (SELECT id FROM menu_modifier_groups);
DELETE FROM translations t WHERE t.table_name='bundle_products' AND t.record_id NOT IN (SELECT id FROM bundle_products);
DELETE FROM translations t WHERE t.table_name='bundle_categories' AND t.record_id NOT IN (SELECT id FROM bundle_categories);
DELETE FROM translations t WHERE t.table_name='inventory_items' AND t.record_id NOT IN (SELECT id FROM inventory_items);
DELETE FROM translations t WHERE t.table_name='inventory_categories' AND t.record_id NOT IN (SELECT id FROM inventory_categories);
DELETE FROM translations t WHERE t.table_name='allergens' AND t.record_id NOT IN (SELECT id FROM allergens);
DELETE FROM translations t WHERE t.table_name='dietary_tags' AND t.record_id NOT IN (SELECT id FROM dietary_tags);
DELETE FROM translations t WHERE t.table_name='tax_categories' AND t.record_id NOT IN (SELECT id FROM tax_categories);
DELETE FROM translations t WHERE t.table_name='voucher_definitions' AND t.record_id NOT IN (SELECT id FROM voucher_definitions);
DELETE FROM translations t WHERE t.table_name='reward_catalog' AND t.record_id NOT IN (SELECT id FROM reward_catalog);
DELETE FROM translations t WHERE t.table_name='splash_screens' AND t.record_id NOT IN (SELECT id FROM splash_screens);
DELETE FROM translations t WHERE t.table_name='survey_definitions' AND t.record_id NOT IN (SELECT id FROM survey_definitions);
DELETE FROM translations t WHERE t.table_name='survey_questions' AND t.record_id NOT IN (SELECT id FROM survey_questions);
DELETE FROM translations t WHERE t.table_name='stores' AND t.record_id NOT IN (SELECT id FROM stores);
DELETE FROM translations t WHERE t.table_name='event_categories' AND t.record_id NOT IN (SELECT id FROM event_categories);
DELETE FROM translations t WHERE t.table_name='loyalty_tiers' AND t.record_id NOT IN (SELECT id FROM loyalty_tiers);
DELETE FROM translations t WHERE t.table_name='marketing_campaigns' AND t.record_id NOT IN (SELECT id FROM marketing_campaigns);

COMMIT;
