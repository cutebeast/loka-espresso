const DB_NAME = 'loka-pwa-db';
const DB_VERSION = 1;
const STORE_NAME = 'zustand';

let idbAvailable = true;
let cachedDB: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!idbAvailable) { reject(new Error('IndexedDB unavailable')); return; }
    if (cachedDB) { resolve(cachedDB); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      if (request.error?.name === 'QuotaExceededError' || request.error?.name === 'UnknownError') {
        idbAvailable = false;
      }
      reject(request.error);
    };
    request.onsuccess = () => {
      cachedDB = request.result;
      cachedDB.onclose = () => { cachedDB = null; };
      cachedDB.onversionchange = () => { cachedDB?.close(); cachedDB = null; };
      resolve(cachedDB);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

function loadAllFromDB(): Promise<Map<string, string>> {
  return openDB().then((db) => {
    return new Promise<Map<string, string>>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const memory = new Map<string, string>();
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          memory.set(String(cursor.key), String(cursor.value));
          cursor.continue();
        } else {
          resolve(memory);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }).catch(() => new Map<string, string>());
}

const memoryCache = new Map<string, string>();

let _initPromise: Promise<void> | null = null;

export const idbStorageReady: Promise<boolean> = (() => {
  _initPromise = loadAllFromDB().then((loaded) => {
    loaded.forEach((value, key) => { memoryCache.set(key, value); });
  }).catch((err) => { console.error("idbStorage init failed:", err); });
  return _initPromise.then(() => true);
})();

export const idbStorage = {
  getItem: (name: string): string | null => {
    const v = memoryCache.get(name);
    return v === undefined ? null : v;
  },
  setItem: (name: string, value: string): void => {
    memoryCache.set(name, value);
    if (typeof window === 'undefined') return;
    openDB().then((db) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, name);
    }).catch((err) => {
      try { localStorage.setItem(name, value); } catch {
        console.error('idbStorage: failed to persist key', name, '— both IndexedDB and localStorage unavailable', err);
      }
    });
  },
  removeItem: (name: string): void => {
    memoryCache.delete(name);
    if (typeof window === 'undefined') return;
    openDB().then((db) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(name);
    }).catch((err) => {
      console.error("idbStorage remove failed:", err);
      try { localStorage.removeItem(name); } catch { /* fallback also failed */ }
    });
  },
};
