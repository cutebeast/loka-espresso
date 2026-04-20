-- FNB Super-App: Clean re-seed with proper ACL data
-- Password for all users: admin123

-- ================================================================
-- 1. USERS
-- ================================================================

-- HQ Management (user_type_id=1)
INSERT INTO users (id, name, email, phone, password_hash, user_type_id, role_id, is_active, created_at) VALUES
(1,  'Admin User',      'admin@loyaltysystem.uk', '+60123456789', '$2b$12$LPWI9m7dyhUC1RRCOVBeCuJlXJETGzEOrkLFx5sLrP42SQcyQZjI6', 1, 1, true, NOW()),
(2,  'ZUS Store Owner', 'store.owner@zus.my',    '+60123456790', '$2b$12$LPWI9m7dyhUC1RRCOVBeCuJlXJETGzEOrkLFx5sLrP42SQcyQZjI6', 1, 2, true, NOW()),
(3,  'HQ Staff',        'staff@zus.com',          '',              '$2b$12$LPWI9m7dyhUC1RRCOVBeCuJlXJETGzEOrkLFx5sLrP42SQcyQZjI6', 1, 7, true, NOW());

-- Store Management (user_type_id=2)
INSERT INTO users (id, name, email, phone, password_hash, user_type_id, role_id, is_active, created_at) VALUES
(4,  'Raj Manager',    'raj.manager@zus.my',  '+60123456800', '$2b$12$LPWI9m7dyhUC1RRCOVBeCuJlXJETGzEOrkLFx5sLrP42SQcyQZjI6', 2, 3, true, NOW()),
(5,  'Siti Rahman',    'siti@zus.my',          '+60123456801', '$2b$12$LPWI9m7dyhUC1RRCOVBeCuJlXJETGzEOrkLFx5sLrP42SQcyQZjI6', 2, 4, true, NOW()),
(6,  'Lisa Chen',      'lisa.manager@zus.my', '+60123456802', '$2b$12$LPWI9m7dyhUC1RRCOVBeCuJlXJETGzEOrkLFx5sLrP42SQcyQZjI6', 2, 3, true, NOW()),
(7,  'Chin Fuh Taur',  'williamcft@gmail.com', '+60123456803', '$2b$12$LPWI9m7dyhUC1RRCOVBeCuJlXJETGzEOrkLFx5sLrP42SQcyQZjI6', 2, 3, true, NOW());

-- Store Staff (user_type_id=3)
INSERT INTO users (id, name, email, phone, password_hash, user_type_id, role_id, is_active, created_at) VALUES
(8,  'Priya Nair',     'priya.dashboard@zus.my', '+60123456222', '$2b$12$LPWI9m7dyhUC1RRCOVBeCuJlXJETGzEOrkLFx5sLrP42SQcyQZjI6', 3, 5, true, NOW()),
(9,  'Wei Jie',        'weijie@zus.my',          '+60123456223', '$2b$12$LPWI9m7dyhUC1RRCOVBeCuJlXJETGzEOrkLFx5sLrP42SQcyQZjI6', 3, 5, true, NOW()),
(10, 'John Barista',   'john@test.com',          '+60123456224', '$2b$12$LPWI9m7dyhUC1RRCOVBeCuJlXJETGzEOrkLFx5sLrP42SQcyQZjI6', 3, 5, true, NOW());

-- Customers (user_type_id=4, role_id=6)
INSERT INTO users (id, name, email, phone, password_hash, user_type_id, role_id, is_active, created_at) VALUES
(11, 'Ahmad Taher',   'ahmad.taher@email.my', '+60111111001', '$2b$12$LPWI9m7dyhUC1RRCOVBeCuJlXJETGzEOrkLFx5sLrP42SQcyQZjI6', 4, 6, true, NOW()),
(12, 'Sarah Wong',    'sarah.wong@email.my',  '+60122222002', '$2b$12$LPWI9m7dyhUC1RRCOVBeCuJlXJETGzEOrkLFx5sLrP42SQcyQZjI6', 4, 6, true, NOW()),
(13, 'Raj Kumar',     'raj.kumar@email.my',   '+60133333003', '$2b$12$LPWI9m7dyhUC1RRCOVBeCuJlXJETGzEOrkLFx5sLrP42SQcyQZjI6', 4, 6, true, NOW()),
(14, 'Mei Lim',       'mei.lim@email.my',     '+60144444004', '$2b$12$LPWI9m7dyhUC1RRCOVBeCuJlXJETGzEOrkLFx5sLrP42SQcyQZjI6', 4, 6, true, NOW()),
(15, 'Aida Rahman',   'aida.rahman@email.my', '+60155555005', '$2b$12$LPWI9m7dyhUC1RRCOVBeCuJlXJETGzEOrkLFx5sLrP42SQcyQZjI6', 4, 6, true, NOW());

SELECT setval('users_id_seq', 20, true);

-- ================================================================
-- 2. STAFF (legacy staff table for clock-in/PIN)
-- ================================================================
INSERT INTO staff (id, store_id, user_id, name, email, phone, role, pin_code, is_active, created_at) VALUES
-- ZUS KLCC (store 1)
(1, 1, 7,  'Chin Fuh Taur', 'williamcft@gmail.com',   '+60123456803', 'manager',           '1234', true, NOW()),
(2, 1, 8,  'Priya Nair',    'priya.dashboard@zus.my', '+60123456222', 'barista',           '1234', true, NOW()),
(3, 1, 9,  'Wei Jie',       'weijie@zus.my',          '+60123456223', 'cashier',           '1234', true, NOW()),
(4, 1, 10, 'John Barista',  'john@test.com',          '+60123456224', 'barista',           '1234', true, NOW()),
-- ZUS KLCC Park (store 2)
(5, 2, 5,  'Siti Rahman',   'siti@zus.my',            '+60123456801', 'assistant_manager', '1234', true, NOW()),
(6, 2, NULL,'Kumar D.',      NULL,                      NULL,          'delivery',          '1234', true, NOW()),
-- ZUS Cheras (store 3)
(7, 3, 6,  'Lisa Chen',     'lisa.manager@zus.my',    '+60123456802', 'manager',           '1234', true, NOW()),
(8, 3, NULL,'Farah Lee',     NULL,                      NULL,          'barista',           '1234', true, NOW());

SELECT setval('staff_id_seq', 20, true);

-- ================================================================
-- 3. user_store_access
-- ================================================================
-- Admin (id=1) & Brand Owner (id=2) = GLOBAL access, no records needed
-- HQ Staff (id=3) = HQ, no records needed

-- Raj Manager (id=4): manages KLCC + Cheras
INSERT INTO user_store_access (user_id, store_id, assigned_at, assigned_by, is_primary) VALUES
(4, 1, NOW(), 1, true),
(4, 3, NOW(), 1, false);

-- Siti Rahman (id=5): Asst Manager at KLCC Park
INSERT INTO user_store_access (user_id, store_id, assigned_at, assigned_by, is_primary) VALUES
(5, 2, NOW(), 1, true);

-- Lisa Chen (id=6): Manager at Cheras
INSERT INTO user_store_access (user_id, store_id, assigned_at, assigned_by, is_primary) VALUES
(6, 3, NOW(), 1, true);

-- Chin Fuh Taur (id=7): Manager at KLCC
INSERT INTO user_store_access (user_id, store_id, assigned_at, assigned_by, is_primary) VALUES
(7, 1, NOW(), 1, true);

-- Priya Nair (id=8): Staff at KLCC
INSERT INTO user_store_access (user_id, store_id, assigned_at, assigned_by, is_primary) VALUES
(8, 1, NOW(), 1, true);

-- Wei Jie (id=9): Staff at KLCC
INSERT INTO user_store_access (user_id, store_id, assigned_at, assigned_by, is_primary) VALUES
(9, 1, NOW(), 1, true);

-- John Barista (id=10): Staff at KLCC
INSERT INTO user_store_access (user_id, store_id, assigned_at, assigned_by, is_primary) VALUES
(10, 1, NOW(), 1, true);
