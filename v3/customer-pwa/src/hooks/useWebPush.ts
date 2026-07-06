import { useEffect, useRef } from 'react';
import { getVapidPublicKey, registerDevice } from '@/lib/api';
import { getDeviceFingerprint } from '@/lib/fingerprint';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData.split('').map((char) => char.charCodeAt(0)));
}

async function getOrCreateServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.ready;
}

export interface UseWebPushOptions {
  enabled?: boolean;
}

export function useWebPush({ enabled = true }: UseWebPushOptions = {}) {
  const subscribingRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const subscribe = async () => {
      if (subscribingRef.current) return;
      subscribingRef.current = true;
      try {
        if (!('Notification' in window)) return;
        if (!('serviceWorker' in navigator)) return;
        if (!('PushManager' in window)) return;

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const registration = await getOrCreateServiceWorkerRegistration();
        if (!registration) return;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          const publicKey = await getVapidPublicKey();
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as ArrayBuffer,
          });
        }

        const json = subscription.toJSON() as {
          endpoint: string;
          expirationTime?: number | null;
          keys: { p256dh: string; auth: string };
        };
        const fingerprint = await getDeviceFingerprint();
        await registerDevice({
          device_fingerprint: fingerprint,
          platform: 'pwa',
          web_push_subscription: json,
          app_version: process.env.NEXT_PUBLIC_APP_VERSION,
        });
      } catch (err) {
        console.error('[useWebPush] Subscription failed:', err);
      } finally {
        subscribingRef.current = false;
      }
    };

    subscribe();
  }, [enabled]);
}
