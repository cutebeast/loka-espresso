-- ============================================================
-- Loyalty Seed Data for FNB Super-App
-- Append-style: deletes existing records for affected IDs before re-insert
-- Run with: /root/fnb-manage.sh seed_loyalty
-- ============================================================

BEGIN;

-- Clean up existing data for customers (IDs 11-75)
DELETE FROM loyalty_transactions WHERE user_id BETWEEN 11 AND 75;
DELETE FROM wallet_transactions WHERE user_id BETWEEN 11 AND 75;
DELETE FROM loyalty_accounts WHERE user_id BETWEEN 11 AND 75;
DELETE FROM wallets WHERE user_id BETWEEN 11 AND 75;
DELETE FROM orders WHERE user_id BETWEEN 11 AND 75;

-- ============================================================
-- STEP 1: Create loyalty accounts for ALL customers (IDs 11-75)
-- Tier distribution: Bronze=19, Silver=22, Gold=18, Platinum=6
-- ============================================================

-- Customers 11-15 (original)
INSERT INTO loyalty_accounts (user_id, points_balance, tier, total_points_earned, created_at, updated_at)
VALUES
    (11, 650, 'silver', 720, NOW() - INTERVAL '60 days', NOW()),
    (12, 1200, 'gold', 1450, NOW() - INTERVAL '55 days', NOW()),
    (13, 280, 'bronze', 350, NOW() - INTERVAL '50 days', NOW()),
    (14, 3200, 'platinum', 4100, NOW() - INTERVAL '48 days', NOW()),
    (15, 890, 'silver', 1050, NOW() - INTERVAL '45 days', NOW());

-- Customers 16-75 (seeded customers)
INSERT INTO loyalty_accounts (user_id, points_balance, tier, total_points_earned, created_at, updated_at)
VALUES
    (16, 150, 'bronze', 200, NOW() - INTERVAL '120 days', NOW()),
    (17, 320, 'bronze', 450, NOW() - INTERVAL '115 days', NOW()),
    (18, 45, 'bronze', 80, NOW() - INTERVAL '110 days', NOW()),
    (19, 480, 'bronze', 520, NOW() - INTERVAL '105 days', NOW()),
    (20, 210, 'bronze', 300, NOW() - INTERVAL '100 days', NOW()),
    (21, 550, 'silver', 620, NOW() - INTERVAL '95 days', NOW()),
    (22, 780, 'silver', 900, NOW() - INTERVAL '90 days', NOW()),
    (23, 1100, 'gold', 1350, NOW() - INTERVAL '85 days', NOW()),
    (24, 150, 'bronze', 200, NOW() - INTERVAL '80 days', NOW()),
    (25, 420, 'bronze', 500, NOW() - INTERVAL '75 days', NOW()),
    (26, 680, 'silver', 750, NOW() - INTERVAL '70 days', NOW()),
    (27, 920, 'silver', 1100, NOW() - INTERVAL '65 days', NOW()),
    (28, 2100, 'gold', 2500, NOW() - INTERVAL '60 days', NOW()),
    (29, 350, 'bronze', 400, NOW() - INTERVAL '55 days', NOW()),
    (30, 590, 'silver', 680, NOW() - INTERVAL '50 days', NOW()),
    (31, 1250, 'gold', 1500, NOW() - INTERVAL '45 days', NOW()),
    (32, 180, 'bronze', 220, NOW() - INTERVAL '40 days', NOW()),
    (33, 440, 'bronze', 520, NOW() - INTERVAL '38 days', NOW()),
    (34, 720, 'silver', 850, NOW() - INTERVAL '36 days', NOW()),
    (35, 980, 'silver', 1150, NOW() - INTERVAL '34 days', NOW()),
    (36, 1400, 'gold', 1700, NOW() - INTERVAL '32 days', NOW()),
    (37, 2800, 'platinum', 3400, NOW() - INTERVAL '30 days', NOW()),
    (38, 290, 'bronze', 350, NOW() - INTERVAL '28 days', NOW()),
    (39, 510, 'silver', 600, NOW() - INTERVAL '26 days', NOW()),
    (40, 870, 'silver', 1000, NOW() - INTERVAL '24 days', NOW()),
    (41, 1150, 'gold', 1400, NOW() - INTERVAL '22 days', NOW()),
    (42, 1650, 'gold', 2000, NOW() - INTERVAL '20 days', NOW()),
    (43, 230, 'bronze', 280, NOW() - INTERVAL '18 days', NOW()),
    (44, 480, 'bronze', 550, NOW() - INTERVAL '16 days', NOW()),
    (45, 650, 'silver', 750, NOW() - INTERVAL '14 days', NOW()),
    (46, 820, 'silver', 950, NOW() - INTERVAL '12 days', NOW()),
    (47, 1050, 'gold', 1250, NOW() - INTERVAL '10 days', NOW()),
    (48, 1900, 'gold', 2300, NOW() - INTERVAL '8 days', NOW()),
    (49, 2600, 'platinum', 3100, NOW() - INTERVAL '6 days', NOW()),
    (50, 380, 'bronze', 450, NOW() - INTERVAL '5 days', NOW()),
    (51, 520, 'silver', 600, NOW() - INTERVAL '4 days', NOW()),
    (52, 750, 'silver', 880, NOW() - INTERVAL '3 days', NOW()),
    (53, 920, 'silver', 1050, NOW() - INTERVAL '2 days', NOW()),
    (54, 1100, 'gold', 1300, NOW() - INTERVAL '1 day', NOW()),
    (55, 1450, 'gold', 1750, NOW(), NOW()),
    (56, 200, 'bronze', 250, NOW(), NOW()),
    (57, 350, 'bronze', 420, NOW(), NOW()),
    (58, 580, 'silver', 680, NOW(), NOW()),
    (59, 780, 'silver', 920, NOW(), NOW()),
    (60, 950, 'silver', 1100, NOW(), NOW()),
    (61, 1200, 'gold', 1450, NOW(), NOW()),
    (62, 1550, 'gold', 1850, NOW(), NOW()),
    (63, 2200, 'gold', 2650, NOW(), NOW()),
    (64, 2900, 'platinum', 3500, NOW(), NOW()),
    (65, 3100, 'platinum', 3800, NOW(), NOW()),
    (66, 180, 'bronze', 220, NOW(), NOW()),
    (67, 350, 'bronze', 420, NOW(), NOW()),
    (68, 520, 'silver', 600, NOW(), NOW()),
    (69, 680, 'silver', 800, NOW(), NOW()),
    (70, 850, 'silver', 1000, NOW(), NOW()),
    (71, 1050, 'gold', 1250, NOW(), NOW()),
    (72, 1300, 'gold', 1550, NOW(), NOW()),
    (73, 1600, 'gold', 1900, NOW(), NOW()),
    (74, 2000, 'gold', 2400, NOW(), NOW()),
    (75, 2700, 'platinum', 3200, NOW(), NOW());

-- ============================================================
-- STEP 2: Create wallets for ALL customers
-- ============================================================

INSERT INTO wallets (user_id, balance, currency)
SELECT id, 50.00 + (random() * 50)::numeric(10,2), 'MYR'
FROM users WHERE id BETWEEN 11 AND 75;

-- ============================================================
-- STEP 3: Create loyalty transactions (welcome bonus + earn)
-- ============================================================

-- Welcome bonus for all customers
INSERT INTO loyalty_transactions (user_id, order_id, store_id, points, type, description, created_at, created_by)
SELECT id, NULL, NULL, 50, 'earn', 'Welcome bonus - New account registration', created_at, 1
FROM users WHERE id BETWEEN 11 AND 75;

-- Earn transactions for first 10 customers (not linked to orders to avoid FK issues)
INSERT INTO loyalty_transactions (user_id, order_id, store_id, points, type, description, created_at, created_by)
VALUES
(11, NULL, 1, 39, 'earn', 'In-store purchase - 39.00 RM', NOW() - INTERVAL '10 days', 1),
(11, NULL, 2, 10, 'earn', 'Pickup order - 10.00 RM', NOW() - INTERVAL '5 days', 1),
(12, NULL, 1, 34, 'earn', 'In-store purchase - 34.00 RM', NOW() - INTERVAL '15 days', 1),
(12, NULL, 3, 43, 'earn', 'Delivery order - 43.50 RM', NOW() - INTERVAL '8 days', 1),
(13, NULL, 1, 8, 'earn', 'Pickup order - 8.00 RM', NOW() - INTERVAL '20 days', 1),
(14, NULL, 1, 76, 'earn', 'In-store purchase - 76.00 RM', NOW() - INTERVAL '25 days', 1),
(14, NULL, 2, 46, 'earn', 'In-store purchase - 46.00 RM', NOW() - INTERVAL '18 days', 1),
(14, NULL, 3, 14, 'earn', 'Pickup order - 14.00 RM', NOW() - INTERVAL '7 days', 1),
(15, NULL, 1, 41, 'earn', 'Delivery order - 41.50 RM', NOW() - INTERVAL '12 days', 1),
(15, NULL, 2, 11, 'earn', 'In-store purchase - 11.00 RM', NOW() - INTERVAL '3 days', 1);

-- ============================================================
-- STEP 4: Create wallet transactions (topups + payments)
-- ============================================================

-- Initial topup for all customers
INSERT INTO wallet_transactions (wallet_id, user_id, amount, type, description, created_at, balance_after)
SELECT w.id, w.user_id, 50.00, 'topup', 'Initial wallet credit',
       u.created_at - INTERVAL '1 day', 50.00 + w.balance
FROM wallets w JOIN users u ON u.id = w.user_id WHERE w.user_id BETWEEN 11 AND 75;

-- Additional wallet transactions for select customers
INSERT INTO wallet_transactions (wallet_id, user_id, amount, type, description, created_at, balance_after)
SELECT w.id, w.user_id, 30.00, 'topup', 'E-wallet topup', NOW() - INTERVAL '7 days', 80.00
FROM wallets w WHERE w.user_id = 11
UNION ALL
SELECT w.id, w.user_id, -15.00, 'payment', 'Order payment', NOW() - INTERVAL '3 days', 65.00
FROM wallets w WHERE w.user_id = 11
UNION ALL
SELECT w.id, w.user_id, 50.00, 'topup', 'E-wallet topup', NOW() - INTERVAL '10 days', 90.00
FROM wallets w WHERE w.user_id = 12
UNION ALL
SELECT w.id, w.user_id, -20.00, 'payment', 'Order payment', NOW() - INTERVAL '5 days', 70.00
FROM wallets w WHERE w.user_id = 12
UNION ALL
SELECT w.id, w.user_id, 100.00, 'topup', 'E-wallet topup', NOW() - INTERVAL '15 days', 150.00
FROM wallets w WHERE w.user_id = 14
UNION ALL
SELECT w.id, w.user_id, -45.00, 'payment', 'Order payment', NOW() - INTERVAL '8 days', 105.00
FROM wallets w WHERE w.user_id = 14;

-- ============================================================
-- STEP 5: Create orders for customers 11-65
-- ============================================================

INSERT INTO orders (
    user_id, store_id, table_id, order_number, order_type,
    items, subtotal, delivery_fee, discount, total,
    status, payment_method, payment_status, loyalty_points_earned,
    notes, created_at, updated_at
) VALUES
-- Customer 11
(11, 1, 3, 'ORD-C11-001', 'dine_in', '[{"name":"Cappuccino","price":12.00,"quantity":2},{"name":"Cheesecake","price":15.00,"quantity":1}]'::jsonb, 39.00, 0.00, 0.00, 39.00, 'completed', 'card', 'paid', 39, NULL, NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),
(11, 2, NULL, 'ORD-C11-002', 'pickup', '[{"name":"Americano","price":10.00,"quantity":1}]'::jsonb, 10.00, 0.00, 0.00, 10.00, 'completed', 'ewallet', 'paid', 10, NULL, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
-- Customer 12
(12, 1, 5, 'ORD-C12-001', 'dine_in', '[{"name":"Latte","price":13.00,"quantity":2},{"name":"Blueberry Muffin","price":8.00,"quantity":1}]'::jsonb, 34.00, 0.00, 0.00, 34.00, 'completed', 'card', 'paid', 34, NULL, NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days'),
(12, 3, NULL, 'ORD-C12-002', 'delivery', '[{"name":"Cold Brew","price":12.00,"quantity":3}]'::jsonb, 36.00, 7.50, 0.00, 43.50, 'completed', 'card', 'paid', 43, NULL, NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),
-- Customer 13
(13, 1, NULL, 'ORD-C13-001', 'pickup', '[{"name":"Espresso","price":8.00,"quantity":1}]'::jsonb, 8.00, 0.00, 0.00, 8.00, 'completed', 'cash', 'paid', 8, NULL, NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days'),
-- Customer 14 (platinum)
(14, 1, 2, 'ORD-C14-001', 'dine_in', '[{"name":"Signature Latte","price":15.00,"quantity":3},{"name":"Tiramisu","price":18.00,"quantity":2}]'::jsonb, 81.00, 0.00, 5.00, 76.00, 'completed', 'card', 'paid', 76, 'Birthday celebration', NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days'),
(14, 2, 4, 'ORD-C14-002', 'dine_in', '[{"name":"Mocha","price":14.00,"quantity":2},{"name":"Croissant","price":9.00,"quantity":2}]'::jsonb, 46.00, 0.00, 0.00, 46.00, 'completed', 'ewallet', 'paid', 46, NULL, NOW() - INTERVAL '18 days', NOW() - INTERVAL '18 days'),
(14, 3, NULL, 'ORD-C14-003', 'pickup', '[{"name":"Matcha Latte","price":14.00,"quantity":1}]'::jsonb, 14.00, 0.00, 0.00, 14.00, 'completed', 'card', 'paid', 14, NULL, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days'),
-- Customer 15
(15, 1, NULL, 'ORD-C15-001', 'delivery', '[{"name":"Cappuccino","price":12.00,"quantity":2},{"name":"Banana Bread","price":10.00,"quantity":1}]'::jsonb, 34.00, 7.50, 0.00, 41.50, 'completed', 'card', 'paid', 41, NULL, NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days'),
(15, 2, 6, 'ORD-C15-002', 'dine_in', '[{"name":"Flat White","price":11.00,"quantity":1}]'::jsonb, 11.00, 0.00, 0.00, 11.00, 'completed', 'cash', 'paid', 11, NULL, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
-- Customers 16-25
(16, 1, NULL, 'ORD-C16-001', 'pickup', '[{"name":"Americano","price":10.00,"quantity":1}]'::jsonb, 10.00, 0.00, 0.00, 10.00, 'completed', 'ewallet', 'paid', 10, NULL, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'),
(17, 2, 1, 'ORD-C17-001', 'dine_in', '[{"name":"Latte","price":13.00,"quantity":2},{"name":"Cheesecake","price":15.00,"quantity":1}]'::jsonb, 41.00, 0.00, 0.00, 41.00, 'completed', 'card', 'paid', 41, NULL, NOW() - INTERVAL '28 days', NOW() - INTERVAL '28 days'),
(18, 1, NULL, 'ORD-C18-001', 'pickup', '[{"name":"Espresso","price":8.00,"quantity":1}]'::jsonb, 8.00, 0.00, 0.00, 8.00, 'completed', 'cash', 'paid', 8, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
(19, 3, NULL, 'ORD-C19-001', 'delivery', '[{"name":"Cold Brew","price":12.00,"quantity":2},{"name":"Muffin","price":7.00,"quantity":1}]'::jsonb, 31.00, 7.50, 0.00, 38.50, 'completed', 'card', 'paid', 38, NULL, NOW() - INTERVAL '22 days', NOW() - INTERVAL '22 days'),
(20, 1, 7, 'ORD-C20-001', 'dine_in', '[{"name":"Cappuccino","price":12.00,"quantity":1},{"name":"Croissant","price":9.00,"quantity":1}]'::jsonb, 21.00, 0.00, 0.00, 21.00, 'completed', 'card', 'paid', 21, NULL, NOW() - INTERVAL '18 days', NOW() - INTERVAL '18 days'),
(21, 2, NULL, 'ORD-C21-001', 'pickup', '[{"name":"Mocha","price":14.00,"quantity":2}]'::jsonb, 28.00, 0.00, 0.00, 28.00, 'completed', 'ewallet', 'paid', 28, NULL, NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days'),
(22, 1, 3, 'ORD-C22-001', 'dine_in', '[{"name":"Latte","price":13.00,"quantity":1},{"name":"Blueberry Muffin","price":8.00,"quantity":1}]'::jsonb, 21.00, 0.00, 0.00, 21.00, 'completed', 'card', 'paid', 21, NULL, NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),
(23, 3, NULL, 'ORD-C23-001', 'delivery', '[{"name":"Matcha Latte","price":14.00,"quantity":2},{"name":"Cake Pop","price":6.00,"quantity":2}]'::jsonb, 40.00, 7.50, 0.00, 47.50, 'completed', 'card', 'paid', 47, NULL, NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),
(24, 1, NULL, 'ORD-C24-001', 'pickup', '[{"name":"Americano","price":10.00,"quantity":1}]'::jsonb, 10.00, 0.00, 0.00, 10.00, 'completed', 'cash', 'paid', 10, NULL, NOW() - INTERVAL '35 days', NOW() - INTERVAL '35 days'),
(25, 2, 5, 'ORD-C25-001', 'dine_in', '[{"name":"Flat White","price":11.00,"quantity":2}]'::jsonb, 22.00, 0.00, 0.00, 22.00, 'completed', 'card', 'paid', 22, NULL, NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days'),
-- Customers 26-35
(26, 1, NULL, 'ORD-C26-001', 'pickup', '[{"name":"Cappuccino","price":12.00,"quantity":1}]'::jsonb, 12.00, 0.00, 0.00, 12.00, 'completed', 'ewallet', 'paid', 12, NULL, NOW() - INTERVAL '16 days', NOW() - INTERVAL '16 days'),
(27, 3, NULL, 'ORD-C27-001', 'delivery', '[{"name":"Cold Brew","price":12.00,"quantity":1},{"name":"Cookie","price":5.00,"quantity":1}]'::jsonb, 17.00, 7.50, 0.00, 24.50, 'completed', 'card', 'paid', 24, NULL, NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days'),
(28, 1, 2, 'ORD-C28-001', 'dine_in', '[{"name":"Signature Latte","price":15.00,"quantity":2},{"name":"Cheesecake","price":15.00,"quantity":1}]'::jsonb, 45.00, 0.00, 0.00, 45.00, 'completed', 'card', 'paid', 45, NULL, NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days'),
(29, 2, NULL, 'ORD-C29-001', 'pickup', '[{"name":"Espresso","price":8.00,"quantity":1}]'::jsonb, 8.00, 0.00, 0.00, 8.00, 'completed', 'cash', 'paid', 8, NULL, NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days'),
(30, 1, 4, 'ORD-C30-001', 'dine_in', '[{"name":"Latte","price":13.00,"quantity":1}]'::jsonb, 13.00, 0.00, 0.00, 13.00, 'completed', 'card', 'paid', 13, NULL, NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days'),
(31, 2, NULL, 'ORD-C31-001', 'pickup', '[{"name":"Mocha","price":14.00,"quantity":2}]'::jsonb, 28.00, 0.00, 0.00, 28.00, 'completed', 'card', 'paid', 28, NULL, NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days'),
(32, 3, NULL, 'ORD-C32-001', 'delivery', '[{"name":"Americano","price":10.00,"quantity":1}]'::jsonb, 10.00, 7.50, 0.00, 17.50, 'completed', 'ewallet', 'paid', 17, NULL, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'),
(33, 1, 6, 'ORD-C33-001', 'dine_in', '[{"name":"Cappuccino","price":12.00,"quantity":1}]'::jsonb, 12.00, 0.00, 0.00, 12.00, 'completed', 'card', 'paid', 12, NULL, NOW() - INTERVAL '18 days', NOW() - INTERVAL '18 days'),
(34, 2, NULL, 'ORD-C34-001', 'pickup', '[{"name":"Latte","price":13.00,"quantity":1},{"name":"Croissant","price":9.00,"quantity":1}]'::jsonb, 22.00, 0.00, 0.00, 22.00, 'completed', 'cash', 'paid', 22, NULL, NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days'),
(35, 1, 1, 'ORD-C35-001', 'dine_in', '[{"name":"Flat White","price":11.00,"quantity":2}]'::jsonb, 22.00, 0.00, 0.00, 22.00, 'completed', 'card', 'paid', 22, NULL, NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),
-- Customers 36-45
(36, 3, NULL, 'ORD-C36-001', 'delivery', '[{"name":"Matcha Latte","price":14.00,"quantity":1}]'::jsonb, 14.00, 7.50, 0.00, 21.50, 'completed', 'card', 'paid', 21, NULL, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
(37, 1, 3, 'ORD-C37-001', 'dine_in', '[{"name":"Signature Latte","price":15.00,"quantity":3},{"name":"Tiramisu","price":18.00,"quantity":1}]'::jsonb, 63.00, 0.00, 0.00, 63.00, 'completed', 'card', 'paid', 63, NULL, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
(38, 2, NULL, 'ORD-C38-001', 'pickup', '[{"name":"Espresso","price":8.00,"quantity":1}]'::jsonb, 8.00, 0.00, 0.00, 8.00, 'completed', 'cash', 'paid', 8, NULL, NOW() - INTERVAL '22 days', NOW() - INTERVAL '22 days'),
(39, 1, 5, 'ORD-C39-001', 'dine_in', '[{"name":"Latte","price":13.00,"quantity":1}]'::jsonb, 13.00, 0.00, 0.00, 13.00, 'completed', 'card', 'paid', 13, NULL, NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days'),
(40, 3, NULL, 'ORD-C40-001', 'pickup', '[{"name":"Cold Brew","price":12.00,"quantity":2}]'::jsonb, 24.00, 0.00, 0.00, 24.00, 'completed', 'ewallet', 'paid', 24, NULL, NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),
(41, 1, NULL, 'ORD-C41-001', 'delivery', '[{"name":"Cappuccino","price":12.00,"quantity":2}]'::jsonb, 24.00, 7.50, 0.00, 31.50, 'completed', 'card', 'paid', 31, NULL, NOW() - INTERVAL '18 days', NOW() - INTERVAL '18 days'),
(42, 2, 2, 'ORD-C42-001', 'dine_in', '[{"name":"Mocha","price":14.00,"quantity":1},{"name":"Cheesecake","price":15.00,"quantity":1}]'::jsonb, 29.00, 0.00, 0.00, 29.00, 'completed', 'card', 'paid', 29, NULL, NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days'),
(43, 1, NULL, 'ORD-C43-001', 'pickup', '[{"name":"Americano","price":10.00,"quantity":1}]'::jsonb, 10.00, 0.00, 0.00, 10.00, 'completed', 'cash', 'paid', 10, NULL, NOW() - INTERVAL '28 days', NOW() - INTERVAL '28 days'),
(44, 3, NULL, 'ORD-C44-001', 'delivery', '[{"name":"Latte","price":13.00,"quantity":1}]'::jsonb, 13.00, 7.50, 0.00, 20.50, 'completed', 'ewallet', 'paid', 20, NULL, NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days'),
(45, 1, 4, 'ORD-C45-001', 'dine_in', '[{"name":"Flat White","price":11.00,"quantity":1}]'::jsonb, 11.00, 0.00, 0.00, 11.00, 'completed', 'card', 'paid', 11, NULL, NOW() - INTERVAL '16 days', NOW() - INTERVAL '16 days'),
-- Customers 46-55
(46, 2, NULL, 'ORD-C46-001', 'pickup', '[{"name":"Matcha Latte","price":14.00,"quantity":1}]'::jsonb, 14.00, 0.00, 0.00, 14.00, 'completed', 'card', 'paid', 14, NULL, NOW() - INTERVAL '11 days', NOW() - INTERVAL '11 days'),
(47, 1, 6, 'ORD-C47-001', 'dine_in', '[{"name":"Cappuccino","price":12.00,"quantity":2}]'::jsonb, 24.00, 0.00, 0.00, 24.00, 'completed', 'card', 'paid', 24, NULL, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days'),
(48, 3, NULL, 'ORD-C48-001', 'delivery', '[{"name":"Cold Brew","price":12.00,"quantity":2},{"name":"Cookie","price":5.00,"quantity":2}]'::jsonb, 34.00, 7.50, 0.00, 41.50, 'completed', 'card', 'paid', 41, NULL, NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),
(49, 1, 1, 'ORD-C49-001', 'dine_in', '[{"name":"Signature Latte","price":15.00,"quantity":2},{"name":"Tiramisu","price":18.00,"quantity":1}]'::jsonb, 48.00, 0.00, 0.00, 48.00, 'completed', 'card', 'paid', 48, NULL, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
(50, 2, NULL, 'ORD-C50-001', 'pickup', '[{"name":"Espresso","price":8.00,"quantity":1}]'::jsonb, 8.00, 0.00, 0.00, 8.00, 'completed', 'cash', 'paid', 8, NULL, NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days'),
(51, 1, NULL, 'ORD-C51-001', 'pickup', '[{"name":"Latte","price":13.00,"quantity":1}]'::jsonb, 13.00, 0.00, 0.00, 13.00, 'completed', 'card', 'paid', 13, NULL, NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days'),
(52, 2, 3, 'ORD-C52-001', 'dine_in', '[{"name":"Mocha","price":14.00,"quantity":1}]'::jsonb, 14.00, 0.00, 0.00, 14.00, 'completed', 'ewallet', 'paid', 14, NULL, NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),
(53, 3, NULL, 'ORD-C53-001', 'delivery', '[{"name":"Cappuccino","price":12.00,"quantity":1}]'::jsonb, 12.00, 7.50, 0.00, 19.50, 'completed', 'card', 'paid', 19, NULL, NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days'),
(54, 1, 5, 'ORD-C54-001', 'dine_in', '[{"name":"Flat White","price":11.00,"quantity":2}]'::jsonb, 22.00, 0.00, 0.00, 22.00, 'completed', 'card', 'paid', 22, NULL, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
(55, 2, NULL, 'ORD-C55-001', 'pickup', '[{"name":"Americano","price":10.00,"quantity":2}]'::jsonb, 20.00, 0.00, 0.00, 20.00, 'completed', 'cash', 'paid', 20, NULL, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
-- Customers 56-65
(56, 1, NULL, 'ORD-C56-001', 'pickup', '[{"name":"Espresso","price":8.00,"quantity":1}]'::jsonb, 8.00, 0.00, 0.00, 8.00, 'completed', 'card', 'paid', 8, NULL, NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),
(57, 3, 2, 'ORD-C57-001', 'dine_in', '[{"name":"Latte","price":13.00,"quantity":1}]'::jsonb, 13.00, 0.00, 0.00, 13.00, 'completed', 'ewallet', 'paid', 13, NULL, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
(58, 1, NULL, 'ORD-C58-001', 'delivery', '[{"name":"Cold Brew","price":12.00,"quantity":1}]'::jsonb, 12.00, 7.50, 0.00, 19.50, 'completed', 'card', 'paid', 19, NULL, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
(59, 2, 4, 'ORD-C59-001', 'dine_in', '[{"name":"Matcha Latte","price":14.00,"quantity":1}]'::jsonb, 14.00, 0.00, 0.00, 14.00, 'completed', 'card', 'paid', 14, NULL, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
(60, 1, NULL, 'ORD-C60-001', 'pickup', '[{"name":"Cappuccino","price":12.00,"quantity":1}]'::jsonb, 12.00, 0.00, 0.00, 12.00, 'completed', 'cash', 'paid', 12, NULL, NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days'),
(61, 2, 1, 'ORD-C61-001', 'dine_in', '[{"name":"Latte","price":13.00,"quantity":2},{"name":"Croissant","price":9.00,"quantity":1}]'::jsonb, 35.00, 0.00, 0.00, 35.00, 'completed', 'card', 'paid', 35, NULL, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days'),
(62, 1, NULL, 'ORD-C62-001', 'pickup', '[{"name":"Mocha","price":14.00,"quantity":1}]'::jsonb, 14.00, 0.00, 0.00, 14.00, 'completed', 'ewallet', 'paid', 14, NULL, NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),
(63, 3, 3, 'ORD-C63-001', 'dine_in', '[{"name":"Signature Latte","price":15.00,"quantity":2}]'::jsonb, 30.00, 0.00, 0.00, 30.00, 'completed', 'card', 'paid', 30, NULL, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
(64, 1, NULL, 'ORD-C64-001', 'delivery', '[{"name":"Cold Brew","price":12.00,"quantity":2}]'::jsonb, 24.00, 7.50, 0.00, 31.50, 'completed', 'card', 'paid', 31, NULL, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
(65, 2, 5, 'ORD-C65-001', 'dine_in', '[{"name":"Flat White","price":11.00,"quantity":1}]'::jsonb, 11.00, 0.00, 0.00, 11.00, 'completed', 'cash', 'paid', 11, NULL, NOW(), NOW());

-- ============================================================
-- Verification
-- ============================================================
SELECT 'loyalty_accounts' as table_name, COUNT(*) as count FROM loyalty_accounts
UNION ALL
SELECT 'wallets', COUNT(*) FROM wallets
UNION ALL
SELECT 'loyalty_transactions', COUNT(*) FROM loyalty_transactions
UNION ALL
SELECT 'wallet_transactions', COUNT(*) FROM wallet_transactions
UNION ALL
SELECT 'orders (new)', COUNT(*) FROM orders WHERE user_id BETWEEN 11 AND 65;

COMMIT;
