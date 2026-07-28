"use client";

/**
 * Customer-facing POS display — designed for a second screen / counter tablet.
 *
 * Works in two modes:
 * 1. Same-browser (dual-screen): listens to BroadcastChannel for instant updates
 * 2. Cross-device (separate tablet): polls Redis via API every 2 seconds
 *
 * Features:
 * - Idle screen with welcome, clock, and wallet top-up QR
 * - Live cart display as staff builds the order
 * - Payment QR (Stripe) for customer to scan with their phone
 * - Payment pending spinner (for cash/card)
 * - Thank-you screen with order number and change
 * - Fullscreen + Wake Lock for kiosk-like operation
 * - localStorage persistence for refresh recovery
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { subscribeToPos, pollRedisState, loadFromLocal, clearLocal, type DisplayState } from "@/components/pos/usePosBroadcast";
import { pwaBaseUrl } from "@/lib/pwaBase";
import { useTranslation } from "@/hooks/useTranslation";
import { Smartphone, CheckCircle, Loader2, ShoppingBag, QrCode as QrIcon, Wallet, Maximize2 } from "lucide-react";

const DEFAULT_STATE: DisplayState = {
  storeName: "Loka Espresso",
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

const TOPUP_QR_CACHE_KEY = "pos-display-topup-qr";

export default function CustomerDisplayPage() {
  const { t, locale, setLocale } = useTranslation();
  const [state, setState] = useState<DisplayState>(DEFAULT_STATE);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [einvoiceQrUrl, setEinvoiceQrUrl] = useState<string | null>(null);
  const [topUpQrUrl, setTopUpQrUrl] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [storeId, setStoreId] = useState<number>(1);
  const [displayKey, setDisplayKey] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Determine store ID + display key from URL ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = parseInt(params.get("store") || "1", 10);
    setStoreId(sid || 1);
    setDisplayKey(params.get("key") || "");
  }, []);

  // ── Restore from localStorage on mount (refresh recovery) ──
  useEffect(() => {
    const saved = loadFromLocal();
    if (saved && saved.phase !== "idle") {
      setState(saved);
    }
  }, []);

  // ── Auto-return to idle from the thank-you screen (~25s) ──
  // Without this the paid screen stays up until the next order starts.
  useEffect(() => {
    if (state.phase !== "paid") return;
    const timer = setTimeout(() => {
      setState(prev => ({ ...DEFAULT_STATE, storeName: prev.storeName }));
      clearLocal();
    }, 25_000);
    return () => clearTimeout(timer);
  }, [state.phase]);

  // ── Subscribe to BroadcastChannel (same-browser, instant) ──
  useEffect(() => {
    const unsub = subscribeToPos(
      (s) => setState(s),
      () => { setState(DEFAULT_STATE); clearLocal(); },
    );
    return unsub;
  }, []);

  // ── Poll Redis (cross-device fallback) — requires the per-store display key ──
  useEffect(() => {
    if (!storeId || !displayKey) return;
    const stopPoll = pollRedisState(
      storeId,
      displayKey,
      (s) => setState(s),
      () => { setState(DEFAULT_STATE); clearLocal(); },
    );
    return stopPoll;
  }, [storeId, displayKey]);

  // ── Clock for welcome screen ──
  useEffect(() => {
    if (state.phase === "idle") {
      setNow(Date.now());
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    }
  }, [state.phase]);

  // ── Generate payment QR from PWA payment URL ──
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

  // ── Generate e-invoice validation QR (thank-you screen) ──
  useEffect(() => {
    setEinvoiceQrUrl(null);
    if (!state.einvoiceUrl) return;
    let cancelled = false;
    import("qrcode").then(QRCode =>
      QRCode.toDataURL(state.einvoiceUrl!, { width: 240, margin: 1, errorCorrectionLevel: "M" }),
    ).then(dataUrl => {
      if (!cancelled) setEinvoiceQrUrl(dataUrl);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [state.einvoiceUrl]);

  // ── Generate wallet top-up QR for idle screen ──
  useEffect(() => {
    // Build PWA wallet top-up URL (domain derived from current host — no hardcoding)
    const pwaBase = pwaBaseUrl();
    const topUpUrl = `${pwaBase}/#wallet?action=topup&store=${storeId}`;

    // Check cache
    const cacheKey = `${TOPUP_QR_CACHE_KEY}-${storeId}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setTopUpQrUrl(cached);
      return;
    }

    let cancelled = false;
    import("qrcode").then(QRCode =>
      QRCode.toDataURL(topUpUrl, {
        width: 200,
        margin: 1,
        color: { dark: "#3B4A1A", light: "#FFFFFF" },
        errorCorrectionLevel: "L",
      }),
    ).then(dataUrl => {
      if (!cancelled) {
        setTopUpQrUrl(dataUrl);
        try { sessionStorage.setItem(cacheKey, dataUrl); } catch {}
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [storeId]);

  // ── Fullscreen + Wake Lock ──
  const enterFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement && containerRef.current?.requestFullscreen) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch { /* user gesture required on some browsers */ }

    // Wake Lock — prevents screen from sleeping
    try {
      if ("wakeLock" in navigator) {
        await (navigator as any).wakeLock.request("screen");
      }
    } catch { /* not supported */ }
  }, []);

  // Auto-attempt fullscreen on first user interaction
  useEffect(() => {
    const onFirstClick = () => {
      enterFullscreen();
      document.removeEventListener("click", onFirstClick);
      document.removeEventListener("touchstart", onFirstClick);
    };
    document.addEventListener("click", onFirstClick);
    document.addEventListener("touchstart", onFirstClick);
    return () => {
      document.removeEventListener("click", onFirstClick);
      document.removeEventListener("touchstart", onFirstClick);
    };
  }, [enterFullscreen]);

  // Re-acquire wake lock when page becomes visible again
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        try {
          if ("wakeLock" in navigator) {
            (navigator as any).wakeLock.request("screen").catch(() => {});
          }
        } catch { /* */ }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const fmt = useCallback((amt: number | string) => `${t("pos.currency_symbol")}${Number(amt ?? 0).toFixed(2)}`, [t]);

  // ── IDLE / WELCOME ──
  if (state.phase === "idle" || (state.phase === "browsing" && state.cart.length === 0)) {
    return (
      <div ref={containerRef} style={styles.container} onClick={enterFullscreen}>
        {/* Language selector (top-left) */}
        <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10, display: "flex", gap: 6 }}>
          {([["en", "EN"], ["ms", "BM"], ["zh", "中文"], ["ta", "தமிழ்"], ["tr", "TR"]] as const).map(([code, label]) => (
            <button key={code} onClick={(e) => { e.stopPropagation(); setLocale(code); try { localStorage.setItem("locale", code); } catch { /* */ } }}
              style={{
                padding: "6px 10px", fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: "pointer",
                border: locale === code ? "2px solid var(--color-primary)" : "1px solid var(--color-border-light)",
                background: locale === code ? "var(--color-primary)" : "rgba(255,255,255,0.85)",
                color: locale === code ? "#fff" : "var(--color-text-secondary)",
              }}>
              {label}
            </button>
          ))}
        </div>
        {/* Fullscreen button (top-right, subtle) */}
        {!isFullscreen && (
          <button style={styles.fullscreenBtn} onClick={(e) => { e.stopPropagation(); enterFullscreen(); }} aria-label="Fullscreen">
            <Maximize2 size={20} />
          </button>
        )}

        <div style={styles.welcomeWrap}>
          <div style={styles.logo}>{state.storeName}</div>
          <div style={styles.welcomeText}>{t("pos.display_welcome")}</div>
          <div style={styles.clock}>
            {now != null ? new Date(now).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : ""}
          </div>

          {/* Wallet Top-Up QR */}
          {topUpQrUrl && (
            <div style={styles.topUpSection} onClick={(e) => e.stopPropagation()}>
              <div style={styles.topUpQrWrap}>
                {topUpQrUrl ? (
                  <img src={topUpQrUrl} alt="Top Up QR" style={styles.topUpQrImg} />
                ) : (
                  <Loader2 size={32} className="animate-spin" style={{ color: "var(--color-primary)" }} />
                )}
              </div>
              <div style={styles.topUpLabel}>
                <Wallet size={18} style={{ marginRight: 6, verticalAlign: "middle" }} />
                {t("pos.display_topup_qr_label")}
              </div>
              <div style={styles.topUpHint}>
                <Smartphone size={14} style={{ marginRight: 4, verticalAlign: "middle" }} />
                {t("pos.display_scan_to_topup")}
              </div>
            </div>
          )}

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

  // ── PAID / THANK YOU ──
  if (state.phase === "paid") {
    return (
      <div ref={containerRef} style={styles.container}>
        <div style={styles.thankYouWrap}>
          <CheckCircle size={80} style={{ color: "#16A34A", marginBottom: 24 }} />
          <div style={styles.thankYouTitle}>{t("pos.display_thank_you")}</div>
          {state.orderNumber && <div style={styles.orderNum}>#{state.orderNumber}</div>}
          <div style={styles.paidTotal}>{fmt(state.paidTotal || state.total)}</div>
          {state.change !== undefined && state.change > 0 && (
            <div style={styles.changeText}>{t("pos.change_rm")}{fmt(state.change)}</div>
          )}
          <div style={styles.paymentMethod}>{state.paymentMethod?.toUpperCase()}</div>
          {state.einvoiceUrl && einvoiceQrUrl && (
            <div style={{ marginTop: 24, textAlign: "center" }}>
              <img src={einvoiceQrUrl} alt="e-invoice" style={{ width: 120, height: 120 }} />
              <div style={{ fontSize: 13, opacity: 0.7, marginTop: 8 }}>{t("pos.display_einvoice_scan")}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── BROWSING + PAYMENT + QR PAYMENT ──
  const showPaymentQR = state.phase === "qr_payment" && qrDataUrl;
  // Cross-device (polled) state has the payment URLs stripped and sets
  // payment_pending instead — show a generic pay prompt, not the QR.
  const showPaymentPending = !showPaymentQR && (state.phase === "payment" || (state.phase === "qr_payment" && !!state.payment_pending));
  return (
    <div ref={containerRef} style={styles.container}>
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
                {item.image_url ? (
                  <img src={item.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                ) : null}
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
            {state.splitInfo && (
              <div style={{ ...styles.totalRow, color: "#2563EB", fontWeight: 600 }}>
                <span>{t("pos.split_paid_of", { paid: fmt(state.splitInfo.paid), total: fmt(state.splitInfo.total) })}</span>
                {state.splitInfo.charging != null && <span>{t("pos.display_this_share")} {fmt(state.splitInfo.charging)}</span>}
              </div>
            )}
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
                <img src={qrDataUrl} alt={t("pos.payment_qr_alt")} style={styles.qrImage} />
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

        {/* Payment pending (non-QR, e.g. cash — or cross-device polled mode) */}
        {showPaymentPending && (
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

// ── Styles ──
const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "100vw", height: "100vh", display: "flex", flexDirection: "column",
    background: "var(--color-bg-page)", color: "var(--color-text-primary)",
    fontFamily: "var(--font-sans)", overflow: "hidden", userSelect: "none",
    cursor: "default",
  },
  fullscreenBtn: {
    position: "absolute", top: 12, right: 12, zIndex: 10,
    background: "rgba(0,0,0,0.05)", border: "none", borderRadius: 8,
    padding: 8, cursor: "pointer", color: "var(--color-text-muted)",
  },
  welcomeWrap: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  logo: { fontSize: 36, fontWeight: 800, color: "var(--color-primary)" },
  welcomeText: { fontSize: 22, color: "var(--color-text-muted)", marginTop: 12 },
  clock: { fontSize: 48, fontWeight: 300, color: "var(--color-text-secondary)", marginTop: 24 },
  topUpSection: { marginTop: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  topUpQrWrap: { width: 160, height: 160, background: "white", borderRadius: 12, padding: 8, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" },
  topUpQrImg: { width: "100%", height: "100%" },
  topUpLabel: { fontSize: 16, fontWeight: 700, color: "var(--color-primary)", display: "flex", alignItems: "center" },
  topUpHint: { fontSize: 13, color: "var(--color-text-muted)", display: "flex", alignItems: "center" },
  hint: { marginTop: 48, textAlign: "center" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid var(--color-border-light)" },
  orderTypeBadge: { fontSize: 16, fontWeight: 600, color: "var(--color-text-muted)", background: "var(--color-bg-muted)", padding: "6px 16px", borderRadius: 20 },
  body: { flex: 1, display: "flex", padding: 16, overflow: "hidden" },
  bodyWithQR: { flex: 1, display: "flex", padding: 16, gap: 16, overflow: "hidden" },
  cart: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  cartWithQR: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  cartTitle: { fontSize: 20, fontWeight: 700, marginBottom: 12, padding: "0 4px" },
  cartList: { flex: 1, overflowY: "auto", padding: "0 4px" },
  cartRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--color-border-light)" },
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
