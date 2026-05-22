-- FNB Enterprise v3 — Minimal Seed Data
-- Run after all schema objects are created

-- ============================================================
-- 1. IAM Roles
-- ============================================================
INSERT INTO iam_roles (role_key, display_name, description, is_system, scope_level) VALUES
('system_admin', 'System Administrator', 'Full platform access', true, 'global'),
('regional_manager', 'Regional Manager', 'Multi-store oversight', true, 'region'),
('store_manager', 'Store Manager', 'Single store management', true, 'store'),
('shift_supervisor', 'Shift Supervisor', 'Supervises staff during shifts', true, 'store'),
('cashier', 'Cashier', 'POS and checkout operations', true, 'store'),
('server', 'Server', 'Table service and order taking', true, 'store'),
('kitchen_staff', 'Kitchen Staff', 'Food preparation and KDS', true, 'store'),
('delivery_coordinator', 'Delivery Coordinator', 'Manages delivery dispatch', true, 'store'),
('readonly_analyst', 'Read-Only Analyst', 'View-only access to reports', true, 'global');

-- ============================================================
-- 2. IAM Permissions (sample set — expand as needed)
-- ============================================================
INSERT INTO iam_permissions (permission_key, resource, action, description, is_dangerous) VALUES
('order.read', 'order', 'read', 'View orders', false),
('order.create', 'order', 'create', 'Create orders', false),
('order.update', 'order', 'update', 'Update order status', false),
('order.delete', 'order', 'delete', 'Cancel/delete orders', true),
('order.export', 'order', 'export', 'Export order data', false),
('inventory.read', 'inventory', 'read', 'View inventory', false),
('inventory.adjust', 'inventory', 'update', 'Adjust inventory levels', true),
('menu.read', 'menu', 'read', 'View menu', false),
('menu.update', 'menu', 'update', 'Edit menu items', false),
('staff.read', 'staff', 'read', 'View staff', false),
('staff.manage', 'staff', 'update', 'Manage staff profiles', true),
('customer.read', 'customer', 'read', 'View customers', false),
('customer.update', 'customer', 'update', 'Edit customers', true),
('report.read', 'report', 'read', 'View reports', false),
('report.export', 'report', 'export', 'Export reports', false),
('settings.read', 'settings', 'read', 'View settings', false),
('settings.update', 'settings', 'update', 'Update settings', true),
('payment.read', 'payment', 'read', 'View payments', false),
('payment.refund', 'payment', 'transfer', 'Process refunds', true),
('campaign.read', 'campaign', 'read', 'View campaigns', false),
('campaign.manage', 'campaign', 'create', 'Create/edit campaigns', false),
('audit.read', 'audit', 'read', 'View audit logs', false);

-- ============================================================
-- 3. Role Permissions (System Admin gets everything)
-- ============================================================
INSERT INTO role_permission (role_id, permission_id)
SELECT 1, id FROM iam_permissions;

-- Store Manager gets subset
INSERT INTO role_permission (role_id, permission_id)
SELECT 3, id FROM iam_permissions
WHERE permission_key IN (
    'order.read','order.create','order.update',
    'inventory.read','inventory.adjust',
    'menu.read','menu.update',
    'staff.read','staff.manage',
    'customer.read','customer.update',
    'report.read','report.export',
    'settings.read','settings.update',
    'payment.read','payment.refund',
    'campaign.read','campaign.manage'
);

-- Cashier gets minimal POS
INSERT INTO role_permission (role_id, permission_id)
SELECT 5, id FROM iam_permissions
WHERE permission_key IN ('order.read','order.create','order.update','menu.read','payment.read');

-- ============================================================
-- 4. Default Store (Brand HQ + first operational store)
-- ============================================================
INSERT INTO stores (
    store_code, store_name, slug, brand_name,
    address_line_1, city, state_province, postal_code, country_code,
    latitude, longitude, phone_number, email_address,
    timezone, currency_code,
    pickup_lead_minutes, delivery_radius_km, base_delivery_fee, minimum_order_amount,
    pos_integration_type, delivery_integration_type,
    is_active, is_accepting_orders
) VALUES (
    'HQ-001', 'Brand Headquarters', 'hq', 'LOKA Espresso',
    '123 Admin Street', 'Kuala Lumpur', 'Wilayah Persekutuan', '50000', 'MY',
    3.1390, 101.6869, '+60123456789', 'hq@lokaespresso.my',
    'Asia/Kuala_Lumpur', 'MYR',
    15, 10.00, 5.00, 15.00,
    'internal', 'internal',
    true, true
);

INSERT INTO stores (
    store_code, store_name, slug, brand_name,
    address_line_1, city, state_province, postal_code, country_code,
    latitude, longitude, phone_number, email_address,
    timezone, currency_code,
    pickup_lead_minutes, delivery_radius_km, base_delivery_fee, minimum_order_amount,
    pos_integration_type, delivery_integration_type,
    is_active, is_accepting_orders
) VALUES (
    'KLCC-01', 'LOKA Espresso KLCC', 'klcc', 'LOKA Espresso',
    'Suria KLCC, Lot G-12', 'Kuala Lumpur', 'Wilayah Persekutuan', '50088', 'MY',
    3.1588, 101.7116, '+60321631234', 'klcc@lokaespresso.my',
    'Asia/Kuala_Lumpur', 'MYR',
    15, 8.00, 5.00, 15.00,
    'internal', 'internal',
    true, true
);

-- ============================================================
-- 5. Store Operating Hours (KLCC)
-- ============================================================
INSERT INTO store_operating_hours (store_id, day_of_week, open_time, close_time, is_closed, is_24_hours, last_order_time) VALUES
(1, 0, '08:00', '22:00', false, false, '21:30'),
(1, 1, '08:00', '22:00', false, false, '21:30'),
(1, 2, '08:00', '22:00', false, false, '21:30'),
(1, 3, '08:00', '22:00', false, false, '21:30'),
(1, 4, '08:00', '22:00', false, false, '21:30'),
(1, 5, '08:00', '23:00', false, false, '22:30'),
(1, 6, '08:00', '23:00', false, false, '22:30'),
(2, 0, '07:00', '22:00', false, false, '21:30'),
(2, 1, '07:00', '22:00', false, false, '21:30'),
(2, 2, '07:00', '22:00', false, false, '21:30'),
(2, 3, '07:00', '22:00', false, false, '21:30'),
(2, 4, '07:00', '23:00', false, false, '22:30'),
(2, 5, '08:00', '23:00', false, false, '22:30'),
(2, 6, '08:00', '22:00', false, false, '21:30');

-- ============================================================
-- 6. Default Admin Account
-- ============================================================
-- Principal first
INSERT INTO iam_principals (principal_type, status) VALUES ('human', 'active');

-- Admin account
-- NOTE: password_hash below is a placeholder. Generate a real hash via:
--   python -c "from argon2 import PasswordHasher; print(PasswordHasher().hash('Admin123!'))"
-- Then update this seed or use the admin creation endpoint.
INSERT INTO admin_accounts (
    principal_id, email, display_name, password_hash, password_algorithm,
    is_active
) VALUES (
    1,
    'admin@loyaltysystem.uk',
    'System Administrator',
    '$argon2id$v=19$m=65536,t=3,p=4$k9JKDH0HXNBko+oVT+cKLw$Rh9YgM4rsyQ4ir2RGTMUG536h8Ihkmdk2Ncida5VyyE',
    'argon2id',
    true
);

-- Assign system_admin role
INSERT INTO role_assignments (assignee_id, role_id, effective_from, is_active) VALUES (1, 1, now(), true);

-- Assign to HQ store
INSERT INTO store_assignments (assignee_id, store_id, is_primary, can_approve_refunds, can_adjust_inventory, can_manage_staff)
VALUES (1, 1, true, true, true, true);

-- ============================================================
-- 7. Loyalty Tiers
-- ============================================================
INSERT INTO loyalty_tiers (tier_key, display_name, min_lifetime_points, points_multiplier, benefits_config, color_hex, sort_order, is_active) VALUES
('bronze', 'Bronze', 0, 1.00, '{"free_delivery_threshold": null, "birthday_bonus": 0, "priority_support": false}', '#CD7F32', 1, true),
('silver', 'Silver', 500, 1.25, '{"free_delivery_threshold": 50.00, "birthday_bonus": 50, "priority_support": false}', '#C0C0C0', 2, true),
('gold', 'Gold', 1500, 1.50, '{"free_delivery_threshold": 30.00, "birthday_bonus": 100, "priority_support": true}', '#FFD700', 3, true),
('platinum', 'Platinum', 5000, 2.00, '{"free_delivery_threshold": 0, "birthday_bonus": 200, "priority_support": true}', '#E5E4E2', 4, true);

-- ============================================================
-- 8. Platform Config
-- ============================================================
-- CRITICAL: OTP bypass and all runtime business rules are DB-driven.
-- They are managed via the admin API, NOT environment variables.
-- This ensures auditability and avoids false-negative security audits.
INSERT INTO platform_config (config_key, config_value, value_type, environment, is_sensitive, is_editable) VALUES
('app.name', '"LOKA Espresso"', 'string', 'all', false, false),
('app.currency', '"MYR"', 'string', 'all', false, false),
('app.support_phone', '"+60123456789"', 'string', 'all', false, true),
('app.support_email', '"support@lokaespresso.my"', 'string', 'all', false, true),
('otp.bypass_enabled', 'false', 'boolean', 'all', true, true),
('otp.bypass_code', '"000000"', 'string', 'all', true, true),
('otp.expiry_minutes', '5', 'integer', 'all', false, true),
('otp.max_send_per_hour', '5', 'integer', 'all', false, true),
('order.auto_confirm', 'true', 'boolean', 'all', false, true),
('order.preparation_time_minutes', '10', 'integer', 'all', false, true),
('loyalty.points_per_currency', '1', 'integer', 'all', false, true),
('loyalty.welcome_bonus', '50', 'integer', 'all', false, true),
('notifications.retention_days', '30', 'integer', 'all', false, true),
('upload.max_size_mb', '10', 'integer', 'all', false, true);

-- ============================================================
-- 9. Data Retention Policies
-- ============================================================
INSERT INTO data_retention_policies (table_name, retention_days, purge_strategy, archive_table) VALUES
('notification_messages', 90, 'delete', null),
('notification_delivery_log', 90, 'delete', null),
('audit_log', 2555, 'archive', 'audit_log_archive'),
('system_health_metrics', 90, 'delete', null),
('survey_responses', 1095, 'anonymize', null),
('order_status_log', 2555, 'archive', 'order_status_log_archive'),
('wallet_ledger_entries', 2555, 'archive', 'wallet_ledger_archive'),
('loyalty_points_ledger', 2555, 'archive', 'loyalty_ledger_archive');
