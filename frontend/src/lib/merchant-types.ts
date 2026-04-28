export interface MerchantStore {
  id: number;
  name: string;
  slug: string;
  address: string;
  phone: string;
  opening_hours: Record<string, string>;
  pickup_lead_minutes: number;
  is_active: boolean;
  lat: number | null;
  lng: number | null;
  image_url: string | null;
  delivery_radius_km: number | null;
  pos_integration_enabled: boolean;
  delivery_integration_enabled: boolean;
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
  category_id: number;
  name: string;
  description: string;
  base_price: number;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  display_order: number;
}

export interface MerchantTableItem {
  id: number;
  store_id: number;
  table_number: string;
  qr_code_url: string | null;
  qr_generated_at: string | null;
  capacity: number;
  is_active: boolean;
  is_occupied: boolean;
  active_order?: {
    id: number;
    order_number: string;
    status: string;
    order_type: string;
    total: number;
    payment_status: string;
  } | null;
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

export interface MerchantInventoryCategory {
  id: number;
  store_id: number;
  name: string;
  slug: string | null;
  display_order: number;
  is_active: boolean;
}

export interface MerchantInventoryItem {
  id: number;
  name: string;
  current_stock: number;
  unit: string;
  reorder_level: number;
  is_active: boolean;
  category_id: number | null;
  category_name: string | null;
}

export interface InventoryMovement {
  id: number;
  store_id: number;
  inventory_item_id: number;
  inventory_item_name: string | null;
  movement_type: string;
  quantity: number;
  balance_after: number;
  note: string;
  attachment_path: string | null;
  created_by: number;
  created_by_name: string | null;
  created_at: string | null;
}

export interface MerchantOrder {
  id: number;
  order_number: string;
  order_type: string;
  status: string;
  delivery_status?: string | null;
  total: number;
  items: Array<Record<string, unknown>>;
  created_at: string;
  store_id: number;
  table_id: number | null;
  pickup_time: string | null;
  delivery_address?: Record<string, unknown> | null;
  delivery_eta_minutes?: number | null;
  delivery_courier_name?: string | null;
  delivery_courier_phone?: string | null;
  delivery_tracking_url?: string | null;
  delivery_provider?: string | null;
  payment_method?: string | null;
  payment_status?: string;
  notes?: string | null;
  pos_synced_at?: string | null;
  pos_synced_by?: number | null;
  delivery_dispatched_at?: string | null;
  delivery_dispatched_by?: number | null;
  staff_notes?: string | null;
  user_id: number;
}

export interface MerchantDashboardData {
  total_orders: number;
  active_orders: number;
  total_revenue: number;
  total_customers: number;
  orders_today: number;
  revenue_today: number;
  orders_by_type: Record<string, number>;
  monthly?: Record<string, { orders: number; revenue: number }>;
}

export interface StoreAssignment {
  store_id: number;
  store_name: string;
}

export interface MerchantStaffMember {
  id: number | null;
  name: string;
  role: string;                // legacy staff table role (barista, manager, etc.)
  phone: string;
  is_active: boolean;
  user_type_id?: number | null;  // FK to user_types lookup (1=HQ, 2=Store Mgmt, 3=Store, 4=Customer)
  role_id?: number | null;       // FK to roles lookup (1=Admin, 2=Brand Owner, 3=Manager, etc.)
  user_type?: string | null;     // resolved name: "HQ Management", "Store Management", "Store"
  user_role?: string | null;     // resolved name: "Admin", "Manager", "Staff", etc.
  email?: string | null;
  store_id?: number | null;
  user_id?: number | null;
  store_name?: string | null;
  store_assignments?: StoreAssignment[];  // all stores this user is assigned to via user_store_access
  created_at?: string | null;
  temp_password?: string;
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
  status: string;
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
  created_at: string;
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
  sort_order: number;
}

export interface CustomerItem {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  tier: string | null;
  points_balance: number;
  total_orders: number;
  total_spent: number;
  phone_verified?: boolean;
  is_profile_complete?: boolean;
  created_at?: string;
}

export interface CustomerDetail {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  tier: string | null;
  points_balance: number;
  wallet_balance: number;
  total_orders: number;
  total_spent: number;
  total_points_earned: number;
  phone_verified?: boolean;
  is_profile_complete?: boolean;
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

export type PageId = 'dashboard' | 'orders' | 'kitchen' | 'menu' | 'inventory' | 'tables' | 'staff' | 'rewards' | 'vouchers' | 'promotions' | 'information' | 'feedback' | 'reports' | 'marketingreports' | 'customers' | 'notifications' | 'auditlog' | 'loyaltyrules' | 'store' | 'settings' | 'pwa' | 'walletTopup' | 'posterminal';
