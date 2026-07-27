"use client";

import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import Drawer from "@/components/Drawer";
import { CloudOff, RotateCw } from "lucide-react";
import type { QueuedOrder } from "@/lib/offlineQueue";

function money(v: number): string {
  return (Number.isFinite(v) ? v : 0).toFixed(2);
}

/** Offline queue chip for the POS header — shows queued-order count and
 * opens a drawer listing each queued sale with its sync status. */
export default function PosOfflineQueueChip({
  items,
  onRetry,
}: {
  items: QueuedOrder[];
  onRetry: (clientRef: string) => void;
}) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (items.length === 0) return null;

  const statusLabel = (s: QueuedOrder["status"]) =>
    s === "failed" ? t("pos.offline_failed") : s === "syncing" ? t("pos.offline_syncing") : t("pos.offline_pending");
  const statusColor = (s: QueuedOrder["status"]) =>
    s === "failed" ? "var(--color-error, #B91C1C)" : s === "syncing" ? "var(--color-info, #1D4ED8)" : "var(--color-warning, #8A7030)";

  return (
    <>
      <button
        type="button"
        className="badge badge-sm"
        style={{
          display: "flex", alignItems: "center", gap: 4, cursor: "pointer", border: "none",
          background: "var(--color-warning-light, #FEF3C7)", color: "var(--color-warning, #8A7030)",
        }}
        onClick={() => setDialogOpen(true)}
        title={t("pos.offline_queue_title")}
      >
        <CloudOff size={11} />
        {t("pos.offline_queue_chip", { count: items.length })}
      </button>

      <Drawer open={dialogOpen} onClose={() => setDialogOpen(false)} title={t("pos.offline_queue_title")} position="bottom">
        {items.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{t("pos.offline_queue_empty")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((q) => (
              <div key={q.client_ref} className="card" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{q.summary}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                      {new Date(q.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t("pos.currency_symbol")}{money(q.total)}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: statusColor(q.status) }}>{statusLabel(q.status)}</div>
                  </div>
                </div>
                {q.error && (
                  <div style={{ fontSize: 11, color: "var(--color-error, #B91C1C)", marginTop: 6 }}>{q.error}</div>
                )}
                {q.status === "failed" && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}
                    onClick={() => onRetry(q.client_ref)}
                  >
                    <RotateCw size={12} />{t("pos.offline_retry")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </>
  );
}
