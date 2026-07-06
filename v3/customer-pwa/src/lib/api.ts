import axios from 'axios';

function resolveApiBase(): string {
  const envUrl =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : undefined;
  // Use the same-origin /api proxy so that HttpOnly cookies are sent
  // automatically. The Next.js rewrite forwards /api/* to the backend.
  // Server-side callers (Node/SSR) still need an absolute URL.
  if (typeof window !== 'undefined') {
    return '/api';
  }
  if (envUrl && envUrl.startsWith('http')) {
    return envUrl;
  }
  return 'http://127.0.0.1:13800/api';
}

export const API_BASE = resolveApiBase();

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
  withCredentials: true,
});

// Inject locale into every request. Auth is handled by HttpOnly cookies.
api.interceptors.request.use((config) => {
  const rawLocale = typeof window !== 'undefined' ? localStorage.getItem('loka-locale') : null;
  if (rawLocale) {
    try {
      const parsed = JSON.parse(rawLocale);
      const locale = parsed?.state?.locale || parsed?.locale;
      if (locale && typeof locale === 'string') {
        config.headers['Accept-Language'] = locale;
      }
    } catch {
      config.headers['Accept-Language'] = rawLocale;
    }
  }
  return config;
});

let _refreshPromise: Promise<{ access_token?: string; refresh_token?: string }> | null = null;

api.interceptors.response.use(
  (res) => {
    // Unwrap standard backend wrapper: { success, message, data } -> data
    // Auth endpoints return plain objects, so leave them as-is.
    const data = res.data;
    if (
      data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      'data' in data &&
      ('success' in data || 'status' in data || 'message' in data)
    ) {
      res.data = data.data;
    }
    return res;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/refresh')) {
      originalRequest._retry = true;
      let tokens: { access_token?: string; refresh_token?: string } | undefined;
      let currentPromise: Promise<any>;
      try {
        if (!_refreshPromise) {
          currentPromise = axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true }).then((res) => {
            const data = res.data;
            const t = data?.tokens || data;
            return t;
          });
          _refreshPromise = currentPromise;
        } else {
          currentPromise = _refreshPromise;
        }
        tokens = await currentPromise;
        _refreshPromise = null;
        if (tokens?.access_token) {
          return api(originalRequest);
        }
      } catch (refreshError: any) {
        if (_refreshPromise && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:expired'));
        }
        _refreshPromise = null;
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ---------- Shared primitives ----------

export interface OperatingHour {
  day_of_week: number; // 0 = Sunday
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  is_24_hours: boolean;
}

export interface SavedAddress {
  id?: number;
  label: string;
  recipient_name: string;
  recipient_phone: string;
  address_line_1: string;
  address_line_2?: string | null;
  city: string;
  state_province: string;
  postal_code: string;
  country_code: string;
  latitude?: number | null;
  longitude?: number | null;
  is_default?: boolean;
}

export interface Allergen {
  display_name: string;
  severity: string;
  icon_url?: string | null;
}

export interface ModifierOption {
  id: number;
  option_name: string;
  price_adjustment: number;
  is_default: boolean;
  is_available: boolean;
}

export interface ModifierGroup {
  id: number;
  group_name: string;
  selection_type: string; // e.g. 'single', 'multiple'
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  options: ModifierOption[];
}

export interface MenuItemVariant {
  id: number;
  variant_name: string;
  price_adjustment: number;
  is_available: boolean;
}

// ---------- Store ----------

export interface Store {
  id: number;
  store_name: string;
  slug?: string;
  address_line_1?: string;
  address_line_2?: string | null;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country_code?: string;
  phone_number?: string;
  email_address?: string;
  logo_url?: string | null;
  banner_image_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  operating_hours?: OperatingHour[];
  pickup_lead_minutes?: number;
  delivery_radius_km?: number;
  first_order_minutes_after_open?: number;
  last_order_minutes_before_close?: number;
  is_active?: boolean;
  is_accepting_orders?: boolean;
  currency_code?: string;
  pos_integration_type?: string | null;
  delivery_integration_type?: string | null;
}

// ---------- Menu ----------

export interface MenuCategory {
  id: number;
  category_name: string;
  slug?: string;
  is_available: boolean;
  is_featured: boolean;
  display_order: number;
  category_type?: string;
  image_url?: string | null;
}

export interface MenuItem {
  id: number;
  category_id: number;
  item_name: string;
  description: string | null;
  long_description?: string | null;
  base_price: number;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  is_popular?: boolean;
  display_order?: number;
  calories?: number | null;
  minimum_tier_id?: number | null;
  dietary_tags?: string[];
  allergens?: Allergen[];
  modifier_groups?: ModifierGroup[];
  variants?: MenuItemVariant[];
  is_addon_deal_eligible?: boolean;
  addon_discount_type?: string | null;
  addon_discount_value?: number | null;
  eligible_bundle_ids?: number[] | null;
}

export interface CustomizationOption {
  id: number;
  name: string;
  option_type: string;
  price_adjustment: number;
  is_active: boolean;
  is_popular: boolean;
}

// ---------- Cart ----------

export interface CartLineItem {
  id?: number;
  menu_item_id: number;
  item_name: string;
  unit_price: number;
  line_total?: number;
  quantity: number;
  selected_modifiers?: Record<string, unknown>;
  modifier_option_ids?: number[];
  image_url?: string | null;
  bundle_product_id?: number;
  bundle_component_id?: number;
  item_snapshot?: {
    item_name?: string;
    image_url?: string | null;
  };
}

/** UI-facing cart item kept for local cart store and components. */
export interface CartItem {
  id?: number;
  menu_item_id: number;
  name: string;
  price: number;
  base_price?: number;
  quantity: number;
  store_id?: number;
  bundle_product_id?: number;
  bundle_component_id?: number;
  customizations?: Record<string, unknown>;
  customization_option_ids?: number[];
  customization_count?: number;
  image_url?: string;
}

export interface Cart {
  id?: number;
  store_id?: number;
  line_items?: CartLineItem[];
  total_items?: number;
  subtotal?: number;
  total_amount?: number;
  discount_amount?: number;
  delivery_fee?: number;
}

// ---------- Order ----------

export interface OrderLineItem {
  id?: number;
  menu_item_id?: number;
  item_name: string;
  unit_price: number;
  line_total?: number;
  quantity: number;
  selected_modifiers?: Record<string, unknown>;
  image_url?: string | null;
  item_snapshot?: {
    item_name?: string;
    image_url?: string | null;
  };
}

/** UI-facing order item alias kept for components that still expect name/price. */
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

export interface OrderStatusEntry {
  status: string;
  timestamp: string;
  note?: string;
}

export interface Order {
  id: number;
  order_number: string;
  order_type: 'dine_in' | 'takeaway' | 'delivery';
  status: string;
  payment_status?: string;
  payment_method?: string;
  items_subtotal: number;
  discount_amount?: number;
  delivery_fee?: number;
  total_amount: number;
  total_amount_currency?: string;
  customer_notes?: string;
  store_name?: string;
  store_address?: string;
  store_id?: number;
  dining_table_id?: number;
  created_at: string;
  updated_at?: string;
  loyalty_points_earned?: number;
  line_items: OrderLineItem[];
  status_log?: OrderStatusEntry[];
  // Fulfillment extras (flattened by backend or derived)
  pickup_time?: string;
  delivery_address?: Record<string, unknown> | string;
  recipient_name?: string;
  recipient_phone?: string;
  delivery_tracking_url?: string;
  delivery_eta_minutes?: number;
  delivery_courier_name?: string;
  delivery_courier_phone?: string;
}

// ---------- Wallet ----------

export interface WalletData {
  balance: number;
  currency_code: string;
  total_credited?: number;
  total_debited?: number;
  rewards?: UserReward[];
  vouchers?: UserVoucher[];
}

export interface LedgerEntry {
  id: number;
  entry_type: string;
  amount: number;
  description: string;
  created_at: string;
  running_balance?: number;
  reference_type?: string;
  reference_id?: string | number;
}

// ---------- Loyalty ----------

export interface LoyaltySummary {
  current_points: number;
  tier_name: string;
  tier_id?: number;
  points_to_next_tier?: number;
  lifetime_points?: number;
}

export interface LoyaltyLedgerEntry {
  id: number;
  points_delta: number;
  event_type: string;
  description?: string;
  created_at: string;
}

// ---------- Rewards ----------

export interface RewardCatalogItem {
  id: number;
  reward_name: string;
  reward_key?: string;
  reward_type: string;
  points_cost: number;
  image_url?: string | null;
  short_description?: string | null;
  long_description?: string | null;
  terms_and_conditions?: string[] | null;
  how_to_redeem?: string | null;
  discount_value?: number;
  discount_max_amount?: number;
  minimum_order_value?: number;
  validity_days?: number;
}

export interface UserReward {
  id: number;
  reward_catalog_id: number;
  reward_name: string;
  redemption_code: string;
  status: 'available' | 'used' | 'expired' | 'active';
  points_spent?: number;
  expires_at: string;
  created_at?: string;
  used_at?: string | null;
}

// ---------- Vouchers ----------

export interface UserVoucher {
  id: number;
  voucher_definition_id: number;
  code: string;
  status: 'available' | 'used' | 'expired' | 'active';
  expires_at: string;
  source?: string;
  created_at?: string;
  used_at?: string | null;
  discount_type: string;
  discount_value: number;
  min_spend?: number;
  max_discount?: number;
  voucher_title?: string;
  voucher_image_url?: string | null;
}

// ---------- Notifications ----------

export interface Notification {
  id: number;
  message_type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  action_url?: string | null;
  action_type?: string | null;
}

// ---------- Profile ----------

export interface UserProfile {
  id: number;
  display_name: string;
  email_address: string;
  phone_number: string;
  avatar_url?: string | null;
  date_of_birth?: string | null;
  created_at?: string;
  referral_code?: string;
  referral_count?: number;
  referral_earnings_total?: number;
  addresses?: SavedAddress[];
  default_address?: SavedAddress | null;
}

// ---------- Payment methods ----------

export interface PaymentMethod {
  id: number;
  method_type: 'wallet' | 'card' | 'cash' | string;
  provider?: string;
  display_label?: string;
  card_brand?: string;
  card_last_four?: string;
  card_expiry_month?: string;
  card_expiry_year?: string;
  is_default?: boolean;
  is_active?: boolean;
}

// ---------- Content ----------

export interface PromoBanner {
  id: number;
  title: string;
  short_description?: string | null;
  long_description?: string | null;
  image_url?: string | null;
  action_type?: string | null;
  action_url?: string | null;
  voucher_id?: number | null;
  survey_id?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  terms_and_conditions?: string[];
  how_to_redeem?: string | null;
}

export interface InformationCard {
  id: number;
  title: string;
  slug?: string | null;
  short_description?: string | null;
  long_description?: string | null;
  content_type?: string | null;
  icon?: string | null;
  image_url?: string | null;
  image_gallery_urls?: string[] | null;
  action_url?: string | null;
  action_type?: string | null;
  action_label?: string | null;
  position?: number;
  start_date?: string | null;
  end_date?: string | null;
}

export interface LegalPage {
  id: number;
  page_key: string;
  title: string;
  body_text: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SplashScreen {
  id: number;
  screen_name: string;
  title: string;
  subtitle?: string | null;
  body_text?: string | null;
  image_url?: string | null;
  cta_text?: string | null;
  cta_url?: string | null;
  show_frequency?: string;
  dismissible?: boolean;
  duration_ms?: number;
  active_from?: string | null;
  active_until?: string | null;
}

// ---------- Config ----------

export interface TierInfo {
  id: number;
  name: string;
  min_points: number;
  points_multiplier: number;
  benefits: Record<string, unknown> | null;
  sort_order: number;
}

export interface ConfigBootstrap {
  currency: string;
  currency_symbol: string;
  delivery_fee?: number;
  minimum_order_amount?: number;
  loyalty_tiers?: TierInfo[];
  stores?: Store[];
  features?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

// ---------- Surveys ----------

export interface SurveyQuestion {
  id: number;
  question_text: string;
  question_type: 'text' | 'single_choice' | 'multiple_choice' | 'rating';
  options?: string[];
  required: boolean;
  display_order: number;
}

export interface Survey {
  id: number;
  survey_key: string;
  survey_name: string;
  description?: string;
  survey_type: string;
  is_active: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  questions?: SurveyQuestion[];
}

export interface SurveyAnswerInput {
  question_id: number;
  answer_value: string;
  answer_detail?: string;
}

export interface SurveyResponse {
  id: number;
  survey_id: number;
  customer_name?: string;
  submitted_at?: string;
  answers: SurveyAnswerInput[];
}

// ---------- Reservations ----------

export interface Reservation {
  id: number;
  store_id: number;
  store_name?: string;
  customer_name?: string;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  status: 'requested' | 'confirmed' | 'seated' | 'no_show' | 'cancelled' | 'completed';
  special_requests?: string;
  table_number?: string;
  created_at?: string;
}

// ---------- Bundles ----------

export interface BundleProduct {
  id: number;
  bundle_type: string;
  title: string;
  description: string | null;
  image_url: string | null;
  bundle_price: number;
  category_id: number | null;
  display_order: number;
  is_active: boolean;
  pick_count?: number | null;
  allow_duplicates?: boolean;
  max_per_order?: number;
  components: BundleProductComponent[];
  groups?: BundleGroup[];
}

export interface BundleGroup {
  id: number;
  group_label: string;
  group_description: string | null;
  pick_count: number;
  min_pick: number;
  max_pick: number;
  sort_order: number;
  components: BundleProductComponent[];
}

export interface BundleProductComponent {
  id: number;
  menu_item_id: number;
  bundle_group_id: number | null;
  menu_item_name: string | null;
  menu_item_price: number | null;
  menu_item_image_url: string | null;
  default_quantity: number;
  sort_order: number;
  modifier_overrides: Array<{
    id: number;
    modifier_option_id: number;
    modifier_option_name: string | null;
    price_adjustment: number | null;
    is_default: boolean;
  }>;
}

// ---------- Pagination ----------

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

// ---------- Deprecated aliases (kept for minimal local churn) ----------

/** @deprecated Use MenuCategory */
export type Category = MenuCategory;

/** @deprecated Use RewardCatalogItem */
export type Reward = RewardCatalogItem;

/** @deprecated Use LedgerEntry */
export type Transaction = LedgerEntry;

/** @deprecated Use LoyaltyLedgerEntry */
export type LoyaltyHistoryEntry = LoyaltyLedgerEntry;





// ---------- Misc ----------

export interface Table {
  id: number;
  store_id: number;
  table_number: string;
  capacity: number;
}

export interface DeliveryAddress {
  address: string;
  lat?: number;
  lng?: number;
}

export type PageId = 'home' | 'menu' | 'rewards' | 'cart' | 'checkout' | 'orders' | 'order-detail' | 'profile' | 'wallet' | 'history' | 'promotions' | 'information' | 'my-rewards' | 'account-details' | 'payment-methods' | 'saved-addresses' | 'notifications' | 'help-support' | 'legal' | 'settings' | 'my-card' | 'referral' | 'reservations' | 'events' | 'checkin';
export type OrderMode = 'pickup' | 'delivery' | 'dine_in';

export function cacheBust(url: string, ts?: number): string {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${ts ?? Date.now()}`;
}

export interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface RegisterDevicePayload {
  device_fingerprint: string;
  platform: 'web' | 'pwa';
  push_token?: string | null;
  web_push_subscription?: PushSubscriptionJSON | null;
  app_version?: string;
  os_version?: string;
  device_model?: string;
}

export async function getVapidPublicKey(): Promise<string> {
  const res = await api.get('/push/vapid-public-key');
  return res.data?.public_key as string;
}

export async function registerDevice(payload: RegisterDevicePayload): Promise<unknown> {
  const res = await api.post('/me/devices', payload);
  return res.data;
}

export async function deregisterDevice(deviceFingerprint: string): Promise<unknown> {
  const res = await api.delete(`/me/devices/${deviceFingerprint}`);
  return res.data;
}
