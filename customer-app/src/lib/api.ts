import axios from 'axios';

export const API_BASE = '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('loka-auth');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const token = parsed?.state?.token;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch {}
    }
  }
  return config;
});

function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('loka-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.refreshToken ?? null;
  } catch {
    return null;
  }
}

function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('loka-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.user ?? null;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = getStoredRefreshToken();
        if (refreshToken) {
          const response = await axios.post(`${API_BASE}/auth/refresh`, {
            refresh_token: refreshToken,
          });

          if (response.data?.access_token) {
            const newToken = response.data.access_token;
            const newRefresh = response.data.refresh_token || response.data.refreshToken;

            localStorage.setItem('loka-auth', JSON.stringify({
              state: {
                token: newToken,
                refreshToken: newRefresh || refreshToken,
                user: getStoredUser(),
              },
              version: 0,
            }));

            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          }
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
      }

      localStorage.removeItem('loka-auth');
      localStorage.removeItem('loka-cart');
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    }

    return Promise.reject(error);
  }
);

export default api;

export async function apiFetch(path: string, token?: string, _options?: RequestInit) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  
  try {
    const response = await api.get(path, { headers });
    return {
      ok: true,
      json: () => Promise.resolve(response.data),
    };
  } catch (error) {
    const err = error as { response?: { status: number; data: unknown } };
    if (err.response) {
      const { status, data } = err.response;
      return {
        ok: false,
        status,
        json: () => Promise.resolve(data),
      };
    }
    throw error;
  }
}

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
  short_description: string | null;
  long_description?: string | null;
  content_type?: string | null;
  icon?: string | null;
  image_url?: string | null;
  action_url?: string | null;
  action_type?: string | null;
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
  store_id: number;
  category_id: number;
  name: string;
  description: string;
  base_price: number;
  image_url: string | null;
  is_available: boolean;
  is_featured?: boolean;
  display_order?: number;
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
  timeline?: Array<{
    status: string;
    timestamp: string;
    note?: string;
  }>;
}

export interface CartItem {
  id?: number;
  menu_item_id: number;
  name: string;
  price: number;
  quantity: number;
  customizations?: Record<string, unknown>;
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
  created_at?: string;
}

export type PageId = 'home' | 'menu' | 'rewards' | 'cart' | 'checkout' | 'orders' | 'order-detail' | 'profile' | 'wallet' | 'history' | 'promotions' | 'information' | 'my-rewards' | 'account-details' | 'payment-methods' | 'saved-addresses' | 'notifications' | 'help-support';
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
