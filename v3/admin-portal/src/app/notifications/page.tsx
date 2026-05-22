"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2, Send, Archive, Undo, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useAudienceSegments } from "@/lib/useAudienceSegments";

const PAGE_SIZE = 20;
const TYPE_LABELS: Record<string, string> = { general: "General", order: "Order", reward: "Reward", wallet: "Wallet", loyalty: "Loyalty", promo: "Promo", info: "Info", event: "Event" };

interface Notif { id: number; title: string; body?: string; notification_type: string; audience_segment: string; status: string; scheduled_at?: string; sent_at?: string; is_archived: boolean; created_at: string; }

export default function NotificationsPage() {
  const router = useRouter();
  const { allSegments } = useAudienceSegments();
  const AUD_LABELS = Object.fromEntries(allSegments.map(s => [s.value, s.label]));
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const fetchData = useCallback(async (p: number = 1) => {
    const params = new URLSearchParams({ page: String(p), per_page: String(PAGE_SIZE), is_archived: String(tab === "archived") });
    return api.getRaw<{ items: Notif[]; total: number; total_pages: number }>(`/admin/notifications?${params}`);
  }, [tab]);

  const applyData = useCallback((d: { items: Notif[]; total: number; total_pages: number }, p: number) => {
    setItems(d.items || []); setTotal(d.total || 0); setTotalPages(d.total_pages || 1); setPage(p);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchData(1)
      .then((d) => { if (!cancelled) applyData(d, 1); })
      .catch((e: any) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchData, applyData]);

  const sendNow = async (id: number) => { if (!confirm("Send now?")) return; try { await api.post(`/admin/notifications/${id}/send`, {}); applyData(await fetchData(page), page); } catch (e: any) { setError(e.message); } };
  const toggleArchive = async (id: number) => { try { await api.patch(`/admin/notifications/${id}/archive`, {}); applyData(await fetchData(page), page); } catch (e) { console.error(e); }; };
  const handleDelete = async (id: number) => { try { await api.del(`/admin/notifications/${id}`); setConfirmDelete(null); applyData(await fetchData(page), page); } catch (e) { console.error(e); }; };

  const statusBadge = (s: string, scheduled?: string) => {
    if (scheduled && s === "draft") return <span className="badge badge-sm badge-yellow"><Clock size={10} /> Scheduled</span>;
    const m: Record<string, { l: string; c: string }> = { draft: { l: "Draft", c: "badge-gray" }, scheduled: { l: "Scheduled", c: "badge-yellow" }, sent: { l: "Sent", c: "badge-green" }, failed: { l: "Failed", c: "badge-red" } };
    const i = m[s] || { l: s, c: "badge-gray" };
    return <span className={`badge badge-sm ${i.c}`}>{i.l}</span>;
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Notifications</h1><p className="page-subtitle">Push notifications sent to PWA users · {total} total</p></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => router.push("/notifications/templates")} className="btn btn-sm btn-outline">📋 Templates</button>
          <button onClick={() => router.push("/notifications/report")} className="btn btn-sm btn-outline">📊 Report</button>
          <button onClick={() => router.push("/notifications/new")} className="btn btn-primary btn-sm"><Plus size={16} /> New Notification</button>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select value={tab} onChange={e => { setTab(e.target.value as any); setPage(1); }} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
          <option value="active">Active</option><option value="archived">Archived</option>
        </select>
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} of {total} notifications</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Title</th><th>Type</th><th>Audience</th><th>Status</th><th>Date</th><th style={{ width: 120 }}>Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={6} className="data-table-empty">Loading...</td></tr>
          : items.length === 0 ? <tr><td colSpan={6} className="data-table-empty">No notifications.</td></tr>
          : items.map(n => (
            <tr key={n.id} className="clickable" role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();(() => router.push(`/notifications/${n.id}`))();}}} onClick={() => router.push(`/notifications/${n.id}`)} style={{ cursor: "pointer" }}>
              <td><div style={{ fontWeight: 600 }}>{n.title}</div>{n.body && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{n.body.slice(0, 60)}</div>}</td>
              <td><span className="badge badge-sm badge-outline">{TYPE_LABELS[n.notification_type] || n.notification_type}</span></td>
              <td>{AUD_LABELS[n.audience_segment] || n.audience_segment}</td>
              <td>{statusBadge(n.status, n.scheduled_at)}</td>
              <td style={{ fontSize: 12 }}>{n.sent_at ? `Sent ${new Date(n.sent_at).toLocaleDateString()}` : n.scheduled_at ? `Scheduled ${new Date(n.scheduled_at).toLocaleDateString()}` : new Date(n.created_at).toLocaleDateString()}</td>
              <td onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {n.status === "draft" && <><button onClick={() => sendNow(n.id)} className="btn btn-ghost btn-sm" title="Send now" style={{ color: "#16A34A" }}><Send size={14} /></button><button onClick={() => router.push(`/notifications/${n.id}`)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)" }}><Edit2 size={14} /></button>
                    {confirmDelete === n.id ? <><button onClick={() => handleDelete(n.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)", fontWeight: 600 }}>✓</button><button onClick={() => setConfirmDelete(null)} className="btn btn-ghost btn-sm">✕</button></> : <button onClick={() => setConfirmDelete(n.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>}
                  </>}
                  <button onClick={() => toggleArchive(n.id)} className="btn btn-ghost btn-sm" title={n.is_archived ? "Unarchive" : "Archive"}>{n.is_archived ? <Undo size={14} /> : <Archive size={14} />}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "center", marginTop: 16 }}>
          <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={async () => { applyData(await fetchData(page - 1), page - 1); }}><ChevronLeft size={14} /> Prev</button>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Page {page} of {totalPages}</span>
          <button className="btn btn-sm btn-ghost" disabled={page >= totalPages} onClick={async () => { applyData(await fetchData(page + 1), page + 1); }}>Next <ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}
