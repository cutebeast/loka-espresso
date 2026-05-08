const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:13800/api/v1";

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
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
    return (await res.json()) as T;
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

export async function customerLogin(email: string, password: string) {
  const data = await api.post<{ access_token: string; refresh_token: string; token_type: string }>("/auth/login", { email, password });
  if (data.access_token) {
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("refreshToken", data.refresh_token);
  }
  return data;
}

export async function customerRegister(name: string, email: string, phone: string, password: string) {
  const data = await api.post<{ access_token: string; refresh_token: string; token_type: string }>("/auth/register", { name, email, phone, password });
  if (data.access_token) {
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("refreshToken", data.refresh_token);
  }
  return data;
}

export function customerLogout() {
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export type Store = {
  id: string;
  name: string;
  description?: string;
  address?: string;
  phone?: string;
  status?: string;
  image_url?: string;
};

export type MenuCategory = {
  id: string;
  name: string;
  store_id: string;
  sort_order?: number;
};

export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  category_id: string;
  store_id: string;
  is_available?: boolean;
};

export type CartItem = {
  id: string;
  cart_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  menu_item?: MenuItem;
};

export type Cart = {
  id: string;
  customer_id: string;
  store_id?: string;
  items: CartItem[];
  total_amount: number;
};

export type Order = {
  id: string;
  customer_id: string;
  store_id: string;
  status: string;
  order_type: string;
  total_amount: number;
  table_number?: string;
  special_instructions?: string;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
};

export type OrderItem = {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  menu_item?: MenuItem;
};

export type Profile = {
  id: string;
  name: string;
  email: string;
  phone?: string;
};
