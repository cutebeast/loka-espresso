-- Seed customer test data for FNB Super-App
-- Run: docker exec -i fnb-db psql -U fnb -d fnb < seed_customers.sql

BEGIN;

-- ============================================
-- 1. Create customer users (IDs 2-6)
-- ============================================
INSERT INTO users (phone, email, name, password_hash, role, avatar_url, referral_code, is_active, created_at, updated_at) VALUES
('+6012345001', 'ahmad@example.com', 'Ahmad Razak', '$2b$12$dummyhash1', 'customer', NULL, 'AHMAD001', true, NOW() - interval '30 days', NOW() - interval '30 days'),
('+6012345002', 'siti@example.com', 'Siti Nurhaliza', '$2b$12$dummyhash2', 'customer', NULL, 'SITI002', true, NOW() - interval '25 days', NOW() - interval '25 days'),
('+6012345003', 'david@example.com', 'David Tan', '$2b$12$dummyhash3', 'customer', NULL, 'DAVID003', true, NOW() - interval '20 days', NOW() - interval '20 days'),
('+6012345004', 'mei@example.com', 'Mei Lin Wong', '$2b$12$dummyhash4', 'customer', NULL, 'MEI004', true, NOW() - interval '15 days', NOW() - interval '15 days'),
('+6012345005', 'raj@example.com', 'Raj Kumar', '$2b$12$dummyhash5', 'customer', NULL, 'RAJ005', true, NOW() - interval '5 days', NOW() - interval '5 days')
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- 2. Create wallets for customers
-- ============================================
INSERT INTO wallets (user_id, balance, currency) VALUES
(2, 45.50, 'MYR'),
(3, 120.00, 'MYR'),
(4, 8.75, 'MYR'),
(5, 200.00, 'MYR'),
(6, 0.00, 'MYR')
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- 3. Create loyalty accounts for customers
-- ============================================
INSERT INTO loyalty_accounts (user_id, points_balance, tier, total_points_earned, created_at, updated_at) VALUES
(2, 320, 'silver', 480, NOW() - interval '30 days', NOW()),
(3, 1250, 'gold', 1500, NOW() - interval '25 days', NOW()),
(4, 85, 'bronze', 85, NOW() - interval '20 days', NOW()),
(5, 2800, 'platinum', 3200, NOW() - interval '15 days', NOW()),
(6, 45, 'bronze', 45, NOW() - interval '5 days', NOW())
ON CONFLICT DO NOTHING;

-- ============================================
-- 4. Create orders for customers (realistic data)
-- ============================================

-- Ahmad (user 2) - 5 orders
INSERT INTO orders (user_id, store_id, table_id, order_number, order_type, items, subtotal, delivery_fee, discount, total, status, payment_method, payment_status, loyalty_points_earned, notes, created_at, updated_at) VALUES
(2, 1, 1, 'ORD-20260315-001', 'dine_in', '[{"name":"Caramel Macchiato","qty":1,"price":15.90},{"name":"Croissant","qty":1,"price":8.90}]'::json, 24.80, 0, 0, 24.80, 'completed', 'wallet', 'paid', 24, NULL, NOW() - interval '28 days', NOW() - interval '28 days'),
(2, 1, NULL, 'ORD-20260320-002', 'pickup', '[{"name":"Americano","qty":2,"price":10.90},{"name":"Matcha Latte","qty":1,"price":14.90}]'::json, 36.70, 0, 5.00, 31.70, 'completed', 'voucher', 'paid', 31, NULL, NOW() - interval '22 days', NOW() - interval '22 days'),
(2, 1, 3, 'ORD-20260328-003', 'dine_in', '[{"name":"Mocha","qty":1,"price":15.90},{"name":"Croissant","qty":2,"price":8.90}]'::json, 33.70, 0, 0, 33.70, 'completed', 'card', 'paid', 33, NULL, NOW() - interval '14 days', NOW() - interval '14 days'),
(2, 2, NULL, 'ORD-20260405-004', 'pickup', '[{"name":"Signature Latte","qty":1,"price":16.90}]'::json, 16.90, 0, 0, 16.90, 'completed', 'wallet', 'paid', 16, 'Extra shot please', NOW() - interval '7 days', NOW() - interval '7 days'),
(2, 1, NULL, 'ORD-20260410-005', 'delivery', '[{"name":"Cappuccino","qty":1,"price":13.90},{"name":"Chocolate","qty":1,"price":12.90},{"name":"Croissant","qty":1,"price":8.90}]'::json, 35.70, 3.00, 0, 38.70, 'preparing', 'card', 'paid', 35, NULL, NOW() - interval '1 day', NOW() - interval '1 day'),

-- Siti (user 3) - 4 orders (gold member, big spender)
(3, 1, 5, 'ORD-20260316-006', 'dine_in', '[{"name":"Sakura Frappe","qty":2,"price":16.90},{"name":"Taro Latte","qty":1,"price":13.90}]'::json, 47.70, 0, 0, 47.70, 'completed', 'wallet', 'paid', 47, NULL, NOW() - interval '27 days', NOW() - interval '27 days'),
(3, 1, NULL, 'ORD-20260322-007', 'pickup', '[{"name":"Caramel Macchiato","qty":3,"price":15.90}]'::json, 47.70, 0, 0, 47.70, 'completed', 'card', 'paid', 47, NULL, NOW() - interval '21 days', NOW() - interval '21 days'),
(3, 2, NULL, 'ORD-20260402-008', 'delivery', '[{"name":"Signature Latte","qty":2,"price":16.90},{"name":"Iced Americano","qty":1,"price":12.90}]'::json, 46.70, 3.00, 10.00, 39.70, 'completed', 'wallet', 'paid', 39, NULL, NOW() - interval '10 days', NOW() - interval '10 days'),
(3, 1, 2, 'ORD-20260408-009', 'dine_in', '[{"name":"Mocha","qty":1,"price":15.90},{"name":"Matcha Latte","qty":1,"price":14.90},{"name":"Croissant","qty":2,"price":8.90}]'::json, 48.60, 0, 0, 48.60, 'ready', 'card', 'paid', 48, 'Window seat please', NOW() - interval '3 days', NOW() - interval '3 days'),

-- David (user 4) - 2 orders
(4, 1, 4, 'ORD-20260401-010', 'dine_in', '[{"name":"Americano","qty":1,"price":10.90}]'::json, 10.90, 0, 0, 10.90, 'completed', 'cash', 'paid', 10, NULL, NOW() - interval '12 days', NOW() - interval '12 days'),
(4, 1, NULL, 'ORD-20260409-011', 'pickup', '[{"name":"Cappuccino","qty":1,"price":13.90},{"name":"Croissant","qty":1,"price":8.90}]'::json, 22.80, 0, 0, 22.80, 'confirmed', 'card', 'pending', 22, NULL, NOW() - interval '2 days', NOW() - interval '2 days'),

-- Mei Lin (user 5) - 6 orders (platinum, frequent buyer)
(5, 1, 6, 'ORD-20260314-012', 'dine_in', '[{"name":"Sakura Frappe","qty":1,"price":16.90},{"name":"Taro Latte","qty":1,"price":13.90},{"name":"Croissant","qty":1,"price":8.90}]'::json, 39.70, 0, 0, 39.70, 'completed', 'wallet', 'paid', 39, NULL, NOW() - interval '29 days', NOW() - interval '29 days'),
(5, 1, NULL, 'ORD-20260318-013', 'pickup', '[{"name":"Caramel Macchiato","qty":2,"price":15.90},{"name":"Mocha","qty":1,"price":15.90}]'::json, 47.70, 0, 0, 47.70, 'completed', 'card', 'paid', 47, NULL, NOW() - interval '25 days', NOW() - interval '25 days'),
(5, 2, NULL, 'ORD-20260325-014', 'delivery', '[{"name":"Signature Latte","qty":1,"price":16.90}]'::json, 16.90, 3.00, 0, 19.90, 'completed', 'wallet', 'paid', 19, NULL, NOW() - interval '18 days', NOW() - interval '18 days'),
(5, 1, 7, 'ORD-20260330-015', 'dine_in', '[{"name":"Matcha Latte","qty":2,"price":14.90},{"name":"Chocolate","qty":1,"price":12.90}]'::json, 42.70, 0, 5.00, 37.70, 'completed', 'voucher', 'paid', 37, NULL, NOW() - interval '13 days', NOW() - interval '13 days'),
(5, 1, NULL, 'ORD-20260406-016', 'pickup', '[{"name":"Cappuccino","qty":1,"price":13.90},{"name":"Croissant","qty":1,"price":8.90}]'::json, 22.80, 0, 0, 22.80, 'completed', 'card', 'paid', 22, NULL, NOW() - interval '6 days', NOW() - interval '6 days'),
(5, 1, NULL, 'ORD-20260411-017', 'delivery', '[{"name":"Sakura Frappe","qty":3,"price":16.90}]'::json, 50.70, 3.00, 0, 53.70, 'pending', 'wallet', 'pending', 50, 'Birthday treat for friends', NOW() - interval '12 hours', NOW() - interval '12 hours'),

-- Raj (user 6) - 1 order (new customer)
(6, 1, NULL, 'ORD-20260412-018', 'pickup', '[{"name":"Americano","qty":1,"price":10.90}]'::json, 10.90, 0, 0, 10.90, 'confirmed', 'card', 'paid', 10, 'First order!', NOW() - interval '1 day', NOW() - interval '1 day');

-- ============================================
-- 5. Create loyalty transactions
-- ============================================
INSERT INTO loyalty_transactions (user_id, order_id, store_id, points, type, created_at) VALUES
-- Ahmad's loyalty history
(2, 1, 1, 24, 'earn', NOW() - interval '28 days'),
(2, 2, 1, 31, 'earn', NOW() - interval '22 days'),
(2, 3, 1, 33, 'earn', NOW() - interval '14 days'),
(2, 4, 2, 16, 'earn', NOW() - interval '7 days'),
(2, 5, 1, 35, 'earn', NOW() - interval '1 day'),
(2, NULL, NULL, -50, 'redeem', NOW() - interval '10 days'),
(2, NULL, NULL, -100, 'redeem', NOW() - interval '5 days'),
(2, NULL, NULL, 200, 'earn', NOW() - interval '3 days'),

-- Siti's loyalty history
(3, 6, 1, 47, 'earn', NOW() - interval '27 days'),
(3, 7, 1, 47, 'earn', NOW() - interval '21 days'),
(3, 8, 2, 39, 'earn', NOW() - interval '10 days'),
(3, 9, 1, 48, 'earn', NOW() - interval '3 days'),
(3, NULL, NULL, -200, 'redeem', NOW() - interval '15 days'),

-- David's loyalty history
(4, 10, 1, 10, 'earn', NOW() - interval '12 days'),
(4, 11, 1, 22, 'earn', NOW() - interval '2 days'),

-- Mei Lin's loyalty history
(5, 12, 1, 39, 'earn', NOW() - interval '29 days'),
(5, 13, 1, 47, 'earn', NOW() - interval '25 days'),
(5, 14, 2, 19, 'earn', NOW() - interval '18 days'),
(5, 15, 1, 37, 'earn', NOW() - interval '13 days'),
(5, 16, 1, 22, 'earn', NOW() - interval '6 days'),
(5, 17, 1, 50, 'earn', NOW() - interval '12 hours'),
(5, NULL, NULL, -300, 'redeem', NOW() - interval '20 days'),
(5, NULL, NULL, -200, 'redeem', NOW() - interval '8 days'),

-- Raj's loyalty history
(6, 18, 1, 10, 'earn', NOW() - interval '1 day');

-- ============================================
-- 6. Create wallet transactions
-- ============================================
INSERT INTO wallet_transactions (wallet_id, amount, type, description, created_at) VALUES
-- Ahmad's wallet (wallet_id 2)
(2, 50.00, 'topup', 'Top-up via credit card', NOW() - interval '28 days'),
(2, -24.80, 'payment', 'Payment for ORD-20260315-001', NOW() - interval '28 days'),
(2, 30.00, 'topup', 'Top-up via online banking', NOW() - interval '20 days'),
(2, -16.90, 'payment', 'Payment for ORD-20260405-004', NOW() - interval '7 days'),
(2, 7.20, 'refund', 'Refund for cancelled item', NOW() - interval '3 days'),

-- Siti's wallet (wallet_id 3)
(3, 100.00, 'topup', 'Initial top-up', NOW() - interval '25 days'),
(3, -47.70, 'payment', 'Payment for ORD-20260316-006', NOW() - interval '27 days'),
(3, 100.00, 'topup', 'Top-up via credit card', NOW() - interval '15 days'),
(3, -39.70, 'payment', 'Payment for ORD-20260402-008', NOW() - interval '10 days'),

-- David's wallet (wallet_id 4)
(4, 20.00, 'topup', 'Top-up via credit card', NOW() - interval '18 days'),
(4, -10.90, 'payment', 'Payment for ORD-20260401-010', NOW() - interval '12 days'),

-- Mei Lin's wallet (wallet_id 5)
(5, 100.00, 'topup', 'Initial top-up', NOW() - interval '29 days'),
(5, -39.70, 'payment', 'Payment for ORD-20260314-012', NOW() - interval '29 days'),
(5, 100.00, 'topup', 'Top-up via online banking', NOW() - interval '20 days'),
(5, -19.90, 'payment', 'Payment for ORD-20260325-014', NOW() - interval '18 days'),
(5, 100.00, 'topup', 'Top-up via credit card', NOW() - interval '10 days'),
(5, -37.70, 'payment', 'Payment for ORD-20260330-015', NOW() - interval '13 days'),
(5, -53.70, 'payment', 'Payment for ORD-20260411-017', NOW() - interval '12 hours');

-- ============================================
-- 7. Create user_vouchers (claimed vouchers)
-- ============================================
INSERT INTO user_vouchers (user_id, voucher_id, store_id, applied_at, order_id) VALUES
(2, 1, 1, NOW() - interval '22 days', 2),
(5, 1, 1, NOW() - interval '13 days', 15),
(5, 2, 1, NOW() - interval '6 days', 16);

-- Unclaimed vouchers
INSERT INTO user_vouchers (user_id, voucher_id) VALUES
(3, 1),
(3, 3),
(5, 3),
(2, 2);

-- ============================================
-- 8. Create user_rewards (redeemed rewards)
-- ============================================
INSERT INTO user_rewards (user_id, reward_id, redeemed_at, is_used) VALUES
(2, 2, NOW() - interval '10 days', true),
(3, 1, NOW() - interval '15 days', true),
(5, 1, NOW() - interval '20 days', true),
(5, 3, NOW() - interval '8 days', false);

-- ============================================
-- 9. Create feedback from customers
-- ============================================
INSERT INTO feedback (user_id, store_id, order_id, rating, comment, is_resolved, created_at) VALUES
(2, 1, 1, 5, 'Excellent coffee and fast service!', true, NOW() - interval '27 days'),
(2, 1, 3, 4, 'Good but croissant was a bit stale', false, NOW() - interval '13 days'),
(3, 1, 6, 5, 'Sakura Frappe is amazing! Best drink ever', true, NOW() - interval '26 days'),
(3, 1, 9, 4, 'Great ambiance, would come again', false, NOW() - interval '2 days'),
(4, 1, 10, 3, 'Americano was okay, nothing special', true, NOW() - interval '11 days'),
(5, 1, 12, 5, 'Perfect combination of drinks and pastry', true, NOW() - interval '28 days'),
(5, 1, 13, 5, 'Consistently great quality', true, NOW() - interval '24 days'),
(5, 1, 15, 4, 'Good service, slight delay on food', false, NOW() - interval '12 days'),
(6, 1, 18, 4, 'First time trying, will be back!', false, NOW() - interval '18 hours');

COMMIT;
