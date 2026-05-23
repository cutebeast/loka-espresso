'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

const VERSION_CHECK_INTERVAL = 60000;

export function useVersionCheck() {
  const { showToast } = useUIStore();
  const { t } = useTranslation();
  const checkInProgress = useRef(false);

  const checkVersion = useCallback(async () => {
    if (checkInProgress.current) return;
    checkInProgress.current = true;

    try {
      // Check for Service Worker updates (browser-native, no backend endpoint needed)
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration?.waiting) {
        // A new SW is already waiting — prompt user to refresh
        window.dispatchEvent(new CustomEvent('sw-update-available'));
      }
    } catch (err) {
      console.error('[PWA] Version check failed:', err);
    } finally {
      checkInProgress.current = false;
    }
  }, []);

  const checkNotifications = useCallback(async () => {
    try {
      // Fetch unread count only — lightweight check
      const res = await api.get('/notifications/me?per_page=1&is_read=false');
      const data = res.data;
      const items = Array.isArray(data) ? data : (data?.items ?? []);
      if (items.length > 0) {
        showToast(t('notifications.newCount', { count: items.length }), 'info');
      }
      return items;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error('[PWA] Notification check failed:', err?.response?.status || err?.message || err);
      return [];
    }
  }, [showToast, t]);

  useEffect(() => {
    // Check version immediately on mount
    checkVersion();
    checkNotifications();
    
    // Set up interval for periodic checks
    const versionInterval = setInterval(checkVersion, VERSION_CHECK_INTERVAL);
    const notificationInterval = setInterval(checkNotifications, 300000); // Every 5 minutes
    
    // Check when app becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
        checkNotifications();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(versionInterval);
      clearInterval(notificationInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkVersion, checkNotifications]);

  return { checkVersion, checkNotifications };
}

export default useVersionCheck;
