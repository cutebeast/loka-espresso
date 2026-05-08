import axios from 'axios';

export const API_BASE = '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Inject auth token and locale into every request
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const locale = typeof window !== 'undefined' ? localStorage.getItem('locale') : null;
  if (locale) {
    config.headers['Accept-Language'] = locale;
  }
  return config;
});

// URL mapping: old v1 endpoints → v3 endpoints
function mapUrl(url: string): string {
  if (!url) return url;
  // Exact matches
  const exactMap: Record<string, string> = {
    '/auth/session': '/auth/login',
    '/auth/logout': '/auth/logout',
    '/auth/refresh': '/auth/refresh',
    '/users/me': '/me',
    '/users/me/avatar': '/me',
    '/users/me/addresses': '/me/addresses',
    '/users/me/payment-methods': '/me/addresses',
    '/users/me/notifications': '/notifications/me',
    '/users/me/notifications/preferences': '/notifications/preferences/me',
    '/content/stores': '/stores',
    '/content/location': '/stores',
    '/promos/banners': '/content/blocks',
    '/rewards': '/rewards/catalog',
    '/wallet': '/wallet/me',
    '/wallet/balance': '/wallet/me',
    '/me/wallet': '/wallet/me',
    '/wallet/transactions': '/wallet/ledger/me',
    '/wallet/topup': '/wallet/topup',
    '/loyalty/balance': '/loyalty/me',
    '/loyalty/me': '/loyalty/me',
    '/loyalty/history': '/loyalty/ledger/me',
    '/referral/stats': '/referrals/me',
    '/referral/code': '/referrals/me',
    '/referral/apply': '/referrals',
    '/notifications': '/notifications/me',
    '/payments/methods': '/payments',
    '/payments/create-intent': '/payments/intent',
    '/payments/confirm': '/payments/intent',
    '/cart': '/cart',
    '/cart/items': '/cart/items',
    '/checkout': '/orders',
    '/feedback': '/surveys',
    '/tables/scan': '/stores',
    '/config': '/stores',
    '/config/bootstrap': '/stores',
    '/vouchers/validate': '/vouchers/apply',
  };
  if (exactMap[url]) return exactMap[url];

  // Prefix matches
  if (url.startsWith('/content/information')) return url.replace('/content/information', '/content/blocks');
  if (url.startsWith('/content/legal/')) return '/content/blocks';
  if (url.startsWith('/orders/') && url.includes('/pos-webhook')) return url;
  if (url.startsWith('/orders/') && url.includes('/delivery-webhook')) return url;

  return url;
}

// Response mapping helpers
function unwrapV3(data: any): any {
  if (data && typeof data === 'object' && 'data' in data && ('success' in data || 'status' in data || 'message' in data)) {
    return unwrapV3(data.data);
  }
  return data;
}

function mapV3Response(url: string, data: any): any {
  const unwrapped = unwrapV3(data);
  if (!unwrapped) return unwrapped;

  // Map v3 shapes back to v1 shapes for compatibility
  if (url.includes('/stores') && Array.isArray(unwrapped)) {
    return unwrapped.map((s: any) => ({
      ...s,
      opening_hours: s.operating_hours || s.opening_hours,
      lat: s.latitude,
      lng: s.longitude,
    }));
  }
  if (url.includes('/stores/') && !Array.isArray(unwrapped) && unwrapped) {
    return {
      ...unwrapped,
      opening_hours: unwrapped.operating_hours || unwrapped.opening_hours,
      lat: unwrapped.latitude,
      lng: unwrapped.longitude,
    };
  }
  if (url.includes('/menu/stores/') && unwrapped?.categories) {
    return unwrapped;
  }
  if (url.includes('/orders') && unwrapped) {
    if (Array.isArray(unwrapped)) {
      return unwrapped.map((o: any) => ({
        ...o,
        order_number: o.order_number || `ORD-${o.id}`,
        total: o.total_amount ?? o.total,
        items: o.items || o.order_items || [],
      }));
    }
    return {
      ...unwrapped,
      order_number: unwrapped.order_number || `ORD-${unwrapped.id}`,
      total: unwrapped.total_amount ?? unwrapped.total,
      items: unwrapped.items || unwrapped.order_items || [],
    };
  }
  if (url.includes('/wallet/me') && unwrapped) {
    return {
      balance: unwrapped.balance ?? 0,
      currency: unwrapped.currency ?? 'MYR',
      loyalty_points: unwrapped.loyalty_points ?? 0,
      tier: unwrapped.tier_name ?? unwrapped.tier ?? 'Bronze',
      total_points_earned: unwrapped.total_points_earned ?? 0,
    };
  }
  if (url.includes('/wallet/ledger') && Array.isArray(unwrapped)) {
    return unwrapped.map((t: any) => ({
      ...t,
      type: t.transaction_type ?? t.type,
      description: t.description || t.notes || t.type,
    }));
  }
  if (url.includes('/loyalty/me') && unwrapped) {
    return {
      points: unwrapped.points_balance ?? unwrapped.points ?? 0,
      tier: unwrapped.tier_name ?? unwrapped.tier ?? 'Bronze',
      lifetime_points: unwrapped.lifetime_points ?? 0,
    };
  }
  if (url.includes('/loyalty/ledger') && Array.isArray(unwrapped)) {
    return unwrapped.map((e: any) => ({
      ...e,
      points: e.points_delta ?? e.points ?? 0,
      type: e.event_type ?? e.type,
    }));
  }
  if (url.includes('/me') && !url.includes('/addresses') && !url.includes('/consents') && !url.includes('/devices') && unwrapped) {
    return {
      ...unwrapped,
      avatar_url: unwrapped.avatar_url || unwrapped.profile_image_url,
    };
  }
  if (url.includes('/content/blocks') && Array.isArray(unwrapped)) {
    return unwrapped.map((b: any) => ({
      ...b,
      title: b.title || b.block_key || b.name,
      image_url: b.image_url || b.content,
    }));
  }
  if (url.includes('/rewards/catalog') && Array.isArray(unwrapped)) {
    return unwrapped.map((r: any) => ({
      ...r,
      base_price: r.base_price ?? r.price ?? 0,
      description: r.description || r.short_description || '',
    }));
  }
  if (url.includes('/rewards/me') && Array.isArray(unwrapped)) {
    return unwrapped.map((r: any) => ({
      ...r,
      reward_name: r.reward_name || r.name,
      status: r.status || 'available',
    }));
  }
  if (url.includes('/vouchers/me') && Array.isArray(unwrapped)) {
    return unwrapped.map((v: any) => ({
      ...v,
      voucher_title: v.voucher_title || v.title || v.code,
      status: v.status || 'available',
    }));
  }
  if (url.includes('/notifications/me') && Array.isArray(unwrapped)) {
    return unwrapped.map((n: any) => ({
      ...n,
      title: n.title || n.subject,
      body: n.body || n.message,
      is_read: n.is_read ?? n.read_at !== null,
    }));
  }
  if (url.includes('/referrals/me') && unwrapped) {
    return {
      referral_code: unwrapped.referral_code || unwrapped.code,
      total_referrals: unwrapped.total_referrals ?? 0,
      total_rewards: unwrapped.total_rewards ?? 0,
    };
  }
  if (url.includes('/surveys') && Array.isArray(unwrapped)) {
    return unwrapped.map((s: any) => ({
      ...s,
      title: s.title || s.survey_key,
    }));
  }

  return unwrapped;
}

let _refreshPromise: Promise<any> | null = null;

api.interceptors.response.use(
  (res) => {
    const mappedUrl = mapUrl(res.config.url || '');
    res.data = mapV3Response(mappedUrl, res.data);
    return res;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        if (!_refreshPromise) {
          _refreshPromise = axios.post(`${API_BASE}/auth/refresh`, {}, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('refreshToken') || ''}`,
            },
          });
        }
        const response = await _refreshPromise;
        _refreshPromise = null;
        const unwrapped = unwrapV3(response.data);
        if (unwrapped?.access_token) {
          localStorage.setItem('token', unwrapped.access_token);
          if (unwrapped.refresh_token) {
            localStorage.setItem('refreshToken', unwrapped.refresh_token);
          }
          return api(originalRequest);
        }
      } catch (refreshError: any) {
        _refreshPromise = null;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:expired'));
        }
      }
    }
    return Promise.reject(error);
  }
);

// Override request methods to apply URL mapping
const originalRequest = api.request.bind(api);
api.request = function(config: any) {
  if (config.url) {
    config.url = mapUrl(config.url);
  }
  return originalRequest(config);
};

export default api;

// Types
export interface Store {
  id: number;
  name: string;
  slug?: string;
  address?: string;
  phone?: string;
  opening_hours?: Record<string, string>;
  is_active?: boolean;
  image_url?: string;
  lat?: number;
  lng?: number;
  pickup_lead_minutes?: number;
  delivery_radius_km?: number;
  delivery_fee?: number;
  min_order?: number;
  pos_integration_enabled?: boolean;
  delivery_integration_enabled?: boolean;
}

export interface Category {
  id: number;
  name: string;
  slug?: string;
  is_active?: boolean;
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
  sections?: { title?: string; body?: string; list?: string[]; visible?: boolean }[] | null;
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
  is_popular: boolean;
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
  customization_count?: number;
  customization_options?: CustomizationOption[];
}

export interface Reward {
  id: number;
  name: string;
  short_description: string | null;
  description: string;
  long_description?: string | null;
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
  image_url?: string;
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
  store_address?: string;
  table_id?: number;
  pickup_time?: string;
  delivery_address?: Record<string, unknown> | string;
  notes?: string;
  recipient_name?: string;
  recipient_phone?: string;
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
  base_price?: number;
  quantity: number;
  store_id?: number;
  customizations?: Record<string, unknown>;
  customization_option_ids?: number[];
  customization_count?: number;
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
  referral_code?: string;
}

export interface Reservation {
  id: number;
  store_id: number;
  store_name?: string;
  customer_name?: string;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  status: 'requested' | 'confirmed' | 'seated' | 'no_show' | 'cancelled' | 'completed';
  notes?: string;
  table_number?: string;
  created_at?: string;
}

export interface Survey {
  id: number;
  survey_key: string;
  title: string;
  description?: string;
  survey_type: string;
  is_active: boolean;
  starts_at?: string;
  ends_at?: string;
  questions?: SurveyQuestion[];
}

export interface SurveyQuestion {
  id?: number;
  question_text: string;
  question_type: 'text' | 'single_choice' | 'multiple_choice' | 'rating';
  options?: string[];
  required: boolean;
  display_order: number;
}

export interface SurveyResponse {
  id: number;
  customer_name: string;
  submitted_at: string;
  answers: { question_id: number; answer: string }[];
}

export type PageId = 'home' | 'menu' | 'rewards' | 'cart' | 'checkout' | 'orders' | 'order-detail' | 'profile' | 'wallet' | 'history' | 'promotions' | 'information' | 'my-rewards' | 'account-details' | 'payment-methods' | 'saved-addresses' | 'notifications' | 'help-support' | 'legal' | 'settings' | 'my-card' | 'referral' | 'reservations';
export type OrderMode = 'pickup' | 'delivery' | 'dine_in';

export function cacheBust(url: string, ts?: number): string {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${ts ?? Date.now()}`;
}
