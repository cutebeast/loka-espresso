"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, getMarketingCampaigns, sendCampaign, type MarketingCampaign } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";

export default function MarketingCampaignsPage() {
  const router = useRouter();
  const [items, setItems] = useState<MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    return getMarketingCampaigns();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchData()
      .then((d) => { if (!cancelled) setItems(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchData]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this campaign?")) return;
    try { await api.del(`/admin/marketing/campaigns/${id}`); setItems(await fetchData()); } catch (e: any) { console.error("Failed to delete campaign:", e); }
  };

  const handleSend = async (id: number) => {
    if (!confirm("Send this campaign now?")) return;
    try { await sendCampaign(id); setItems(await fetchData()); } catch (err: any) { setError(err.message); }
  };

  const statusBadge = (s: string) => {
    const m: Record<string, string> = { draft: "badge-gray", scheduled: "badge-yellow", active: "badge-green", paused: "badge-yellow", completed: "badge-blue", cancelled: "badge-red" };
    return <span className={`badge badge-sm ${m[s] || "badge-gray"}`}>{s}</span>;
  };

  const channelLabel = (ch: string) => { const m: Record<string,string> = { push_notification: "Push", email: "Email", sms: "SMS", in_app: "In-App", whatsapp: "WhatsApp" }; return m[ch] || ch; };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Marketing Campaigns</h1><p className="page-subtitle">Multi-channel campaigns</p></div>
        <button type="button" onClick={() => router.push("/marketing/campaigns/new")} className="btn btn-primary btn-sm"><Plus size={16} /> Add Campaign</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} campaigns</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Name</th><th>Channel</th><th>Status</th><th>Scheduled</th><th>Budget</th><th style={{ width: 100 }}>Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={6} className="data-table-empty">Loading...</td></tr>
          : items.map(item => (
            <tr key={item.id} className="clickable" role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();(() => router.push(`/marketing/campaigns/${item.id}`))();}}} onClick={() => router.push(`/marketing/campaigns/${item.id}`)} style={{ cursor: "pointer" }}>
              <td><div style={{ fontWeight: 600 }}>{item.campaign_name}</div><div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{item.campaign_type}</div></td>
              <td><span className="badge badge-sm badge-blue">{channelLabel(item.channel)}</span></td>
              <td>{statusBadge(item.status)}</td>
              <td style={{ fontSize: 12 }}>{item.scheduled_at ? new Date(item.scheduled_at).toLocaleString() : "—"}</td>
              <td style={{ fontWeight: 600 }}>RM {typeof item.budget_spent === "number" ? item.budget_spent.toFixed(2) : "—"}</td>
              <td onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <button type="button" onClick={() => router.push(`/marketing/campaigns/${item.id}`)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)" }}><Edit2 size={14} /></button>
                  {(item.status === "draft" || item.status === "scheduled") && <button type="button" onClick={() => handleSend(item.id)} className="btn btn-sm btn-primary" style={{ fontSize: 11 }}>Send</button>}
                  <button type="button" onClick={() => handleDelete(item.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
