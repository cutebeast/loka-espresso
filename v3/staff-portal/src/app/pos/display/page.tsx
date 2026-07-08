"use client";

/**
 * Customer-facing POS display — designed for a second screen / counter tablet.
 *
 * Listens to BroadcastChannel "pos-display" for real-time cart + payment state
 * from the staff POS page. Shows:
 *  - Store branding + welcome
 *  - Order items + running total (live as staff adds items)
 *  - Payment QR (Stripe Checkout) for customer to scan with their phone
 *  - The QR deep-links to the PWA (app.loyaltysystem.uk) so the customer can
 *    pay from their own device — completes the order without staff intervention
 *  - Payment confirmed / thank-you screen
 *
 * Usage: staff clicks "Customer Display" on the POS → this opens in a new
 * fullscreen window on the customer-facing monitor.
 */

import { useEffect, useState, useCallback } from "react";
import { subscribeToPos, type DisplayState } from "@/components/pos/usePosBroadcast";
import { useTranslation } from "@/hooks/useTranslation";
import { Smartphone, CheckCircle, Loader2, ShoppingBag, QrCode as QrIcon } from "lucide-react";

const DEFAULT_STATE: DisplayState = {
  storeName: "LOKA Espresso",
  orderType: "dine_in",
  tableNumber: null,
  cart: [],
  subtotal: 0,
  serviceCharge: 0,
  taxAmount: 0,
  total: 0,
  itemCount: 0,
  phase: "idle",
};

export default function CustomerDisplayPage() {
  const { t } = useTranslation();
  const [state, setState] = useState<DisplayState>(DEFAULT_STATE);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  // Subscribe to POS broadcasts
  useEffect(() => {
    const unsub = subscribeToPos(
      (s) => setState(s),
      () => setState(DEFAULT_STATE),
    );
    return unsub;
  }, []);

  // Clock for welcome screen
  useEffect(() => {
    if (state.phase === "idle") {
      setNow(Date.now());
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    }
  }, [state.phase]);

  // Generate QR from the PWA payment URL (customer scans → opens PWA → pays)
  useEffect(() => {
    setQrDataUrl(null);
    if (!state.pwaPayUrl && !state.paymentUrl) return;
    const url = state.pwaPayUrl || state.paymentUrl!;
    let cancelled = false;
    import("qrcode").then(QRCode =>
      QRCode.toDataURL(url, {
        width: 320,
        margin: 2,
        color: { dark: "#2C1E16", light: "#FFFFFF" },
        errorCorrectionLevel: "M",
      }),
    ).then(dataUrl => {
      if (!cancelled) setQrDataUrl(dataUrl);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [state.pwaPayUrl, state.paymentUrl]);

  const fmt = useCallback((amt: number) => `RM ${amt.toFixed(2)}`, []);

  // ── IDLE / WELCOME ──────────────────────────────────────────────
  if (state.phase === "idle" || (state.phase === "browsing" && state.cart.length === 0)) {
    return (
      <div style={styles.container}>
        <div style={styles.welcomeWrap}>
          <div style={styles.logo}>{state.storeName}</div>
          <div style={styles.welcomeText}>{t("pos.display_welcome")}</div>
          <div style={styles.clock}>
            {new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div style={styles.hint}>
            <ShoppingBag size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
            <div style={{ fontSize: 18, color: "var(--color-text-muted)" }}>
              {t("pos.display_scan_to_order_hint")}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── PAID / THANK YOU ────────────────────────────────────────────
  if (state.phase === "paid") {
    return (
      <div style={styles.container}>
        <div style={styles.thankYouWrap}>
          <CheckCircle size={80} style={{ color: "#16A34A", marginBottom: 24 }} />
          <div style={styles.thankYouTitle}>{t("pos.display_thank_you")}</div>
          {state.orderNumber && <div style={styles.orderNum}>#{state.orderNumber}</div>}
          <div style={styles.paidTotal}>{fmt(state.paidTotal || state.total)}</div>
          {state.change !== undefined && state.change > 0 && (
            <div style={styles.changeText}>{t("pos.change_rm")}{fmt(state.change)}</div>
          )}
          <div style={styles.paymentMethod}>{state.paymentMethod?.toUpperCase()}</div>
        </div>
      </div>
    );
  }

  // ── BROWSING (cart building) + PAYMENT + QR PAYMENT ─────────────
  const showPaymentQR = state.phase === "qr_payment" && qrDataUrl;
  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>{state.storeName}</div>
        <div style={styles.orderTypeBadge}>
          {state.orderType === "dine_in" ? t("pos.dine_in") : state.orderType === "takeaway" ? t("pos.takeaway") : t("pos.delivery")}
          {state.tableNumber && ` · ${t("pos.table")} ${state.tableNumber}`}
        </div>
      </div>

      <div style={showPaymentQR ? styles.bodyWithQR : styles.body}>
        {/* Cart / order summary */}
        <div style={showPaymentQR ? styles.cartWithQR : styles.cart}>
          <div style={styles.cartTitle}>{t("pos.order_summary")}</div>
          <div style={styles.cartList}>
            {state.cart.map((item, i) => (
              <div key={i} style={styles.cartRow}>
                <div style={styles.qty}>{item.qty}×</div>
                <div style={styles.itemName}>
                  {item.name}
                  {item.modifiers_label && (
                    <div style={styles.modLabel}>{item.modifiers_label}</div>
                  )}
                </div>
                <div style={styles.itemPrice}>{fmt(item.price * item.qty)}</div>
              </div>
            ))}
            {state.cart.length === 0 && (
              <div style={styles.emptyCart}>{t("pos.no_items_found")}</div>
            )}
          </div>
          {/* Totals */}
          <div style={styles.totalsWrap}>
            {state.serviceCharge > 0 && (
              <div style={styles.totalRow}>
                <span>{t("pos.service_charge")}</span>
                <span>{fmt(state.serviceCharge)}</span>
              </div>
            )}
            {state.taxAmount > 0 && (
              <div style={styles.totalRow}>
                <span>{t("pos.tax")}</span>
                <span>{fmt(state.taxAmount)}</span>
              </div>
            )}
            <div style={styles.grandTotalRow}>
              <span>{t("pos.total_due")}</span>
              <span>{fmt(state.total)}</span>
            </div>
          </div>
        </div>

        {/* Payment QR panel */}
        {showPaymentQR && (
          <div style={styles.qrPanel}>
            <div style={styles.qrTitle}>
              <QrIcon size={28} style={{ marginRight: 8 }} />
              {t("pos.scan_to_pay")}
            </div>
            <div style={styles.qrImageWrap}>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Payment QR" style={styles.qrImage} />
              ) : (
                <Loader2 size={48} className="animate-spin" style={{ color: "var(--color-primary)" }} />
              )}
            </div>
            <div style={styles.qrAmount}>{fmt(state.total)}</div>
            <div style={styles.qrHint}>
              <Smartphone size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
              {t("pos.display_scan_with_phone")}
            </div>
            {state.orderNumber && (
              <div style={styles.qrOrderNum}>#{state.orderNumber}</div>
            )}
          </div>
        )}

        {/* Payment pending (non-QR, e.g. cash) */}
        {state.phase === "payment" && !showPaymentQR && (
          <div style={styles.paymentPendingWrap}>
            <div style={styles.paymentPendingText}>{t("pos.display_payment_in_progress")}</div>
            <div style={styles.qrAmount}>{fmt(state.total)}</div>
            <Loader2 size={40} className="animate-spin" style={{ color: "var(--color-primary)", marginTop: 16 }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "100vw", height: "100vh", display: "flex", flexDirection: "column",
    background: "var(--color-bg-page)", color: "var(--color-text-primary)",
    fontFamily: "var(--font-sans)", overflow: "hidden", userSelect: "none",
  },
  welcomeWrap: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  logo: { fontSize: 36, fontWeight: 800, color: "var(--color-primary)" },
  welcomeText: { fontSize: 22, color: "var(--color-text-muted)", marginTop: 12 },
  clock: { fontSize: 48, fontWeight: 300, color: "var(--color-text-secondary)", marginTop: 24 },
  hint: { marginTop: 48, textAlign: "center" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid var(--color-border-light)" },
  orderTypeBadge: { fontSize: 16, fontWeight: 600, color: "var(--color-text-muted)", background: "var(--color-bg-muted)", padding: "6px 16px", borderRadius: 20 },
  body: { flex: 1, display: "flex", padding: 16, overflow: "hidden" },
  bodyWithQR: { flex: 1, display: "flex", padding: 16, gap: 16, overflow: "hidden" },
  cart: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  cartWithQR: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  cartTitle: { fontSize: 20, fontWeight: 700, marginBottom: 12, padding: "0 4px" },
  cartList: { flex: 1, overflowY: "auto", padding: "0 4px" },
  cartRow: { display: "flex", alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--color-border-light)" },
  qty: { fontSize: 22, fontWeight: 700, color: "var(--color-primary)", minWidth: 48 },
  itemName: { flex: 1, fontSize: 18, fontWeight: 500, lineHeight: 1.4 },
  modLabel: { fontSize: 14, color: "var(--color-text-muted)", marginTop: 2 },
  itemPrice: { fontSize: 18, fontWeight: 600, marginLeft: 8, whiteSpace: "nowrap" },
  emptyCart: { fontSize: 18, color: "var(--color-text-muted)", textAlign: "center", padding: 40 },
  totalsWrap: { borderTop: "2px solid var(--color-border-light)", padding: "12px 4px 0" },
  totalRow: { display: "flex", justifyContent: "space-between", fontSize: 16, color: "var(--color-text-muted)", padding: "4px 0" },
  grandTotalRow: { display: "flex", justifyContent: "space-between", fontSize: 28, fontWeight: 800, padding: "8px 0 0", color: "var(--color-primary)" },
  qrPanel: { width: 400, display: "flex", flexDirection: "column", alignItems: "center", background: "var(--color-bg-card)", borderRadius: 16, padding: 24, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" },
  qrTitle: { fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", marginBottom: 16 },
  qrImageWrap: { width: 320, height: 320, display: "flex", alignItems: "center", justifyContent: "center", background: "white", borderRadius: 12, padding: 8 },
  qrImage: { width: 300, height: 300 },
  qrAmount: { fontSize: 36, fontWeight: 800, color: "var(--color-primary)", margin: "16px 0 8px" },
  qrHint: { fontSize: 16, color: "var(--color-text-muted)", textAlign: "center" },
  qrOrderNum: { fontSize: 14, color: "var(--color-text-muted)", marginTop: 8 },
  paymentPendingWrap: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  paymentPendingText: { fontSize: 22, fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 16 },
  thankYouWrap: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  thankYouTitle: { fontSize: 42, fontWeight: 800, color: "var(--color-primary)", marginTop: 16 },
  orderNum: { fontSize: 24, color: "var(--color-text-muted)", marginTop: 8 },
  paidTotal: { fontSize: 56, fontWeight: 800, color: "var(--color-primary)", marginTop: 24 },
  changeText: { fontSize: 24, fontWeight: 600, color: "var(--color-text-secondary)", marginTop: 12 },
  paymentMethod: { fontSize: 16, color: "var(--color-text-muted)", marginTop: 16, letterSpacing: 2 },
};
