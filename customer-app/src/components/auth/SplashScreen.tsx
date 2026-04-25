'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';

interface SplashScreenProps {
  onFinish: () => void;
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(onFinish, 2200);
    return () => clearTimeout(timer);
  }, [onFinish]);

  const handleGuest = () => {
    useUIStore.getState().setIsGuest(true);
    // Don't call onFinish — AppShell's useEffect will set authDone
  };

  return (
    <div className="splash-page">
      <div className="splash-page-inner">
        <div className="splash-icon">
          <svg width="56" height="61" viewBox="0 0 384 416" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
            <path d="M16 32c0-8.837 7.163-16 16-16h224c8.837 0 16 7.163 16 16v224c0 70.692-57.308 128-128 128S16 326.692 16 256V32zm336 64c17.673 0 32 14.327 32 32v32c0 70.692-57.308 128-128 128h0v-32c53.019 0 96-42.981 96-96V128c0-17.673 14.327-32 32-32z" fill="currentColor"/>
          </svg>
        </div>
        <div className="splash-title">LOKA</div>
        <div className="splash-tagline">Espresso · since 2026</div>

        <div className="splash-actions">
          <button className="splash-guest-btn" onClick={handleGuest}>
            Browse as Guest
          </button>
        </div>

        <div className="splash-loading">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#D18E38"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ animation: 'spin 1s linear infinite' }}
          >
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
          </svg>
          preparing…
        </div>
      </div>
    </div>
  );
}
