export interface MerchantStore {
  id: number;
  name: string;
  slug: string;
  address: string;
  phone: string;
  opening_hours: Record<string, string>;
  pickup_lead_minutes: number;
  is_active: boolean;
}

export interface MerchantCategory {
  id: number;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
}

export interface MerchantMenuItem {
  id: number;
  store_id: number;
  category_id: number;
  name: string;
  description: string;
  base_price: number;
  image_url: string | null;
  is_available: boolean;
  display_order: number;
}

export interface MerchantTableItem {
  id: number;
  table_number: string;
  qr_code_url: string;
  capacity: number;
  is_active: boolean;
}

export interface MerchantReward {
  id: number;
  name: string;
  description: string;
  points_cost: number;
  reward_type: string;
  stock_limit: number | null;
  total_redeemed: number;
  is_active: boolean;
}

export interface MerchantVoucher {
  id: number;
  code: string;
  description: string;
  discount_type: string;
  discount_value: number;
  min_order: number;
  max_uses: number | null;
  used_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
}

export interface MerchantInventoryItem {
  id: number;
  name: string;
  current_stock: number;
  unit: string;
  reorder_level: number;
  cost_per_unit: number | null;
}

export interface MerchantOrder {
  id: number;
  order_number: string;
  order_type: string;
  status: string;
  total: number;
  items: Array<Record<string, unknown>>;
  created_at: string;
  store_id: number;
  table_id: number | null;
  pickup_time: string | null;
  user_id: number;
}

export interface MerchantDashboardData {
  total_orders: number;
  total_revenue: number;
  total_customers: number;
  orders_today: number;
  revenue_today: number;
  orders_by_type: Record<string, number>;
}

export interface MerchantStaffMember {
  id: number;
  name: string;
  role: string;
  phone: string;
  is_active: boolean;
}

export interface MerchantBanner {
  id: number;
  title: string;
  image_url: string;
  target_url: string;
  is_active: boolean;
  created_at: string;
}

export interface MerchantBroadcast {
  id: number;
  title: string;
  body: string | null;
  audience: string;
  store_id: number | null;
  scheduled_at: string | null;
  sent_at: string | null;
  sent_count: number;
  open_count: number;
  is_archived: boolean;
  created_at: string | null;
}

export interface BroadcastListResponse {
  broadcasts: MerchantBroadcast[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface MerchantAuditEntry {
  id: number;
  timestamp: string;
  user_email: string;
  action: string;
  ip_address: string;
  store_id: number | null;
  status: string;
  details: string;
}

export interface MerchantFeedbackItem {
  id: number;
  customer_name: string;
  rating: number;
  comment: string;
  store_id: number;
  store_name: string;
  created_at: string;
  reply: string | null;
}

export interface MerchantFeedbackStats {
  average_rating: number;
  total_reviews: number;
  rating_distribution: Record<string, number>;
}

export interface MerchantLoyaltyTier {
  id: number;
  name: string;
  min_points: number;
  points_multiplier: number;
  benefits: Record<string, unknown> | null;
}

export interface CustomerItem {
  id: number;
  name: string;
  phone: string;
  email: string;
  tier: string;
  points: number;
  total_orders: number;
  total_spent: number;
}

export interface CustomerDetail {
  id: number;
  name: string;
  phone: string;
  email: string;
  tier: string;
  points: number;
  wallet_balance: number;
  total_orders: number;
  total_spent: number;
  created_at: string;
}

export interface CustomerWalletTransaction {
  id: number;
  type: string;
  amount: number;
  description: string;
  created_at: string;
}

export interface CustomerLoyaltyTransaction {
  id: number;
  type: string;
  points: number;
  description: string;
  created_at: string;
}

export type PageId = 'dashboard' | 'orders' | 'menu' | 'inventory' | 'tables' | 'staff' | 'rewards' | 'vouchers' | 'promotions' | 'feedback' | 'surveys' | 'reports' | 'marketingreports' | 'customers' | 'notifications' | 'auditlog' | 'loyaltyrules' | 'store';
