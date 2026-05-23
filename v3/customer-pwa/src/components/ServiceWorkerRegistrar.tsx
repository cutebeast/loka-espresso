'use client';
import { useEffect, useRef } from 'react';

export function ServiceWorkerRegistrar() {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || registeredRef.current) return;
    registeredRef.current = true;

    const workerListeners: Array<{ target: ServiceWorkerRegistration | ServiceWorker; type: string; handler: () => void }> = [];

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none',
        });

        const onUpdateFound = () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          const onStateChange = () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              const event = new CustomEvent('sw-update-available');
              window.dispatchEvent(event);
            }
          };
          newWorker.addEventListener('statechange', onStateChange);
          workerListeners.push({ target: newWorker, type: 'statechange', handler: onStateChange });
        };

        registration.addEventListener('updatefound', onUpdateFound);
        workerListeners.push({ target: registration, type: 'updatefound', handler: onUpdateFound });

        if (registration.waiting) {
          const event = new CustomEvent('sw-update-available');
          window.dispatchEvent(event);
        }
      } catch (err) {
        console.error('[ServiceWorker] Registration failed:', err);
      }
    };

    void registerServiceWorker();

    return () => {
      workerListeners.forEach(({ target, type, handler }) => {
        target.removeEventListener(type, handler);
      });
    };
  }, []);

  return null;
}
