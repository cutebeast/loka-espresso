"use client";

/**
 * Customer-facing POS display — designed for a second screen / counter tablet
 * or wall-mounted LCD at the outlet.
 *
 * Modes:
 * 1. Same-browser (dual-screen): BroadcastChannel for instant updates
 * 2. Cross-device (separate tablet): polls Redis via API every 2 seconds
 *
 * Features:
 * - Idle screen with welcome, clock, and wallet top-up QR
 * - Live cart display with item images
 * - Payment QR (Stripe) for customer to scan with their phone
 * - Split-bill progress with remaining/shares
 * - Thank-you screen with e-invoice QR + auto-reset
 * - Fullscreen + Wake Lock with re-acquisition
 * - Connection status indicator (live / stale / disconnected)
 * - Stale state auto-return to idle (30s no updates)
 * - LCD mode: ?mode=lcd or auto-detect large screens → 2x font scaling
 * - Landscape-optimised layout (cart left, totals right)
 * - localStorage persistence for refresh recovery
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { subscribeToPos, pollRedisState, loadFromLocal, clearLocal, type DisplayState } from "@/components/pos/usePosBroadcast";
import { useTranslation } from "@/hooks/useTranslation";
import { Smartphone, CheckCircle, Loader2, ShoppingBag, QrCode as QrIcon, Maximize2, Wifi, WifiOff } from "lucide-react";

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

interface PromoBannerLite {
  id: number;
  title: string;
  short_description: string | null;
  image_url: string | null;
}

const STALE_TIMEOUT_MS = 30_000; // 30s — return to idle if no updates
const STALE_WARN_MS = 5_000;     // show amber indicator after 5s
const PROMO_ROTATE_MS = 8_000;   // idle promo carousel rotation

export default function CustomerDisplayPage() {
  const { t, locale, setLocale } = useTranslation();
  const [state, setState] = useState<DisplayState>(DEFAULT_STATE);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [einvoiceQrUrl, setEinvoiceQrUrl] = useState<string | null>(null);
  const [promoBanners, setPromoBanners] = useState<PromoBannerLite[]>([]);
  const [promoIndex, setPromoIndex] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [storeId, setStoreId] = useState<number>(1);
  const [displayKey, setDisplayKey] = useState("");
  const [isLCD, setIsLCD] = useState(false);
  const [connStatus, setConnStatus] = useState<"live" | "stale" | "disconnected">("live");
  const containerRef = useRef<HTMLDivElement>(null);
  // Init 0 — Date.now() during render is impure (React Compiler lint); the
  // value is set on first poll anyway and only used for elapsed-time checks.
  const lastUpdateRef = useRef<number>(0);

  // ── Determine store ID + display key + LCD mode from URL ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = parseInt(params.get("store") || "1", 10);
    setStoreId(sid || 1);
    setDisplayKey(params.get("key") || "");
    // LCD mode: explicit ?mode=lcd OR auto-detect large landscape screen
    const mode = params.get("mode");
    if (mode === "lcd") {
      setIsLCD(true);
    } else if (window.innerWidth >= 1920 && window.innerWidth > window.innerHeight) {
      setIsLCD(true);
    }
  }, []);

  // ── Restore from localStorage on mount (refresh recovery) ──
  useEffect(() => {
    const saved = loadFromLocal();
    if (saved && saved.phase !== "idle") {
      setState(saved);
      lastUpdateRef.current = Date.now();
    }
  }, []);

  // ── Auto-return to idle from thank-you screen (~25s) ──
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
      (s) => { setState(s); lastUpdateRef.current = Date.now(); },
      () => { setState(DEFAULT_STATE); clearLocal(); },
    );
    return unsub;
  }, []);

  // ── Poll Redis (cross-device fallback) ──
  useEffect(() => {
    if (!storeId || !displayKey) return;
    const stopPoll = pollRedisState(
      storeId,
      displayKey,
      (s) => { setState(s); lastUpdateRef.current = Date.now(); },
      () => { setState(DEFAULT_STATE); clearLocal(); },
    );
    return stopPoll;
  }, [storeId, displayKey]);

  // ── Connection status monitor ──
  useEffect(() => {
    const check = setInterval(() => {
      const elapsed = Date.now() - lastUpdateRef.current;
      if (elapsed > STALE_TIMEOUT_MS && state.phase !== "idle") {
        setConnStatus("disconnected");
        setState(prev => ({ ...DEFAULT_STATE, storeName: prev.storeName }));
        clearLocal();
      } else if (elapsed > STALE_WARN_MS) {
        setConnStatus("stale");
      } else {
        setConnStatus("live");
      }
    }, 1000);
    return () => clearInterval(check);
  }, [state.phase]);

  // ── Clock for welcome screen ──
  useEffect(() => {
    if (state.phase === "idle") {
      setNow(Date.now());
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    }
  }, [state.phase]);

  // ── Generate payment QR ──
  useEffect(() => {
    setQrDataUrl(null);
    if (!state.pwaPayUrl && !state.paymentUrl) return;
    const url = state.pwaPayUrl || state.paymentUrl!;
    let cancelled = false;
    import("qrcode").then(QRCode =>
      QRCode.toDataURL(url, { width: isLCD ? 480 : 320, margin: 2, color: { dark: "#2C1E16", light: "#FFFFFF" }, errorCorrectionLevel: "M" }),
    ).then(dataUrl => { if (!cancelled) setQrDataUrl(dataUrl); }).catch(() => {});
    return () => { cancelled = true; };
  }, [state.pwaPayUrl, state.paymentUrl, isLCD]);

  // ── Generate e-invoice validation QR ──
  useEffect(() => {
    setEinvoiceQrUrl(null);
    if (!state.einvoiceUrl) return;
    const size = isLCD ? 360 : 240;
    let cancelled = false;
    import("qrcode").then(QRCode =>
      QRCode.toDataURL(state.einvoiceUrl!, { width: size, margin: 1, errorCorrectionLevel: "M" }),
    ).then(dataUrl => { if (!cancelled) setEinvoiceQrUrl(dataUrl); }).catch(() => {});
    return () => { cancelled = true; };
  }, [state.einvoiceUrl, isLCD]);

  // ── Idle promo carousel — fetch active promo banners once, rotate every 8s ──
  useEffect(() => {
    let cancelled = false;
    fetch("/api/promos/banners")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        const list = (json.data || json) as PromoBannerLite[];
        if (Array.isArray(list)) setPromoBanners(list.filter((b) => b.image_url));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (state.phase !== "idle" || promoBanners.length < 2) return;
    const id = setInterval(() => setPromoIndex((i) => (i + 1) % promoBanners.length), PROMO_ROTATE_MS);
    return () => clearInterval(id);
  }, [state.phase, promoBanners.length]);

  // ── Fullscreen + Wake Lock ──
  const enterFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement && containerRef.current?.requestFullscreen) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch {}
    try { if ("wakeLock" in navigator) await (navigator as any).wakeLock.request("screen"); } catch {}
  }, []);

  useEffect(() => {
    const onFirstClick = () => { enterFullscreen(); document.removeEventListener("click", onFirstClick); document.removeEventListener("touchstart", onFirstClick); };
    document.addEventListener("click", onFirstClick);
    document.addEventListener("touchstart", onFirstClick);
    return () => { document.removeEventListener("click", onFirstClick); document.removeEventListener("touchstart", onFirstClick); };
  }, [enterFullscreen]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") { try { if ("wakeLock" in navigator) (navigator as any).wakeLock.request("screen").catch(() => {}); } catch {} }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const fmt = useCallback((amt: number | string) => `${t("pos.currency_symbol")}${Number(amt ?? 0).toFixed(2)}`, [t]);
  const scale = (size: number) => isLCD ? Math.round(size * 2) : size;

  // ── IDLE / WELCOME ──
  if (state.phase === "idle" || (state.phase === "browsing" && state.cart.length === 0)) {
    return (
      <div ref={containerRef} style={s.container} onClick={enterFullscreen}>
        <style>{`@keyframes posDispFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
        {/* Connection status dot */}
        <div style={{ position: "absolute", bottom: 16, left: 16, zIndex: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: scale(8), height: scale(8), borderRadius: "50%",
            background: connStatus === "live" ? "#16A34A" : connStatus === "stale" ? "#F59E0B" : "#DC2626",
            boxShadow: `0 0 ${scale(4)}px currentColor`,
          }} />
          <span style={{ fontSize: scale(11), color: "var(--color-text-muted)" }}>
            {connStatus === "live" ? t("pos.display_live") : connStatus === "stale" ? t("pos.display_waiting") : t("pos.display_disconnected")}
          </span>
        </div>

        {/* Language selector */}
        <div style={{ position: "absolute", top: scale(12), left: scale(12), zIndex: 10, display: "flex", gap: scale(6) }}>
          {([["en", "EN"], ["ms", "BM"], ["zh", "中文"], ["ta", "தமிழ்"], ["tr", "TR"]] as const).map(([code, label]) => (
            <button key={code} aria-label={`Switch display language to ${label}`} onClick={(e) => { e.stopPropagation(); setLocale(code); try { localStorage.setItem("locale", code); } catch {} }}
              style={{
                padding: `${scale(6)}px ${scale(10)}px`, fontSize: scale(13), fontWeight: 700, borderRadius: 8, cursor: "pointer",
                border: locale === code ? `2px solid var(--color-primary)` : "1px solid var(--color-border-light)",
                background: locale === code ? "var(--color-primary)" : "rgba(255,255,255,0.85)",
                color: locale === code ? "#fff" : "var(--color-text-secondary)",
              }}>{label}</button>
          ))}
        </div>
        {/* Fullscreen button */}
        {!isFullscreen && (
          <button style={{ position: "absolute", top: scale(12), right: scale(12), zIndex: 10, background: "rgba(0,0,0,0.05)", border: "none", borderRadius: 8, padding: scale(8), cursor: "pointer", color: "var(--color-text-muted)" }}
            onClick={(e) => { e.stopPropagation(); enterFullscreen(); }}><Maximize2 size={scale(20)} /></button>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", padding: `0 ${scale(40)}px` }}>
          <div style={{ fontSize: scale(32), fontWeight: 800, color: "var(--color-primary)" }}>{state.storeName}</div>
          <div style={{ fontSize: scale(36), fontWeight: 300, color: "var(--color-text-secondary)", marginTop: scale(8) }}>
            {now != null ? new Date(now).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : ""}
          </div>

          {promoBanners.length > 0 ? (() => {
            const promo = promoBanners[promoIndex % promoBanners.length];
            if (!promo) return null;
            return (
            <div style={{ marginTop: scale(24), width: "100%", maxWidth: scale(680) }} onClick={(e) => e.stopPropagation()}>
              <div key={promoIndex} style={{ position: "relative", width: "100%", borderRadius: scale(18), overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,0.10)", border: "1px solid var(--color-border-light)", animation: "posDispFadeIn 0.6s ease" }}>
                <img
                  src={promo.image_url!}
                  alt={promo.title}
                  style={{ display: "block", width: "100%", aspectRatio: "16 / 9", objectFit: "cover" }}
                />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(20,14,8,0.78) 0%, rgba(20,14,8,0.25) 45%, transparent 70%)" }} />
                <div style={{ position: "absolute", left: scale(20), right: scale(20), bottom: scale(16), color: "#fff" }}>
                  <div style={{ fontSize: scale(24), fontWeight: 800, textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>{promo.title}</div>
                  {promo.short_description && (
                    <div style={{ fontSize: scale(14), opacity: 0.92, marginTop: scale(4), textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>{promo.short_description}</div>
                  )}
                </div>
              </div>
              {promoBanners.length > 1 && (
                <div style={{ display: "flex", justifyContent: "center", gap: scale(6), marginTop: scale(12) }}>
                  {promoBanners.map((b, i) => (
                    <span key={b.id} style={{ width: scale(8), height: scale(8), borderRadius: "50%", background: i === promoIndex % promoBanners.length ? "var(--color-primary)" : "var(--color-border)", transition: "background 0.3s" }} />
                  ))}
                </div>
              )}
            </div>
            );
          })() : (
            <div style={{ fontSize: scale(22), color: "var(--color-text-muted)", marginTop: scale(16) }}>{t("pos.display_welcome")}</div>
          )}

          <div style={{ marginTop: scale(28), textAlign: "center" }}>
            <ShoppingBag size={scale(48)} style={{ opacity: 0.3, marginBottom: scale(16) }} />
            <div style={{ fontSize: scale(18), color: "var(--color-text-muted)" }}>{t("pos.display_scan_to_order_hint")}</div>
          </div>
        </div>
      </div>
    );
  }

  // ── PAID / THANK YOU ──
  if (state.phase === "paid") {
    return (
      <div ref={containerRef} style={s.container}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <CheckCircle size={scale(80)} style={{ color: "#16A34A", marginBottom: scale(24) }} />
          <div style={{ fontSize: scale(42), fontWeight: 800, color: "var(--color-primary)", marginTop: scale(16) }}>{t("pos.display_thank_you")}</div>
          {state.orderNumber && <div style={{ fontSize: scale(24), color: "var(--color-text-muted)", marginTop: scale(8) }}>#{state.orderNumber}</div>}
          <div style={{ fontSize: scale(56), fontWeight: 800, color: "var(--color-primary)", marginTop: scale(24) }}>{fmt(state.paidTotal || state.total)}</div>
          {state.change !== undefined && state.change > 0 && (
            <div style={{ fontSize: scale(24), fontWeight: 600, color: "var(--color-text-secondary)", marginTop: scale(12) }}>{t("pos.change_rm")}{fmt(state.change)}</div>
          )}
          <div style={{ fontSize: scale(16), color: "var(--color-text-muted)", marginTop: scale(16), letterSpacing: 2 }}>{state.paymentMethod?.toUpperCase()}</div>
          {state.einvoiceUrl && einvoiceQrUrl && (
            <div style={{ marginTop: scale(24), textAlign: "center" }}>
              <img src={einvoiceQrUrl} alt="e-invoice" style={{ width: scale(120), height: scale(120) }} />
              <div style={{ fontSize: scale(13), opacity: 0.7, marginTop: scale(8) }}>{t("pos.display_einvoice_scan")}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── BROWSING + PAYMENT + QR PAYMENT ──
  const showPaymentQR = state.phase === "qr_payment" && qrDataUrl;
  const showPaymentPending = !showPaymentQR && (state.phase === "payment" || (state.phase === "qr_payment" && !!state.payment_pending));
  const isLandscape = window.innerWidth > window.innerHeight;

  return (
    <div ref={containerRef} style={s.container}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${scale(16)}px ${scale(24)}px`, borderBottom: "1px solid var(--color-border-light)" }}>
        <div style={{ fontSize: scale(36), fontWeight: 800, color: "var(--color-primary)" }}>{state.storeName}</div>
        <div style={{ display: "flex", alignItems: "center", gap: scale(12) }}>
          {/* Connection dot */}
          <div style={{ display: "flex", alignItems: "center", gap: scale(4) }}>
            {connStatus === "live" ? (
              <Wifi size={scale(14)} style={{ color: "#16A34A" }} />
            ) : connStatus === "stale" ? (
              <Wifi size={scale(14)} style={{ color: "#F59E0B" }} />
            ) : (
              <WifiOff size={scale(14)} style={{ color: "#DC2626" }} />
            )}
          </div>
          <div style={{ fontSize: scale(16), fontWeight: 600, color: "var(--color-text-muted)", background: "var(--color-bg-muted)", padding: `${scale(6)}px ${scale(16)}px`, borderRadius: 20 }}>
            {state.orderType === "dine_in" ? t("pos.dine_in") : t("pos.takeaway")}
            {state.tableNumber && ` · ${t("pos.table")} ${state.tableNumber}`}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: showPaymentQR && !isLandscape ? "column" : "row", padding: scale(16), gap: scale(16), overflow: "hidden" }}>
        {/* Cart / order summary */}
        <div style={{ flex: showPaymentQR && isLandscape ? 1 : 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ fontSize: scale(20), fontWeight: 700, marginBottom: scale(12), padding: `0 ${scale(4)}px` }}>{t("pos.order_summary")}</div>
          <div style={{ flex: 1, overflowY: "auto", padding: `0 ${scale(4)}px` }}>
            {state.cart.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: scale(10), padding: `${scale(10)}px 0`, borderBottom: "1px solid var(--color-border-light)" }}>
                {item.image_url ? <img src={item.image_url} alt="" style={{ width: scale(40), height: scale(40), borderRadius: 8, objectFit: "cover", flexShrink: 0 }} /> : null}
                <div style={{ fontSize: scale(22), fontWeight: 700, color: "var(--color-primary)", minWidth: scale(48) }}>{item.qty}×</div>
                <div style={{ flex: 1, fontSize: scale(18), fontWeight: 500, lineHeight: 1.4 }}>
                  {item.name}
                  {item.modifiers_label && <div style={{ fontSize: scale(14), color: "var(--color-text-muted)", marginTop: 2 }}>{item.modifiers_label}</div>}
                </div>
                <div style={{ fontSize: scale(18), fontWeight: 600, marginLeft: scale(8), whiteSpace: "nowrap" }}>{fmt(item.price * item.qty)}</div>
              </div>
            ))}
            {state.cart.length === 0 && <div style={{ fontSize: scale(18), color: "var(--color-text-muted)", textAlign: "center", padding: scale(40) }}>{t("pos.no_items_found")}</div>}
          </div>
          {/* Totals */}
          <div style={{ borderTop: "2px solid var(--color-border-light)", padding: `${scale(12)}px ${scale(4)}px 0` }}>
            {state.serviceCharge > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: scale(16), color: "var(--color-text-muted)", padding: `${scale(4)}px 0` }}>
                <span>{t("pos.service_charge")}</span><span>{fmt(state.serviceCharge)}</span>
              </div>
            )}
            {state.taxAmount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: scale(16), color: "var(--color-text-muted)", padding: `${scale(4)}px 0` }}>
                <span>{t("pos.tax")}</span><span>{fmt(state.taxAmount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: scale(28), fontWeight: 800, padding: `${scale(8)}px 0 0`, color: "var(--color-primary)" }}>
              <span>{t("pos.total_due")}</span><span>{fmt(state.total)}</span>
            </div>
            {state.splitInfo && (
              <div style={{ fontSize: scale(16), fontWeight: 600, color: "#2563EB", marginTop: scale(4) }}>
                {t("pos.split_paid_of", { paid: fmt(state.splitInfo.paid), total: fmt(state.splitInfo.total) })}
                {state.splitInfo.charging != null && ` · ${t("pos.display_this_share")} ${fmt(state.splitInfo.charging)}`}
              </div>
            )}
          </div>
        </div>

        {/* Payment QR panel */}
        {showPaymentQR && (
          <div style={{ width: isLandscape ? scale(400) : "100%", display: "flex", flexDirection: isLandscape ? "column" : "row", alignItems: "center", background: "var(--color-bg-card)", borderRadius: 16, padding: scale(24), boxShadow: "0 4px 24px rgba(0,0,0,0.08)", gap: isLandscape ? 0 : scale(16) }}>
            <div style={{ fontSize: scale(22), fontWeight: 700, display: "flex", alignItems: "center", marginBottom: isLandscape ? scale(16) : 0 }}><QrIcon size={scale(28)} style={{ marginRight: 8 }} />{t("pos.scan_to_pay")}</div>
            <div style={{ width: scale(320), height: scale(320), display: "flex", alignItems: "center", justifyContent: "center", background: "white", borderRadius: 12, padding: scale(8) }}>
              {qrDataUrl ? <img src={qrDataUrl} alt={t("pos.payment_qr_alt")} style={{ width: scale(300), height: scale(300) }} /> : <Loader2 size={scale(48)} className="animate-spin" style={{ color: "var(--color-primary)" }} />}
            </div>
            <div style={{ fontSize: scale(36), fontWeight: 800, color: "var(--color-primary)", margin: `${scale(16)}px 0 ${scale(8)}px` }}>{fmt(state.total)}</div>
            <div style={{ fontSize: scale(16), color: "var(--color-text-muted)", textAlign: "center" }}>
              <Smartphone size={scale(18)} style={{ verticalAlign: "middle", marginRight: 6 }} />{t("pos.display_scan_with_phone")}
            </div>
            {state.orderNumber && <div style={{ fontSize: scale(14), color: "var(--color-text-muted)", marginTop: scale(8) }}>#{state.orderNumber}</div>}
          </div>
        )}

        {/* Payment pending */}
        {showPaymentPending && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: scale(22), fontWeight: 600, color: "var(--color-text-muted)", marginBottom: scale(16) }}>{t("pos.display_payment_in_progress")}</div>
            <div style={{ fontSize: scale(36), fontWeight: 800, color: "var(--color-primary)" }}>{fmt(state.total)}</div>
            <Loader2 size={scale(40)} className="animate-spin" style={{ color: "var(--color-primary)", marginTop: scale(16) }} />
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { width: "100vw", height: "100vh", display: "flex", flexDirection: "column", background: "var(--color-bg-page)", color: "var(--color-text-primary)", fontFamily: "var(--font-sans)", overflow: "hidden", userSelect: "none" },
};
