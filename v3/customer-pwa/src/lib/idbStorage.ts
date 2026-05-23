/**
 * IndexedDB storage adapter for Zustand persist middleware.
 * Provides more reliable offline storage than localStorage.
 */

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

export const idbStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(name);
      return await new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const result = request.result;
          resolve(result === undefined ? null : result);
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      if (typeof window !== 'undefined') {
        return localStorage.getItem(name);
      }
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, name);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      if (typeof window !== 'undefined') {
        localStorage.setItem(name, value);
      }
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(name);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(name);
      }
    }
  },
};
