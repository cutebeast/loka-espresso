"use client";

/**
 * BroadcastChannel-based bridge between the POS (staff-facing) and the
 * Customer Display (/pos/display, customer-facing second screen).
 *
 * The POS broadcasts state changes; the display listens and renders.
 * No backend round-trip needed — everything is same-origin real-time.
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
  orderType: string; // "dine_in" | "takeaway" | "delivery"
  tableNumber: string | null;
  cart: DisplayCartItem[];
  subtotal: number;
  serviceCharge: number;
  taxAmount: number;
  total: number;
  itemCount: number;
  // Payment phase
  phase: "browsing" | "payment" | "qr_payment" | "paid" | "idle";
  paymentUrl?: string;        // Stripe Checkout URL (for QR generation)
  pwaPayUrl?: string;         // PWA deep-link for customer to pay from their phone
  orderNumber?: string;
  orderId?: string;
  paidTotal?: number;
  change?: number;
  paymentMethod?: string;
};

const CHANNEL = "pos-display";

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return null;
  return new BroadcastChannel(CHANNEL);
}

/** POS side: broadcast state to the customer display. */
export function broadcastDisplay(state: DisplayState): void {
  try {
    const ch = getChannel();
    if (!ch) return;
    ch.postMessage({ type: "state", state, ts: Date.now() });
    ch.close();
  } catch {
    /* display may not be open */
  }
}

/** POS side: tell the display to reset to idle. */
export function broadcastReset(): void {
  try {
    const ch = getChannel();
    if (!ch) return;
    ch.postMessage({ type: "reset", ts: Date.now() });
    ch.close();
  } catch { /* */ }
}

/** Display side: subscribe to POS broadcasts. Returns an unsubscribe fn. */
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
    ch.close();
  };
}

/** Open the customer display in a new browser window (fullscreen on dual-screen). */
export function openCustomerDisplay(): void {
  if (typeof window === "undefined") return;
  const url = "/pos/display";
  const features = "popup=yes,width=480,height=800,left=1920,top=0,menubar=no,toolbar=no,location=no,status=no";
  window.open(url, "pos-customer-display", features);
}
