"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { api } from "@/lib/api";
import { Scissors, RefreshCw } from "lucide-react";

interface SplitItem {
  line_item_id: number;
  item_name: string | null;
  unit_price: number;
  ordered_qty: number;
  paid_qty: number;
  remaining_qty: number;
  remaining_amount: number;
}
interface SplitState {
  total_amount: number;
  total_paid: number;
  remaining_due: number;
  fully_paid: boolean;
  lines: SplitItem[];
}
export interface SplitSelection {
  mode: "full" | "items" | "even";
  allocations: { line_item_id: number; quantity: number }[];
  chargeAmount: number | null;
  shareTotal: number;
}

export default function PosSplitBillSection({
  orderId,
  currencySymbol,
  refreshKey,
  onSplitChange,
  onSplitStateChange,
}: {
  orderId: string;
  currencySymbol: string;
  refreshKey: string | number;
  onSplitChange: (sel: SplitSelection) => void;
  onSplitStateChange?: (info: { paid: number; total: number } | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SplitState | null>(null);
  const [mode, setMode] = useState<"full" | "items" | "even">("full");
  const [itemQty, setItemQty] = useState<Record<number, number>>({});
  const [evenN, setEvenN] = useState(2);

  const load = useCallback(async () => {
    try {
      const res = await api.getRaw<{ data: SplitState }>(`/staff/orders/${orderId}/split-state`);
      setState((res as any)?.data ?? (res as any));
    } catch (e) {
      console.error("split-state:", e);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Reset item quantities whenever the state reloads (after a share is paid)
  useEffect(() => {
    setItemQty({});
    setMode("full");
  }, [state?.total_paid]);

  // Echo the paid/total progress upward (customer display shows it)
  useEffect(() => {
    onSplitStateChange?.(state ? { paid: state.total_paid, total: state.total_amount } : null);
  }, [state, onSplitStateChange]);

  const selectedTotal = useMemo(() => {
    if (!state) return 0;
    return state.lines.reduce((sum, li) => sum + (itemQty[li.line_item_id] || 0) * li.unit_price, 0);
  }, [state, itemQty]);

  const evenShare = state && evenN > 0 ? state.remaining_due / evenN : 0;

  // Emit selection upward
  useEffect(() => {
    if (!state) return;
    if (!open || mode === "full") {
      onSplitChange({ mode: "full", allocations: [], chargeAmount: null, shareTotal: state.remaining_due });
      return;
    }
    if (mode === "items") {
      const allocations = Object.entries(itemQty)
        .filter(([, q]) => q > 0)
        .map(([id, q]) => ({ line_item_id: Number(id), quantity: q }));
      onSplitChange({ mode: "items", allocations, chargeAmount: null, shareTotal: Math.round(selectedTotal * 100) / 100 });
      return;
    }
    onSplitChange({ mode: "even", allocations: [], chargeAmount: Math.round(evenShare * 100) / 100, shareTotal: Math.round(evenShare * 100) / 100 });
  }, [open, mode, itemQty, evenN, state, selectedTotal, evenShare, onSplitChange]);

  if (!state || state.fully_paid) return null;
  if (state.lines.length < 2 && !open) {
    // Single line item — even split may still be useful, so keep the toggle
  }

  const setQty = (id: number, qty: number, max: number) => {
    setItemQty(prev => ({ ...prev, [id]: Math.max(0, Math.min(max, qty)) }));
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        aria-expanded={open}
      >
        <Scissors size={16} />
        <span style={{ fontSize: 14, fontWeight: 700 }}>{t("pos.split_bill")}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-text-muted)" }}>
          {t("pos.split_paid_of", { paid: `${currencySymbol}${state.total_paid.toFixed(2)}`, total: `${currencySymbol}${state.total_amount.toFixed(2)}` })}
        </span>
        <RefreshCw size={13} style={{ opacity: 0.4, transform: open ? "rotate(180deg)" : undefined }} />
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(["full", "items", "even"] as const).map(m => (
              <button key={m} className={`btn btn-sm flex-1 ${mode === m ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode(m)}>
                {t(`pos.split_mode_${m}`)}
              </button>
            ))}
          </div>

          {mode === "items" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                {state.lines.filter(li => li.remaining_qty > 0).map(li => {
                  const q = itemQty[li.line_item_id] || 0;
                  return (
                    <div key={li.line_item_id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <div style={{ flex: 1 }}>
                        {li.item_name}
                        {li.paid_qty > 0 && <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}> ({t("pos.split_qty_left", { n: li.remaining_qty })})</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setQty(li.line_item_id, q - 1, li.remaining_qty)}>−</button>
                        <span style={{ minWidth: 20, textAlign: "center", fontWeight: 700 }}>{q}</span>
                        <button className="btn btn-ghost btn-sm" onClick={() => setQty(li.line_item_id, q + 1, li.remaining_qty)}>+</button>
                      </div>
                      <div style={{ width: 70, textAlign: "right", fontWeight: 600 }}>{currencySymbol}{(q * li.unit_price).toFixed(2)}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid var(--color-border-light)", paddingTop: 8 }}>
                <span>{t("pos.split_selected")}</span>
                <span>{currencySymbol}{selectedTotal.toFixed(2)}</span>
              </div>
            </>
          )}

          {mode === "even" && (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {[2, 3, 4, 5, 6].map(n => (
                  <button key={n} className={`btn btn-sm ${evenN === n ? "btn-primary" : "btn-ghost"}`} onClick={() => setEvenN(n)}>{n}</button>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>{t("pos.split_each_share", { n: evenN })}</span>
                <span>{currencySymbol}{evenShare.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
