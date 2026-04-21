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
function haversineKm(
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
 * Uses ip-api.com (free, no key, 45 req/min).
 */
export async function detectIPLocation(): Promise<IPLocation | null> {
  try {
    const res = await fetch('https://ip-api.com/json/?fields=status,lat,lon', {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data?.status === 'success' && data.lat && data.lon) {
      return { lat: data.lat, lng: data.lon };
    }
  } catch {
    // ip-api failed, try backup
    try {
      const res = await fetch('https://ipapi.co/json/', {
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      if (data?.latitude && data?.longitude) {
        return { lat: data.latitude, lng: data.longitude };
      }
    } catch {
      // both failed
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
  let minDist = haversineKm(userLoc.lat, userLoc.lng, nearest.lat!, nearest.lng!);

  for (let i = 1; i < physicalStores.length; i++) {
    const d = haversineKm(
      userLoc.lat, userLoc.lng,
      physicalStores[i].lat!, physicalStores[i].lng!,
    );
    if (d < minDist) {
      minDist = d;
      nearest = physicalStores[i];
    }
  }

  return nearest;
}

/**
 * One-shot: detect IP location → find nearest store.
 * Returns null if anything fails (caller shows "Select Store").
 */
export async function autoDetectStore(
  stores: Store[],
): Promise<Store | null> {
  const loc = await detectIPLocation();
  if (!loc) return null;
  return findNearestStore(stores, loc);
}

/**
 * Get user location via browser Geolocation API (more accurate than IP).
 * Returns null if permission denied or not available.
 */
export async function getBrowserLocation(): Promise<IPLocation | null> {
  return new Promise((resolve) => {
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
  preferBrowserLocation = true
): Promise<Array<Store & { distance: string; distanceKm: number }>> {
  let userLoc: IPLocation | null = null;
  
  if (preferBrowserLocation) {
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
