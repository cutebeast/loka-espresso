'use client';

import { useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import type { Notification } from '@/lib/api';

export function useNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      // Backend supports is_read=false — use the paginated total so the badge
      // reflects all unread notifications, not just the first page.
      const notifRes = await api.get('/notifications/me', { params: { per_page: 1, is_read: false } });
      const data = notifRes.data as { total?: number; items?: Notification[] } | Notification[];
      if (Array.isArray(data)) {
        setUnreadCount(data.filter((n) => !n.is_read).length);
      } else if (typeof data?.total === 'number') {
        setUnreadCount(data.total);
      } else {
        setUnreadCount((data?.items ?? []).filter((n) => !n.is_read).length);
      }
    } catch (err) { console.error("Failed to fetch notifications:", err); }
  }, [isAuthenticated]);

  return { unreadCount, fetchUnreadCount };
}
