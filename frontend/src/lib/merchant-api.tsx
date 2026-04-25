import { ReactNode } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

function notifyMerchantAuthExpired() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('merchant-auth-expired'));
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshMerchantAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        return false;
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// _unused is intentionally ignored — auth is via httpOnly session cookies
export async function apiFetch(path: string, _unused?: string, options?: RequestInit) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (response.status === 401) {
    const refreshed = await refreshMerchantAccessToken();
    if (refreshed) {
      return fetch(`${API}${path}`, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });
    }
    notifyMerchantAuthExpired();
  }

  if (!response.ok && response.status !== 401) {
    const errorBody = await response.text().catch(() => '');
    console.error(`API error ${response.status} on ${path}:`, errorBody);
  }
  return response;
}

/**
 * Upload files via FormData. Unlike apiFetch, this does NOT set Content-Type
 * so the browser can set the correct multipart boundary automatically.
 */
// _unused is intentionally ignored — auth is via httpOnly session cookies
export async function apiUpload(path: string, formData: FormData): Promise<Response> {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      // Intentionally no Content-Type — browser sets multipart/form-data with boundary
    },
    body: formData,
  });

  if (response.status === 401) {
    const refreshed = await refreshMerchantAccessToken();
    if (refreshed) {
      return fetch(`${API}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: {},
        body: formData,
      });
    }
  }
  return response;
}

export function statusBadge(status: string): ReactNode {
  const map: Record<string, string> = {
    pending: 'badge-yellow',
    paid: 'badge-blue',
    confirmed: 'badge-blue',
    preparing: 'badge-yellow',
    ready: 'badge-green',
    out_for_delivery: 'badge-blue',
    driver_assigned: 'badge-blue',
    completed: 'badge-green',
    cancelled: 'badge-red',
  };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>;
}

export function formatRM(amount: number): string {
  return `RM ${Number(amount).toFixed(2)}`;
}

/**
 * Appends a cache-busting query param to an image URL.
 * Forces Cloudflare/browser to re-fetch instead of serving cached 404.
 * @param url - The image URL (e.g. "/uploads/items/abc.jpg")
 * @param ts  - Unix timestamp override (defaults to Date.now())
 */
export function cacheBust(url: string, ts?: number): string {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${ts ?? Date.now()}`;
}

export { API };
