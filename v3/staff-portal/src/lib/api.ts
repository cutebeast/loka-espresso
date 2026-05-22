const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

function getAuthHeaders(): HeadersInit {
  if (typeof window === "undefined") return { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  Auth helpers (extracted to avoid duplication)                     */
/* ------------------------------------------------------------------ */

function clearAuthStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("staffEmail");
  localStorage.removeItem("staffName");
  localStorage.removeItem("staffStoreId");
  localStorage.removeItem("staffProfile");
  localStorage.removeItem("staffId");
  localStorage.removeItem("isAdmin");
}

/* ------------------------------------------------------------------ */
/*  Token refresh with mutex (prevents race conditions)               */
/* ------------------------------------------------------------------ */

let _refreshPromise: Promise<boolean> | null = null;

export async function refreshToken(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      if (typeof window === "undefined") return false;
      const refresh = localStorage.getItem("refreshToken");
      if (!refresh) return false;
      const res = await fetch(`${BASE_URL}/staff/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) return false;
      const json = await res.json();
      const data = json.data || json;
      if (data.tokens?.access_token) {
        localStorage.setItem("token", data.tokens.access_token);
        if (data.tokens.refresh_token) localStorage.setItem("refreshToken", data.tokens.refresh_token);
        return true;
      }
      return false;
    } catch (err) {
      console.error("refreshToken failed:", err);
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

/* ------------------------------------------------------------------ */
/*  Request helpers                                                   */
/* ------------------------------------------------------------------ */

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const makeRequest = async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: getAuthHeaders(),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) {
        const retry = await fetch(`${BASE_URL}${path}`, {
          method,
          headers: getAuthHeaders(),
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (retry.ok) return retry;
      }
      if (typeof window !== "undefined") {
        clearAuthStorage();
        window.location.replace("/login");
      }
      throw new Error("Session expired. Please log in again.");
    }
    return res;
  };

  const res = await makeRequest();
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const json = await res.json();
    if (json && typeof json === "object" && "data" in json) {
      const data = json.data;
      if (data && typeof data === "object" && Array.isArray(data.items)) {
        return data.items as T;
      }
      return data as T;
    }
    return json as T;
  }
  throw new Error("Expected JSON response but received non-JSON");
}

async function requestRaw<T>(method: string, path: string, body?: unknown): Promise<T> {
  const makeRequest = async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: getAuthHeaders(),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) {
        const retry = await fetch(`${BASE_URL}${path}`, {
          method,
          headers: getAuthHeaders(),
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (retry.ok) return retry;
      }
      if (typeof window !== "undefined") {
        clearAuthStorage();
        window.location.replace("/login");
      }
      throw new Error("Session expired");
    }
    return res;
  };
  const res = await makeRequest();
  if (!res.ok) { const text = await res.text(); throw new Error(text || `Request failed: ${res.status}`); }
  const json = await res.json();
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

async function requestWithTimeout<T>(method: string, path: string, body?: unknown, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const makeRequest = async () => {
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: getAuthHeaders(),
        signal: controller.signal,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (res.status === 401) {
        const refreshed = await refreshToken();
        if (refreshed) {
          const retry = await fetch(`${BASE_URL}${path}`, {
            method,
            headers: getAuthHeaders(),
            signal: controller.signal,
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
          if (retry.ok) return retry;
        }
        if (typeof window !== "undefined") {
          clearAuthStorage();
          window.location.replace("/login");
        }
        throw new Error("Session expired");
      }
      return res;
    };
    const res = await makeRequest();
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed: ${res.status}`);
    }
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const json = await res.json();
      if (json && typeof json === "object" && "data" in json) {
        const data = json.data;
        if (data && typeof data === "object" && Array.isArray(data.items)) {
          return data.items as T;
        }
        return data as T;
      }
      return json as T;
    }
    throw new Error("Expected JSON response but received non-JSON");
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  getRaw: <T>(path: string) => requestRaw<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload: async <T = { url: string; filename: string }>(path: string, formData: FormData): Promise<T> => {
    if (typeof window === "undefined") throw new Error("Cannot upload during SSR");
    const token = localStorage.getItem("token");
    const doFetch = (headers: HeadersInit) =>
      fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: formData });
    let res = await doFetch(token ? { Authorization: `Bearer ${token}` } : {});
    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) {
        const freshToken = localStorage.getItem("token");
        res = await doFetch(freshToken ? { Authorization: `Bearer ${freshToken}` } : {});
      }
      else throw new Error("Session expired");
    }
    if (!res.ok) { const text = await res.text(); throw new Error(text || `Upload failed: ${res.status}`); }
    const json = await res.json();
    return (json?.data ?? json) as T;
  },
  fetchRaw: async (method: string, path: string, body?: unknown) => {
    const makeRequest = async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (res.status === 401) {
        const refreshed = await refreshToken();
        if (refreshed) {
          const freshToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
          const retry = await fetch(`${BASE_URL}${path}`, {
            method,
            headers: { ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
          if (retry.ok) return retry;
        }
        if (typeof window !== "undefined") {
          clearAuthStorage();
          window.location.replace("/login");
        }
        throw new Error("Session expired");
      }
      return res;
    };
    return makeRequest();
  },
};

/* ------------------------------------------------------------------ */
/*  Auth                                                              */
/* ------------------------------------------------------------------ */

export async function staffLogin(email: string, password: string) {
  const data = await api.post<{
    tokens?: { access_token?: string; refresh_token?: string };
    profile?: { email?: string; display_name?: string; store_id?: number; staff_id?: number; is_admin?: boolean };
  }>("/staff/auth/login", { email, password });
  const token = data.tokens?.access_token;
  const refresh = data.tokens?.refresh_token;
  if (token) {
    localStorage.setItem("token", token);
    if (refresh) localStorage.setItem("refreshToken", refresh);
    if (data.profile) {
      localStorage.setItem("staffProfile", JSON.stringify(data.profile));
      if (data.profile.email) localStorage.setItem("staffEmail", data.profile.email);
      if (data.profile.display_name) localStorage.setItem("staffName", data.profile.display_name);
      if (data.profile.store_id) localStorage.setItem("staffStoreId", String(data.profile.store_id));
      if (data.profile.staff_id) localStorage.setItem("staffId", String(data.profile.staff_id));
      if (data.profile.is_admin) localStorage.setItem("isAdmin", String(data.profile.is_admin));
    }
  }
  return data;
}

export async function staffLoginByName(name: string, pin: string, storeId: number) {
  const data = await api.post<{
    tokens?: { access_token?: string; refresh_token?: string };
    profile?: { email?: string; display_name?: string; store_id?: number; staff_id?: number; is_admin?: boolean };
  }>("/staff/auth/login", { display_name: name, password: pin, store_id: storeId });
  const token = data.tokens?.access_token;
  const refresh = data.tokens?.refresh_token;
  if (token) {
    localStorage.setItem("token", token);
    if (refresh) localStorage.setItem("refreshToken", refresh);
    if (data.profile) {
      localStorage.setItem("staffProfile", JSON.stringify(data.profile));
      if (data.profile.email) localStorage.setItem("staffEmail", data.profile.email);
      if (data.profile.display_name) localStorage.setItem("staffName", data.profile.display_name);
      if (data.profile.store_id) localStorage.setItem("staffStoreId", String(data.profile.store_id));
      if (data.profile.staff_id) localStorage.setItem("staffId", String(data.profile.staff_id));
      if (data.profile.is_admin) localStorage.setItem("isAdmin", String(data.profile.is_admin));
    }
  }
  return data;
}

export function staffLogout() {
  clearAuthStorage();
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return !!getToken();
}

/* ------------------------------------------------------------------ */
/*  Core Types                                                        */
/* ------------------------------------------------------------------ */

export type OrderStatus =
  | "pending" | "confirmed" | "preparing" | "ready_for_pickup"
  | "out_for_delivery" | "delivered"
  | "cancelled_by_customer" | "cancelled_by_merchant"
  | "refunded" | "partially_refunded" | "disputed";

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
  modifier_ids?: number[];
  modifiers_label?: string;
}

export interface Order {
  id: string | number;
  order_number: string;
  status: OrderStatus;
  order_type: string;
  total_amount: number;
  created_at: string;
  updated_at: string;
  customer_name?: string;
  customer_phone?: string;
  table_number?: string;
  dining_table_id?: number;
  item_count?: number;
  items?: OrderItem[];
  line_items?: OrderItem[];
  payment_status?: string;
  payment_method?: string;
  order_notes?: string;
  store_name?: string;
}

export interface OrderDetail extends Order {
  items_subtotal?: number;
  tax_amount?: number;
  delivery_fee?: number;
  discount_amount?: number;
  adjustments?: Array<{
    adjustment_type: string;
    amount_delta: number;
    reason?: string;
    created_at?: string;
  }>;
  status_log?: Array<{
    from_status?: string;
    to_status: string;
    created_at: string;
    reason?: string;
    actor_type?: string;
    actor_id?: number;
  }>;
}

export interface DashboardMetrics {
  today_orders: number;
  active_orders: number;
  today_revenue: number;
  pending_items: number;
}

export interface Table {
  id: number;
  table_number: string;
  display_name?: string | null;
  capacity: number;
  section?: string | null;
  current_status: "available" | "occupied" | "reserved" | "cleaning" | "maintenance";
  is_active?: boolean;
  qr_code_image_url?: string | null;
  qr_code_token?: string | null;
  qr_generated_at?: string | null;
  active_order?: {
    id: number;
    order_number: string;
    status: string;
    payment_status: string;
    total_amount: number;
  } | null;
}

export interface MenuItem {
  id: number;
  item_name: string;
  base_price: number;
  category_id?: number;
  category_name?: string;
  modifier_groups?: ModifierGroup[];
  is_available: boolean;
  image_url?: string;
}

export interface ModifierGroup {
  id: number;
  group_name: string;
  is_required: boolean;
  selection_type: "single" | "multiple";
  max_selections?: number;
  options: Modifier[];
}

export interface Modifier {
  id: number;
  option_name: string;
  price_adjustment: number;
}

export interface Category {
  id: number;
  category_name: string;
}

export interface CartItem {
  menu_item_id: number;
  name: string;
  qty: number;
  price: number;
  modifier_ids: number[];
  modifiers_label: string;
}

export interface Customer {
  id: number;
  display_name: string;
  phone_number: string;
  email?: string;
  loyalty_points?: number;
}

export interface Store {
  id: number;
  store_name: string;
  is_active?: boolean;
}

export type ReservationStatus = "requested" | "confirmed" | "seated" | "no_show" | "cancelled_by_guest" | "cancelled_by_merchant" | "completed";

export interface Reservation {
  id: number;
  customer_name: string;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  table_number?: string;
  dining_table_id?: number;
  status: ReservationStatus;
  customer_phone?: string;
  special_requests?: string;
  created_at?: string;
}

/* ------------------------------------------------------------------ */
/*  Time Clock                                                        */
/* ------------------------------------------------------------------ */

export interface TimeEvent {
  id: number;
  event_type: "clock_in" | "clock_out" | "break_start" | "break_end";
  event_timestamp: string;
  latitude?: number;
  longitude?: number;
  location_verified?: boolean;
  device_info?: string;
  notes?: string;
  approved_by?: number;
}

/* ------------------------------------------------------------------ */
/*  API Helpers                                                       */
/* ------------------------------------------------------------------ */

export function getStores() {
  return api.get<Store[]>("/admin/stores");
}

export function getTables(storeId: number) {
  return api.get<Table[]>(`/admin/stores/${storeId}/tables`);
}

export function getOrders(storeId?: number, status?: OrderStatus, paymentStatus?: string) {
  const params = new URLSearchParams();
  if (status) params.append("status", status);
  if (paymentStatus) params.append("payment_status", paymentStatus);
  if (storeId != null && storeId > 0) params.append("store_id", String(storeId));
  params.append("per_page", "100");
  const qs = params.toString();
  return api.get<Order[]>(`/admin/orders?${qs}`);
}

export function getOrderById(id: string | number) {
  return api.get<OrderDetail>(`/admin/orders/${id}`);
}

export function updateOrderStatus(id: string | number, status: OrderStatus, reason?: string) {
  return api.patch(`/admin/orders/${id}/status`, { status, ...(reason ? { reason } : {}) });
}

export function updateOrderPayment(id: string | number, payload: {
  payment_method: string;
  amount_tendered?: number;
  amount?: number;
  discount_amount?: number;
  discount_type?: "percentage" | "fixed";
}) {
  return api.patch(`/admin/orders/${id}/payment`, payload);
}

export function applyOrderVoucher(orderId: string | number, voucherCode: string) {
  return api.post<{ order_id: number; voucher_code: string; discount_amount: number; new_total: number; message: string }>(`/admin/orders/${orderId}/apply-voucher`, { voucher_code: voucherCode });
}

export function applyOrderReward(orderId: string | number, rewardId: number) {
  return api.post<{ order_id: number; reward_id: number; discount_amount: number; new_total: number; message: string }>(`/admin/orders/${orderId}/apply-reward`, { reward_id: rewardId });
}

export function payWithWallet(orderId: string | number, amount: number) {
  return api.post<{ order_id: number; amount_paid: number; wallet_balance_remaining: number; payment_status: string; message: string }>(`/admin/orders/${orderId}/wallet-payment`, { amount });
}

export function getReservations(storeId: number, date?: string, status?: ReservationStatus) {
  const params = new URLSearchParams();
  if (date) { params.append("date_from", date); params.append("date_to", date); }
  if (status) params.append("status", status);
  if (storeId != null && storeId > 0) params.append("store_id", String(storeId));
  params.append("per_page", "100");
  return api.get<Reservation[]>(`/admin/reservations?${params.toString()}`);
}

export function updateReservationStatus(id: number, status: ReservationStatus, tableId?: number | null) {
  const body: Record<string, unknown> = { status };
  if (tableId != null) {
    body.dining_table_id = tableId;
  }
  return api.patch(`/admin/reservations/${id}/status`, body);
}

export function clockIn() {
  return api.post<TimeEvent>("/staff/time-events?event_type=clock_in");
}

export function clockOut() {
  return api.post<TimeEvent>("/staff/time-events?event_type=clock_out");
}

export function startBreak() {
  return api.post<TimeEvent>("/staff/time-events?event_type=break_start");
}

export function endBreak() {
  return api.post<TimeEvent>("/staff/time-events?event_type=break_end");
}

export function getMyTimeEvents(date?: string) {
  const qs = new URLSearchParams();
  if (date) { qs.set("date_from", date); qs.set("date_to", date); }
  qs.set("per_page", "100");
  return api.get<TimeEvent[]>(`/staff/time-events/me?${qs.toString()}`);
}

/* ------------------------------------------------------------------ */
/*  POS Helpers                                                       */
/* ------------------------------------------------------------------ */

export function getMenuItems(perPage = 100) {
  return api.get<MenuItem[]>(`/admin/menu/items?per_page=${perPage}`);
}

export function getMenuCategories(perPage = 50) {
  return api.get<Category[]>(`/admin/menu/categories?per_page=${perPage}`);
}

export function searchCustomers(q: string) {
  return api.get<Customer[]>(`/staff/customers/search?q=${encodeURIComponent(q)}`);
}

export function createPosOrder(payload: {
  customer_id?: number | null;
  dining_table_id?: number | null;
  order_type: string;
  line_items: Array<{ menu_item_id: number; quantity: number; modifier_ids: number[]; notes?: string }>;
  order_notes?: string;
}) {
  return api.post<{ order_id: number; order_number: string; total: number; change?: number }>("/staff/pos/orders", payload);
}

export function generateTableQr(storeId: number, tableId: number) {
  return api.post<Table>(`/admin/stores/${storeId}/tables/${tableId}/generate-qr`);
}

export function updateTableStatus(storeId: number, tableId: number, status: string) {
  return api.patch(`/admin/stores/${storeId}/tables/${tableId}`, { current_status: status });
}

/* ------------------------------------------------------------------ */
/*  Wallet, Rewards & Vouchers                                        */
/* ------------------------------------------------------------------ */

export interface Reward {
  id: number;
  reward_id?: number;
  reward_catalog_id?: number;
  name?: string;
  redemption_code?: string;
  status?: string;
  points_spent?: number;
  expires_at?: string;
}

export interface Voucher {
  id: number;
  voucher_id?: number;
  redemption_code?: string;
  title?: string;
  code?: string;
  voucher_title?: string;
  voucher_code?: string;
  discount_type?: string;
  discount_value?: number;
  min_spend?: number;
  status?: string;
  expires_at?: string;
}

export interface CustomerWallet {
  balance: number;
  rewards: Reward[];
  vouchers: Voucher[];
}

export interface CustomerDetail extends Customer {
  wallet?: { id: number; is_frozen: boolean; currency_code: string; balance?: number } | null;
  loyalty?: { tier_name: string; points_balance: number } | null;
}

export function getCustomerById(id: number) {
  return api.get<CustomerDetail>(`/admin/customers/${id}`);
}

export function getCustomerWallet(customerId: number) {
  return api.get<CustomerWallet>(`/admin/customers/${customerId}/wallet`);
}

export function topUpWallet(payload: {
  phone?: string;
  customer_id?: number;
  amount: number;
  payment_method?: string;
  notes?: string;
}) {
  return api.post<{ message: string; new_balance: number }>("/admin/wallets/topup", payload);
}

export function useReward(customerId: number, rewardId: number, notes?: string) {
  return api.post<{ message: string; success: boolean }>(`/admin/customers/${customerId}/use-reward/${rewardId}`, { store_id: null, notes: notes || "Used in-store" });
}

export function useVoucher(customerId: number, voucherId: number, notes?: string) {
  return api.post<{ message: string; success: boolean }>(`/admin/customers/${customerId}/use-voucher/${voucherId}`, { store_id: null, notes: notes || "Used in-store" });
}

export function scanCustomerCode(code: string) {
  return api.post<{
    customer_id: number;
    customer_name: string;
    customer_phone: string;
    wallet_balance?: number;
  }>("/admin/scan/customer", { code });
}

export function scanRewardCode(code: string) {
  return api.post<{
    reward_id: number;
    name: string;
    customer_id?: number;
    valid: boolean;
  }>(`/admin/scan/reward/${code}`, { store_id: null });
}

export function scanVoucherCode(code: string) {
  return api.post<{
    voucher_id: number;
    title: string;
    customer_id?: number;
    valid: boolean;
  }>(`/admin/scan/voucher/${code}`, { store_id: null });
}
