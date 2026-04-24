'use client';
import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let reloading = false;

    const activateWorker = (worker: ServiceWorker | null) => {
      if (!worker) return;

      const requestActivation = () => {
        worker.postMessage('SKIP_WAITING');
      };

      if (worker.state === 'installed') {
        requestActivation();
        return;
      }

      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') {
          requestActivation();
        }
      });
    };

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none',
        });

        activateWorker(registration.waiting ?? null);
        activateWorker(registration.installing ?? null);

        registration.addEventListener('updatefound', () => {
          activateWorker(registration.installing ?? null);
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        });

        await registration.update();
      } catch (err) {
        console.error('SW registration failed:', err);
      }
    };

    void registerServiceWorker();
  }, []);

  return null;
}
