'use client';
import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none',
        });

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              const event = new CustomEvent('sw-update-available');
              window.dispatchEvent(event);
            }
          });
        });

        if (registration.waiting) {
          const event = new CustomEvent('sw-update-available');
          window.dispatchEvent(event);
        }
      } catch (err) {
        console.error('[ServiceWorker] Registration failed:', err);
      }
    };

    void registerServiceWorker();
  }, []);

  return null;
}
