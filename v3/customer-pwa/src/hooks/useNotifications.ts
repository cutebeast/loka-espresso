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
      const notifRes = await api.get('/notifications/me');
      const data = notifRes.data as { items?: Notification[] } | Notification[];
      const notifs = Array.isArray(data) ? data : (data?.items ?? []);
      setUnreadCount(notifs.filter((n) => !n.is_read).length);
    } catch (err) { console.error("Failed to fetch notifications:", err); }
  }, [isAuthenticated]);

  return { unreadCount, fetchUnreadCount };
}
