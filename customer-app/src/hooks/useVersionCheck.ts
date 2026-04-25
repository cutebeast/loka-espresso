'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';

const VERSION_CHECK_INTERVAL = 60000; // Check every 60 seconds
const STORAGE_KEY = 'loka_pwa_version';

export function useVersionCheck() {
  const { showToast } = useUIStore();
  const checkInProgress = useRef(false);

  const checkVersion = useCallback(async () => {
    if (checkInProgress.current) return;
    checkInProgress.current = true;

    try {
      // Get stored version
      const storedVersion = localStorage.getItem(STORAGE_KEY) || '1.0.0';
      
      // Check server version
      const res = await api.get(`/content/version?client_version=${storedVersion}`);
      const data = res.data;

      if (data.requires_update) {
        console.log('[PWA] Update available:', data.version);
        
        // Store new version
        localStorage.setItem(STORAGE_KEY, data.version);
        
        // Dispatch event so AppShell can show a user-facing update prompt
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
      const lastCheck = localStorage.getItem('loka_last_notification_check');
      const url = lastCheck 
        ? `/content/notifications?last_check=${encodeURIComponent(lastCheck)}`
        : '/content/notifications';
      
      const res = await api.get(url);
      const data = res.data;
      
      if (data.notifications && data.notifications.length > 0) {
        // Show notification badge or toast for new notifications
        const unreadCount = data.notifications.filter((n: {is_read: boolean}) => !n.is_read).length;
        if (unreadCount > 0) {
          showToast(`${unreadCount} new notification${unreadCount > 1 ? 's' : ''}`, 'info');
        }
        
        // Store check time
        localStorage.setItem('loka_last_notification_check', data.server_time);
        
        // Return notifications for UI to display
        return data.notifications;
      }
      
      // Store check time even if no new notifications
      if (data.server_time) {
        localStorage.setItem('loka_last_notification_check', data.server_time);
      }
      
      return [];
    } catch (err) {
      console.error('[PWA] Notification check failed:', err);
      return [];
    }
  }, [showToast]);

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
