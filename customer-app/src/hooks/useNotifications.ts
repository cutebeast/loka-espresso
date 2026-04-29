'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';

export function useNotifications() {
  const toast = useUIStore((s) => s.toast);
  const hideToast = useUIStore((s) => s.hideToast);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [unreadCount, setUnreadCount] = useState(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Toast auto-hide
  useEffect(() => {
    if (toast) {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => hideToast(), 3000);
    }
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, [toast, hideToast]);

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
