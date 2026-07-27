/**
 * POS offline queue — tiny promise-based IndexedDB wrapper (no deps).
 *
 * db `fnb-pos-offline`:
 *   - `queue`     (keyPath "client_ref") — orders taken while offline,
 *                 replayed to POST /staff/pos/orders when back online.
 *   - `snapshots` (keyPath "store_id")   — last successfully loaded menu,
 *                 used to keep the POS usable without connectivity.
 */

export type QueuedOrderStatus = "pending" | "syncing" | "failed";

export interface QueuedOrderPayment {
  payment_method: string;
  amount_tendered: number;
}

export interface QueuedOrder {
  client_ref: string;
  order_payload: Record<string, unknown>;
  payment: QueuedOrderPayment;
  total: number;
  /** Human-readable: first item names + item count, e.g. "Latte, Espresso (3 items)" */
  summary: string;
  created_at: number;
  status: QueuedOrderStatus;
  error?: string;
}

export interface MenuSnapshot {
  store_id: number;
  saved_at: number;
  data: {
    items: unknown[];
    categories: unknown[];
    bundleProducts: unknown[];
  };
}

const DB_NAME = "fnb-pos-offline";
const DB_VERSION = 1;
const STORE_QUEUE = "queue";
const STORE_SNAPSHOTS = "snapshots";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: "client_ref" });
      }
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: "store_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function reqValue<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** fetch() rejects with TypeError on network failure; HTTP errors from the
 *  API wrapper are plain Error instances. */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError;
}

export async function saveMenuSnapshot(
  storeId: number,
  data: MenuSnapshot["data"],
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_SNAPSHOTS, "readwrite");
  tx.objectStore(STORE_SNAPSHOTS).put({ store_id: storeId, saved_at: Date.now(), data });
  await txDone(tx);
}

export async function loadMenuSnapshot(storeId: number): Promise<MenuSnapshot | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_SNAPSHOTS, "readonly");
  const snap = await reqValue(tx.objectStore(STORE_SNAPSHOTS).get(storeId) as IDBRequest<MenuSnapshot | undefined>);
  return snap ?? null;
}

export async function enqueueOrder(item: QueuedOrder): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, "readwrite");
  tx.objectStore(STORE_QUEUE).put(item);
  await txDone(tx);
}

export async function listQueue(): Promise<QueuedOrder[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, "readonly");
  const all = await reqValue(tx.objectStore(STORE_QUEUE).getAll() as IDBRequest<QueuedOrder[]>);
  return (all ?? []).sort((a, b) => a.created_at - b.created_at);
}

export async function updateQueueItem(
  clientRef: string,
  patch: Partial<Omit<QueuedOrder, "client_ref">>,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, "readwrite");
  const store = tx.objectStore(STORE_QUEUE);
  const existing = await reqValue(store.get(clientRef) as IDBRequest<QueuedOrder | undefined>);
  if (existing) {
    store.put({ ...existing, ...patch, client_ref: clientRef });
  }
  await txDone(tx);
}

export async function removeQueueItem(clientRef: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, "readwrite");
  tx.objectStore(STORE_QUEUE).delete(clientRef);
  await txDone(tx);
}
