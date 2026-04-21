import { ReactNode } from 'react';

const API = '/api/v1';

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('fnb_token');
}

function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('fnb_refresh_token');
}

export function setMerchantTokens(token: string, refreshToken?: string | null) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('fnb_token', token);
  if (refreshToken) localStorage.setItem('fnb_refresh_token', refreshToken);
}

export function clearMerchantTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('fnb_token');
  localStorage.removeItem('fnb_refresh_token');
}

function notifyMerchantAuthExpired() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('merchant-auth-expired'));
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshMerchantAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clearMerchantTokens();
        return false;
      }
      const data = await res.json();
      setMerchantTokens(data.access_token || data.token, data.refresh_token || data.refreshToken || refreshToken);
      return true;
    } catch {
      clearMerchantTokens();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function apiFetch(path: string, token: string, options?: RequestInit) {
  const requestWithToken = (authToken: string | null) => fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...options?.headers,
    },
  });

  let response = await requestWithToken(getStoredToken() || token);
  if (response.status === 401 && (getStoredRefreshToken() || getStoredToken())) {
    const refreshed = await refreshMerchantAccessToken();
    if (refreshed) {
      response = await requestWithToken(getStoredToken());
    }
  }
  if (response.status === 401) {
    clearMerchantTokens();
    notifyMerchantAuthExpired();
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

export { API };
