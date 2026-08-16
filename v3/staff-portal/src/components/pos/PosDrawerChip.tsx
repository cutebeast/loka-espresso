"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import Drawer from "@/components/Drawer";
import {
  closePosSession,
  getPosSessionCurrent,
  openPosSession,
  type PosSession,
} from "@/lib/api";
import { Vault } from "lucide-react";

function money(v: string | number | null | undefined): string {
  const n = typeof v === "string" ? parseFloat(v) : v ?? 0;
  return (isNaN(n as number) ? 0 : (n as number)).toFixed(2);
}

/** Cash drawer chip for the POS header — shows the store's open drawer
 * (expected cash) and opens the open/close drawer dialogs (Z-report). */
export default function PosDrawerChip() {
  const { t } = useTranslation();
  const [session, setSession] = useState<PosSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [doneMsg, setDoneMsg] = useState("");

  const refresh = useCallback(async () => {
    try {
      const d = await getPosSessionCurrent();
      setSession(d.session ?? null);
    } catch {
      /* chip stays in last known state */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const live = session?.live ?? null;
  const counted = parseFloat(amount);
  const variance = live && !isNaN(counted) ? counted - parseFloat(live.expected_cash) : null;

  const handleOpen = async () => {
    if (isNaN(counted) || counted < 0) { setError(t("pos.drawer_float") + " ?"); return; }
    setSaving(true); setError("");
    try {
      const d = await openPosSession(counted);
      setSession(d.session);
      setDialogOpen(false); setAmount(""); setNotes("");
      setDoneMsg(t("pos.drawer_opened_msg"));
      setTimeout(() => setDoneMsg(""), 3000);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleClose = async () => {
    if (isNaN(counted) || counted < 0) { setError(t("pos.drawer_counted") + " ?"); return; }
    setSaving(true); setError("");
    try {
      await closePosSession(counted, notes || undefined);
      setSession(null);
      setDialogOpen(false); setAmount(""); setNotes("");
      setDoneMsg(t("pos.drawer_closed_msg"));
      setTimeout(() => setDoneMsg(""), 3000);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  if (!loaded) return null;

  const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" };

  return (
    <>
      <button
        type="button"
        className={`badge badge-sm ${session ? "badge-primary" : ""}`}
        style={{
          display: "flex", alignItems: "center", gap: 4, cursor: "pointer", border: "none",
          minHeight: 34, padding: "6px 12px",
          ...(session ? {} : { background: "var(--color-warning-light, #FEF3C7)", color: "var(--color-warning, #8A7030)" }),
        }}
        onClick={() => { setError(""); setAmount(""); setNotes(""); setDialogOpen(true); if (session) refresh(); }}
        title={t("pos.drawer")}
      >
        <Vault size={11} />
        {session ? `RM ${money(live?.expected_cash ?? session.opening_cash)}` : t("pos.drawer_closed")}
      </button>
      {doneMsg && <span style={{ fontSize: 12, color: "var(--color-success, #15803D)", fontWeight: 600 }}>{doneMsg}</span>}

      <Drawer open={dialogOpen} onClose={() => setDialogOpen(false)} title={t("pos.drawer")} position="bottom">
        {session && live ? (
          <>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
              {t("pos.drawer_open_since")}: {new Date(session.opened_at).toLocaleString()}
            </div>
            <div style={row}><span>{t("pos.drawer_float")}</span><b>RM {money(live.opening_cash)}</b></div>
            <div style={row}><span>{t("pos.drawer_cash_sales")}</span><b>RM {money(live.sales_cash)}</b></div>
            <div style={row}><span>{t("pos.drawer_refunds")}</span><b>− RM {money(live.cash_refunds)}</b></div>
            <div style={row}><span>{t("pos.drawer_card_sales")}</span><b>RM {money(live.sales_card)}</b></div>
            <div style={row}><span>{t("pos.drawer_qr_sales")}</span><b>RM {money(live.sales_qr)}</b></div>
            <div style={row}><span>{t("pos.drawer_orders")}</span><b>{live.order_count}</b></div>
            <div style={{ ...row, borderTop: "1px solid var(--color-border-light)", marginTop: 4, paddingTop: 8, fontSize: 14 }}>
              <span>{t("pos.drawer_expected")}</span><b>RM {money(live.expected_cash)}</b>
            </div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, margin: "10px 0 4px" }}>{t("pos.drawer_counted")}</label>
            <input className="form-input" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            {variance !== null && (
              <div style={{ ...row, fontWeight: 700, color: Math.abs(variance) < 0.005 ? "var(--color-success, #15803D)" : "var(--color-error, #B91C1C)" }}>
                <span>{t("pos.drawer_variance")}</span><b>{variance >= 0 ? "+" : "−"} RM {money(Math.abs(variance))}</b>
              </div>
            )}
            {variance !== null && Math.abs(variance) >= 0.005 && (
              <>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, margin: "8px 0 4px" }}>{t("pos.drawer_notes")}</label>
                <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("pos.drawer_notes")} />
              </>
            )}
            {error && <p style={{ color: "var(--color-error, #B91C1C)", fontSize: 12, marginTop: 8 }}>{error}</p>}
            <button type="button" className="btn btn-primary" style={{ width: "100%", marginTop: 14 }} disabled={saving} onClick={handleClose}>
              {saving ? "…" : t("pos.drawer_close_btn")}
            </button>
          </>
        ) : (
          <>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, margin: "4px 0 4px" }}>{t("pos.drawer_float")}</label>
            <input className="form-input" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
            {error && <p style={{ color: "var(--color-error, #B91C1C)", fontSize: 12, marginTop: 8 }}>{error}</p>}
            <button type="button" className="btn btn-primary" style={{ width: "100%", marginTop: 14 }} disabled={saving} onClick={handleOpen}>
              {saving ? "…" : t("pos.drawer_open_btn")}
            </button>
          </>
        )}
      </Drawer>
    </>
  );
}
