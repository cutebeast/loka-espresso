-- ============================================================
-- Scalability indexes for 30-outlet concurrent deployment
-- Generated: 2026-08-12
-- ============================================================

-- 1. Per-store payment status queries (admin order list, payment reports)
CREATE INDEX IF NOT EXISTS idx_orders_store_payment_status 
  ON orders(store_id, payment_status, created_at DESC);

-- 2. Per-store channel reporting (dashboard breakdown by channel)
CREATE INDEX IF NOT EXISTS idx_orders_store_channel_created 
  ON orders(store_id, order_channel, created_at DESC);

-- 3. Z-report: compute_session_report filters by provider
CREATE INDEX IF NOT EXISTS idx_payments_provider 
  ON payments(provider);

-- 4. Z-report: status IN ('captured','partially_refunded') + created_at range
CREATE INDEX IF NOT EXISTS idx_payments_status_created 
  ON payments(status, created_at);

-- 5. Customer notification feed (my notifications, ordered by recency)
CREATE INDEX IF NOT EXISTS idx_notification_messages_customer_created 
  ON notification_messages(customer_id, created_at DESC);

-- 6. Staff "my pending tasks" with status filter
CREATE INDEX IF NOT EXISTS idx_staff_tasks_staff_status_created 
  ON staff_tasks(staff_id, status, created_at DESC);

-- 7. Daily checkin deduplication (has customer checked in today?)
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_checkins_customer_date 
  ON customer_daily_checkins(customer_id, checkin_date);

-- 8. Equipment maintenance log history per equipment item
CREATE INDEX IF NOT EXISTS idx_equip_maint_log_equip_created 
  ON equipment_maintenance_logs(equipment_id, created_at DESC);

-- 9. Hygiene report listing per store, filtered by type
CREATE INDEX IF NOT EXISTS idx_hygiene_reports_store_type_created 
  ON hygiene_reports(store_id, report_type, created_at DESC);

-- 10. POS session listing per terminal (current session lookup)
CREATE INDEX IF NOT EXISTS idx_pos_sessions_terminal_opened 
  ON pos_sessions(terminal_id, opened_at DESC);

-- 11. Inventory movement history per item (chronological)
CREATE INDEX IF NOT EXISTS idx_inv_movement_item_created 
  ON inventory_movement_log(inventory_item_id, created_at DESC);

-- 12. Wastage report listing per store (admin review page)
CREATE INDEX IF NOT EXISTS idx_wastage_reports_store_created 
  ON wastage_reports(store_id, created_at DESC);

-- 13. Translation lookup: most heavily hit read path in the system
CREATE UNIQUE INDEX IF NOT EXISTS idx_translations_unique 
  ON translations(namespace, locale, translation_key, entity_type, entity_id);
