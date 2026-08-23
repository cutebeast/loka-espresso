"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

/** Transactional send log — every auto-notification the engine delivered. */
export default function NotificationEventsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [eventKey, setEventKey] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.getRaw<any>(
        `/admin/notifications/events-log?page=${page}&per_page=20${eventKey ? `&event_key=${encodeURIComponent(eventKey)}` : ""}`
      );
      setRows(d?.items || []);
      setTotal(d?.total || 0);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, eventKey]);

  const fmt = (v: string) => (v ? new Date(v).toLocaleString() : "—");

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/notifications/templates")} className="btn btn-ghost btn-sm">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>
            {t("notifications_events.title")}
          </h1>
          <p className="page-subtitle">{t("notifications_events.subtitle", { count: total })}</p>
        </div>
      </div>

      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <label className="df-label">{t("notifications_events.filter_event")}</label>
        <select value={eventKey} onChange={(e) => { setEventKey(e.target.value); setPage(1); }}>
          <option value="">{t("notifications_events.all_events")}</option>
          {["welcome", "order_confirmed", "order_preparing", "order_ready", "order_out_for_delivery", "order_delivered", "order_cancelled", "refund_processed", "payment_reminder", "voucher_granted", "reward_redeemed", "wallet_topup", "tier_upgrade", "referral_credited", "points_expiring_soon", "lucky_draw_win", "reservation_reminder"].map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--color-bg-light)", textAlign: "left" }}>
              <th style={th}>{t("notifications_events.col_event")}</th>
              <th style={th}>{t("notifications_events.col_customer")}</th>
              <th style={th}>{t("notifications_events.col_message")}</th>
              <th style={th}>{t("notifications_events.col_entity")}</th>
              <th style={th}>{t("notifications_events.col_time")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--color-border-light)" }}>
                <td style={td}><code style={{ fontSize: 12 }}>{r.event_key}</code></td>
                <td style={td}>{r.customer_name || `#${r.customer_id}`}</td>
                <td style={td}>{r.message_title || "—"}</td>
                <td style={td}>{r.entity_type}:{r.entity_id}</td>
                <td style={td}>{fmt(r.created_at)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...td, textAlign: "center", color: "var(--color-text-muted)", padding: 32 }}>
                  {t("notifications_events.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("notifications_events.prev")}
          </button>
          <span style={{ fontSize: 13 }}>
            {t("notifications_events.page_of", { page, totalPages: Math.ceil(total / 20) })}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>
            {t("notifications_events.next")}
          </button>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600, fontSize: 12 };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top" };
