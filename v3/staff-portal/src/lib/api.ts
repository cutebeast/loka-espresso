
function resolveApiBase(): string {
  const envUrl = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_URL : undefined;
  // Use the same-origin /api proxy so HttpOnly cookies are sent automatically.
  // Server-side callers need an absolute URL (API_PROXY_URL or API_URL).
  if (typeof window !== "undefined") {
    return "/api";
  }
  if (envUrl && envUrl.startsWith("http")) {
    return envUrl;
  }
  // Server-side: use API_PROXY_URL or API_URL if available, otherwise fallback
  return process.env.API_PROXY_URL || process.env.API_URL || "http://127.0.0.1:13800/api";
}

const BASE_URL = resolveApiBase();

function getAuthHeaders(): HeadersInit {
  // Auth is handled by the HttpOnly staff_token cookie.
  return { "Content-Type": "application/json" };
}

function fetchOptions(body?: unknown, signal?: AbortSignal): RequestInit {
  return {
    headers: getAuthHeaders(),
    credentials: "include",
    signal,
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  Auth helpers (extracted to avoid duplication)                     */
/* ------------------------------------------------------------------ */

function clearAuthStorage(): void {
  if (typeof window === "undefined") return;
  // Legacy token/refreshToken are no longer stored client-side.
  // Only non-sensitive POS preferences are cleared here.
  localStorage.removeItem("pos_active_cart");
  localStorage.removeItem("pos_held_orders");
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
      const res = await fetch("/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      return res.ok;
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

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  total_pages: number;
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  // Reset idle timer on API activity
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("staff:activity"));
  }
  const makeRequest = async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      ...fetchOptions(body, signal),
    });
    if (res.status === 401) {
      if (signal?.aborted) throw new Error("Request aborted");
      const refreshed = await refreshToken();
      if (refreshed) {
        const retry = await fetch(`${BASE_URL}${path}`, {
          method,
          ...fetchOptions(body, signal),
        });
        if (retry.ok) return retry;
      }
      if (typeof window !== "undefined") {
        clearAuthStorage();
        window.location.replace("/login");
      }
      throw new Error("Session expired. Please log in again.");
    }
    if (res.status === 403) {
      const errText = await res.text();
      try {
        const errJson = JSON.parse(errText);
        if (errJson.detail === "must_change_pin" || errJson.error === "must_change_pin") {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("must-change-pin"));
          }
          throw new Error("must_change_pin");
        }
      } catch { /* not JSON */ }
    }
    return res;
  };

  const res = await makeRequest();
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return {} as T;
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const json = await res.json();
    if (json && typeof json === "object" && "data" in json) {
      const data = json.data;
      // Only list responses unwrap to bare arrays — a single-entity payload
      // (has `id`) must be returned whole, or order detail comes back as items.
      if (data && typeof data === "object" && !("id" in data) && Array.isArray((data as Record<string, unknown>).items)) {
        return (data.items ?? []) as unknown as T;
      }
      return data as T;
    }
    return json as T;
  }
  throw new Error("Expected JSON response but received non-JSON");
}

async function requestPaginated<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<PaginatedResponse<T>> {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("staff:activity"));
  }
  const makeRequest = async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      ...fetchOptions(body, signal),
    });
    if (res.status === 401) {
      if (signal?.aborted) throw new Error("Request aborted");
      const refreshed = await refreshToken();
      if (refreshed) {
        const retry = await fetch(`${BASE_URL}${path}`, {
          method,
          ...fetchOptions(body, signal),
        });
        if (retry.ok) return retry;
      }
      if (typeof window !== "undefined") {
        clearAuthStorage();
        window.location.replace("/login");
      }
      throw new Error("Session expired");
    }
    if (res.status === 403) {
      const errText = await res.text();
      try {
        const errJson = JSON.parse(errText);
        if (errJson.detail === "must_change_pin" || errJson.error === "must_change_pin") {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("must-change-pin"));
          }
          throw new Error("must_change_pin");
        }
      } catch { /* not JSON */ }
    }
    return res;
  };
  const res = await makeRequest();
  if (!res.ok) { const text = await res.text(); throw new Error(text || `Request failed: ${res.status}`); }
  if (res.status === 204) return { items: [], total: 0, page: 1, total_pages: 1 };
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const json = await res.json();
    const data = (json && typeof json === "object" && "data" in json) ? json.data : json;
    if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).items)) {
      return {
        items: (data as Record<string, unknown>).items as T[],
        total: ((data as Record<string, unknown>).total ?? 0) as number,
        page: ((data as Record<string, unknown>).page ?? 1) as number,
        total_pages: ((data as Record<string, unknown>).total_pages ?? (data as Record<string, unknown>).pages ?? 1) as number,
      };
    }
    return { items: (Array.isArray(data) ? data : []) as T[], total: 0, page: 1, total_pages: 1 };
  }
  throw new Error("Expected JSON response for paginated request");
}

async function requestRaw<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  // Reset idle timer on API activity
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("staff:activity"));
  }
  const makeRequest = async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      ...fetchOptions(body, signal),
    });
    if (res.status === 401) {
      if (signal?.aborted) throw new Error("Request aborted");
      const refreshed = await refreshToken();
      if (refreshed) {
        const retry = await fetch(`${BASE_URL}${path}`, {
          method,
          ...fetchOptions(body, signal),
        });
        if (retry.ok) return retry;
      }
      if (typeof window !== "undefined") {
        clearAuthStorage();
        window.location.replace("/login");
      }
      throw new Error("Session expired");
    }
    if (res.status === 403) {
      const errText = await res.text();
      try {
        const errJson = JSON.parse(errText);
        if (errJson.detail === "must_change_pin" || errJson.error === "must_change_pin") {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("must-change-pin"));
          }
          throw new Error("must_change_pin");
        }
      } catch { /* not JSON */ }
    }
    return res;
  };
  const res = await makeRequest();
  if (!res.ok) { const text = await res.text(); throw new Error(text || `Request failed: ${res.status}`); }
  if (res.status === 204) return {} as T;
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const json = await res.json();
    if (json && typeof json === "object" && "data" in json) {
      const data = json.data;
      // Only list responses unwrap to bare arrays — a single-entity payload
      // (has `id`) must be returned whole, or order detail comes back as items.
      if (data && typeof data === "object" && !("id" in data) && Array.isArray((data as Record<string, unknown>).items)) return (data.items ?? []) as T;
      return data as T;
    }
    return json as T;
  }
  const text = await res.text();
  return text as unknown as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>("GET", path, undefined, signal),
  getRaw: <T>(path: string, signal?: AbortSignal) => requestRaw<T>("GET", path, undefined, signal),
  getPaginated: <T>(path: string, signal?: AbortSignal) => requestPaginated<T>("GET", path, undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  postPaginated: <T>(path: string, body?: unknown) => requestPaginated<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload: async <T = { url: string; filename: string }>(path: string, formData: FormData): Promise<T> => {
    if (typeof window === "undefined") throw new Error("Cannot upload during SSR");
    const doFetch = () =>
      fetch(`${BASE_URL}${path}`, { method: "POST", credentials: "include", body: formData });
    let res = await doFetch();
    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) {
        res = await doFetch();
        if (res.status === 401) {
          clearAuthStorage();
          window.location.replace("/login");
          throw new Error("Session expired");
        }
      }
      else throw new Error("Session expired");
    }
    if (!res.ok) { const text = await res.text(); throw new Error(text || `Upload failed: ${res.status}`); }
    const json = await res.json();
    return (json?.data ?? json) as T;
  },
  fetchRaw: async (method: string, path: string, body?: unknown, signal?: AbortSignal) => {
    const makeRequest = async () => {
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: { ...(body ? { "Content-Type": "application/json" } : {}) },
        credentials: "include",
        signal,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    if (res.status === 401) {
      if (signal?.aborted) throw new Error("Request aborted");
      const refreshed = await refreshToken();
      if (refreshed) {
        const retry = await fetch(`${BASE_URL}${path}`, {
          method,
          ...fetchOptions(body, signal),
          });
          if (retry.ok) return retry;
        }
        if (typeof window !== "undefined") {
          clearAuthStorage();
          window.location.replace("/login");
        }
        throw new Error("Session expired");
      }
      if (res.status === 403) {
        const errText = await res.text();
        try {
          const errJson = JSON.parse(errText);
          if (errJson.detail === "must_change_pin" || errJson.error === "must_change_pin") {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("must-change-pin"));
            }
            throw new Error("must_change_pin");
          }
        } catch { /* not JSON */ }
      }
      return res;
    };
    return makeRequest();
  },
};

/* ------------------------------------------------------------------ */
/*  Auth                                                              */
/* ------------------------------------------------------------------ */

export async function staffLogin(email: string, password: string, storeId?: number) {
  clearAuthStorage();
  const res = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password, store_id: storeId }),
  });
  const data: {
    tokens?: { access_token?: string; refresh_token?: string };
    profile?: { email?: string; display_name?: string; store_id?: number; staff_id?: number; is_admin?: boolean };
    detail?: string | { msg?: string } | { msg?: string }[];
    message?: string;
  } = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail || data.message || "Login failed";
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (data.profile) {
    localStorage.setItem("staffProfile", JSON.stringify(data.profile));
    if (data.profile.email) localStorage.setItem("staffEmail", data.profile.email);
    if (data.profile.display_name) localStorage.setItem("staffName", data.profile.display_name);
    if (data.profile.store_id) localStorage.setItem("staffStoreId", String(data.profile.store_id));
    if (data.profile.staff_id) localStorage.setItem("staffId", String(data.profile.staff_id));
  }
  return data;
}

export async function staffLoginByName(name: string, pin: string, storeId: number) {
  clearAuthStorage();
  const res = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ display_name: name, password: pin, store_id: storeId }),
  });
  const data: {
    tokens?: { access_token?: string; refresh_token?: string };
    profile?: { email?: string; display_name?: string; store_id?: number; staff_id?: number; is_admin?: boolean };
    detail?: string | { msg?: string } | { msg?: string }[];
    message?: string;
  } = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail || data.message || "Login failed";
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (data.profile) {
    localStorage.setItem("staffProfile", JSON.stringify(data.profile));
    if (data.profile.email) localStorage.setItem("staffEmail", data.profile.email);
    if (data.profile.display_name) localStorage.setItem("staffName", data.profile.display_name);
    if (data.profile.store_id) localStorage.setItem("staffStoreId", String(data.profile.store_id));
    if (data.profile.staff_id) localStorage.setItem("staffId", String(data.profile.staff_id));
  }
  return data;
}

export async function staffLogout() {
  try {
    await fetch("/auth/logout", { method: "POST" });
  } catch (err) {
    console.error("staffLogout failed:", err);
  }
  clearAuthStorage();
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
  menu_item_id?: number;
  item_name?: string;
  unit_price?: number;
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
  occupied_since?: string | null;
  current_order_id?: number | null;
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
  is_addon_deal_eligible?: boolean;
  addon_discount_type?: string | null;
  addon_discount_value?: number | null;
  eligible_bundle_ids?: number[] | null;
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
  category_type?: string;
  slug?: string;
}

export interface CartItem {
  menu_item_id: number;
  name: string;
  qty: number;
  price: number;
  modifier_ids: number[];
  modifiers_label: string;
  image_url?: string;
  bundle_product_id?: number;
  bundle_component_id?: number;
  class_session_id?: number;
  class_session_label?: string;
}

export interface ClassSession {
  id: number;
  menu_item_id: number;
  session_date: string;
  start_time: string;
  capacity: number;
  booked_pax: number;
  remaining: number;
  location: string | null;
}

export function getClassSessions(itemId: number) {
  return api.get<ClassSession[]>(`/menu/items/${itemId}/sessions`);
}

export function findOrCreateCustomer(phone_number: string, display_name: string) {
  return api.post<Customer & { created?: boolean }>("/staff/customers/find-or-create", { phone_number, display_name });
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
  return api.get<Store[]>("/stores");
}

export function getTables(_storeId: number) {
  return api.get<Table[]>(`/staff/tables`);
}

export function getOrders(_storeId?: number, status?: OrderStatus, paymentStatus?: string, station?: string) {
  const params = new URLSearchParams();
  if (status) params.append("status", status);
  if (paymentStatus) params.append("payment_status", paymentStatus);
  if (station) params.append("station", station);
  params.append("per_page", "100");
  const qs = params.toString();
  return api.get<Order[]>(`/staff/orders?${qs}`);
}

export function getOrderById(id: string | number) {
  return api.get<OrderDetail>(`/staff/orders/${id}`);
}

export interface OrderEinvoice {
  document_type: string;
  code_number: string;
  status: string;
  myinvois_uuid: string | null;
  validation_link: string | null;
  submitted_at: string | null;
}

export function getOrderEinvoice(id: string | number) {
  return api.get<OrderEinvoice | null>(`/staff/orders/${id}/einvoice`);
}

export function updateOrderStatus(id: string | number, status: OrderStatus, reason?: string) {
  return api.patch(`/staff/orders/${id}/status`, { status, ...(reason ? { reason } : {}) });
}

export function updateOrderPayment(id: string | number, payload: {
  payment_method: string;
  amount_tendered?: number;
  amount?: number;
  discount_amount?: number;
  discount_type?: "percentage" | "fixed";
  tip_amount?: number;
  allocations?: { line_item_id: number; quantity: number }[];
  charge_amount?: number;
}) {
  return api.patch(`/staff/orders/${id}/payment`, payload);
}

export function applyOrderVoucher(orderId: string | number, voucherCode: string) {
  return api.post<{ order_id: number; voucher_code: string; discount_amount: number; new_total: number; message: string }>(`/staff/orders/${orderId}/apply-voucher`, { voucher_code: voucherCode });
}

export function applyOrderReward(orderId: string | number, rewardId: number) {
  return api.post<{ order_id: number; reward_id: number; discount_amount: number; new_total: number; message: string }>(`/staff/orders/${orderId}/apply-reward`, { reward_id: rewardId });
}

export function payWithWallet(orderId: string | number, amount: number) {
  return api.post<{ order_id: number; amount_paid: number; wallet_balance_remaining: number; payment_status: string; message: string }>(`/staff/orders/${orderId}/wallet-payment`, { amount });
}

// ── POS cash drawer session ──
export interface PosSessionLive {
  window_start: string;
  window_end: string;
  order_count: number;
  sales_cash: string;
  sales_card: string;
  sales_qr: string;
  cash_refunds: string;
  opening_cash: string;
  expected_cash: string;
}
export interface PosSession {
  id: number;
  terminal_id: number;
  staff_id: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  discrepancy: number | null;
  discrepancy_notes: string | null;
  total_sales_cash: number;
  total_sales_card: number;
  total_sales_qr: number;
  order_count: number;
  live?: PosSessionLive | null;
}
export function getPosSessionCurrent() {
  return api.get<{ session: PosSession | null }>("/staff/pos/session/current");
}
export function openPosSession(openingCash: number) {
  return api.post<{ session: PosSession }>("/staff/pos/session/open", { opening_cash: openingCash });
}
export function closePosSession(closingCash: number, notes?: string) {
  return api.post<{ session: PosSession }>("/staff/pos/session/close", { closing_cash: closingCash, ...(notes ? { discrepancy_notes: notes } : {}) });
}

export function addOrderItem(orderId: string | number, payload: { menu_item_id: number; quantity?: number; modifier_ids?: number[]; special_instructions?: string; unit_price?: number }) {
  return api.post(`/staff/orders/${orderId}/items`, payload);
}

export function removeOrderItem(orderId: string | number, lineItemId: number, reason?: string) {
  return api.del(`/staff/orders/${orderId}/items/${lineItemId}${reason ? `?reason=${encodeURIComponent(reason)}` : ""}`);
}

export function cancelOrder(orderId: string | number, reason?: string) {
  return api.post(`/staff/orders/${orderId}/cancel${reason ? `?reason=${encodeURIComponent(reason)}` : ""}`);
}

export function transferTable(orderId: string | number, newTableId: number) {
  return api.patch(`/staff/orders/${orderId}/transfer-table?new_table_id=${newTableId}`);
}

export function mergeOrder(orderId: string | number, targetOrderId: number) {
  return api.post<{ id: number; order_number: string; merged_from_order_number: string; moved_items: number; total_amount: string }>(`/staff/orders/${orderId}/merge`, { target_order_id: targetOrderId });
}

export function getReservations(_storeId: number, date?: string, status?: ReservationStatus) {
  const params = new URLSearchParams();
  if (date) { params.append("date_from", date); params.append("date_to", date); }
  if (status) params.append("status", status);
  params.append("per_page", "100");
  return api.get<Reservation[]>(`/staff/reservations?${params.toString()}`);
}

export function updateReservationStatus(id: number, status: ReservationStatus, tableId?: number | null) {
  const body: Record<string, unknown> = { status };
  if (tableId != null) {
    body.dining_table_id = tableId;
  }
  return api.patch(`/staff/reservations/${id}/status`, body);
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

export interface StaffShift {
  id: number;
  store_id: number;
  staff_id: number;
  shift_template_id?: number | null;
  shift_date: string;
  planned_start: string;
  planned_end: string;
  actual_start?: string | null;
  actual_end?: string | null;
  status: string;
  notes?: string | null;
}

export function getMyShifts(fromDate?: string, toDate?: string) {
  const qs = new URLSearchParams();
  qs.set("per_page", "100");
  if (fromDate) qs.set("from_date", fromDate);
  if (toDate) qs.set("to_date", toDate);
  return api.get<StaffShift[]>(`/staff/shifts/me?${qs.toString()}`);
}

export interface StaffTask {
  id: number;
  store_id: number;
  staff_id: number;
  title: string;
  description?: string | null;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  due_date?: string | null;
  completed_at?: string | null;
  completed_by?: number | null;
  created_at: string;
  updated_at: string;
}

export function getMyTasks(status?: string) {
  const qs = new URLSearchParams();
  qs.set("per_page", "100");
  if (status) qs.set("status", status);
  return api.get<StaffTask[]>(`/staff/tasks/me?${qs.toString()}`);
}

export function completeMyTask(taskId: number) {
  return api.post<StaffTask>(`/staff/tasks/${taskId}/complete`);
}

/* ------------------------------------------------------------------ */
/*  POS Helpers                                                       */
/* ------------------------------------------------------------------ */

export function getMenuItems(perPage = 500) {
  return api.get<MenuItem[]>(`/staff/menu/items?per_page=${perPage}`);
}

export function getMenuCategories(perPage = 50) {
  return api.get<Category[]>(`/staff/menu/categories?per_page=${perPage}`);
}

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
}

export function getBundleProducts() {
  return api.get<BundleProduct[]>("/menu/bundle-products");
}

export function searchCustomers(q: string) {
  return api.get<Customer[]>(`/staff/customers/search?q=${encodeURIComponent(q)}`);
}

export function createPosOrder(payload: {
  store_id?: number;
  customer_id?: number | null;
  dining_table_id?: number | null;
  order_type: string;
  line_items: Array<{ menu_item_id: number; quantity: number; modifier_ids: number[]; special_instructions?: string; bundle_product_id?: number; bundle_component_id?: number; class_session_id?: number }>;
  order_notes?: string;
  is_byot?: boolean;
  idempotency_key?: string;
  // Offline-mode replay key — replays return the existing order (HTTP 200)
  client_ref?: string;
  payment?: { amount_tendered?: number; method?: string };
}) {
  return api.post<{ order_id: number; order_number: string; total: number; change?: number }>("/staff/pos/orders", payload);
}

export async function generateTableQr(_storeId: number, tableId: number): Promise<Table | null> {
  try {
    return await api.post<Table>(`/staff/tables/${tableId}/generate-qr`);
  } catch {
    return null;
  }
}

export function updateTableStatus(_storeId: number, tableId: number, status: string) {
  return api.patch(`/staff/tables/${tableId}/status?current_status=${status}`);
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
  return api.get<CustomerDetail>(`/staff/customers/${id}`);
}

export function getCustomerWallet(customerId: number) {
  return api.get<CustomerWallet>(`/staff/customers/${customerId}/wallet`);
}

export function topUpWallet(payload: {
  phone?: string;
  customer_id?: number;
  amount: number;
  payment_method?: string;
  notes?: string;
}) {
  return api.post<{ message: string; new_balance: number }>("/staff/wallets/topup", payload);
}

export function markRewardUsed(customerId: number, rewardId: number, notes?: string) {
  const storeId = typeof window !== "undefined" ? localStorage.getItem("staffStoreId") : null;
  return api.post<{ message: string; success: boolean }>(`/staff/customers/${customerId}/use-reward/${rewardId}`, { store_id: storeId ? Number(storeId) : null, notes: notes || "Used in-store" });
}

export function markVoucherUsed(customerId: number, voucherId: number, notes?: string) {
  const storeId = typeof window !== "undefined" ? localStorage.getItem("staffStoreId") : null;
  return api.post<{ message: string; success: boolean }>(`/staff/customers/${customerId}/use-voucher/${voucherId}`, { store_id: storeId ? Number(storeId) : null, notes: notes || "Used in-store" });
}

export function scanCustomerCode(code: string) {
  return api.post<{
    customer_id: number;
    customer_name: string;
    customer_phone: string;
    wallet_balance?: number;
  }>("/staff/scan/customer", { code });
}

export function scanRewardCode(code: string) {
  return api.post<{
    reward_id: number;
    name: string;
    customer_id?: number;
    valid: boolean;
  }>(`/staff/scan/reward/${code}`, { store_id: null });
}

export function scanVoucherCode(code: string) {
  return api.post<{
    voucher_id: number;
    title: string;
    customer_id?: number;
    valid: boolean;
  }>(`/staff/scan/voucher/${code}`, { store_id: null });
}


// ── Help Center / Internal Wiki ──

export interface HelpArticle {
  id: number;
  slug: string;
  title: string;
  audience: "admin" | "staff" | "customer";
  category: string | null;
  body_text: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function getHelpArticles(audience: "staff" = "staff") {
  return api.get<PaginatedResponse<HelpArticle>>(`/public/help/articles?audience=${audience}&per_page=500`);
}

export function getHelpArticle(slug: string) {
  return api.get<HelpArticle>(`/public/help/articles/${slug}`);
}
