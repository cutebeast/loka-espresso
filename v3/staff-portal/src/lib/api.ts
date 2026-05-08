const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: getAuthHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
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
  return undefined as unknown as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

export async function staffLogin(email: string, password: string) {
  const data = await api.post<{ tokens?: { access_token?: string }; profile?: { email?: string; display_name?: string } }>("/admin/auth/login", { email, password });
  const token = data.tokens?.access_token;
  if (token) {
    localStorage.setItem("token", token);
    if (data.profile?.email) localStorage.setItem("staffEmail", data.profile.email);
    if (data.profile?.display_name) localStorage.setItem("staffName", data.profile.display_name);
  }
  return data;
}

export function staffLogout() {
  localStorage.removeItem("token");
  localStorage.removeItem("staffEmail");
  localStorage.removeItem("staffName");
}

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}

export interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  type: "dine_in" | "takeaway" | "delivery";
  total: number;
  created_at: string;
  updated_at: string;
  customer_name?: string;
  customer_phone?: string;
  table_number?: string;
  items: OrderItem[];
  payment_status?: string;
}

export interface DashboardMetrics {
  today_orders: number;
  active_orders: number;
  today_revenue: number;
  pending_items: number;
}

export interface Table {
  id: string;
  number: string;
  seats: number;
  status: "available" | "occupied" | "reserved";
  current_order_id?: string;
  current_reservation_id?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  is_available: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  low_stock_threshold: number;
  category?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
}

export interface Store {
  id: number;
  name: string;
  type?: string;
  address?: string;
}

export type ReservationStatus = "requested" | "confirmed" | "seated" | "no_show" | "cancelled" | "completed";

export interface Reservation {
  id: string;
  guest_name: string;
  party_size: number;
  date: string;
  time: string;
  table_number?: string;
  table_id?: string;
  status: ReservationStatus;
  phone?: string;
  notes?: string;
  created_at?: string;
}

export function getStores() {
  return api.get<Store[]>("/admin/stores");
}

export function getTables(storeId: number) {
  return api.get<Table[]>(`/admin/stores/${storeId}/tables`);
}

export function getOrders(storeId?: number, status?: OrderStatus) {
  if (storeId) {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    const query = params.toString();
    return api.get<Order[]>(`/admin/stores/${storeId}/orders${query ? `?${query}` : ""}`);
  }
  return api.get<Order[]>("/orders");
}

export function updateOrderStatus(id: string, status: OrderStatus) {
  return api.patch(`/orders/${id}`, { status });
}

export function getReservations(storeId: number, date?: string, status?: ReservationStatus) {
  const params = new URLSearchParams();
  if (date) params.append("date", date);
  if (status) params.append("status", status);
  const query = params.toString();
  return api.get<Reservation[]>(`/admin/stores/${storeId}/reservations${query ? `?${query}` : ""}`);
}

export function updateReservationStatus(id: string, status: ReservationStatus) {
  return api.patch(`/admin/reservations/${id}`, { status });
}

/* ------------------------------------------------------------------ */
/*  Time Clock                                                        */
/* ------------------------------------------------------------------ */

export interface TimeEvent {
  id: string;
  event_type: "clock_in" | "clock_out" | "start_break" | "end_break";
  timestamp: string;
  location?: string;
  verified_by?: string;
}

export function clockIn() {
  return api.post<TimeEvent>("/staff/time-events", { event_type: "clock_in" });
}

export function clockOut() {
  return api.post<TimeEvent>("/staff/time-events", { event_type: "clock_out" });
}

export function startBreak() {
  return api.post<TimeEvent>("/staff/time-events", { event_type: "start_break" });
}

export function endBreak() {
  return api.post<TimeEvent>("/staff/time-events", { event_type: "end_break" });
}

export function getMyTimeEvents(date?: string) {
  const qs = new URLSearchParams();
  if (date) qs.set("date", date);
  return api.get<TimeEvent[]>(`/staff/time-events/me?${qs.toString()}`);
}
