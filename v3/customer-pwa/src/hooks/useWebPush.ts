import { useEffect, useRef } from 'react';
import { getVapidPublicKey, registerDevice, deregisterDevice } from '@/lib/api';
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

async function getExistingSubscription(): Promise<PushSubscription | null> {
  const registration = await getOrCreateServiceWorkerRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

function hasRegisteredThisSession(endpoint: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem('loka_web_push_registered') === endpoint;
  } catch {
    return false;
  }
}

function markRegisteredThisSession(endpoint: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem('loka_web_push_registered', endpoint);
  } catch {
    // ignore
  }
}

async function registerWebPushSubscription(): Promise<void> {
  if (!('Notification' in window)) return;
  if (!('serviceWorker' in navigator)) return;
  if (!('PushManager' in window)) return;

  const permission = Notification.permission;
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

  if (hasRegisteredThisSession(subscription.endpoint)) return;

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
  markRegisteredThisSession(subscription.endpoint);
}

export interface UseWebPushOptions {
  enabled?: boolean;
}

export function useWebPush({ enabled = true }: UseWebPushOptions = {}) {
  const subscribingRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const syncExisting = async () => {
      if (subscribingRef.current) return;
      subscribingRef.current = true;
      try {
        const existing = await getExistingSubscription();
        if (existing && Notification.permission === 'granted') {
          await registerWebPushSubscription();
        }
      } catch (err) {
        console.error('[useWebPush] Existing subscription sync failed:', err);
      } finally {
        subscribingRef.current = false;
      }
    };

    syncExisting();
  }, [enabled]);
}

/**
 * Request web push permission and register the subscription.
 * Intended to be called from a user action (e.g., a button click).
 */
export async function requestWebPushPermission(): Promise<void> {
  if (!('Notification' in window)) return;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;
  await registerWebPushSubscription();
}

/**
 * Unsubscribe the current push subscription and deregister the device.
 * Should be called on logout.
 */
export async function unsubscribeAndDeregisterWebPush(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }
    const fingerprint = await getDeviceFingerprint();
    await deregisterDevice(fingerprint);
  } catch (err) {
    console.error('[useWebPush] Deregister failed:', err);
  }
}
