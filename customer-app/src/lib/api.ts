export const API = '/api/v1';

export interface Store { id: number; name: string; slug: string; address: string; phone: string; opening_hours: Record<string, string>; is_active: boolean; }
export interface Category { id: number; name: string; slug: string; is_active: boolean; }
export interface MenuItem { id: number; store_id: number; category_id: number; name: string; description: string; base_price: number; image_url: string | null; is_available: boolean; customization_options?: Record<string, unknown>; }
export interface Reward { id: number; name: string; description: string; points_cost: number; reward_type: string; is_active: boolean; }
export interface Order { id: number; order_number: string; order_type: string; status: string; total: number; items: Array<Record<string, unknown>>; created_at: string; }
export interface CartItem { id?: number; name: string; price: number; quantity: number; customizations?: Record<string, unknown>; itemId?: number; }

export type PageId = 'home' | 'menu' | 'rewards' | 'cart' | 'orders' | 'profile' | 'history';
export type OrderMode = 'pickup' | 'delivery';

export function apiFetch(path: string, token?: string, options?: RequestInit) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API}${path}`, { ...options, headers });
}
