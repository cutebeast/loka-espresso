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

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('loka-auth');
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
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  display_order?: number;
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
  customization_options?: CustomizationOption[];
}

export interface Reward {
  id: number;
  name: string;
  description: string;
  points_cost: number;
  reward_type: string;
  image_url?: string;
  is_active: boolean;
}

export interface UserReward {
  id: number;
  reward_id: number;
  reward_name: string;
  redemption_code: string;
  status: 'available' | 'used' | 'expired';
  expires_at: string;
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
}

export interface OrderItem {
  id?: number;
  menu_item_id?: number;
  name: string;
  price: number;
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
  discount_applied?: number;
  delivery_fee?: number;
  items: OrderItem[];
  created_at: string;
  updated_at?: string;
  store_id?: number;
  store_name?: string;
  table_id?: number;
  payment_method?: string;
  payment_status?: string;
  loyalty_points_earned?: number;
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

export type PageId = 'home' | 'menu' | 'rewards' | 'cart' | 'checkout' | 'orders' | 'order-detail' | 'profile' | 'wallet' | 'history';
export type OrderMode = 'pickup' | 'delivery' | 'dine_in';
