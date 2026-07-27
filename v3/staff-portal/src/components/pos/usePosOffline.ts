"use client";

/**
 * POS offline orchestration: online-state tracking, menu snapshot hooks,
 * and the sync engine that replays queued orders to the backend.
 *
 * Sync state machine (per queued order, oldest first):
 *   pending|failed → syncing
 *     POST /staff/pos/orders (client_ref) 201|200 → order created (200 = replay)
 *       → PATCH /staff/orders/{id}/payment
 *         200            → paid → removeQueueItem
 *         409            → duplicate-payment guard → GET split-state:
 *                          remaining_due == 0 → already paid → removeQueueItem
 *                          else → failed
 *         other 4xx/5xx  → failed (error message kept)
 *     network (TypeError) → back to pending, stop the pass (still offline)
 *     HTTP 4xx/5xx        → failed (error message kept)
 * Concurrent runs are blocked by a syncing flag; triggers are the window
 * 'online' event plus a 15s interval (a fetch is the real connectivity probe).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  enqueueOrder,
  isNetworkError,
  listQueue,
  removeQueueItem,
  updateQueueItem,
  type QueuedOrder,
} from "@/lib/offlineQueue";

const SYNC_INTERVAL_MS = 15000;

function errorDetail(text: string, max = 200): string {
  try {
    const json = JSON.parse(text);
    if (typeof json?.detail === "string") return json.detail.slice(0, max);
  } catch { /* not JSON */ }
  return text.slice(0, max);
}

export function usePosOffline() {
  const [online, setOnline] = useState(true);
  const [queueItems, setQueueItems] = useState<QueuedOrder[]>([]);
  const syncingRef = useRef(false);

  const refreshQueue = useCallback(async () => {
    try {
      setQueueItems(await listQueue());
    } catch { /* IndexedDB unavailable — queue chip just stays empty */ }
  }, []);

  const markOnline = useCallback((v: boolean) => setOnline(v), []);

  /** Flip to offline when a fetch dies at the network layer (non-HTTP). */
  const reportNetworkFailure = useCallback(() => setOnline(false), []);
  /** Any successful API round-trip proves connectivity is back. */
  const reportSuccess = useCallback(() => setOnline(true), []);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    let connectivityOk = true;
    try {
      const work = (await listQueue()).filter(
        (i) => i.status === "pending" || i.status === "failed",
      );
      for (const item of work) {
        try {
          await updateQueueItem(item.client_ref, { status: "syncing", error: undefined });
          await refreshQueue();

          // 1) Create the order — client_ref makes replays return the
          //    existing order (HTTP 200) instead of duplicating the sale.
          const createRes = await api.fetchRaw("POST", "/staff/pos/orders", item.order_payload);
          if (createRes.status !== 200 && createRes.status !== 201) {
            const txt = await createRes.text();
            await updateQueueItem(item.client_ref, {
              status: "failed",
              error: `Order rejected (HTTP ${createRes.status}): ${errorDetail(txt)}`,
            });
            await refreshQueue();
            continue;
          }
          const createdJson = await createRes.json();
          const created = createdJson?.data ?? createdJson ?? {};
          const orderId = created.order_id ?? created.id;
          // Tender exactly what the backend computed — snapshot prices may be
          // stale, and service charge/tax are only known server-side.
          const serverTotal = Number(created.total);
          const tendered = Number.isFinite(serverTotal) && serverTotal > 0
            ? serverTotal
            : item.payment.amount_tendered;

          // 2) Record the cash payment collected while offline.
          const payRes = await api.fetchRaw("PATCH", `/staff/orders/${orderId}/payment`, {
            payment_method: item.payment.payment_method,
            amount_tendered: tendered,
          });
          if (payRes.ok) {
            await removeQueueItem(item.client_ref);
          } else if (payRes.status === 409) {
            // Duplicate-payment guard (same payment within 60s): verify the
            // bill is actually settled before dropping the queue entry.
            const ssRes = await api.fetchRaw("GET", `/staff/orders/${orderId}/split-state`);
            if (ssRes.ok) {
              const ssJson = await ssRes.json();
              const remaining = Number((ssJson?.data ?? ssJson)?.remaining_due ?? 1);
              if (remaining <= 0) {
                await removeQueueItem(item.client_ref);
              } else {
                await updateQueueItem(item.client_ref, {
                  status: "failed",
                  error: "Payment duplicated but a balance remains — please check the order",
                });
              }
            } else {
              await updateQueueItem(item.client_ref, {
                status: "failed",
                error: `Could not verify payment (HTTP ${ssRes.status})`,
              });
            }
          } else {
            const txt = await payRes.text();
            await updateQueueItem(item.client_ref, {
              status: "failed",
              error: `Payment rejected (HTTP ${payRes.status}): ${errorDetail(txt)}`,
            });
          }
        } catch (e) {
          if (isNetworkError(e)) {
            // Still offline — leave the item pending and stop this pass.
            await updateQueueItem(item.client_ref, { status: "pending" }).catch(() => {});
            connectivityOk = false;
            setOnline(false);
            break;
          }
          await updateQueueItem(item.client_ref, {
            status: "failed",
            error: (e as Error).message,
          }).catch(() => {});
        }
        await refreshQueue();
      }
      if (connectivityOk && work.length > 0) setOnline(true);
    } catch { /* IndexedDB unavailable — try again next tick */ } finally {
      syncingRef.current = false;
      await refreshQueue();
    }
  }, [refreshQueue]);

  const enqueue = useCallback(async (item: QueuedOrder) => {
    await enqueueOrder(item);
    await refreshQueue();
  }, [refreshQueue]);

  const retryItem = useCallback(async (clientRef: string) => {
    await updateQueueItem(clientRef, { status: "pending", error: undefined });
    await refreshQueue();
    void syncNow();
  }, [refreshQueue, syncNow]);

  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    // Crash recovery: a page that died mid-sync leaves items stuck in
    // "syncing" — reset them so the next pass picks them up (backend
    // client_ref replay makes a double-sync safe).
    void (async () => {
      try {
        const items = await listQueue();
        for (const i of items) {
          if (i.status === "syncing") await updateQueueItem(i.client_ref, { status: "pending" });
        }
      } catch { /* IndexedDB unavailable */ }
      await refreshQueue();
    })();
    const onOnline = () => { setOnline(true); void syncNow(); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const timer = setInterval(() => { void syncNow(); }, SYNC_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(timer);
    };
  }, [refreshQueue, syncNow]);

  return {
    online,
    queueItems,
    enqueue,
    retryItem,
    syncNow,
    reportNetworkFailure,
    reportSuccess,
    markOnline,
  };
}
