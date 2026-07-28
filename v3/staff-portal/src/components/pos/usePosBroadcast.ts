"use client";

/**
 * Dual-channel bridge between POS (staff-facing) and Customer Display.
 *
 * 1. BroadcastChannel — instant same-browser sync (dual-screen setup)
 * 2. Redis via API — cross-device sync (display on separate tablet/device)
 *
 * The POS writes state to both channels. The display reads from both:
 * BroadcastChannel first (instant), then falls back to Redis polling.
 */

export type DisplayCartItem = {
  menu_item_id: number;
  name: string;
  qty: number;
  price: number;
  modifiers_label: string;
  bundle_product_id?: number;
  bundle_component_id?: number;
};

export type DisplayState = {
  storeName: string;
  storeId?: number;
  orderType: string;
  tableNumber: string | null;
  cart: DisplayCartItem[];
  subtotal: number;
  serviceCharge: number;
  taxAmount: number;
  total: number;
  itemCount: number;
  phase: "browsing" | "payment" | "qr_payment" | "paid" | "idle";
  paymentUrl?: string;
  pwaPayUrl?: string;
  /** Set by the backend on the polled (cross-device) state when a payment is
   *  in progress — signed payment URLs are stripped from that channel. */
  payment_pending?: boolean;
  orderNumber?: string;
  orderId?: string;
  paidTotal?: number;
  change?: number;
  paymentMethod?: string;
  /** LHDN e-invoice validation link — shown as a QR on the thank-you screen. */
  einvoiceUrl?: string;
  /** Split-bill progress while a bill is being settled in shares. */
  splitInfo?: { paid: number; total: number; charging: number | null };
};

const CHANNEL = "pos-display";
const STORAGE_KEY = "pos-display-state";
const POLL_INTERVAL_MS = 2000;

let _channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return null;
  if (!_channel) {
    _channel = new BroadcastChannel(CHANNEL);
  }
  return _channel;
}

/** Save state to localStorage so display survives refresh */
function saveToLocal(state: DisplayState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, ts: Date.now() }));
  } catch { /* ignore */ }
}

/** Load last state from localStorage */
export function loadFromLocal(): DisplayState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { state, ts } = JSON.parse(raw);
    // Expire after 5 minutes
    if (Date.now() - ts > 5 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

/** Clear localStorage state */
export function clearLocal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

/** POS side: broadcast state to BroadcastChannel + Redis + localStorage */
export function broadcastDisplay(state: DisplayState): void {
  // 1. BroadcastChannel (instant, same-browser)
  try {
    const ch = getChannel();
    if (ch) ch.postMessage({ type: "state", state, ts: Date.now() });
  } catch { /* display may not be open */ }

  // 2. localStorage (for refresh recovery)
  saveToLocal(state);

  // 3. Redis via API (cross-device) — fire and forget
  try {
    fetch("/api/staff/pos/display-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(state),
    }).catch(() => {});
  } catch { /* ignore */ }
}

/** POS side: tell the display to reset to idle */
export function broadcastReset(): void {
  try {
    const ch = getChannel();
    if (ch) ch.postMessage({ type: "reset", ts: Date.now() });
  } catch { /* */ }

  clearLocal();

  try {
    fetch("/api/staff/pos/display-state", {
      method: "DELETE",
      credentials: "include",
    }).catch(() => {});
  } catch { /* ignore */ }
}

/** Display side: subscribe to POS broadcasts via BroadcastChannel */
export function subscribeToPos(
  onState: (state: DisplayState) => void,
  onReset: () => void,
): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (e: MessageEvent) => {
    if (e.data?.type === "state" && e.data.state) onState(e.data.state);
    else if (e.data?.type === "reset") onReset();
  };
  ch.addEventListener("message", handler);
  return () => {
    ch.removeEventListener("message", handler);
  };
}

/** Display side: poll Redis for state (cross-device fallback).
 *  The public poll requires the per-store display key. */
export function pollRedisState(
  storeId: number,
  key: string,
  onState: (state: DisplayState) => void,
  onNull: () => void,
): () => void {
  let active = true;
  let lastTs = "";

  const poll = async () => {
    if (!active) return;
    try {
      const res = await fetch(`/api/staff/pos/display-state?store_id=${storeId}&key=${encodeURIComponent(key)}`);
      if (!res.ok) return;
      const json = await res.json();
      const data = json?.data;
      if (!data) {
        if (lastTs) { onNull(); lastTs = ""; }
        return;
      }
      const ts = data.updated_at || "";
      if (ts !== lastTs) {
        lastTs = ts;
        onState(data as DisplayState);
      }
    } catch { /* transient — will retry */ }
  };

  poll();
  const interval = setInterval(poll, POLL_INTERVAL_MS);
  return () => {
    active = false;
    clearInterval(interval);
  };
}

/** Open the customer display in a new browser window.
 *  Passes the current store id + display key so the display polls the right
 *  store's state (the public poll 403s without the key). */
export function openCustomerDisplay(left = 1920, storeId?: number, displayKey?: string): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (storeId) params.set("store", String(storeId));
  if (displayKey) params.set("key", displayKey);
  const qs = params.toString();
  const url = `/pos/display${qs ? `?${qs}` : ""}`;
  const features = `popup=yes,width=480,height=800,left=${left},top=0,menubar=no,toolbar=no,location=no,status=no`;
  window.open(url, "pos-customer-display", features);
}
