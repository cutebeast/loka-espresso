 
import { STORAGE_KEYS, API as API_CONST } from "./constants";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

function createAbortController(timeoutMs = API_CONST.DEFAULT_TIMEOUT_MS): { signal: AbortSignal; clear: () => void } {
  if (typeof AbortController === "undefined") return { signal: undefined as unknown as AbortSignal, clear: () => {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function getAuthHeaders(): HeadersInit {
  if (typeof window === "undefined") return { "Content-Type": "application/json" };
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function refreshToken(): Promise<boolean> {
  try {
    if (typeof window === "undefined") return false;
    const refresh = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    if (!refresh) return false;
    const { signal, clear } = createAbortController();
    try {
      const res = await fetch(`${BASE_URL}/admin/auth/refresh`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal,
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) return false;
      const json = await res.json();
      const data = json.data || json;
      if (data.tokens?.access_token) {
        localStorage.setItem(STORAGE_KEYS.TOKEN, data.tokens.access_token);
        if (data.tokens.refresh_token) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.tokens.refresh_token);
        return true;
      }
      return false;
    } finally { clear(); }
  } catch (e) { console.error("Token refresh failed:", e); return false; }
}

function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.ADMIN_EMAIL);
}

// NOTE: Bearer token auth is used — CSRF tokens are NOT needed.
// Modern browsers enforce same-origin policies for custom headers, and
// Bearer auth header requires explicit JavaScript, making CSRF attacks
// infeasible. No X-CSRF-Token header exchange is required.

async function request<T>(method: string, path: string, body?: unknown, timeoutMs?: number): Promise<T> {
  const doFetch = async (retrySignal?: AbortSignal): Promise<Response> => {
    const { signal, clear } = createAbortController(timeoutMs ?? API_CONST.DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method, headers: getAuthHeaders(),
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: retrySignal || signal,
      });
      return res;
    } finally { clear(); }
  };

  const res = await doFetch();
  if (res.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed) {
      const { signal, clear } = createAbortController(timeoutMs ?? API_CONST.DEFAULT_TIMEOUT_MS);
      try {
        const retry = await fetch(`${BASE_URL}${path}`, {
          method, headers: getAuthHeaders(),
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal,
        });
        if (retry.ok) {
          if (retry.status === 204) return undefined as unknown as T;
          const ct = retry.headers.get("content-type");
          if (ct && ct.includes("application/json")) {
            const json = await retry.json();
            if (json && typeof json === "object" && "data" in json) {
              const data = json.data;
              if (data && typeof data === "object" && "items" in data) return (data.items ?? []) as T;
              return data as T;
            }
            return json as T;
          }
          throw new Error("Unexpected non-JSON response");
        }
        if (retry.status === 401) {
          clearSession();
          if (typeof window !== "undefined") window.location.replace("/login");
          throw new Error("Session expired");
        }
        const text = await retry.text();
        throw new Error(text || `Request failed: ${retry.status}`);
      } finally { clear(); }
    }
    clearSession();
    if (typeof window !== "undefined") window.location.replace("/login");
    throw new Error("Session expired");
  }
  if (!res.ok) { const text = await res.text(); throw new Error(text || `Request failed: ${res.status}`); }
  if (res.status === 204) return undefined as unknown as T;
  const ct = res.headers.get("content-type");
  if (ct && ct.includes("application/json")) {
    const json = await res.json();
    if (json && typeof json === "object" && "data" in json) {
      const data = json.data;
      if (data && typeof data === "object" && "items" in data) return (data.items ?? []) as T;
      return data as T;
    }
    return json as T;
  }
  throw new Error("Unexpected non-JSON response");
}

async function requestRaw<T>(method: string, path: string, body?: unknown, timeoutMs?: number): Promise<T> {
  const doFetch = async (retrySignal?: AbortSignal): Promise<Response> => {
    const { signal, clear } = createAbortController(timeoutMs ?? API_CONST.DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method, headers: getAuthHeaders(),
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: retrySignal || signal,
      });
      return res;
    } finally { clear(); }
  };

  const res = await doFetch();
  if (res.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed) {
      const { signal, clear } = createAbortController(timeoutMs ?? API_CONST.DEFAULT_TIMEOUT_MS);
      try {
        const retry = await fetch(`${BASE_URL}${path}`, {
          method, headers: getAuthHeaders(),
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal,
        });
        if (retry.ok) {
          if (retry.status === 204) return {} as T;
          const rct = retry.headers.get("content-type");
          if (rct && rct.includes("application/json")) {
            const json = await retry.json();
            if (json && typeof json === "object" && "data" in json) return json.data as T;
            return json as T;
          }
          return await retry.text() as unknown as T;
        }
        if (retry.status === 401) {
          clearSession();
          if (typeof window !== "undefined") window.location.replace("/login");
          throw new Error("Session expired");
        }
        const text = await retry.text();
        throw new Error(text || `Request failed: ${retry.status}`);
      } finally { clear(); }
    }
    clearSession();
    if (typeof window !== "undefined") window.location.replace("/login");
    throw new Error("Session expired");
  }
  if (!res.ok) { const text = await res.text(); throw new Error(text || `Request failed: ${res.status}`); }
  if (res.status === 204) return {} as T;
  const ct = res.headers.get("content-type");
  if (ct && ct.includes("application/json")) {
    const json = await res.json();
    if (json && typeof json === "object" && "data" in json) return json.data as T;
    return json as T;
  }
  return await res.text() as unknown as T;
}

export const api = {
  get: <T>(path: string, timeoutMs?: number) => request<T>("GET", path, undefined, timeoutMs),
  getRaw: <T>(path: string, timeoutMs?: number) => requestRaw<T>("GET", path, undefined, timeoutMs),
  getPaginated: async <T>(path: string, timeoutMs?: number) => {
    const data = await requestRaw<{ items: T[]; total: number; total_pages: number; page?: number } & Record<string, any>>("GET", path, undefined, timeoutMs);
    return { ...data, items: (data?.items || []) as T[], total: data?.total ?? 0, totalPages: data?.total_pages ?? 1, page: data?.page ?? 1 };
  },
  post: <T>(path: string, body?: unknown, timeoutMs?: number) => request<T>("POST", path, body, timeoutMs),
  patch: <T>(path: string, body?: unknown, timeoutMs?: number) => request<T>("PATCH", path, body, timeoutMs),
  put: <T>(path: string, body?: unknown, timeoutMs?: number) => request<T>("PUT", path, body, timeoutMs),
  del: <T>(path: string, timeoutMs?: number) => request<T>("DELETE", path, undefined, timeoutMs),
  upload: async <T = { url: string; filename: string }>(path: string, formData: FormData, timeoutMs?: number): Promise<T> => {
    const token = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEYS.TOKEN) : null;
    const doFetch = (headers: HeadersInit, signal: AbortSignal) =>
      fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: formData, signal });
    const { signal, clear } = createAbortController(timeoutMs ?? API_CONST.DEFAULT_TIMEOUT_MS);
    try {
      let res = await doFetch(token ? { Authorization: `Bearer ${token}` } : {}, signal);
      if (res.status === 401) {
        const refreshed = await refreshToken();
        if (refreshed) {
          const freshToken = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEYS.TOKEN) : null;
          const { signal: rSignal, clear: rClear } = createAbortController(timeoutMs ?? API_CONST.DEFAULT_TIMEOUT_MS);
          try {
            res = await doFetch(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}, rSignal);
          } finally { rClear(); }
          if (res.status === 401) {
            clearSession();
            if (typeof window !== "undefined") window.location.replace("/login");
            throw new Error("Session expired");
          }
        } else {
          clearSession();
          if (typeof window !== "undefined") window.location.replace("/login");
          throw new Error("Session expired");
        }
      }
      if (!res.ok) { const text = await res.text(); throw new Error(text || `Upload failed: ${res.status}`); }
      const json = await res.json();
      return (json?.data ?? json) as T;
    } finally { clear(); }
  },
  fetchRaw: async (method: string, path: string, body?: unknown, timeoutMs?: number): Promise<Response> => {
    if (typeof window === "undefined") throw new Error("fetchRaw cannot be used during SSR");
    const doFetch = (signal: AbortSignal) => {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      return fetch(`${BASE_URL}${path}`, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal,
      });
    };
    const { signal: s1, clear: c1 } = createAbortController(timeoutMs ?? API_CONST.DEFAULT_TIMEOUT_MS);
    try {
      let res = await doFetch(s1);
      if (res.status === 401) {
        const refreshed = await refreshToken();
        if (refreshed) {
          const { signal: s2, clear: c2 } = createAbortController(timeoutMs ?? API_CONST.DEFAULT_TIMEOUT_MS);
          try { res = await doFetch(s2); } finally { c2(); }
        } else {
          clearSession();
          if (typeof window !== "undefined") window.location.replace("/login");
          throw new Error("Session expired");
        }
      }
      if (!res.ok) { const text = await res.text(); throw new Error(text || `Request failed: ${res.status}`); }
      return res;
    } finally { c1(); }
  },
};

export async function adminLogin(email: string, password: string) {
  const data = await api.post<{ tokens?: { access_token?: string; refresh_token?: string }; profile?: { email?: string } }>("/admin/auth/login", { email, password });
  const token = data.tokens?.access_token;
  if (token) {
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    if (data.tokens?.refresh_token) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.tokens.refresh_token);
    if (data.profile?.email) localStorage.setItem(STORAGE_KEYS.ADMIN_EMAIL, data.profile.email);
  }
  return data;
}
export function adminLogout() { clearSession(); }
export function isLoggedIn(): boolean { if (typeof window === "undefined") return false; return !!localStorage.getItem(STORAGE_KEYS.TOKEN); }

export interface Reservation { id: number; store_id: number; customer_id: number | null; dining_table_id?: number; party_size: number; reservation_date: string; reservation_time: string; duration_minutes?: number; status: string; }

export interface LoyaltyAccount { id: number; customer_id: number; customer_name?: string | null; tier_id: number | null; tier_name?: string | null; tier?: any; color_hex?: string | null; current_points: number; lifetime_points: number; lifetime_points_earned?: number; lifetime_points_redeemed?: number; points_balance?: number; points_to_next_tier?: number | null; tier_multiplier?: number; current_tier_id?: number | null; last_activity_at?: string | null; last_activity?: any; last_tier_change_at?: string | null; }
export function getLoyaltyAccounts() { return api.get<LoyaltyAccount[]>("/admin/loyalty/accounts"); }

export interface LoyaltyLedgerEntry { id: number; loyalty_account_id: number; customer_id: number; customer_name?: string | null; event_type: string; points_delta: number; running_balance: number; created_at: string; }
export function getLoyaltyLedger(params?: { event_type?: string; account_id?: number }) { const qs = new URLSearchParams(); if (params?.event_type) qs.set("event_type", params.event_type); if (params?.account_id) qs.set("account_id", String(params.account_id)); return api.get<LoyaltyLedgerEntry[]>(`/admin/loyalty/ledger?${qs.toString()}`); }

export interface Wallet { id: number; customer_id: number; is_frozen: boolean; currency_code: string; balance?: number; total_credited?: number; total_debited?: number; }

export interface Voucher { id: number; voucher_code: string; display_title: string; voucher_type: string; discount_value: number; valid_from: string; valid_until: string; max_global_uses: number; global_use_count: number; minimum_order_value?: number; max_uses_per_customer?: number; description?: string; customer_segments?: string[]; is_active: boolean; }

export interface Reward { id: number; reward_name: string; reward_key: string; reward_type: string; description?: string; image_url?: string; points_cost: number; customer_segments?: string[]; is_active: boolean; }

export interface AuditLogEntry { id: number; action: string; resource_type: string; resource_id: number | null; principal_id: number | null; severity: string; ip_address: string | null; created_at: string; }
export function getAuditLog(params?: { action?: string; resource_type?: string; severity?: string; date_from?: string; date_to?: string }) { const qs = new URLSearchParams(); if (params?.action) qs.set("action", params.action); if (params?.resource_type) qs.set("resource_type", params.resource_type); if (params?.severity) qs.set("severity", params.severity); if (params?.date_from) qs.set("date_from", params.date_from); if (params?.date_to) qs.set("date_to", params.date_to); return api.get<AuditLogEntry[]>(`/admin/audit-log?${qs.toString()}`); }

export interface CustomerConsent { id: number; customer_id: number; customer_name?: string; consent_type: string; status: string; granted_at: string | null; revoked_at?: string | null; withdrawn_at?: string; ip_address?: string | null; }
export function getCustomerConsents(params?: { consent_type?: string; status?: string }) { const qs = new URLSearchParams(); if (params?.consent_type) qs.set("consent_type", params.consent_type); if (params?.status) qs.set("status", params.status); return api.get<CustomerConsent[]>(`/admin/customers/consents?${qs.toString()}`); }

export interface CustomerDevice { id: number; customer_id: number; customer_name?: string; platform: string; device_model: string | null; is_active: boolean; last_seen_at: string | null; }
export function getCustomerDevices(params?: { platform?: string; is_active?: boolean }) { const qs = new URLSearchParams(); if (params?.platform) qs.set("platform", params.platform); if (params?.is_active !== undefined) qs.set("is_active", String(params.is_active)); return api.get<CustomerDevice[]>(`/admin/customers/devices?${qs.toString()}`); }

export interface PurchaseOrder { id: number; po_number: string; supplier_id: number; supplier_name?: string; status: string; total_amount: number; expected_delivery: string; created_at: string; items_count?: number; items?: PurchaseOrderLineItem[]; }
export interface PurchaseOrderLineItem { inventory_item_id: number; quantity_ordered: number; unit_cost: number; }
export function getPurchaseOrders(params?: { status?: string; store_id?: string }) { const qs = new URLSearchParams(); if (params?.status) qs.set("status", params.status); if (params?.store_id) qs.set("store_id", params.store_id); return api.get<PurchaseOrder[]>(`/admin/inventory/purchase-orders?${qs.toString()}`); }
export function createPurchaseOrder(body: { supplier_id: number; store_id: number; expected_delivery: string; po_number: string; lines: PurchaseOrderLineItem[] }) { return api.post<PurchaseOrder>("/admin/inventory/purchase-orders", body); }
export function receivePurchaseOrder(id: number) { return api.patch<PurchaseOrder>(`/admin/inventory/purchase-orders/${id}/receive`, {}); }
export function cancelPurchaseOrder(id: number) { return api.del<{ id: number; deleted: boolean }>(`/admin/inventory/purchase-orders/${id}`); }

export interface MarketingCampaign { id: number; campaign_name: string; campaign_key: string; campaign_type: string; channel: string; status: string; audience_segment?: string; body_content?: string; scheduled_at?: string; budget_spent: number; }
export function getMarketingCampaigns() { return api.get<MarketingCampaign[]>("/admin/marketing/campaigns"); }
export function createMarketingCampaign(body: Omit<MarketingCampaign, "id" | "budget_spent">) { return api.post<MarketingCampaign>("/admin/marketing/campaigns", body); }
export function sendCampaign(id: number) { return api.patch<MarketingCampaign>(`/admin/marketing/campaigns/${id}/send`, {}); }

export interface StaffTimeEvent { id: number; staff_id: number; staff_name?: string; store_id: number; event_type: string; event_timestamp: string; latitude: number | null; longitude: number | null; device_info: string | null; notes: string | null; approved_by: number | null; verified_at?: string; created_at: string; }
export function getStaffTimeEvents(params?: { event_type?: string; date_from?: string; date_to?: string; store_id?: string }) { const qs = new URLSearchParams(); if (params?.event_type) qs.set("event_type", params.event_type); if (params?.date_from) qs.set("date_from", params.date_from); if (params?.date_to) qs.set("date_to", params.date_to); if (params?.store_id) qs.set("store_id", params.store_id); return api.get<StaffTimeEvent[]>(`/admin/staff/time-events?${qs.toString()}`); }
export function verifyTimeEvent(id: number) { return api.patch<StaffTimeEvent>(`/admin/staff/time-events/${id}/verify`, {}); }

export interface TipAllocation { id: number; order_id: number; store_id?: number; store_name?: string; staff_id: number; total_tip?: number; tip_amount: number; tip_percentage?: number; allocation_type: string; payment_method?: string; distributed_by_name?: string; created_at: string; }
export function getTipAllocations(params?: { page?: number; per_page?: number; store_id?: number }) { const qs = new URLSearchParams(); if (params?.page) qs.set("page", String(params.page)); if (params?.per_page) qs.set("per_page", String(params.per_page)); if (params?.store_id) qs.set("store_id", String(params.store_id)); return api.get<TipAllocation[]>(`/admin/staff/tips?${qs.toString()}`); }

export interface OrderDetail { id: number; order_number: string; customer_name: string; customer_id: number; store_name: string; store_id: number; order_type: string; status: string; payment_status: string; payment_method?: string; fulfillment_type: string; item_count: number; subtotal?: number; items_subtotal: number; modifier_subtotal?: number; delivery_fee: number; tax_amount: number; discount_amount: number; tip_amount?: number; total_amount: number; total_amount_currency: string; line_items: any[]; status_log: any[]; adjustments: any[]; fulfillment: any; customer_notes: string | null; created_at: string; }
