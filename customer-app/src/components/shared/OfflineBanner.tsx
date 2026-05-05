'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

const RETRY_INTERVAL = 15;

function getInitialOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export default function OfflineBanner() {
  const { t } = useTranslation();
  const [isOnline, setIsOnline] = useState<boolean>(getInitialOnline);
  const [showBanner, setShowBanner] = useState<boolean>(() => !getInitialOnline());
  const [countdown, setCountdown] = useState(RETRY_INTERVAL);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(() => {
    clearTimer();
    setCountdown(RETRY_INTERVAL);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      clearTimer();
      setTimeout(() => setShowBanner(false), 2000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
      startCountdown();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!getInitialOnline()) {
      startCountdown();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimer();
    };
  }, [startCountdown, clearTimer]);

  if (!showBanner) return null;

  return (
    <div
      className={`offline-banner ${isOnline ? 'online' : 'offline'}`}
      role="status"
      aria-live="polite"
    >
      {isOnline ? (
        <>
          <Wifi size={16} />
          <span>{t('common.backOnline')}</span>
        </>
      ) : (
        <>
          <WifiOff size={16} />
          <span className="flex-1">
            {t('toast.offline')}
          </span>
          {countdown > 0 && (
            <span className="flex items-center gap-1 text-xs opacity-85">
              <RefreshCw size={12} />
              Retrying in {countdown}s
            </span>
          )}
        </>
      )}
    </div>
  );
}
