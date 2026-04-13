import { ReactNode } from 'react';

const API = '/api/v1';

export function apiFetch(path: string, token: string, options?: RequestInit) {
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
}

export function statusBadge(status: string): ReactNode {
  const map: Record<string, string> = {
    pending: 'badge-yellow',
    confirmed: 'badge-blue',
    preparing: 'badge-yellow',
    ready: 'badge-green',
    completed: 'badge-green',
    cancelled: 'badge-red',
  };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>;
}

export function formatRM(amount: number): string {
  return `RM ${Number(amount).toFixed(2)}`;
}

export { API };
