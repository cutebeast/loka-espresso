/**
 * Detect user location via IP geolocation and find the nearest store.
 *
 * Strategy:
 * 1. Try free ip-api.com (no key needed, works server-side)
 * 2. Haversine distance to each store's lat/lng
 * 3. Return the closest store, or null if anything fails
 */

import type { Store } from '@/lib/api';

interface IPLocation {
  lat: number;
  lng: number;
}

/**
 * Haversine distance in km between two lat/lng points
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Detect user's approximate location via IP.
 * Uses our own backend endpoint which tries local MaxMind DB then ip-api fallback.
 */
function createTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

export async function detectIPLocation(): Promise<IPLocation | null> {
  try {
    const { default: api } = await import('@/lib/api');
    const res = await api.get('/content/location', { timeout: 5000 });
    if (res.data?.lat && res.data?.lng) {
      return { lat: res.data.lat, lng: res.data.lng };
    }
  } catch {
    // Backend unavailable — try direct ip-api
    try {
      const fallbackGeoUrl = process.env.NEXT_PUBLIC_GEOIP_API_URL || 'https://ip-api.com/json/?fields=status,lat,lon';
      const res = await fetch(fallbackGeoUrl, {
        signal: createTimeoutSignal(5000),
      });
      const data = await res.json();
      if (data?.status === 'success' && data.lat && data.lon) {
        return { lat: data.lat, lng: data.lon };
      }
    } catch {
      // all failed
    }
  }
  return null;
}

/**
 * Given a list of stores and a user location, find the nearest physical store.
 * Skips store_id=0 (HQ — it's not a physical location).
 */
export function findNearestStore(
  stores: Store[],
  userLoc: IPLocation,
): Store | null {
  const physicalStores = stores.filter(
    (s) => s.is_active && s.id !== 0 && s.lat != null && s.lng != null,
  );

  if (physicalStores.length === 0) return null;

  let nearest = physicalStores[0];
  if (!nearest) return null;
  let minDist = haversineKm(userLoc.lat, userLoc.lng, nearest.lat!, nearest.lng!);

  for (let i = 1; i < physicalStores.length; i++) {
    const store = physicalStores[i];
    if (!store) continue;
    const d = haversineKm(
      userLoc.lat, userLoc.lng,
      store.lat!, store.lng!,
    );
    if (d < minDist) {
      minDist = d;
      nearest = store;
    }
  }

  return nearest;
}

/**
 * One-shot: detect location (prefer cached GPS, fall back to IP) → find nearest store.
 * Returns null if anything fails (caller shows "Select Store").
 */
export async function autoDetectStore(
  stores: Store[],
  cachedLocation?: IPLocation | null,
): Promise<Store | null> {
  let loc = cachedLocation ?? null;
  if (!loc) loc = await getBrowserLocation();
  if (!loc) loc = await detectIPLocation();
  if (!loc) return null;
  return findNearestStore(stores, loc);
}

/**
 * Get user location via browser Geolocation API (more accurate than IP).
 * Returns null if permission denied or not available.
 */
export async function getBrowserLocation(): Promise<IPLocation | null> {
  const TIMEOUT_MS = 15000;
  const locationPromise = new Promise<IPLocation | null>((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
  const timeoutPromise = new Promise<IPLocation | null>((resolve) => {
    setTimeout(() => resolve(null), TIMEOUT_MS);
  });
  return Promise.race([locationPromise, timeoutPromise]);
}

/**
 * Calculate distance from user to a specific store.
 * Returns formatted string like "0.5km" or null if can't calculate.
 */
export async function getDistanceToStore(
  store: Store,
  preferBrowserLocation = true
): Promise<string | null> {
  if (store.lat == null || store.lng == null) return null;
  
  let userLoc: IPLocation | null = null;
  
  if (preferBrowserLocation) {
    userLoc = await getBrowserLocation();
  }
  
  if (!userLoc) {
    userLoc = await detectIPLocation();
  }
  
  if (!userLoc) return null;
  
  const dist = haversineKm(userLoc.lat, userLoc.lng, store.lat, store.lng);
  
  if (dist < 1) {
    return `${(dist * 1000).toFixed(0)}m`;
  }
  return `${dist.toFixed(1)}km`;
}

/**
 * Calculate distances for all stores and return sorted by nearest.
 */
export async function getStoresWithDistance(
  stores: Store[],
  userLoc: { lat: number; lng: number } | null = null
): Promise<Array<Store & { distance: string; distanceKm: number }>> {
  if (!userLoc) {
    userLoc = await getBrowserLocation();
  }
  if (!userLoc) {
    userLoc = await detectIPLocation();
  }
  if (!userLoc) {
    return stores.map(s => ({ ...s, distance: '', distanceKm: Infinity }));
  }
  return stores
    .filter(s => s.id !== 0 && s.lat != null && s.lng != null)
    .map(s => {
      const distKm = haversineKm(userLoc!.lat, userLoc!.lng, s.lat!, s.lng!);
      const distance = distKm < 1 
        ? `${(distKm * 1000).toFixed(0)}m` 
        : `${distKm.toFixed(1)}km`;
      return { ...s, distance, distanceKm: distKm };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
