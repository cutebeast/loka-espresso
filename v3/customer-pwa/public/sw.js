/**
 * Loka Espresso PWA Service Worker
 * Version: 0.1.0 (build 2026-05-26T01:28:54.658Z)
 * Build: 2026-04-23T20:22:55.000Z
 */

const CACHE_VERSION = 'v0.1.0.1779758934';
const CACHE_NAME = `loka-pwa-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico',
  '/offline.html'
];

// Install event - cache static assets, wait for user to apply update
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing ${CACHE_VERSION}`);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('[SW] Caching static assets');
        const results = await Promise.allSettled(
          STATIC_ASSETS.map(url =>
            fetch(url, { cache: 'no-cache' }).then((res) => {
              if (res.ok) return cache.put(url, res);
              throw new Error(`HTTP ${res.status}`);
            })
          )
        );
        results.forEach((result, i) => {
          if (result.status === 'rejected') {
            console.warn(`[SW] Failed to cache ${STATIC_ASSETS[i]}:`, result.reason);
          }
        });
        console.log('[SW] Installed — waiting for user activation');
      })
      .catch((err) => {
        console.error('[SW] Cache failed:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating ${CACHE_VERSION}`);
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        // Delete old page-specific caches to prevent serving stale HTML
        cacheNames
          .filter((k) => k.startsWith('pages-') && k !== CACHE_NAME)
          .forEach((k) => caches.delete(k));
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('loka-pwa-') && name !== CACHE_NAME)
            .map((name) => {
              console.log(`[SW] Deleting old cache: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activated');
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // API calls: network-only, no caching of auth'd data
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/content/api/')) {
    event.respondWith(
      fetch(request)
        .catch(() => new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }))
    );
    return;
  }
  
  // Strategy: Cache First for static assets, Network First for pages
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});

function isStaticAsset(url) {
  const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.json', '.webp'];
  return staticExtensions.some((ext) => url.pathname.endsWith(ext));
}

// Cache First strategy for static assets
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  if (cached) {
    // Return cached and update in background
    updateCache(request, cache);
    return cached;
  }
  
  // Not in cache, fetch and cache
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[SW] Fetch failed:', error);
    if (request.mode === 'navigate' || request.destination === 'document') {
      const fallback = await cache.match('/offline.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503 });
  }
}

// Network First strategy for pages
// Tradeoff: Network-first ensures fresh content on first load but can serve
// stale HTML from cache when offline. The activate handler clears old page
// caches on SW update to mitigate stale deployments. For truly dynamic pages,
// consider adding a cache-busting query parameter or using stale-while-revalidate.
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok && request.mode === 'navigate') {
      // Update cache with fresh content
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_error) {
    // Network failed, try cache
    const cached = await cache.match(request);
    if (cached) {
      console.log('[SW] Serving from cache:', request.url);
      return cached;
    }
    // No cache available — serve offline page for navigations
    if (request.mode === 'navigate') {
      const fallback = await cache.match('/offline.html');
      if (fallback) return fallback;
    }
    return new Response('Offline - No cached version', { 
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Background cache update
async function updateCache(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response);
    }
  } catch (err) {
    // Ignore update errors
  }
}

// Push notification handler
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      event.waitUntil(
        (async () => {
          try {
            const text = await event.data.text();
            data = JSON.parse(text);
          } catch { /* use empty fallback */ }
        })()
      );
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Loka Espresso', {
      body: data.body || 'New update available!',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'general',
      data: data.data || {},
      requireInteraction: true
    })
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const targetUrl = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return clients.openWindow(targetUrl);
      })
  );
});

// ── Background Sync for offline orders ──

const DB_NAME = 'loka-offline-orders';
const DB_VERSION = 1;
const STORE_NAME = 'pending-orders';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueOrder(orderPayload, authToken) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record = {
      payload: orderPayload,
      authToken: authToken || null,
      timestamp: Date.now(),
      retryCount: 0,
      nextRetryAt: 0,
    };
    const request = store.add(record);
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function getPendingOrders() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function removeOrder(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => {
      db.close();
      resolve();
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// Listen for messages from the page to queue an offline order
self.addEventListener('message', (event) => {
  const data = event.data;
  
  if (data && data.type === 'QUEUE_ORDER') {
    queueOrder(data.payload, data.authToken)
      .then(() => self.registration.sync.register('orders'))
      .catch((err) => console.error('[SW] Failed to queue order:', err));
    return;
  }

  if (data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data === 'CHECK_VERSION') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({
        version: CACHE_VERSION,
        cacheName: CACHE_NAME
      });
    }
  }
});

// Background Sync event: replay queued orders
self.addEventListener('sync', (event) => {
  if (event.tag === 'orders') {
    event.waitUntil(replayOrders());
  }
});

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

async function updateOrderRetry(id, retryCount, nextRetryAt) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => {
      const record = request.result;
      if (!record) {
        db.close();
        resolve();
        return;
      }
      record.retryCount = retryCount;
      record.nextRetryAt = nextRetryAt;
      const putRequest = store.put(record);
      putRequest.onsuccess = () => {
        db.close();
        resolve();
      };
      putRequest.onerror = () => {
        db.close();
        reject(putRequest.error);
      };
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function replayOrders() {
  const pendingOrders = await getPendingOrders();
  if (pendingOrders.length === 0) return;

  const API_BASE = '/api/v1';
  const now = Date.now();

  for (const record of pendingOrders) {
    if (record.nextRetryAt && record.nextRetryAt > now) continue;

    const retryCount = record.retryCount || 0;
    if (retryCount >= MAX_RETRIES) {
      console.warn('[SW] Max retries reached for order', record.id, '— removing');
      await removeOrder(record.id);
      continue;
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
        'Idempotency-Key': `sw-sync-${record.id}`,
      };
      if (record.authToken) {
        headers['Authorization'] = `Bearer ${record.authToken}`;
      }
      const response = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(record.payload),
      });

      if (response.ok || response.status === 409) {
        await removeOrder(record.id);
      } else if (response.status >= 500) {
        const nextRetry = retryCount + 1;
        const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
        await updateOrderRetry(record.id, nextRetry, now + delay);
        continue;
      } else {
        await removeOrder(record.id);
      }
    } catch (err) {
      console.error('[SW] Replay failed for order', record.id, err);
      const nextRetry = retryCount + 1;
      const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
      await updateOrderRetry(record.id, nextRetry, now + delay);
      continue;
    }
  }
}

// Background Sync: replay queued orders complete
