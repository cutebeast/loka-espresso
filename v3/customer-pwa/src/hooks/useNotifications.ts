'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';

export function useNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [unreadCount, setUnreadCount] = useState(0);

  // Note: Toast auto-dismiss is handled by the Toast component itself
  // (5s default, 6s if actions present). Do NOT add a second timer here.

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const notifRes = await api.get('/notifications');
      const notifs = Array.isArray(notifRes.data) ? notifRes.data : [];
      setUnreadCount(notifs.filter((n: { is_read?: boolean }) => !n.is_read).length);
    } catch { /* ignore */ }
  }, [isAuthenticated]);

  return { unreadCount, fetchUnreadCount };
}
