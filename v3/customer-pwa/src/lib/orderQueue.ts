import api from './api';

const DB_NAME = 'loka-offline-orders';
const DB_VERSION = 1;
const STORE_NAME = 'pending-orders';

export interface QueuedOrder {
  id?: number;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  timestamp: number;
  retryCount: number;
  nextRetryAt: number;
  errorMessage?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function queueOrder(payload: Record<string, unknown>): Promise<QueuedOrder> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record: QueuedOrder = {
      payload,
      idempotencyKey: createIdempotencyKey('order'),
      timestamp: Date.now(),
      retryCount: 0,
      nextRetryAt: 0,
    };
    const request = store.add(record);
    request.onsuccess = () => {
      db.close();
      resolve({ ...record, id: request.result as number });
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function getPendingOrders(): Promise<QueuedOrder[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      db.close();
      resolve(request.result as QueuedOrder[]);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function removeOrder(id: number): Promise<void> {
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

export async function updateOrderRetry(order: QueuedOrder): Promise<void> {
  if (!order.id) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(order);
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

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

export async function replayOrders(): Promise<{ sent: number; failed: number }> {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return { sent: 0, failed: 0 };
  }

  const pending = await getPendingOrders();
  if (pending.length === 0) return { sent: 0, failed: 0 };

  const now = Date.now();
  let sent = 0;
  let failed = 0;

  for (const order of pending) {
    if (order.nextRetryAt && order.nextRetryAt > now) continue;

    if (order.retryCount >= MAX_RETRIES) {
      await removeOrder(order.id as number);
      failed++;
      continue;
    }

    try {
      await api.post('/orders', order.payload, {
        headers: { 'Idempotency-Key': order.idempotencyKey },
      });
      await removeOrder(order.id as number);
      sent++;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const nextRetry = order.retryCount + 1;
      if (status && status >= 400 && status < 500 && status !== 409) {
        // 4xx client errors (except idempotent duplicate) are not retriable
        await removeOrder(order.id as number);
        failed++;
      } else {
        order.retryCount = nextRetry;
        order.nextRetryAt = now + BASE_DELAY_MS * Math.pow(2, order.retryCount - 1);
        order.errorMessage = String((err as { message?: string })?.message || 'Network error');
        await updateOrderRetry(order);
        if (order.retryCount >= MAX_RETRIES) failed++;
      }
    }
  }

  return { sent, failed };
}

export function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string; response?: { status?: number } };
  if (e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED') return true;
  if (e.message?.toLowerCase().includes('network error')) return true;
  return !e.response?.status;
}
