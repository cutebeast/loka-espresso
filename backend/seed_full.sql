-- ⚠️ DEPRECATED: This seed file uses the old `role` string column.
-- The database schema has been updated to use `role_id` and `user_type_id` integer FKs.
-- Please use the Python seed scripts in /scripts/seed/ instead:
--   - verify_master_base_seed.py (steps 00-08)
--   - verify_master_customer_seed.py (steps 09-18)
-- Last updated: 2026-04-18

BEGIN;

TRUNCATE TABLE
  otp_sessions,
  device_tokens,
  referrals,
  notifications,
  favorites,
  inventory_items,
  app_config,
  splash_content,
  promo_banners,
  notification_broadcasts,
  marketing_campaigns,
  audit_log,
  feedback,
  pin_attempts,
  staff_shifts,
  staff,
  user_vouchers,
  vouchers,
  user_rewards,
  rewards,
  loyalty_transactions,
  loyalty_tiers,
  loyalty_accounts,
  wallet_transactions,
  wallets,
  payments,
  order_status_history,
  order_items,
  orders,
  user_addresses,
  payment_methods,
  customization_options,
  menu_items,
  menu_categories,
  store_tables,
  stores,
  users
CASCADE;

INSERT INTO users (id, phone, email, name, password_hash, role, avatar_url, referral_code, referred_by, is_active, phone_verified, created_at, updated_at) VALUES
(1,  '+60123456789', 'admin@loyaltysystem.uk',  'Admin User',       '$2b$12$.vuUeOcljqTq42tH9L2HsO5.EA0ue32xKs/a2ifdkfF8j9/sPHuLK', 'admin',       NULL, NULL,                 NULL, TRUE, FALSE, NOW() - interval '90 days', NOW()),
(2,  '+60177889900', 'ahmad.taher@email.my',    'Ahmad Taher',      '$2b$12$.LYq8V8n2BhYxlMDNdlLTureVoG.Nd9DfFh9nZrBAS7jDfQcj.gu.', 'customer',   NULL, 'REF-AHMAD01',         NULL, TRUE, TRUE,  NOW() - interval '60 days', NOW()),
(3,  '+60199887766', 'sarah.wong@email.my',     'Sarah Wong',       '$2b$12$.LYq8V8n2BhYxlMDNdlLTureVoG.Nd9DfFh9nZrBAS7jDfQcj.gu.', 'customer',   NULL, 'REF-SARAH02',         NULL, TRUE, TRUE,  NOW() - interval '55 days', NOW()),
(4,  '+60155667788', 'raj.kumar@email.my',      'Raj Kumar',        '$2b$12$.LYq8V8n2BhYxlMDNdlLTureVoG.Nd9DfFh9nZrBAS7jDfQcj.gu.', 'customer',   NULL, 'REF-RAJ03',           NULL, TRUE, TRUE,  NOW() - interval '50 days', NOW()),
(5,  '+60133445566', 'mei.lim@email.my',        'Mei Lim',          '$2b$12$.LYq8V8n2BhYxlMDNdlLTureVoG.Nd9DfFh9nZrBAS7jDfQcj.gu.', 'customer',   NULL, 'REF-MEI04',           NULL, TRUE, TRUE,  NOW() - interval '45 days', NOW()),
(6,  '+60112233445', 'aida.rahman@email.my',    'Aida Rahman',      '$2b$12$.LYq8V8n2BhYxlMDNdlLTureVoG.Nd9DfFh9nZrBAS7jDfQcj.gu.', 'customer',   NULL, 'REF-AIDA05',          2,    TRUE, TRUE,  NOW() - interval '30 days', NOW()),
(7,  '+60188990011', 'store.owner@zus.my',      'ZUS Store Owner',  '$2b$12$.vuUeOcljqTq42tH9L2HsO5.EA0ue32xKs/a2ifdkfF8j9/sPHuLK', 'store_owner', NULL, NULL,                 NULL, TRUE, FALSE, NOW() - interval '85 days', NOW()),
(8,  '+60123456666', 'siti@zus.my',             'Siti Rahman',      '$2b$12$.vuUeOcljqTq42tH9L2HsO5.EA0ue32xKs/a2ifdkfF8j9/sPHuLK', 'customer',   NULL, NULL,                 NULL, TRUE, FALSE, NOW() - interval '75 days', NOW()),
(9,  '+60123456777', 'priya.dashboard@zus.my',  'Priya Nair',       '$2b$12$.vuUeOcljqTq42tH9L2HsO5.EA0ue32xKs/a2ifdkfF8j9/sPHuLK', 'customer',   NULL, NULL,                 NULL, TRUE, FALSE, NOW() - interval '70 days', NOW()),
(10, '+60123456888', 'raj.manager@zus.my',      'Raj Manager',      '$2b$12$.vuUeOcljqTq42tH9L2HsO5.EA0ue32xKs/a2ifdkfF8j9/sPHuLK', 'customer',   NULL, NULL,                 NULL, TRUE, FALSE, NOW() - interval '65 days', NOW()),
(11, '+60123456999', 'lisa.manager@zus.my',     'Lisa Chen',        '$2b$12$.vuUeOcljqTq42tH9L2HsO5.EA0ue32xKs/a2ifdkfF8j9/sPHuLK', 'customer',   NULL, NULL,                 NULL, TRUE, FALSE, NOW() - interval '60 days', NOW());

SELECT setval('users_id_seq', 11);

INSERT INTO stores (id, name, slug, address, lat, lng, phone, image_url, opening_hours, pickup_lead_minutes, delivery_radius_km, is_active, created_at, updated_at) VALUES
(1, 'ZUS Coffee KLCC', 'zus-klcc',
   'Lot 238, Level 2, Suria KLCC, 50088 Kuala Lumpur, Malaysia',
   3.1584800, 101.7123600, '+60323818888',
   '/images/stores/zus-klcc.jpg',
   '{"mon":"08:00-22:00","tue":"08:00-22:00","wed":"08:00-22:00","thu":"08:00-22:00","fri":"08:00-22:30","sat":"09:00-22:30","sun":"09:00-22:00"}'::json,
   15, 5.00, TRUE, NOW() - interval '80 days', NOW()),
(2, 'ZUS Coffee KLCC Park', 'klcc-park',
   'Ground Floor, KLCC Park Pavilion, Jalan Ampang, 50450 Kuala Lumpur',
   3.1567000, 101.7149000, '+60323819999',
   '/images/stores/zus-klcc-park.jpg',
   '{"mon":"08:00-21:00","tue":"08:00-21:00","wed":"08:00-21:00","thu":"08:00-21:00","fri":"08:00-22:00","sat":"09:00-22:00","sun":"09:00-21:00"}'::json,
   15, 3.50, TRUE, NOW() - interval '75 days', NOW()),
(3, 'ZUS Coffee Cheras', 'zus-cheras',
   'No 12, Jalan Cheras, 56000 Kuala Lumpur',
   3.1000000, 101.7500000, '+603-88881234',
   '/images/stores/zus-cheras.jpg',
   '{"mon":"08:00-22:00","tue":"08:00-22:00","wed":"08:00-22:00","thu":"08:00-22:00","fri":"08:00-22:30","sat":"09:00-22:30","sun":"09:00-22:00"}'::json,
   15, 5.00, TRUE, NOW() - interval '70 days', NOW());

SELECT setval('stores_id_seq', 3);

INSERT INTO store_tables (id, store_id, table_number, qr_code_url, capacity, is_active, is_occupied) VALUES
(1,  1, 'A1', '/qr/zus-klcc/A1',  6, TRUE, FALSE),
(2,  1, 'A2', '/qr/zus-klcc/A2',  2, TRUE, FALSE),
(3,  1, 'A3', '/qr/zus-klcc/A3',  4, TRUE, FALSE),
(4,  1, 'B1', '/qr/zus-klcc/B1',  4, TRUE, FALSE),
(5,  1, 'B2', '/qr/zus-klcc/B2',  6, FALSE, FALSE),
(6,  1, 'B3', '/qr/zus-klcc/B3',  6, TRUE, FALSE),
(7,  1, 'C1', '/qr/zus-klcc/C1',  8, TRUE, FALSE),
(8,  1, 'C2', '/qr/zus-klcc/C2',  8, TRUE, FALSE),
(9,  1, 'C3', '/qr/zus-klcc/C3', 10, TRUE, FALSE),
(10, 1, 'P1', '/qr/zus-klcc/P1',  2, TRUE, FALSE),
(11, 2, 'A1', '/qr/klcc-park/A1', 2, TRUE, FALSE),
(12, 2, 'A2', '/qr/klcc-park/A2', 2, TRUE, FALSE),
(13, 2, 'A3', '/qr/klcc-park/A3', 4, TRUE, FALSE),
(14, 2, 'B1', '/qr/klcc-park/B1', 4, TRUE, FALSE),
(15, 2, 'B2', '/qr/klcc-park/B2', 6, TRUE, FALSE),
(16, 2, 'B3', '/qr/klcc-park/B3', 6, TRUE, FALSE),
(17, 2, 'C1', '/qr/klcc-park/C1', 8, TRUE, FALSE),
(18, 2, 'C2', '/qr/klcc-park/C2',10, TRUE, FALSE),
(19, 2, 'P1', '/qr/klcc-park/P1', 2, TRUE, FALSE),
(20, 2, 'P2', '/qr/klcc-park/P2', 2, TRUE, FALSE),
(21, 3, 'C1', '/qr/zus-cheras/C1',4, TRUE, FALSE),
(22, 3, 'C2', '/qr/zus-cheras/C2',4, TRUE, FALSE),
(23, 3, 'C3', '/qr/zus-cheras/C3',6, TRUE, FALSE),
(24, 3, 'C4', '/qr/zus-cheras/C4',2, TRUE, FALSE),
(25, 3, 'C5', '/qr/zus-cheras/C5',8, TRUE, FALSE);

SELECT setval('store_tables_id_seq', 25);

INSERT INTO menu_categories (id, store_id, name, slug, display_order, is_active) VALUES
(1, 1, 'Coffee',      'coffee',      1, TRUE),
(2, 1, 'Tea',          'tea',         2, TRUE),
(3, 1, 'Pastries',     'pastries',    3, TRUE),
(4, 1, 'Specialties',  'specialties', 4, TRUE),
(5, 3, 'Coffee',       'coffee',      1, TRUE),
(6, 3, 'Non-Coffee',   'non-coffee',  2, TRUE),
(7, 2, 'Coffee',       'coffee',      1, TRUE),
(8, 2, 'Non-Coffee',   'non-coffee',  2, TRUE),
(9, 2, 'Food',         'food',        3, TRUE);

SELECT setval('menu_categories_id_seq', 9);

INSERT INTO menu_items (id, store_id, category_id, name, description, base_price, image_url, customization_options, is_available, display_order, popularity) VALUES
(1,  1, 1, 'Americano',              'Bold double-shot espresso with hot water',                           8.90,  '/images/menu/americano.jpg',  '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"milk":[{"label":"None","price":0},{"label":"Oat Milk","price":1.00},{"label":"Almond Milk","price":1.50}],"sugar":[{"label":"No Sugar","price":0},{"label":"Less Sugar","price":0},{"label":"Normal","price":0}]}'::json, TRUE, 1,  95),
(2,  1, 1, 'Cappuccino',             'Velvety espresso with steamed milk foam',                            10.90, '/images/menu/cappuccino.jpg', '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"milk":[{"label":"Whole Milk","price":0},{"label":"Oat Milk","price":1.00},{"label":"Almond Milk","price":1.50}],"extra_shot":[{"label":"No","price":0},{"label":"Extra Shot","price":1.50}]}'::json, TRUE, 2,  120),
(3,  1, 1, 'Caramel Latte',          'Smooth latte with rich caramel syrup',                               12.90, '/images/menu/caramel-latte.jpg', '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"milk":[{"label":"Whole Milk","price":0},{"label":"Oat Milk","price":1.00}],"whip_cream":[{"label":"Yes","price":0},{"label":"No","price":0}]}'::json, TRUE, 3,  150),
(4,  1, 1, 'Espresso',               'Pure double-shot espresso',                                          8.90,  '/images/menu/espresso.jpg',    '{"size":[{"label":"Single","price":0},{"label":"Double","price":1.50}]}'::json, TRUE, 4,  70),
(5,  1, 1, 'Mocha',                  'Rich chocolate espresso blend',                                      13.90, '/images/menu/mocha.jpg',       '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"milk":[{"label":"Whole Milk","price":0},{"label":"Oat Milk","price":1.00}],"whip_cream":[{"label":"Yes","price":0},{"label":"No","price":0}]}'::json, TRUE, 5,  90),
(6,  1, 1, 'Flat White',             'Silky microfoam over double ristretto',                              11.90, '/images/menu/flat-white.jpg',  '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"milk":[{"label":"Whole Milk","price":0},{"label":"Oat Milk","price":1.00}]}'::json, TRUE, 6,  85),
(7,  1, 2, 'Teh Tarik',              'Classic Malaysian pulled tea',                                       8.90,  '/images/menu/teh-tarik.jpg',   '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.00}],"sugar":[{"label":"Less Sugar","price":0},{"label":"Normal","price":0},{"label":"Extra Sweet","price":0}]}'::json, TRUE, 7,  110),
(8,  1, 2, 'Matcha Latte',           'Premium Japanese matcha with steamed milk',                          12.90, '/images/menu/matcha-latte.jpg','{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"milk":[{"label":"Whole Milk","price":0},{"label":"Oat Milk","price":1.00}],"sweetness":[{"label":"25%","price":0},{"label":"50%","price":0},{"label":"100%","price":0}]}'::json, TRUE, 8,  100),
(9,  1, 2, 'Cham (Coffee + Tea)',     'Best of both worlds - coffee meets tea',                             9.90,  '/images/menu/cham.jpg',       '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.00}]}'::json, TRUE, 9,  65),
(10, 1, 2, 'Iced Lemon Tea',         'Refreshing iced tea with fresh lemon',                               8.90,  '/images/menu/lemon-tea.jpg',   '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.00}],"sugar":[{"label":"Less Sugar","price":0},{"label":"Normal","price":0}]}'::json, TRUE, 10, 55),
(11, 1, 3, 'Croissant',              'Buttery flaky French pastry',                                        9.90,  '/images/menu/croissant.jpg',   NULL, TRUE, 11, 80),
(12, 1, 3, 'Kaya Toast',             'Traditional Malaysian coconut jam toast',                            7.90,  '/images/menu/kaya-toast.jpg',  NULL, TRUE, 12, 90),
(13, 1, 3, 'Chocolate Muffin',       'Rich double chocolate muffin',                                      10.90, '/images/menu/choco-muffin.jpg', NULL, TRUE, 13, 60),
(14, 1, 3, 'Cheese Danish',          'Creamy cheese Danish pastry',                                        11.90, '/images/menu/cheese-danish.jpg', NULL, TRUE, 14, 45),
(15, 1, 4, 'Affogato',               'Vanilla ice cream drowned in espresso',                              14.90, '/images/menu/affogato.jpg',    '{"ice_cream":[{"label":"Vanilla","price":0},{"label":"Hazelnut","price":1.00}]}'::json, TRUE, 15, 75),
(16, 1, 4, 'Gula Melaka Latte',      'Local palm sugar latte with a twist',                                13.90, '/images/menu/gula-melaka.jpg', '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"milk":[{"label":"Whole Milk","price":0},{"label":"Coconut Milk","price":1.50}]}'::json, TRUE, 16, 105),
(17, 1, 4, 'Durian Cappuccino',      'Seasonal Musang King durian espresso',                               16.90, '/images/menu/durian-capp.jpg', '{"size":[{"label":"Regular","price":0},{"label":"Large","price":2.00}]}'::json, TRUE, 17, 40),
(18, 1, 4, 'Kopi O Kosong',          'Traditional black coffee, no sugar',                                  8.90,  '/images/menu/kopi-o.jpg',      '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.00}]}'::json, TRUE, 18, 70),
(19, 1, 1, 'Vanilla Latte',          'Smooth vanilla-flavoured espresso latte',                            12.90, '/images/menu/vanilla-latte.jpg','{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"milk":[{"label":"Whole Milk","price":0},{"label":"Oat Milk","price":1.00}],"whip_cream":[{"label":"Yes","price":0},{"label":"No","price":0}]}'::json, TRUE, 19, 88),
(20, 3, 5, 'Americano',              'Bold double-shot espresso with hot water',                           9.90,  '/images/menu/americano.jpg',   '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}]}'::json, TRUE, 1, 60),
(21, 3, 5, 'Latte',                  'Smooth espresso with steamed milk',                                  12.90, '/images/menu/latte.jpg',       '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"milk":[{"label":"Whole Milk","price":0},{"label":"Oat Milk","price":1.00}]}'::json, TRUE, 2, 75),
(22, 3, 6, 'Matcha Latte',           'Premium Japanese matcha with steamed milk',                          14.90, '/images/menu/matcha-latte.jpg','{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"sweetness":[{"label":"25%","price":0},{"label":"50%","price":0},{"label":"100%","price":0}]}'::json, TRUE, 3, 55),
(23, 2, 7, 'Espresso',               'Pure double-shot espresso',                                          8.90,  '/images/menu/espresso.jpg',    '{"size":[{"label":"Single","price":0},{"label":"Double","price":1.50}]}'::json, TRUE, 1, 65),
(24, 2, 7, 'Americano',              'Bold double-shot espresso with hot water',                           9.90,  '/images/menu/americano.jpg',   '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"milk":[{"label":"None","price":0},{"label":"Oat Milk","price":1.00}]}'::json, TRUE, 2, 70),
(25, 2, 7, 'Cappuccino',             'Velvety espresso with steamed milk foam',                            11.90, '/images/menu/cappuccino.jpg',  '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"milk":[{"label":"Whole Milk","price":0},{"label":"Oat Milk","price":1.00}],"extra_shot":[{"label":"No","price":0},{"label":"Extra Shot","price":1.50}]}'::json, TRUE, 3, 90),
(26, 2, 7, 'Latte',                  'Smooth espresso with steamed milk',                                  12.90, '/images/menu/latte.jpg',       '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"milk":[{"label":"Whole Milk","price":0},{"label":"Oat Milk","price":1.00}]}'::json, TRUE, 4, 85),
(27, 2, 7, 'Mocha',                  'Rich chocolate espresso blend',                                      13.90, '/images/menu/mocha.jpg',       '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"milk":[{"label":"Whole Milk","price":0},{"label":"Oat Milk","price":1.00}],"whip_cream":[{"label":"Yes","price":0},{"label":"No","price":0}]}'::json, TRUE, 5, 80),
(28, 2, 8, 'Teh Tarik',              'Classic Malaysian pulled tea',                                       8.90,  '/images/menu/teh-tarik.jpg',   '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.00}],"sugar":[{"label":"Less Sugar","price":0},{"label":"Normal","price":0}]}'::json, TRUE, 6, 95),
(29, 2, 8, 'Matcha Latte',           'Premium Japanese matcha with steamed milk',                          14.90, '/images/menu/matcha-latte.jpg','{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"milk":[{"label":"Whole Milk","price":0},{"label":"Oat Milk","price":1.00}]}'::json, TRUE, 7, 70),
(30, 2, 8, 'Iced Chocolate',         'Rich and creamy iced chocolate drink',                               11.90, '/images/menu/iced-choco.jpg',  '{"size":[{"label":"Regular","price":0},{"label":"Large","price":1.50}],"whip_cream":[{"label":"Yes","price":0},{"label":"No","price":0}]}'::json, TRUE, 8, 60),
(31, 2, 9, 'Croissant',              'Buttery flaky French pastry',                                        9.90,  '/images/menu/croissant.jpg',   NULL, TRUE, 9,  50),
(32, 2, 9, 'Kaya Toast',             'Traditional Malaysian coconut jam toast',                            7.90,  '/images/menu/kaya-toast.jpg',  NULL, TRUE, 10, 65),
(33, 2, 9, 'Chicken Sandwich',       'Grilled chicken with fresh vegetables',                              13.90, '/images/menu/chicken-sandwich.jpg', NULL, TRUE, 11, 45);

SELECT setval('menu_items_id_seq', 33);

INSERT INTO customization_options (id, menu_item_id, name, price_adjustment, is_active, display_order) VALUES
(1,   1, 'Extra Shot',            1.50, TRUE, 1),
(2,   1, 'Oat Milk',              2.00, TRUE, 2),
(3,   1, 'Less Ice',              0.00, TRUE, 0),
(4,   2, 'Extra Shot',            1.50, TRUE, 1),
(5,   2, 'Whipped Cream',         1.00, TRUE, 2),
(6,   3, 'Extra Syrup',           1.00, TRUE, 1),
(7,   3, 'Whipped Cream',         0.50, TRUE, 2),
(8,   3, 'Extra Caramel Drizzle', 1.00, TRUE, 3),
(9,   4, 'Extra Shot',            1.50, TRUE, 1),
(10,  5, 'Whipped Cream',         0.50, TRUE, 1),
(11,  5, 'Extra Shot',            1.50, TRUE, 2),
(12,  6, 'Oat Milk',              2.00, TRUE, 1),
(13,  6, 'Extra Shot',            1.50, TRUE, 2),
(14,  7, 'Less Sugar',            0.00, TRUE, 1),
(15,  7, 'Extra Sugar',           0.00, TRUE, 2),
(16,  7, 'Less Ice',              0.00, TRUE, 3),
(17,  8, 'Oat Milk',              2.00, TRUE, 1),
(18,  8, 'Less Sugar',            0.00, TRUE, 2),
(19,  8, 'Extra Scoop Matcha',    1.00, TRUE, 3),
(20,  9, 'Less Sugar',            0.00, TRUE, 1),
(21,  9, 'Less Ice',              0.00, TRUE, 2),
(22, 10, 'Less Sugar',            0.00, TRUE, 1),
(23, 10, 'Extra Lemon',           0.50, TRUE, 2),
(24, 10, 'Less Ice',              0.00, TRUE, 3),
(25, 15, 'Hazelnut Ice Cream',    1.00, TRUE, 1),
(26, 15, 'Extra Shot',            1.50, TRUE, 2),
(27, 16, 'Oat Milk',              2.00, TRUE, 1),
(28, 16, 'Extra Gula Melaka',     1.00, TRUE, 2),
(29, 17, 'Extra Durian Paste',    2.00, TRUE, 1),
(30, 18, 'Sugar',                 0.00, TRUE, 1),
(31, 18, 'Evaporated Milk',       0.50, TRUE, 2),
(32, 19, 'Whipped Cream',         0.50, TRUE, 1),
(33, 19, 'Oat Milk',              2.00, TRUE, 2),
(34, 19, 'Extra Vanilla Syrup',   1.00, TRUE, 3),
(35, 20, 'Oat Milk',              2.00, TRUE, 1),
(36, 20, 'Less Ice',              0.00, TRUE, 2),
(37, 20, 'Extra Shot',            1.50, TRUE, 3),
(38, 21, 'Oat Milk',              2.00, TRUE, 1),
(39, 21, 'Extra Shot',            1.50, TRUE, 2),
(40, 21, 'Vanilla Syrup',         1.00, TRUE, 3),
(41, 22, 'Oat Milk',              2.00, TRUE, 1),
(42, 22, 'Less Sugar',            0.00, TRUE, 2),
(43, 22, 'Extra Matcha',          1.00, TRUE, 3),
(44, 23, 'Extra Shot',            1.50, TRUE, 1),
(45, 24, 'Oat Milk',              2.00, TRUE, 1),
(46, 24, 'Less Ice',              0.00, TRUE, 2),
(47, 25, 'Whipped Cream',         0.50, TRUE, 1),
(48, 25, 'Extra Shot',            1.50, TRUE, 2),
(49, 25, 'Oat Milk',              2.00, TRUE, 3),
(50, 26, 'Oat Milk',              2.00, TRUE, 1),
(51, 26, 'Extra Shot',            1.50, TRUE, 2),
(52, 26, 'Vanilla Syrup',         1.00, TRUE, 3),
(53, 27, 'Whipped Cream',         0.50, TRUE, 1),
(54, 27, 'Extra Shot',            1.50, TRUE, 2),
(55, 28, 'Less Sugar',            0.00, TRUE, 1),
(56, 28, 'Extra Sugar',           0.00, TRUE, 2),
(57, 28, 'Less Ice',              0.00, TRUE, 3),
(58, 29, 'Oat Milk',              2.00, TRUE, 1),
(59, 29, 'Less Sugar',            0.00, TRUE, 2),
(60, 30, 'Whipped Cream',         0.50, TRUE, 1),
(61, 30, 'Extra Chocolate',       1.00, TRUE, 2);

SELECT setval('customization_options_id_seq', 61);

INSERT INTO loyalty_tiers (id, name, min_points, benefits, points_multiplier) VALUES
(1, 'bronze',    0,    '{"discount": 0, "free_delivery_per_month": 0, "priority_queue": false}'::json,    1.00),
(2, 'silver',    500,  '{"discount": 5, "free_delivery_per_month": 2, "priority_queue": false}'::json,  1.25),
(3, 'gold',      1500, '{"discount": 10, "free_delivery_per_month": 5, "priority_queue": true}'::json,  1.50),
(4, 'platinum',  3000, '{"discount": 15, "free_delivery_per_month": 10, "priority_queue": true}'::json, 2.00);

SELECT setval('loyalty_tiers_id_seq', 4);

INSERT INTO wallets (id, user_id, balance, currency) VALUES
(1, 2, 50.00,  'MYR'),
(2, 3, 120.50, 'MYR'),
(3, 4, 75.00,  'MYR'),
(4, 5, 200.00, 'MYR'),
(5, 6, 15.00,  'MYR');

SELECT setval('wallets_id_seq', 5);

INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, created_at, user_id) VALUES
(1,  1, 50.00,  'topup',   'Initial wallet top-up via FPX',                     NOW() - interval '55 days', 2),
(2,  1, -22.80, 'payment', 'Payment for order ORD-20260301001',                  NOW() - interval '50 days', 2),
(3,  1, 22.80,  'refund',  'Refund for cancelled order ORD-20260301001',         NOW() - interval '49 days', 2),
(4,  2, 150.00, 'topup',   'Wallet top-up via credit card',                      NOW() - interval '50 days', 3),
(5,  2, -25.70, 'payment', 'Payment for order ORD-20260315005',                  NOW() - interval '35 days', 3),
(6,  2, -18.90, 'payment', 'Payment for order ORD-20260320006',                  NOW() - interval '28 days', 3),
(7,  3, 100.00, 'topup',   'Wallet top-up via FPX',                              NOW() - interval '45 days', 4),
(8,  3, -33.70, 'payment', 'Payment for order ORD-20260407012',                  NOW() - interval '12 days', 4),
(9,  4, 250.00, 'topup',   'Wallet top-up via credit card',                      NOW() - interval '40 days', 5),
(10, 4, -45.60, 'payment', 'Payment for order ORD-20260409013',                  NOW() - interval '8 days',  5),
(11, 5, 25.00,  'topup',   'Wallet top-up via TnG',                              NOW() - interval '25 days', 6),
(12, 5, -10.00, 'payment', 'Payment for order ORD-20260411015',                  NOW() - interval '3 days',  6);

SELECT setval('wallet_transactions_id_seq', 12);

INSERT INTO loyalty_accounts (id, user_id, points_balance, tier, total_points_earned, created_at, updated_at) VALUES
(1, 2, 120,  'bronze',    120,  NOW() - interval '58 days', NOW()),
(2, 3, 820,  'silver',    820,  NOW() - interval '53 days', NOW()),
(3, 4, 1850, 'gold',      1850, NOW() - interval '48 days', NOW()),
(4, 5, 3200, 'platinum',  3200, NOW() - interval '43 days', NOW()),
(5, 6, 45,   'bronze',    45,   NOW() - interval '28 days', NOW());

SELECT setval('loyalty_accounts_id_seq', 5);

INSERT INTO orders (id, user_id, store_id, table_id, order_number, order_type, items, subtotal, delivery_fee, discount, total, status, pickup_time, delivery_address, payment_method, payment_status, loyalty_points_earned, notes, created_at, updated_at) VALUES
(1,  2, 1, 3,    'ORD-20260301001', 'dine_in',  '[{"name":"Cappuccino","qty":1,"price":10.90},{"name":"Kaya Toast","qty":2,"price":7.90}]'::json,                                         26.70, 0.00,  0.00,    26.70, 'completed',   NULL,                              NULL,                                       'wallet',      'paid',      26,  NULL,                                          NOW() - interval '40 days', NOW() - interval '39 days'),
(2,  3, 1, NULL, 'ORD-20260305002', 'pickup',   '[{"name":"Caramel Latte","qty":1,"price":12.90},{"name":"Croissant","qty":1,"price":9.90}]'::json,                                       22.80, 0.00,  0.00,    22.80, 'completed',   NOW() - interval '39 days' + interval '30 minutes', NULL,                                       'card',        'paid',      22,  NULL,                                          NOW() - interval '39 days', NOW() - interval '38 days'),
(3,  4, 1, 5,    'ORD-20260310003', 'dine_in',  '[{"name":"Flat White","qty":2,"price":11.90},{"name":"Chocolate Muffin","qty":1,"price":10.90},{"name":"Matcha Latte","qty":1,"price":12.90}]'::json, 47.60, 0.00, 0.00, 47.60, 'completed',   NULL,                              NULL,                                       'wallet',      'paid',      47,  'Extra hot please',                            NOW() - interval '35 days', NOW() - interval '34 days'),
(4,  5, 1, NULL, 'ORD-20260312004', 'delivery', '[{"name":"Gula Melaka Latte","qty":2,"price":13.90},{"name":"Teh Tarik","qty":1,"price":8.90}]'::json,                                    36.70, 3.00,  0.00,    39.70, 'completed',   NULL,                              '{"address":"Avenue K, Jalan Ampang","lat":3.1608000,"lng":101.7145000}'::json, 'card',        'paid',      39,  NULL,                                          NOW() - interval '33 days', NOW() - interval '32 days'),
(5,  2, 1, 1,    'ORD-20260315005', 'dine_in',  '[{"name":"Americano","qty":1,"price":8.90}]'::json,                                                                              8.90,  0.00,  0.00,    8.90,  'completed',   NULL,                              NULL,                                       'wallet',      'paid',      8,   NULL,                                          NOW() - interval '30 days', NOW() - interval '29 days'),
(6,  3, 1, NULL, 'ORD-20260320006', 'pickup',   '[{"name":"Espresso","qty":2,"price":8.90},{"name":"Croissant","qty":1,"price":9.90}]'::json,                                            27.70, 0.00,  0.00,    27.70, 'completed',   NOW() - interval '25 days' + interval '45 minutes', NULL,                                       'wallet',      'paid',      27,  NULL,                                          NOW() - interval '25 days', NOW() - interval '24 days'),
(7,  4, 1, NULL, 'ORD-20260325007', 'delivery', '[{"name":"Mocha","qty":1,"price":13.90},{"name":"Cheese Danish","qty":1,"price":11.90},{"name":"Cham","qty":1,"price":9.90}]'::json,        35.70, 3.00,  0.00,    38.70, 'completed',   NULL,                              '{"address":"Menara TA One, Jalan P. Ramlee","lat":3.1543000,"lng":101.7107000}'::json, 'card',  'paid',      38,  'Please ring doorbell',                        NOW() - interval '22 days', NOW() - interval '21 days'),
(8,  5, 1, 7,    'ORD-20260328008', 'dine_in',  '[{"name":"Affogato","qty":2,"price":14.90},{"name":"Durian Cappuccino","qty":1,"price":16.90}]'::json,                                   46.70, 0.00,  0.00,    46.70, 'completed',   NULL,                              NULL,                                       'wallet',      'paid',      46,  'Table by the window if possible',             NOW() - interval '20 days', NOW() - interval '19 days'),
(9,  6, 2, 11,   'ORD-20260401009', 'dine_in',  '[{"name":"Cappuccino","qty":1,"price":11.90},{"name":"Kaya Toast","qty":1,"price":7.90}]'::json,                                       19.80, 0.00,  0.00,    19.80, 'completed',   NULL,                              NULL,                                       'cash',        'paid',      19,  NULL,                                          NOW() - interval '12 days', NOW() - interval '11 days'),
(10, 2, 1, NULL, 'ORD-20260403010', 'pickup',   '[{"name":"Matcha Latte","qty":1,"price":12.90},{"name":"Chocolate Muffin","qty":1,"price":10.90}]'::json,                                 23.80, 0.00,  0.00,    23.80, 'completed',   NOW() - interval '10 days' + interval '20 minutes', NULL,                                       'wallet',      'paid',      23,  NULL,                                          NOW() - interval '10 days', NOW() - interval '9 days'),
(11, 3, 1, NULL, 'ORD-20260405011', 'delivery', '[{"name":"Vanilla Latte","qty":1,"price":12.90},{"name":"Teh Tarik","qty":2,"price":8.90}]'::json,                                      30.70, 3.00,  0.00,    33.70, 'completed',   NULL,                              '{"address":"KLCC Condo, Jalan Binjai","lat":3.1612000,"lng":101.7178000}'::json, 'wallet', 'paid', 33,  NULL,                                          NOW() - interval '8 days',  NOW() - interval '7 days'),
(12, 4, 1, 4,    'ORD-20260407012', 'dine_in',  '[{"name":"Gula Melaka Latte","qty":1,"price":13.90},{"name":"Americano","qty":1,"price":8.90}]'::json,                                   22.80, 0.00,  0.00,    22.80, 'completed',   NULL,                              NULL,                                       'card',        'paid',      22,  NULL,                                          NOW() - interval '6 days',  NOW() - interval '5 days'),
(13, 5, 1, NULL, 'ORD-20260409013', 'pickup',   '[{"name":"Caramel Latte","qty":2,"price":12.90},{"name":"Iced Lemon Tea","qty":1,"price":8.90},{"name":"Croissant","qty":2,"price":9.90}]'::json, 54.50, 0.00, 0.00, 54.50, 'completed', NOW() - interval '4 days' + interval '15 minutes', NULL,                                       'wallet',      'paid',      54,  NULL,                                          NOW() - interval '4 days',  NOW() - interval '3 days'),
(14, 2, 1, NULL, 'ORD-20260410014', 'delivery', '[{"name":"Flat White","qty":1,"price":11.90},{"name":"Kaya Toast","qty":1,"price":7.90}]'::json,                                        19.80, 3.00,  0.00,    22.80, 'completed',   NULL,                              '{"address":"Menara Standard Chartered","lat":3.1575000,"lng":101.7128000}'::json, 'wallet', 'paid', 22,  NULL,                                          NOW() - interval '3 days',  NOW() - interval '2 days'),
(15, 6, 2, NULL, 'ORD-20260411015', 'pickup',   '[{"name":"Teh Tarik","qty":1,"price":8.90}]'::json,                                                                              8.90,  0.00,  0.00,    8.90,  'completed',   NOW() - interval '2 days' + interval '10 minutes', NULL,                                       'cash',        'paid',      8,   NULL,                                          NOW() - interval '2 days',  NOW() - interval '1 day'),
(16, 3, 1, 2,    'ORD-20260412016', 'dine_in',  '[{"name":"Mocha","qty":1,"price":13.90},{"name":"Cheese Danish","qty":1,"price":11.90}]'::json,                                       25.80, 0.00,  0.00,    25.80, 'preparing',   NULL,                              NULL,                                       'wallet',      'paid',      25,  'Less sweet on the mocha',                     NOW() - interval '1 day',   NOW() - interval '1 hour'),
(17, 4, 1, NULL, 'ORD-20260413017', 'delivery', '[{"name":"Cappuccino","qty":2,"price":10.90},{"name":"Affogato","qty":1,"price":14.90}]'::json,                                        36.70, 3.00,  0.00,    39.70, 'confirmed',   NULL,                              '{"address":"The Troika, Jalan Binjai","lat":3.1605000,"lng":101.7180000}'::json, 'card', 'paid', 0,    NULL,                                          NOW() - interval '6 hours', NOW() - interval '3 hours'),
(18, 5, 1, NULL, 'ORD-20260413018', 'pickup',   '[{"name":"Durian Cappuccino","qty":1,"price":16.90},{"name":"Kopi O Kosong","qty":1,"price":8.90}]'::json,                                 25.80, 0.00,  0.00,    25.80, 'pending',     NULL,                              NULL,                                       'wallet',      'pending',   0,   NULL,                                          NOW() - interval '30 minutes', NOW() - interval '30 minutes'),
(19, 2, 1, 6,    'ORD-20260413019', 'dine_in',  '[{"name":"Vanilla Latte","qty":1,"price":12.90},{"name":"Croissant","qty":1,"price":9.90}]'::json,                                      22.80, 0.00,  0.00,    22.80, 'pending',     NULL,                              NULL,                                       'wallet',      'pending',   0,   NULL,                                          NOW() - interval '15 minutes', NOW() - interval '15 minutes'),
(20, 6, 2, 13,   'ORD-20260413020', 'dine_in',  '[{"name":"Matcha Latte","qty":1,"price":14.90},{"name":"Kaya Toast","qty":2,"price":7.90}]'::json,                                    30.70, 0.00,  0.00,    30.70, 'preparing',   NULL,                              NULL,                                       'cash',        'paid',      30,  NULL,                                          NOW() - interval '45 minutes', NOW() - interval '30 minutes'),
(21, 3, 1, NULL, 'ORD-20260301021', 'pickup',   '[{"name":"Flat White","qty":1,"price":11.90}]'::json,                                                                             11.90, 0.00,  0.00,    11.90, 'cancelled',   NULL,                              NULL,                                       'card',        'refunded',  0,   'Changed my mind',                            NOW() - interval '42 days', NOW() - interval '41 days'),
(22, 2, 2, NULL, 'ORD-20260325022', 'pickup',   '[{"name":"Cappuccino","qty":1,"price":11.90},{"name":"Kaya Toast","qty":1,"price":7.90}]'::json,                                       19.80, 0.00,  0.00,    22.80, 'completed',   NOW() - interval '19 days' + interval '20 minutes', NULL,                                       'wallet',      'paid',      22,  NULL,                                          NOW() - interval '19 days', NOW() - interval '18 days'),
(23, 3, 2, 11,   'ORD-20260330023', 'dine_in',  '[{"name":"Latte","qty":1,"price":12.90},{"name":"Croissant","qty":1,"price":9.90}]'::json,                                            22.80, 0.00,  0.00,    23.80, 'completed',   NULL,                              NULL,                                       'card',        'paid',      23,  NULL,                                          NOW() - interval '14 days', NOW() - interval '13 days'),
(24, 5, 2, NULL, 'ORD-20260405024', 'delivery', '[{"name":"Mocha","qty":1,"price":13.90},{"name":"Teh Tarik","qty":2,"price":8.90}]'::json,                                            31.70, 3.00,  0.00,    34.70, 'completed',   NULL,                              '{"address":"Avenue K Residences, Jalan Ampang","lat":3.1608000,"lng":101.7145000}'::json, 'wallet', 'paid', 34,  NULL,                                       NOW() - interval '8 days',  NOW() - interval '7 days'),
(25, 6, 2, 14,   'ORD-20260410025', 'dine_in',  '[{"name":"Espresso","qty":2,"price":8.90},{"name":"Chicken Sandwich","qty":1,"price":13.90}]'::json,                                   31.70, 0.00,  0.00,    22.80, 'completed',   NULL,                              NULL,                                       'cash',        'paid',      22,  NULL,                                          NOW() - interval '3 days',  NOW() - interval '2 days'),
(26, 4, 2, NULL, 'ORD-20260412026', 'pickup',   '[{"name":"Americano","qty":1,"price":9.90},{"name":"Iced Chocolate","qty":1,"price":11.90}]'::json,                                     21.80, 0.00,  0.00,    23.80, 'preparing',   NOW() - interval '1 hour',        NULL,                                       'card',        'paid',      0,   NULL,                                          NOW() - interval '1 hour',  NOW() - interval '30 minutes'),
(27, 2, 2, 12,   'ORD-20260413027', 'dine_in',  '[{"name":"Americano","qty":1,"price":9.90},{"name":"Kaya Toast","qty":1,"price":7.90}]'::json,                                        17.80, 0.00,  0.00,    17.80, 'pending',     NULL,                              NULL,                                       'wallet',      'pending',   0,   NULL,                                          NOW() - interval '20 minutes', NOW() - interval '20 minutes'),
(28, 3, 3, NULL, 'ORD-20260408028', 'pickup',   '[{"name":"Americano","qty":1,"price":9.90},{"name":"Latte","qty":1,"price":12.90}]'::json,                                              22.80, 0.00,  0.00,    12.90, 'completed',   NOW() - interval '5 days' + interval '15 minutes', NULL,                                       'card',        'paid',      12,  NULL,                                          NOW() - interval '5 days',  NOW() - interval '4 days'),
(29, 5, 3, NULL, 'ORD-20260411029', 'delivery', '[{"name":"Latte","qty":2,"price":12.90},{"name":"Matcha Latte","qty":1,"price":14.90}]'::json,                                        40.70, 0.00,  3.00,    37.70, 'completed',   NULL,                              '{"address":"The Troika, Jalan Binjai","lat":3.1605000,"lng":101.7180000}'::json, 'wallet', 'paid', 37,  NULL,                                       NOW() - interval '2 days',  NOW() - interval '1 day'),
(30, 2, 3, NULL, 'ORD-20260413030', 'pickup',   '[{"name":"Matcha Latte","qty":1,"price":14.90}]'::json,                                                                          14.90, 0.00,  0.00,    14.90, 'pending',     NULL,                              NULL,                                       'wallet',      'pending',   0,   NULL,                                          NOW() - interval '10 minutes', NOW() - interval '10 minutes');

SELECT setval('orders_id_seq', 30);

INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price, customizations, line_total) VALUES
(1,  2,  'Cappuccino',       1, 10.90, '{"size":"Regular","milk":"Whole Milk"}'::json,           10.90),
(1,  12, 'Kaya Toast',       2,  7.90, NULL,                                                     15.80),
(2,  3,  'Caramel Latte',    1, 12.90, '{"size":"Regular","milk":"Whole Milk","whip_cream":"Yes"}'::json, 12.90),
(2,  11, 'Croissant',        1,  9.90, NULL,                                                      9.90),
(3,  6,  'Flat White',       2, 11.90, '{"size":"Regular","milk":"Whole Milk"}'::json,            23.80),
(3,  13, 'Chocolate Muffin', 1, 10.90, NULL,                                                     10.90),
(3,  8,  'Matcha Latte',     1, 12.90, '{"size":"Regular","milk":"Oat Milk"}'::json,              12.90),
(4,  16, 'Gula Melaka Latte',2, 13.90, '{"size":"Regular","milk":"Whole Milk"}'::json,            27.80),
(4,  7,  'Teh Tarik',        1,  8.90, '{"size":"Regular","sugar":"Normal"}'::json,                8.90),
(5,  1,  'Americano',        1,  8.90, '{"size":"Regular","milk":"None","sugar":"No Sugar"}'::json, 8.90),
(6,  4,  'Espresso',         2,  8.90, '{"size":"Double"}'::json,                                17.80),
(6,  11, 'Croissant',        1,  9.90, NULL,                                                      9.90),
(7,  5,  'Mocha',            1, 13.90, '{"size":"Regular","milk":"Whole Milk","whip_cream":"Yes"}'::json, 13.90),
(7,  14, 'Cheese Danish',    1, 11.90, NULL,                                                     11.90),
(7,  9,  'Cham (Coffee + Tea)',1,9.90, '{"size":"Regular"}'::json,                                9.90),
(8,  15, 'Affogato',         2, 14.90, '{"ice_cream":"Vanilla"}'::json,                           29.80),
(8,  17, 'Durian Cappuccino',1, 16.90, '{"size":"Regular"}'::json,                               16.90),
(9,  25, 'Cappuccino',       1, 11.90, '{"size":"Regular","milk":"Whole Milk"}'::json,            11.90),
(9,  32, 'Kaya Toast',       1,  7.90, NULL,                                                      7.90),
(10, 8,  'Matcha Latte',     1, 12.90, '{"size":"Regular","milk":"Whole Milk","sweetness":"50%"}'::json, 12.90),
(10, 13, 'Chocolate Muffin', 1, 10.90, NULL,                                                     10.90),
(11, 19, 'Vanilla Latte',    1, 12.90, '{"size":"Regular","milk":"Whole Milk","whip_cream":"Yes"}'::json, 12.90),
(11, 7,  'Teh Tarik',        2,  8.90, '{"size":"Regular","sugar":"Normal"}'::json,                17.80),
(12, 16, 'Gula Melaka Latte',1, 13.90, '{"size":"Regular","milk":"Whole Milk"}'::json,            13.90),
(12, 1,  'Americano',        1,  8.90, '{"size":"Regular","milk":"None","sugar":"No Sugar"}'::json, 8.90),
(13, 3,  'Caramel Latte',    2, 12.90, '{"size":"Large","milk":"Whole Milk","whip_cream":"Yes"}'::json, 28.80),
(13, 10, 'Iced Lemon Tea',   1,  8.90, '{"size":"Regular","sugar":"Less Sugar"}'::json,            8.90),
(13, 11, 'Croissant',        2,  9.90, NULL,                                                     19.80),
(14, 6,  'Flat White',       1, 11.90, '{"size":"Regular","milk":"Whole Milk"}'::json,            11.90),
(14, 12, 'Kaya Toast',       1,  7.90, NULL,                                                      7.90),
(15, 28, 'Teh Tarik',        1,  8.90, '{"size":"Regular","sugar":"Normal"}'::json,                8.90),
(16, 5,  'Mocha',            1, 13.90, '{"size":"Regular","milk":"Whole Milk","whip_cream":"No"}'::json, 13.90),
(16, 14, 'Cheese Danish',    1, 11.90, NULL,                                                     11.90),
(17, 2,  'Cappuccino',       2, 10.90, '{"size":"Regular","milk":"Oat Milk","extra_shot":"Extra Shot"}'::json, 24.80),
(17, 15, 'Affogato',         1, 14.90, '{"ice_cream":"Vanilla"}'::json,                           14.90),
(18, 17, 'Durian Cappuccino',1, 16.90, '{"size":"Regular"}'::json,                               16.90),
(18, 18, 'Kopi O Kosong',    1,  8.90, '{"size":"Regular"}'::json,                                8.90),
(19, 19, 'Vanilla Latte',    1, 12.90, '{"size":"Regular","milk":"Whole Milk","whip_cream":"Yes"}'::json, 12.90),
(19, 11, 'Croissant',        1,  9.90, NULL,                                                      9.90),
(20, 29, 'Matcha Latte',     1, 14.90, '{"size":"Regular","milk":"Whole Milk"}'::json,            14.90),
(20, 32, 'Kaya Toast',       2,  7.90, NULL,                                                     15.80),
(21, 6,  'Flat White',       1, 11.90, '{"size":"Regular","milk":"Whole Milk"}'::json,            11.90),
(22, 25, 'Cappuccino',       1, 11.90, '{"size":"Regular","milk":"Whole Milk"}'::json,            11.90),
(22, 32, 'Kaya Toast',       1,  7.90, NULL,                                                      7.90),
(23, 26, 'Latte',            1, 12.90, '{"size":"Regular","milk":"Whole Milk"}'::json,            12.90),
(23, 31, 'Croissant',        1,  9.90, NULL,                                                      9.90),
(24, 27, 'Mocha',            1, 13.90, '{"size":"Regular","milk":"Whole Milk","whip_cream":"Yes"}'::json, 13.90),
(24, 28, 'Teh Tarik',        2,  8.90, '{"size":"Regular","sugar":"Normal"}'::json,                17.80),
(25, 23, 'Espresso',         2,  8.90, '{"size":"Double"}'::json,                                17.80),
(25, 33, 'Chicken Sandwich', 1, 13.90, NULL,                                                     13.90),
(26, 24, 'Americano',        1,  9.90, '{"size":"Regular","milk":"None"}'::json,                   9.90),
(26, 30, 'Iced Chocolate',   1, 11.90, '{"size":"Regular","whip_cream":"Yes"}'::json,             11.90),
(27, 24, 'Americano',        1,  9.90, '{"size":"Regular","milk":"None"}'::json,                   9.90),
(27, 32, 'Kaya Toast',       1,  7.90, NULL,                                                      7.90),
(28, 20, 'Americano',        1,  9.90, '{"size":"Regular"}'::json,                                9.90),
(29, 21, 'Latte',            2, 12.90, '{"size":"Regular","milk":"Whole Milk"}'::json,            25.80),
(29, 22, 'Matcha Latte',     1, 14.90, '{"size":"Regular"}'::json,                               14.90),
(30, 22, 'Matcha Latte',     1, 14.90, '{"size":"Regular"}'::json,                               14.90);

INSERT INTO order_status_history (order_id, status, note, created_at) VALUES
(1,  'pending',    'Order placed',                                  NOW() - interval '40 days'),
(1,  'confirmed',  'Order confirmed by store',                      NOW() - interval '40 days' + interval '2 minutes'),
(1,  'preparing',  'Barista started preparing',                     NOW() - interval '40 days' + interval '5 minutes'),
(1,  'ready',      'Order ready at table',                          NOW() - interval '40 days' + interval '15 minutes'),
(1,  'completed',  'Order completed',                               NOW() - interval '39 days'),
(2,  'pending',    'Order placed for pickup',                       NOW() - interval '39 days'),
(2,  'confirmed',  'Order confirmed',                               NOW() - interval '39 days' + interval '1 minute'),
(2,  'preparing',  'Preparing your order',                          NOW() - interval '39 days' + interval '3 minutes'),
(2,  'ready',      'Ready for pickup',                              NOW() - interval '39 days' + interval '12 minutes'),
(2,  'completed',  'Picked up by customer',                         NOW() - interval '38 days'),
(3,  'pending',    'Order placed',                                  NOW() - interval '35 days'),
(3,  'confirmed',  'Order confirmed',                               NOW() - interval '35 days' + interval '2 minutes'),
(3,  'preparing',  'Extra hot preparation started',                 NOW() - interval '35 days' + interval '5 minutes'),
(3,  'ready',      'Order ready',                                   NOW() - interval '35 days' + interval '20 minutes'),
(3,  'completed',  'Order completed',                               NOW() - interval '34 days'),
(4,  'pending',    'Delivery order placed',                         NOW() - interval '33 days'),
(4,  'confirmed',  'Store confirmed delivery order',                NOW() - interval '33 days' + interval '3 minutes'),
(4,  'preparing',  'Preparing delivery order',                      NOW() - interval '33 days' + interval '5 minutes'),
(4,  'ready',      'Out for delivery',                              NOW() - interval '33 days' + interval '18 minutes'),
(4,  'completed',  'Delivered successfully',                        NOW() - interval '32 days'),
(5,  'pending',    'Order placed',                                  NOW() - interval '30 days'),
(5,  'confirmed',  'Confirmed',                                     NOW() - interval '30 days' + interval '1 minute'),
(5,  'preparing',  'Preparing',                                     NOW() - interval '30 days' + interval '3 minutes'),
(5,  'ready',      'Ready',                                         NOW() - interval '30 days' + interval '10 minutes'),
(5,  'completed',  'Completed',                                     NOW() - interval '29 days'),
(9,  'pending',    'Order placed',                                  NOW() - interval '12 days'),
(9,  'confirmed',  'Order confirmed',                               NOW() - interval '12 days' + interval '2 minutes'),
(9,  'preparing',  'Preparing your order',                          NOW() - interval '12 days' + interval '5 minutes'),
(9,  'ready',      'Order ready at table',                          NOW() - interval '12 days' + interval '15 minutes'),
(9,  'completed',  'Order completed',                               NOW() - interval '11 days'),
(16, 'pending',    'Order placed',                                  NOW() - interval '1 day'),
(16, 'confirmed',  'Order confirmed',                               NOW() - interval '1 day' + interval '2 minutes'),
(16, 'preparing',  'Preparing - less sweet mocha requested',        NOW() - interval '1 day' + interval '5 minutes'),
(17, 'pending',    'Delivery order placed',                         NOW() - interval '6 hours'),
(17, 'confirmed',  'Order confirmed by store',                      NOW() - interval '4 hours'),
(18, 'pending',    'Pickup order placed',                           NOW() - interval '30 minutes'),
(19, 'pending',    'Dine-in order placed',                          NOW() - interval '15 minutes'),
(20, 'pending',    'Order placed',                                  NOW() - interval '45 minutes'),
(20, 'confirmed',  'Order confirmed',                               NOW() - interval '40 minutes'),
(20, 'preparing',  'Preparing your order',                          NOW() - interval '30 minutes'),
(21, 'pending',    'Order placed for pickup',                       NOW() - interval '42 days'),
(21, 'cancelled',  'Customer requested cancellation',               NOW() - interval '42 days' + interval '5 minutes'),
(22, 'pending',    'Order placed for pickup',                       NOW() - interval '19 days'),
(22, 'confirmed',  'Order confirmed',                               NOW() - interval '19 days' + interval '1 minute'),
(22, 'preparing',  'Preparing',                                     NOW() - interval '19 days' + interval '3 minutes'),
(22, 'ready',      'Ready for pickup',                              NOW() - interval '19 days' + interval '12 minutes'),
(22, 'completed',  'Picked up',                                     NOW() - interval '18 days'),
(23, 'pending',    'Dine-in order placed',                          NOW() - interval '14 days'),
(23, 'confirmed',  'Confirmed',                                     NOW() - interval '14 days' + interval '2 minutes'),
(23, 'preparing',  'Preparing',                                     NOW() - interval '14 days' + interval '5 minutes'),
(23, 'ready',      'Ready at table',                                NOW() - interval '14 days' + interval '15 minutes'),
(23, 'completed',  'Completed',                                     NOW() - interval '13 days'),
(24, 'pending',    'Delivery order placed',                         NOW() - interval '8 days'),
(24, 'confirmed',  'Confirmed',                                     NOW() - interval '8 days' + interval '2 minutes'),
(24, 'preparing',  'Preparing',                                     NOW() - interval '8 days' + interval '5 minutes'),
(24, 'ready',      'Out for delivery',                              NOW() - interval '8 days' + interval '18 minutes'),
(24, 'completed',  'Delivered',                                     NOW() - interval '7 days'),
(25, 'pending',    'Dine-in order placed',                          NOW() - interval '3 days'),
(25, 'confirmed',  'Confirmed',                                     NOW() - interval '3 days' + interval '2 minutes'),
(25, 'preparing',  'Preparing',                                     NOW() - interval '3 days' + interval '5 minutes'),
(25, 'ready',      'Ready at table',                                NOW() - interval '3 days' + interval '12 minutes'),
(25, 'completed',  'Completed',                                     NOW() - interval '2 days'),
(26, 'pending',    'Pickup order placed',                           NOW() - interval '1 hour'),
(26, 'confirmed',  'Order confirmed',                               NOW() - interval '50 minutes'),
(26, 'preparing',  'Preparing your order',                          NOW() - interval '30 minutes'),
(27, 'pending',    'Dine-in order placed',                          NOW() - interval '20 minutes'),
(28, 'pending',    'Pickup order placed',                           NOW() - interval '5 days'),
(28, 'confirmed',  'Confirmed',                                     NOW() - interval '5 days' + interval '2 minutes'),
(28, 'preparing',  'Preparing',                                     NOW() - interval '5 days' + interval '5 minutes'),
(28, 'ready',      'Ready for pickup',                              NOW() - interval '5 days' + interval '12 minutes'),
(28, 'completed',  'Picked up',                                     NOW() - interval '4 days'),
(29, 'pending',    'Delivery order placed',                         NOW() - interval '2 days'),
(29, 'confirmed',  'Confirmed',                                     NOW() - interval '2 days' + interval '2 minutes'),
(29, 'preparing',  'Preparing',                                     NOW() - interval '2 days' + interval '5 minutes'),
(29, 'ready',      'Out for delivery',                              NOW() - interval '2 days' + interval '20 minutes'),
(29, 'completed',  'Delivered',                                     NOW() - interval '1 day'),
(30, 'pending',    'Pickup order placed',                           NOW() - interval '10 minutes');

INSERT INTO payments (id, order_id, method, amount, status, transaction_id, created_at) VALUES
(1,  1,  'wallet', 26.70, 'completed', 'TXN-001001', NOW() - interval '40 days'),
(2,  2,  'card',   22.80, 'completed', 'TXN-001002', NOW() - interval '39 days'),
(3,  3,  'wallet', 47.60, 'completed', 'TXN-001003', NOW() - interval '35 days'),
(4,  4,  'card',   39.70, 'completed', 'TXN-001004', NOW() - interval '33 days'),
(5,  5,  'wallet',  8.90, 'completed', 'TXN-001005', NOW() - interval '30 days'),
(6,  6,  'wallet', 27.70, 'completed', 'TXN-001006', NOW() - interval '25 days'),
(7,  7,  'card',   38.70, 'completed', 'TXN-001007', NOW() - interval '22 days'),
(8,  8,  'wallet', 46.70, 'completed', 'TXN-001008', NOW() - interval '20 days'),
(9,  9,  'cash',   19.80, 'completed', 'TXN-001009', NOW() - interval '12 days'),
(10, 10, 'wallet', 23.80, 'completed', 'TXN-001010', NOW() - interval '10 days'),
(11, 11, 'wallet', 33.70, 'completed', 'TXN-001011', NOW() - interval '8 days'),
(12, 12, 'card',   22.80, 'completed', 'TXN-001012', NOW() - interval '6 days'),
(13, 13, 'wallet', 54.50, 'completed', 'TXN-001013', NOW() - interval '4 days'),
(14, 14, 'wallet', 22.80, 'completed', 'TXN-001014', NOW() - interval '3 days'),
(15, 15, 'cash',    8.90, 'completed', 'TXN-001015', NOW() - interval '2 days'),
(16, 16, 'wallet', 25.80, 'completed', 'TXN-001016', NOW() - interval '1 day'),
(17, 17, 'card',   39.70, 'completed', 'TXN-001017', NOW() - interval '6 hours'),
(18, 18, 'wallet', 25.80, 'pending',   'TXN-001018', NOW() - interval '30 minutes'),
(19, 19, 'wallet', 22.80, 'pending',   'TXN-001019', NOW() - interval '15 minutes'),
(20, 20, 'cash',   30.70, 'completed', 'TXN-001020', NOW() - interval '45 minutes'),
(21, 21, 'card',   11.90, 'refunded',  'TXN-001021', NOW() - interval '42 days'),
(22, 22, 'wallet', 22.80, 'completed', 'TXN-001022', NOW() - interval '19 days'),
(23, 23, 'card',   23.80, 'completed', 'TXN-001023', NOW() - interval '14 days'),
(24, 24, 'wallet', 34.70, 'completed', 'TXN-001024', NOW() - interval '8 days'),
(25, 25, 'cash',   22.80, 'completed', 'TXN-001025', NOW() - interval '3 days'),
(26, 26, 'card',   23.80, 'completed', 'TXN-001026', NOW() - interval '1 hour'),
(27, 27, 'wallet', 17.80, 'pending',   'TXN-001027', NOW() - interval '20 minutes'),
(28, 28, 'card',   12.90, 'completed', 'TXN-001028', NOW() - interval '5 days'),
(29, 29, 'wallet', 37.70, 'completed', 'TXN-001029', NOW() - interval '2 days'),
(30, 30, 'wallet', 14.90, 'pending',   'TXN-001030', NOW() - interval '10 minutes');

SELECT setval('payments_id_seq', 30);

INSERT INTO loyalty_transactions (id, user_id, order_id, store_id, points, type, created_at, description) VALUES
(1,  2, 1,  1, 26, 'earn',   NOW() - interval '39 days', 'Points earned from order ORD-20260301001'),
(2,  3, 2,  1, 22, 'earn',   NOW() - interval '38 days', 'Points earned from order ORD-20260305002'),
(3,  4, 3,  1, 47, 'earn',   NOW() - interval '34 days', 'Points earned from order ORD-20260310003'),
(4,  5, 4,  1, 78, 'earn',   NOW() - interval '32 days', 'Platinum tier bonus points from order ORD-20260312004'),
(5,  2, 5,  1,  8, 'earn',   NOW() - interval '29 days', 'Points earned from order ORD-20260315005'),
(6,  3, 6,  1, 34, 'earn',   NOW() - interval '24 days', 'Silver tier bonus points from order ORD-20260320006'),
(7,  4, 7,  1, 57, 'earn',   NOW() - interval '21 days', 'Gold tier bonus points from order ORD-20260325007'),
(8,  5, 8,  1, 93, 'earn',   NOW() - interval '19 days', 'Platinum tier bonus points from order ORD-20260328008'),
(9,  6, 9,  2, 19, 'earn',   NOW() - interval '11 days', 'Points earned from order ORD-20260401009'),
(10, 2, 10, 1, 23, 'earn',   NOW() - interval '9 days',  'Points earned from order ORD-20260403010'),
(11, 3, 11, 1, 42, 'earn',   NOW() - interval '7 days',  'Silver tier bonus points from order ORD-20260405011'),
(12, 4, 12, 1, 34, 'earn',   NOW() - interval '5 days',  'Gold tier bonus points from order ORD-20260407012'),
(13, 5, 13, 1, 109,'earn',   NOW() - interval '3 days',  'Platinum tier bonus points from order ORD-20260409013'),
(14, 2, 14, 1, 22, 'earn',   NOW() - interval '2 days',  'Points earned from order ORD-20260410014'),
(15, 6, 15, 2,  8, 'earn',   NOW() - interval '1 day',   'Points earned from order ORD-20260411015'),
(16, 3, 16, 1, 32, 'earn',   NOW() - interval '1 day',   'Silver tier bonus from order ORD-20260412016'),
(17, 5, NULL, 1, 100,'redeem', NOW() - interval '15 days', 'Redeemed for free Cappuccino reward'),
(18, 4, NULL, 1, 200,'redeem', NOW() - interval '10 days', 'Redeemed for RM10 discount voucher'),
(19, 5, NULL, 1, 50, 'expire', NOW() - interval '5 days',  'Expired points from March promo'),
(20, 3, NULL, 1, 150,'redeem', NOW() - interval '7 days',  'Redeemed for free Affogato reward'),
(21, 2, 22, 2, 22, 'earn',   NOW() - interval '18 days', 'Points earned from order ORD-20260325022'),
(22, 3, 23, 2, 23, 'earn',   NOW() - interval '13 days', 'Silver tier bonus from order ORD-20260330023'),
(23, 5, 24, 2, 69, 'earn',   NOW() - interval '7 days',  'Platinum tier bonus from order ORD-20260405024'),
(24, 6, 25, 2, 22, 'earn',   NOW() - interval '2 days',  'Points earned from order ORD-20260410025'),
(25, 3, 28, 3, 12, 'earn',   NOW() - interval '4 days',  'Silver tier bonus from order ORD-20260408028'),
(26, 5, 29, 3, 75, 'earn',   NOW() - interval '1 day',   'Platinum tier bonus from order ORD-20260411029');

SELECT setval('loyalty_transactions_id_seq', 26);

INSERT INTO rewards (id, name, description, points_cost, reward_type, item_id, discount_value, image_url, stock_limit, total_redeemed, is_active, code, validity_days, created_at, updated_at) VALUES
(1, 'Free Cappuccino',       'Enjoy a free Regular Cappuccino on us',               150,  'free_item',         2,   NULL,  '/images/rewards/free-cappuccino.jpg',   500, 23,  TRUE, 'FREE-CAP',   30, NOW() - interval '60 days', NOW()),
(2, 'RM10 Off Voucher',      'Get RM10 off your next order',                        200,  'discount_voucher',  NULL, 10.00, '/images/rewards/rm10-off.jpg',          NULL, 45, TRUE, 'RM10-OFF',   30, NOW() - interval '60 days', NOW()),
(3, 'Free Kaya Toast',       'Classic Malaysian breakfast on the house',            80,   'free_item',         12,  NULL,  '/images/rewards/free-kaya-toast.jpg',   300, 18,  TRUE, 'FREE-TOAST', 30, NOW() - interval '55 days', NOW()),
(4, 'Free Affogato',         'Premium espresso dessert reward',                     250,  'free_item',         15,  NULL,  '/images/rewards/free-affogato.jpg',     100, 7,   TRUE, 'FREE-AFF',   30, NOW() - interval '50 days', NOW());

SELECT setval('rewards_id_seq', 4);

INSERT INTO user_rewards (id, user_id, reward_id, store_id, redeemed_at, order_id, is_used, status, expires_at, redemption_code, points_spent) VALUES
(1, 5, 1, 1, NOW() - interval '15 days', NULL, FALSE, 'available', NOW() + interval '15 days', 'RWD-1-F5A3C1', 150),
(2, 4, 2, 1, NOW() - interval '10 days', NULL, FALSE, 'available', NOW() + interval '20 days', 'RWD-2-B7E2D9', 200),
(3, 3, 4, 1, NOW() - interval '7 days',  NULL, FALSE, 'available', NOW() + interval '23 days', 'RWD-4-A1C8F5', 250),
(4, 5, 3, 1, NOW() - interval '20 days', 8,   TRUE,  'used',     NOW() - interval '10 days', 'RWD-3-E4D6B2', 80),
(5, 2, 3, 1, NOW() - interval '5 days',  NULL, FALSE, 'available', NOW() + interval '25 days', 'RWD-3-C9A7F1', 80);

SELECT setval('user_rewards_id_seq', 5);

INSERT INTO vouchers (id, code, description, discount_type, discount_value, min_order, max_uses, max_uses_per_user, used_count, valid_from, valid_until, is_active, title, body, image_url, promo_type, store_id, validity_days, created_at) VALUES
(1, 'WELCOME10',   '10% off for new customers',               'percent',   10.00, 20.00,   1000, 1,   234, NOW() - interval '90 days', NOW() + interval '180 days', TRUE, 'First Order Discount', 'New customers get 10% off their first order with code WELCOME10.', '/images/promos/welcome.jpg',    'percentage', NULL, 30, NOW() - interval '90 days'),
(2, 'FLAT5',       'RM5 off any order',                       'fixed',      5.00, 15.00,   500,  NULL, 89,  NOW() - interval '60 days', NOW() + interval '120 days', TRUE, NULL, NULL, NULL, NULL, NULL, 30, NOW() - interval '60 days'),
(3, 'FREECOFFEE',  'Free Americano with any order over RM25', 'free_item',  8.90, 25.00,   200,  NULL, 45,  NOW() - interval '30 days', NOW() + interval '60 days',  TRUE, NULL, NULL, NULL, NULL, NULL, 30, NOW() - interval '30 days'),
(4, 'ZUS20',       '20% off for loyalty members',             'percent',   20.00, 30.00,   100,  2,   12,  NOW() - interval '15 days', NOW() + interval '45 days',  TRUE, 'Ramadan Special', '20% off all beverages during Ramadan. Use code ZUS20.', '/images/promos/ramadan.jpg', 'percentage', NULL, 30, NOW() - interval '15 days'),
(5, 'HAPPY2PM',    'Buy 1 Free 1 all lattes 2-4PM',          'percent',   100.00, 0.00,    500,  1,   67,  NOW() - interval '5 days',  NOW() + interval '25 days',  TRUE, 'Happy Hour', 'Buy 1 Free 1 all lattes from 2-4PM daily.', '/images/promos/happy-hour.jpg', 'bogo', 1, 30, NOW() - interval '5 days');

SELECT setval('vouchers_id_seq', 5);

INSERT INTO user_vouchers (id, user_id, voucher_id, store_id, applied_at, order_id, status, code, expires_at, discount_type, discount_value, min_spend, source) VALUES
(1, 2, 1, 1, NOW() - interval '55 days', NULL, 'used',     'WELCOME10-A1B2C3', NOW() - interval '25 days', 'percent', 10.0, 20.0, 'admin_grant'),
(2, 3, 1, 1, NOW() - interval '50 days', NULL, 'used',     'WELCOME10-D4E5F6', NOW() - interval '20 days', 'percent', 10.0, 20.0, 'admin_grant'),
(3, 4, 2, 1, NOW() - interval '40 days', NULL, 'used',     'FLAT5-G7H8I9',     NOW() - interval '10 days', 'fixed',   5.0,  0.0,  'admin_grant'),
(4, 5, 1, 1, NOW() - interval '38 days', NULL, 'used',     'WELCOME10-J1K2L3', NOW() - interval '8 days',  'percent', 10.0, 20.0, 'admin_grant'),
(5, 5, 4, 1, NOW() - interval '12 days', 13,   'used',     'ZUS20-M4N5O6',     NOW() - interval '2 days',  'percent', 20.0, 30.0, 'admin_grant'),
(6, 6, 1, 2, NOW() - interval '25 days', NULL, 'available', 'WELCOME10-P7Q8R9', NOW() + interval '5 days',  'percent', 10.0, 20.0, 'admin_grant'),
(7, 3, 3, 1, NOW() - interval '10 days', NULL, 'available', 'FREECOFFEE-S1T2U3', NOW() + interval '20 days', 'free_item', 8.9, 0.0, 'admin_grant');

SELECT setval('user_vouchers_id_seq', 7);

INSERT INTO staff (id, user_id, store_id, name, email, phone, role, is_active, pin_code, created_at, updated_at) VALUES
(1,  7,  1, 'Amirul Hakim',  'amirul@zus.my',       '+60123456111', 'manager',           TRUE, '1234', NOW() - interval '80 days', NOW()),
(2,  9,  1, 'Priya Nair',    'priya@zus.my',        '+60123456222', 'barista',           TRUE, '5678', NOW() - interval '70 days', NOW()),
(3,  NULL, 1, 'Wei Jie',      'weijie@zus.my',       '+60123456333', 'cashier',           TRUE, '9012', NOW() - interval '65 days', NOW()),
(4,  NULL, 2, 'Farah Lee',    'farah@zus.my',        '+60123456444', 'barista',           TRUE, '3456', NOW() - interval '60 days', NOW()),
(5,  NULL, 2, 'Kumar D.',     'kumar@zus.my',        '+60123456555', 'delivery',          TRUE, '7890', NOW() - interval '55 days', NOW()),
(6,  8,  2, 'Siti Rahman',   'siti@zus.my',         '+60123456666', 'assistant_manager', TRUE, '2345', NOW() - interval '50 days', NOW()),
(7,  7,  2, 'Amirul Hakim',  'amirul@zus.my',       '+60123456111', 'manager',           TRUE, '1234', NOW() - interval '50 days', NOW()),
(8,  10, 2, 'Raj Manager',   'raj.manager@zus.my',  '+60123456888', 'manager',           TRUE, '5555', NOW() - interval '45 days', NOW()),
(9,  11, 3, 'Lisa Chen',     'lisa.manager@zus.my', '+60123456999', 'manager',           TRUE, '6666', NOW() - interval '40 days', NOW());

SELECT setval('staff_id_seq', 9);

INSERT INTO staff_shifts (id, staff_id, store_id, clock_in, clock_out, notes, created_at) VALUES
(1, 1, 1, NOW() - interval '1 day' + interval '8 hours', NOW() - interval '1 day' + interval '17 hours', 'Morning shift',   NOW() - interval '1 day'),
(2, 2, 1, NOW() - interval '1 day' + interval '9 hours', NOW() - interval '1 day' + interval '18 hours', 'Full day barista', NOW() - interval '1 day'),
(3, 3, 1, NOW() - interval '1 day' + interval '10 hours', NOW() - interval '1 day' + interval '19 hours', 'Afternoon shift',  NOW() - interval '1 day'),
(4, 1, 1, NOW() + interval '8 hours', NULL,                                   'Current shift in progress', NOW()),
(5, 2, 1, NOW() + interval '9 hours', NULL,                                   'Current shift in progress', NOW()),
(6, 4, 2, NOW() - interval '1 day' + interval '8 hours', NOW() - interval '1 day' + interval '16 hours', 'Morning barista',  NOW() - interval '1 day'),
(7, 5, 2, NOW() - interval '1 day' + interval '10 hours', NOW() - interval '1 day' + interval '19 hours', 'Delivery run',     NOW() - interval '1 day'),
(8, 4, 2, NOW() + interval '8 hours', NULL,                                   'Current shift in progress', NOW()),
(9, 9, 3, NOW() - interval '1 day' + interval '8 hours', NOW() - interval '1 day' + interval '17 hours', 'Opening shift',    NOW() - interval '1 day'),
(10, 9, 3, NOW() + interval '8 hours', NULL,                                  'Current shift in progress', NOW());

SELECT setval('staff_shifts_id_seq', 10);

INSERT INTO feedback (id, user_id, store_id, order_id, rating, comment, tags, is_resolved, admin_reply, created_at) VALUES
(1,  2, 1, 1,  5, 'Excellent coffee! The cappuccino was perfect and kaya toast was crispy.',                      '["great_coffee","friendly_staff"]'::json,                          TRUE,  'Thank you Ahmad! We hope to see you again.',     NOW() - interval '38 days'),
(2,  3, 1, 2,  4, 'Good coffee but the pickup wait was a bit long.',                                          '["good_coffee","slow_service"]'::json,                             TRUE,  'Sorry about the wait! We are improving our flow.', NOW() - interval '37 days'),
(3,  4, 1, 3,  5, 'Flat white is the best here! Will definitely order again.',                                '["great_coffee"]'::json,                                          TRUE,  NULL,                                              NOW() - interval '33 days'),
(4,  5, 1, 4,  3, 'Delivery took too long, coffee was lukewarm by the time it arrived.',                       '["cold_food","slow_delivery"]'::json,                              TRUE,  'We apologise Mei. We have added more delivery riders.', NOW() - interval '31 days'),
(5,  2, 1, 5,  4, 'Decent americano, nothing special but reliable quality.',                                  '["consistent_quality"]'::json,                                    TRUE,  NULL,                                              NOW() - interval '28 days'),
(6,  3, 1, 6,  5, 'Love the espresso here, really strong and aromatic.',                                      '["great_coffee","strong_espresso"]'::json,                        TRUE,  NULL,                                              NOW() - interval '23 days'),
(7,  4, 1, 7,  2, 'Cheese danish was stale. Very disappointing.',                                             '["stale_food","disappointing"]'::json,                             TRUE,  'So sorry Raj. We have refreshed our pastry supply.', NOW() - interval '20 days'),
(8,  6, 2, 9,  4, 'Nice ambiance at KLCC Park outlet. Staff were friendly.',                                   '["friendly_staff","nice_ambiance"]'::json,                        TRUE,  NULL,                                              NOW() - interval '10 days'),
(9,  5, 1, 13, 5, 'Always the best! Gula Melaka Latte is my favourite.',                                       '["great_coffee","favourite"]'::json,                              FALSE, NULL,                                              NOW() - interval '2 days'),
(10, 2, 1, 10, 3, 'Matcha latte was too sweet even with 50% sugar.',                                          '["too_sweet"]'::json,                                             FALSE, NULL,                                              NOW() - interval '8 days'),
(11, 3, 1, 11, 4, 'Good delivery experience overall. Teh tarik was nicely packaged.',                           '["good_packaging","good_delivery"]'::json,                        FALSE, NULL,                                              NOW() - interval '6 days'),
(12, 2, 2, 22, 4, 'Quick pickup at KLCC Park, good service.',                                                 '["quick_service"]'::json,                                         TRUE,  NULL,                                              NOW() - interval '17 days'),
(13, 5, 2, 24, 5, 'Mocha at KLCC Park is amazing! Delivery was fast too.',                                    '["great_coffee","fast_delivery"]'::json,                          TRUE,  NULL,                                              NOW() - interval '6 days'),
(14, 3, 3, 28, 4, 'Cheras outlet is convenient. Americano was solid.',                                        '["convenient_location","good_coffee"]'::json,                     FALSE, NULL,                                              NOW() - interval '3 days');

SELECT setval('feedback_id_seq', 14);

INSERT INTO audit_log (id, user_id, store_id, action, entity_type, entity_id, details, ip_address, status, created_at) VALUES
(1,  1,    NULL, 'login',          'user',    1,    NULL,                                                      '192.168.1.100', 'success', NOW() - interval '85 days'),
(2,  1,    1,    'update_menu',    'menu_item', 3,  '{"field":"base_price","old":"11.90","new":"12.90"}'::json, '192.168.1.100', 'success', NOW() - interval '30 days'),
(3,  1,    1,    'create_promo',   'promo_banner', 1, NULL,                                                    '192.168.1.100', 'success', NOW() - interval '25 days'),
(4,  7,    1,    'staff_login',    'staff',   1,    NULL,                                                      '10.0.0.50',     'success', NOW() - interval '1 day'),
(5,  1,    NULL, 'create_voucher', 'voucher', 1,    '{"code":"WELCOME10"}'::json,                             '192.168.1.100', 'success', NOW() - interval '60 days'),
(6,  1,    1,    'update_store',   'store',   1,    '{"field":"opening_hours"}'::json,                         '192.168.1.100', 'success', NOW() - interval '20 days'),
(7,  NULL, NULL, 'order_created',  'order',   21,   '{"order_number":"ORD-20260301021"}'::json,                '172.16.0.5',    'success', NOW() - interval '42 days'),
(8,  1,    2,    'resolve_feedback','feedback',4,    '{"admin_reply":"We apologise Mei."}'::json,              '192.168.1.100', 'success', NOW() - interval '31 days'),
(9,  1,    3,    'create_store',   'store',   3,    '{"name":"ZUS Coffee Cheras"}'::json,                      '192.168.1.100', 'success', NOW() - interval '70 days'),
(10, 1,    3,    'update_menu',    'menu_item', 20, '{"field":"base_price","old":"8.90","new":"9.90"}'::json, '192.168.1.100', 'success', NOW() - interval '25 days'),
(11, 7,    2,    'staff_login',    'staff',   7,    NULL,                                                      '10.0.0.51',     'success', NOW() - interval '1 day'),
(12, 11,   3,    'staff_login',    'staff',   9,    NULL,                                                      '10.0.0.52',     'success', NOW() - interval '12 hours'),
(13, NULL, NULL, 'order_created',  'order',   28,   '{"order_number":"ORD-20260408028"}'::json,                '172.16.0.5',    'success', NOW() - interval '5 days'),
(14, 1,    NULL, 'create_campaign','marketing_campaign', 1, '{"name":"Grand Opening Cheras"}'::json,             '192.168.1.100', 'success', NOW() - interval '5 days');

SELECT setval('audit_log_id_seq', 14);

INSERT INTO notification_broadcasts (id, title, body, audience, store_id, scheduled_at, sent_at, sent_count, open_count, created_by, created_at) VALUES
(1, 'Ramadan Special!',       'Enjoy 20% off all beverages during Ramadan. Use code ZUS20 at checkout.',         'all',      1,    NOW() - interval '15 days', NOW() - interval '15 days', 2450, 890, 1, NOW() - interval '16 days'),
(2, 'New Outlet Open!',       'ZUS Coffee KLCC Park is now open! Visit us for grand opening specials.',          'all',      NULL, NOW() - interval '75 days', NOW() - interval '75 days', 5100, 2100, 1, NOW() - interval '76 days'),
(3, 'Loyalty Rewards Update', 'Platinum members now earn 2x points on every purchase!',                          'platinum', NULL, NOW() - interval '10 days', NOW() - interval '10 days', 320,  180,  1, NOW() - interval '11 days');

SELECT setval('notification_broadcasts_id_seq', 3);

INSERT INTO marketing_campaigns (id, name, channel, subject, body, image_url, cta_url, audience, store_id, status, provider, provider_campaign_id, scheduled_at, sent_at, completed_at, total_recipients, sent_count, delivered_count, opened_count, clicked_count, failed_count, cost, created_by, created_at, updated_at) VALUES
(1, 'Grand Opening Cheras',  'push',  'New Store Opening!', 'Come visit our new Cheras outlet! Free coffee for the first 100 customers.', NULL, NULL, 'all',             3, 'sent',      'fcm',    NULL, NOW() - interval '1 day', NULL, NULL, 5000, 4800, 4500, 1200, 350, 200, 15.00, 1, NOW() - interval '1 day', NOW() - interval '1 day'),
(2, 'Weekend Promo',         'sms',   'Weekend Special!',   'Get 20% off all lattes this weekend!',                                        NULL, NULL, 'loyalty_members', NULL, 'draft',    'twilio', NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 1, NOW() - interval '1 day', NOW() - interval '1 day'),
(3, 'Loyalty Re-engagement', 'email', 'We miss you!',       'Its been a while since your last visit. Heres a voucher for you.',             NULL, NULL, 'all',             NULL, 'scheduled','signal', NULL, NOW() + interval '2 days', NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 1, NOW() - interval '1 day', NOW() - interval '1 day');

SELECT setval('marketing_campaigns_id_seq', 3);

INSERT INTO promo_banners (id, title, short_description, image_url, position, store_id, start_date, end_date, is_active, action_type, voucher_id, created_at, updated_at) VALUES
(1, 'Ramadan Kareem',       '20% off all beverages',     '/images/promos/ramadan-banner.jpg',  1, 1, NOW() - interval '15 days', NOW() + interval '15 days', TRUE, 'detail', 4, NOW() - interval '15 days', NOW()),
(2, 'New Store Opening',    'KLCC Park is NOW OPEN!',    '/images/promos/klcc-park-banner.jpg',2, 2, NOW() - interval '75 days', NOW() + interval '30 days', TRUE, 'detail', NULL, NOW() - interval '75 days', NOW()),
(3, 'Happy Hour 2-4PM',     'Buy 1 Free 1 all lattes',   '/images/promos/happy-hour.jpg',      3, 1, NOW() - interval '5 days',  NOW() + interval '25 days', TRUE, 'detail', 3, NOW() - interval '5 days',  NOW());

SELECT setval('promo_banners_id_seq', 3);

INSERT INTO splash_content (id, image_url, title, subtitle, cta_text, cta_url, dismissible, active_from, active_until, is_active, fallback_title, fallback_subtitle, created_at, updated_at) VALUES
(1, '/images/splash/ramadan-splash.jpg', 'Ramadan Kareem',   'Special deals this holy month',          'Shop Now',  '/promo/ramadan', TRUE,  NOW() - interval '15 days', NOW() + interval '15 days', TRUE, 'Welcome to ZUS Coffee', 'The best coffee in KL', NOW() - interval '15 days', NOW()),
(2, '/images/splash/new-user.jpg',       'Welcome!',         'Get 10% off your first order',           'Claim Now', '/vouchers',      TRUE,  NOW() - interval '90 days', NULL,                       TRUE, 'Welcome to ZUS Coffee', 'The best coffee in KL', NOW() - interval '90 days', NOW());

SELECT setval('splash_content_id_seq', 2);

INSERT INTO app_config (id, key, value, updated_at) VALUES
(1,  'min_delivery_order',  '15.00',          NOW()),
(2,  'delivery_fee',        '3.00',           NOW()),
(3,  'loyalty_points_rate', '1',              NOW()),
(4,  'tax_rate',            '0.06',           NOW()),
(5,  'currency',            'MYR',            NOW()),
(6,  'max_order_items',     '20',             NOW()),
(7,  'pickup_lead_minutes', '15',             NOW()),
(8,  'support_phone',       '+60323818888',   NOW()),
(9,  'support_email',       'hello@zus.my',   NOW()),
(10, 'app_version',         '2.1.0',          NOW());

SELECT setval('app_config_id_seq', 10);

INSERT INTO inventory_items (id, store_id, name, current_stock, unit, reorder_level, cost_per_unit, updated_at) VALUES
(1,  1, 'Arabica Coffee Beans',     25.00,  'kg',    5.00,   85.00,  NOW()),
(2,  1, 'Whole Milk',               50.00,  'litre', 10.00,  6.50,   NOW()),
(3,  1, 'Oat Milk',                 20.00,  'litre', 5.00,   12.00,  NOW()),
(4,  1, 'Almond Milk',              15.00,  'litre', 3.00,   14.00,  NOW()),
(5,  1, 'Sugar Syrup',              10.00,  'litre', 2.00,   4.50,   NOW()),
(6,  1, 'Caramel Syrup',            8.00,   'litre', 2.00,   9.00,   NOW()),
(7,  1, 'Chocolate Syrup',          6.00,   'litre', 2.00,   8.50,   NOW()),
(8,  1, 'Vanilla Syrup',            7.00,   'litre', 2.00,   7.50,   NOW()),
(9,  1, 'Croissant Dough',          40.00,  'pcs',   10.00,  2.50,   NOW()),
(10, 1, 'Kaya Jam',                 5.00,   'kg',    1.00,   15.00,  NOW()),
(11, 1, 'Matcha Powder',            3.00,   'kg',    0.50,   120.00, NOW()),
(12, 1, 'Cups (Regular)',           500.00, 'pcs',   100.00, 0.15,   NOW()),
(13, 1, 'Cups (Large)',             300.00, 'pcs',   50.00,  0.20,   NOW()),
(14, 1, 'Lids',                     800.00, 'pcs',   100.00, 0.10,   NOW()),
(15, 2, 'Arabica Coffee Beans',     20.00,  'kg',    5.00,   85.00,  NOW()),
(16, 2, 'Whole Milk',               40.00,  'litre', 10.00,  6.50,   NOW()),
(17, 2, 'Oat Milk',                 15.00,  'litre', 5.00,   12.00,  NOW()),
(18, 2, 'Almond Milk',              10.00,  'litre', 3.00,   14.00,  NOW()),
(19, 2, 'Sugar Syrup',              8.00,   'litre', 2.00,   4.50,   NOW()),
(20, 2, 'Caramel Syrup',            5.00,   'litre', 2.00,   9.00,   NOW()),
(21, 2, 'Croissant Dough',          30.00,  'pcs',   10.00,  2.50,   NOW()),
(22, 2, 'Kaya Jam',                 3.00,   'kg',    1.00,   15.00,  NOW()),
(23, 2, 'Cups (Regular)',           400.00, 'pcs',   100.00, 0.15,   NOW()),
(24, 2, 'Cups (Large)',             200.00, 'pcs',   50.00,  0.20,   NOW()),
(25, 2, 'Lids',                     600.00, 'pcs',   100.00, 0.10,   NOW()),
(26, 3, 'Arabica Beans',            25.00,  'kg',    5.00,   85.00,  NOW()),
(27, 3, 'Whole Milk',               50.00,  'litre', 10.00,  6.50,   NOW()),
(28, 3, 'Matcha Powder',            2.00,   'kg',    0.50,   120.00, NOW()),
(29, 3, 'Cups (Regular)',           200.00, 'pcs',   50.00,  0.15,   NOW()),
(30, 3, 'Lids',                     250.00, 'pcs',   50.00,  0.10,   NOW());

SELECT setval('inventory_items_id_seq', 30);

INSERT INTO favorites (id, user_id, item_id, created_at) VALUES
(1, 2, 2,  NOW() - interval '50 days'),
(2, 2, 12, NOW() - interval '48 days'),
(3, 3, 3,  NOW() - interval '45 days'),
(4, 3, 6,  NOW() - interval '40 days'),
(5, 4, 6,  NOW() - interval '42 days'),
(6, 4, 16, NOW() - interval '38 days'),
(7, 5, 16, NOW() - interval '35 days'),
(8, 5, 15, NOW() - interval '30 days'),
(9, 5, 3,  NOW() - interval '28 days'),
(10, 6, 7,  NOW() - interval '20 days'),
(11, 2, 25, NOW() - interval '15 days'),
(12, 3, 29, NOW() - interval '10 days');

SELECT setval('favorites_id_seq', 12);

INSERT INTO notifications (id, user_id, title, body, type, is_read, created_at) VALUES
(1,  2, 'Order Confirmed',        'Your order ORD-20260301001 has been confirmed!',          'order',     TRUE,  NOW() - interval '40 days'),
(2,  2, 'Loyalty Points Earned',  'You earned 26 loyalty points from your order.',           'loyalty',   TRUE,  NOW() - interval '39 days'),
(3,  3, 'Order Ready for Pickup', 'Your order ORD-20260305002 is ready for pickup.',         'order',     TRUE,  NOW() - interval '38 days'),
(4,  4, 'Tier Upgrade!',          'Congratulations! You reached Gold tier.',                 'loyalty',   TRUE,  NOW() - interval '20 days'),
(5,  5, 'Platinum Perks',         'Enjoy 2x points on all purchases!',                       'promo',     TRUE,  NOW() - interval '10 days'),
(6,  5, 'Reward Redeemed',        'You redeemed a free Cappuccino reward.',                   'reward',    TRUE,  NOW() - interval '15 days'),
(7,  6, 'Welcome!',               'Welcome to ZUS Coffee! Use WELCOME10 for 10% off.',       'promo',     TRUE,  NOW() - interval '28 days'),
(8,  2, 'Order Confirmed',        'Your order ORD-20260403010 has been confirmed!',          'order',     TRUE,  NOW() - interval '10 days'),
(9,  3, 'Voucher Available',      'You have a FREECOFFEE voucher ready to use!',             'voucher',   FALSE, NOW() - interval '10 days'),
(10, 2, 'New Promo',              'Happy Hour 2-4PM: Buy 1 Free 1 all lattes!',              'promo',     FALSE, NOW() - interval '5 days'),
(11, 5, 'Order Ready',            'Your pickup order ORD-20260409013 is ready!',             'order',     FALSE, NOW() - interval '4 days'),
(12, 6, 'Points Earned',          'You earned 8 loyalty points from your recent order.',     'loyalty',   FALSE, NOW() - interval '1 day'),
(13, 2, 'KLCC Park Order',        'Your pickup order at KLCC Park is confirmed!',            'order',     TRUE,  NOW() - interval '19 days'),
(14, 3, 'Cheras Order Ready',     'Your order at Cheras outlet is ready for pickup!',        'order',     FALSE, NOW() - interval '5 days'),
(15, 5, 'Delivery Arriving',      'Your delivery from Cheras is on its way!',                'order',     TRUE,  NOW() - interval '2 days');

SELECT setval('notifications_id_seq', 15);

INSERT INTO referrals (id, referrer_id, invitee_id, code, reward_amount, created_at) VALUES
(1, 2, 6, 'REF-AHMAD01', 5.00, NOW() - interval '30 days');

SELECT setval('referrals_id_seq', 1);

INSERT INTO device_tokens (id, user_id, token, platform, created_at) VALUES
(1, 2, 'fcm_token_ahmad_iphone_001',     'ios',     NOW() - interval '55 days'),
(2, 3, 'fcm_token_sarah_android_001',     'android', NOW() - interval '50 days'),
(3, 4, 'fcm_token_raj_iphone_001',        'ios',     NOW() - interval '45 days'),
(4, 5, 'fcm_token_mei_android_001',       'android', NOW() - interval '40 days'),
(5, 6, 'fcm_token_aida_iphone_001',       'ios',     NOW() - interval '25 days'),
(6, 7, 'fcm_token_amirul_android_001',    'android', NOW() - interval '80 days');

SELECT setval('device_tokens_id_seq', 6);

INSERT INTO user_addresses (id, user_id, label, address, lat, lng, is_default, created_at) VALUES
(1, 2, 'Office',  'Level 25, Menara Standard Chartered, Jalan Sultan Ismail, 50460 KL', 3.1575000, 101.7128000, TRUE,  NOW() - interval '55 days'),
(2, 3, 'Home',    'Avenue K Residences, Jalan Ampang, 50450 KL',                         3.1608000, 101.7145000, TRUE,  NOW() - interval '50 days'),
(3, 4, 'Office',  'Menara TA One, 22 Jalan P. Ramlee, 50250 KL',                         3.1543000, 101.7107000, TRUE,  NOW() - interval '45 days'),
(4, 4, 'Home',    'The Troika, 11 Jalan Binjai, 55000 KL',                               3.1605000, 101.7180000, FALSE, NOW() - interval '40 days'),
(5, 5, 'Home',    'KLCC Condo, Jalan Binjai, 55000 KL',                                  3.1612000, 101.7178000, TRUE,  NOW() - interval '40 days'),
(6, 5, 'Office',  'Petronas Twin Towers, Level 40, 50088 KL',                            3.1584800, 101.7123600, FALSE, NOW() - interval '35 days'),
(7, 6, 'Home',    'Vista KL, Jalan Tun Razak, 50400 KL',                                 3.1621000, 101.7155000, TRUE,  NOW() - interval '25 days');

SELECT setval('user_addresses_id_seq', 7);

INSERT INTO payment_methods (id, user_id, type, provider, last4, is_default) VALUES
(1, 2, 'card',  'visa',       '4242', FALSE),
(2, 2, 'ewallet', 'tng',     NULL,   FALSE),
(3, 3, 'card',  'mastercard', '8888', TRUE),
(4, 3, 'card',  'visa',       '1234', FALSE),
(5, 4, 'card',  'mastercard', '5678', TRUE),
(6, 5, 'card',  'visa',       '9999', TRUE),
(7, 5, 'ewallet', 'grabpay', NULL,    FALSE);

SELECT setval('payment_methods_id_seq', 7);

INSERT INTO otp_sessions (id, phone, code, verified, expires_at, created_at) VALUES
(1, '+60177889900', '123456', TRUE,  NOW() - interval '59 days', NOW() - interval '60 days'),
(2, '+60199887766', '654321', TRUE,  NOW() - interval '54 days', NOW() - interval '55 days'),
(3, '+60155667788', '111222', TRUE,  NOW() - interval '49 days', NOW() - interval '50 days'),
(4, '+60133445566', '333444', TRUE,  NOW() - interval '44 days', NOW() - interval '45 days'),
(5, '+60112233445', '555666', TRUE,  NOW() - interval '29 days', NOW() - interval '30 days');

SELECT setval('otp_sessions_id_seq', 5);

-- Surveys
INSERT INTO surveys (id, title, description, reward_voucher_id, is_active, created_at, updated_at) VALUES
(1, 'Customer Satisfaction', 'Tell us about your experience and earn a reward!', 1, TRUE, NOW() - interval '30 days', NOW());

SELECT setval('surveys_id_seq', 1);

INSERT INTO survey_questions (id, survey_id, question_text, question_type, options, is_required, sort_order, created_at) VALUES
(1, 1, 'How would you rate your overall experience?', 'rating', NULL, TRUE, 0, NOW() - interval '30 days'),
(2, 1, 'What can we improve?', 'text', NULL, FALSE, 1, NOW() - interval '30 days');

SELECT setval('survey_questions_id_seq', 2);

COMMIT;
