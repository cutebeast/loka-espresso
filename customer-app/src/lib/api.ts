import axios from 'axios';

export const API_BASE = '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Send httpOnly cookies automatically
});

// Prevents multiple simultaneous refresh attempts from triggering multiple reloads
let _refreshFailed = false;
let _refreshPromise: Promise<any> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Deduplicate concurrent 401s — only one refresh call at a time
        if (!_refreshPromise) {
          _refreshPromise = axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true });
        }
        const response = await _refreshPromise;
        _refreshPromise = null;

        if (response.data?.access_token) {
          return api(originalRequest);
        }
      } catch (refreshError: any) {
        _refreshPromise = null;
        // 422 means no refresh token (guest user) — just reject, don't reload
        if (refreshError?.response?.status === 422) {
          return Promise.reject(error);
        }
        console.error('Token refresh failed:', refreshError);
      }

      // Only clear and reload once per page load to prevent infinite loops
      // Skip reload if user is in guest mode (no auth cookie at all)
      if (!_refreshFailed) {
        _refreshFailed = true;
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;

export interface Store {
  id: number;
  name: string;
  slug: string;
  address: string;
  phone: string;
  opening_hours: Record<string, string>;
  is_active: boolean;
  image_url?: string;
  lat?: number;
  lng?: number;
  pickup_lead_minutes?: number;
  delivery_radius_km?: number;
  pos_integration_enabled?: boolean;
  delivery_integration_enabled?: boolean;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  display_order?: number;
}

export interface PromoBanner {
  id: number;
  title: string;
  short_description: string | null;
  long_description: string | null;
  image_url: string | null;
  action_type: 'detail' | 'survey' | null;
  terms: string[] | null;
  how_to_redeem: string | null;
  start_date: string | null;
  end_date: string | null;
  voucher_id?: number | null;
  survey_id?: number | null;
}

export interface InformationCard {
  id: number;
  title: string;
  slug?: string | null;
  short_description: string | null;
  long_description?: string | null;
  content_type?: string | null;
  icon?: string | null;
  image_url?: string | null;
  gallery_urls?: string[] | null;
  action_url?: string | null;
  action_type?: string | null;
  action_label?: string | null;
}

export interface CustomizationOption {
  id: number;
  name: string;
  option_type: string;
  price_adjustment: number;
  is_active: boolean;
}

export interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  description: string;
  base_price: number;
  image_url: string | null;
  is_available: boolean;
  is_featured?: boolean;
  display_order?: number;
  dietary_tags?: string[];
  customization_options?: CustomizationOption[];
}

export interface Reward {
  id: number;
  name: string;
  short_description: string | null;
  description: string;
  points_cost: number;
  reward_type: string;
  image_url?: string;
  is_active: boolean;
  validity_days?: number;
  terms?: string[] | null;
  how_to_redeem?: string | null;
}

export interface UserReward {
  id: number;
  reward_id: number;
  reward_name: string;
  redemption_code: string;
  status: 'available' | 'used' | 'expired';
  expires_at: string;
  reward_image_url?: string;
  reward_snapshot?: string;
  points_spent?: number;
  redeemed_at?: string;
  used_at?: string;
}

export interface UserVoucher {
  id: number;
  voucher_id: number;
  code: string;
  discount_type: string;
  discount_value: number;
  status: 'available' | 'used' | 'expired';
  expires_at: string;
  min_spend?: number;
  max_discount?: number;
  voucher_title?: string;
  voucher_image_url?: string;
  source?: 'survey' | 'promo' | 'gift' | string;
  issued_at?: string;
  used_at?: string;
}

export interface OrderItem {
  id?: number;
  menu_item_id?: number;
  name: string;
  price: number;
   unit_price?: number;
  quantity: number;
  customizations?: Record<string, unknown>;
}

export interface Order {
  id: number;
  order_number: string;
  order_type: 'pickup' | 'delivery' | 'dine_in';
  status: string;
  total: number;
  subtotal?: number;
  discount?: number;
  voucher_discount?: number;
  reward_discount?: number;
  delivery_fee?: number;
  items: OrderItem[];
  created_at: string;
  updated_at?: string;
  store_id?: number;
  store_name?: string;
  table_id?: number;
  pickup_time?: string;
  delivery_address?: Record<string, unknown> | string;
  notes?: string;
  payment_method?: string;
  payment_status?: string;
  loyalty_points_earned?: number;
  points_earned?: number;
  voucher_code?: string;
  reward_redemption_code?: string;
   delivery_status?: string;
   delivery_external_id?: string;
   delivery_tracking_url?: string;
   delivery_eta_minutes?: number;
   delivery_courier_name?: string;
   delivery_courier_phone?: string;
   pos_synced_at?: string;
   pos_synced_by?: number;
   delivery_dispatched_at?: string;
   delivery_dispatched_by?: number;
   staff_notes?: string;
  status_timeline?: Array<{
    status: string;
    timestamp: string;
    note?: string;
  }>;
  /** @deprecated Use status_timeline */
  timeline?: Array<{
    status: string;
    timestamp: string;
    note?: string;
  }>;
  loyalty_discount?: number;
}

export interface CartItem {
  id?: number;
  menu_item_id: number;
  name: string;
  price: number;
  quantity: number;
  store_id?: number;
  customizations?: Record<string, unknown>;
  customization_option_ids?: number[];
  image_url?: string;
}

export interface DeliveryAddress {
  address: string;
  lat?: number;
  lng?: number;
}

export interface Table {
  id: number;
  store_id: number;
  table_number: string;
  capacity: number;
}

export interface PaymentMethod {
  id: number;
  type: 'wallet' | 'card' | 'cash';
  last4?: string;
  brand?: string;
}

export interface WalletData {
  balance: number;
  currency: string;
  loyalty_points: number;
  tier: string;
  total_points_earned?: number;
}

export interface Transaction {
  id: number;
  amount: number;
  type: string;
  description: string;
  created_at: string;
  reference_id?: string;
}

export interface LoyaltyHistoryEntry {
  id: number;
  points: number;
  type: string;
  description?: string;
  created_at: string;
}

export interface Banner {
  id: number;
  title: string;
  subtitle?: string;
  image_url?: string;
  action_type?: string;
  action_url?: string;
  position: number;
}

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  phone: string;
  avatar_url?: string;
  user_type?: string;
  date_of_birth?: string;
  created_at?: string;
}

export type PageId = 'home' | 'menu' | 'rewards' | 'cart' | 'checkout' | 'orders' | 'order-detail' | 'profile' | 'wallet' | 'history' | 'promotions' | 'information' | 'my-rewards' | 'account-details' | 'payment-methods' | 'saved-addresses' | 'notifications' | 'help-support' | 'legal' | 'settings' | 'my-card' | 'referral';
export type OrderMode = 'pickup' | 'delivery' | 'dine_in';

/**
 * Appends a cache-busting query param to an image URL.
 * Forces Cloudflare/browser to re-fetch instead of serving cached 404.
 * @param url - The image URL (e.g. "/uploads/items/abc.jpg")
 * @param ts  - Unix timestamp override (defaults to Date.now())
 */
export function cacheBust(url: string, ts?: number): string {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${ts ?? Date.now()}`;
}
