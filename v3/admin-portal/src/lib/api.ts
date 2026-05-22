const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

function getAuthHeaders(): HeadersInit {
  if (typeof window === "undefined") return { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function refreshToken(): Promise<boolean> {
  try {
    if (typeof window === "undefined") return false;
    const refresh = localStorage.getItem("refreshToken");
    if (!refresh) return false;
    const res = await fetch(`${BASE_URL}/admin/auth/refresh`, {
      method: "POST", headers: { "Content-Type": "application/json" },
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
  } catch (e) { console.error("Token refresh failed:", e); return false; }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const makeRequest = async () => {
    const res = await fetch(`${BASE_URL}${path}`, { method, headers: getAuthHeaders(), ...(body ? { body: JSON.stringify(body) } : {}) });
    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) {
        const retry = await fetch(`${BASE_URL}${path}`, { method, headers: getAuthHeaders(), ...(body ? { body: JSON.stringify(body) } : {}) });
        if (retry.ok) return retry;
      }
      localStorage.removeItem("token"); localStorage.removeItem("refreshToken"); localStorage.removeItem("adminEmail");
      if (typeof window !== "undefined") window.location.href = "/login";
      throw new Error("Session expired");
    }
    return res;
  };
  const res = await makeRequest();
  if (!res.ok) { const text = await res.text(); throw new Error(text || `Request failed: ${res.status}`); }
  const ct = res.headers.get("content-type");
  if (ct && ct.includes("application/json")) {
    const json = await res.json();
    if (json && typeof json === "object" && "data" in json) {
      const data = json.data;
      if (data && typeof data === "object" && Array.isArray(data.items)) return data.items as T;
      return data as T;
    }
    return json as T;
  }
  throw new Error("Unexpected non-JSON response");
}

async function requestRaw<T>(method: string, path: string, body?: unknown): Promise<T> {
  const makeRequest = async () => {
    const res = await fetch(`${BASE_URL}${path}`, { method, headers: getAuthHeaders(), ...(body ? { body: JSON.stringify(body) } : {}) });
    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) {
        const retry = await fetch(`${BASE_URL}${path}`, { method, headers: getAuthHeaders(), ...(body ? { body: JSON.stringify(body) } : {}) });
        if (retry.ok) return retry;
      }
      localStorage.removeItem("token"); localStorage.removeItem("refreshToken"); localStorage.removeItem("adminEmail");
      if (typeof window !== "undefined") window.location.href = "/login";
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

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  getRaw: <T>(path: string) => requestRaw<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload: async <T = { url: string; filename: string }>(path: string, formData: FormData): Promise<T> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const doFetch = (headers: HeadersInit) =>
      fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: formData });
    let res = await doFetch(token ? { Authorization: `Bearer ${token}` } : {});
    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) res = await doFetch(getAuthHeaders());
      else throw new Error("Session expired");
    }
    if (!res.ok) { const text = await res.text(); throw new Error(text || `Upload failed: ${res.status}`); }
    const json = await res.json();
    return (json?.data ?? json) as T;
  },
  fetchRaw: async (method: string, path: string, body?: unknown): Promise<Response> => {
    const token = localStorage.getItem("token");
    const doFetch = () => fetch(`${BASE_URL}${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let res = await doFetch();
    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) res = await doFetch();
      else throw new Error("Session expired");
    }
    if (!res.ok) { const text = await res.text(); throw new Error(text || `Request failed: ${res.status}`); }
    return res;
  },
};

export async function adminLogin(email: string, password: string) {
  const data = await api.post<{ tokens?: { access_token?: string; refresh_token?: string }; profile?: { email?: string } }>("/admin/auth/login", { email, password });
  const token = data.tokens?.access_token;
  if (token) { 
    localStorage.setItem("token", token); 
    if (data.tokens?.refresh_token) localStorage.setItem("refreshToken", data.tokens.refresh_token);
    if (data.profile?.email) localStorage.setItem("adminEmail", data.profile.email); 
  }
  return data;
}
export function adminLogout() { localStorage.removeItem("token"); localStorage.removeItem("refreshToken"); localStorage.removeItem("adminEmail"); }
export function isLoggedIn(): boolean { return !!localStorage.getItem("token"); }

export interface Reservation { id: number; store_id: number; customer_id: number | null; dining_table_id?: number; party_size: number; reservation_date: string; reservation_time: string; duration_minutes?: number; status: string; }

export interface LoyaltyAccount { [key: string]: any; id: number; customer_id: number; customer_name?: string | null; tier_id: number | null; tier_name?: string | null; tier?: any; current_points: number; lifetime_points: number; lifetime_points_earned?: number; lifetime_points_redeemed?: number; points_balance?: number; points_to_next_tier?: number | null; tier_multiplier?: number; current_tier_id?: number | null; last_activity_at?: string | null; last_activity?: any; last_tier_change_at?: string | null; }
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
