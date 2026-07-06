"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, getMarketingCampaigns, sendCampaign, type MarketingCampaign } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
export default function MarketingCampaignsPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const {
    format
  } = useCurrency();
  const [items, setItems] = useState<MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fetchData = useCallback(async () => {
    return getMarketingCampaigns();
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetchData().then(d => {
      if (!cancelled) setItems(d);
    }).catch(e => {
      if (!cancelled) setError(e.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchData]);
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this campaign?")) return;
    setDeletingId(id);
    try {
      await api.del(`/admin/marketing/campaigns/${id}`);
      setItems(await fetchData());
    } catch (e: any) {
      console.error("Failed to delete campaign:", e);
    } finally {
      setDeletingId(null);
    }
  };
  const handleSend = async (id: number) => {
    if (!confirm("Send this campaign now?")) return;
    try {
      await sendCampaign(id);
      setItems(await fetchData());
    } catch (err: any) {
      setError(err.message);
    }
  };
  const statusBadge = (s: string) => {
    const m: Record<string, string> = {
      draft: "badge-gray",
      scheduled: "badge-yellow",
      active: "badge-green",
      paused: "badge-yellow",
      completed: "badge-blue",
      cancelled: "badge-red"
    };
    return <span className={`badge badge-sm ${m[s] || "badge-gray"}`}>{s}</span>;
  };
  const channelLabel = (ch: string) => {
    const m: Record<string, string> = {
      push_notification: "Push",
      email: "Email",
      sms: "SMS",
      in_app: "In-App",
      whatsapp: "WhatsApp"
    };
    return m[ch] || ch;
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div><h1 className="page-title">{t("marketing_campaigns.marketing_campaigns")}</h1><p className="page-subtitle">{t("marketing_campaigns.multi_channel_campaigns")}</p></div>
        <button type="button" onClick={() => router.push("/marketing/campaigns/new")} className="btn btn-primary btn-sm"><Plus size={16} />{t("marketing_campaigns.add_campaign")}</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length}{t("marketing_campaigns.campaigns")}</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>{t("marketing_campaigns.name")}</th><th>{t("marketing_campaigns.channel")}</th><th>{t("marketing_campaigns.status")}</th><th>{t("marketing_campaigns.scheduled")}</th><th>{t("marketing_campaigns.budget")}</th><th style={{
              width: 100
            }}>{t("marketing_campaigns.actions")}</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={6} className="data-table-empty">{t("marketing_campaigns.loading")}</td></tr> : items.map(item => <tr key={item.id} className="clickable" role="button" tabIndex={0} onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              (() => router.push(`/marketing/campaigns/${item.id}`))();
            }
          }} onClick={() => router.push(`/marketing/campaigns/${item.id}`)} style={{
            cursor: "pointer"
          }}>
              <td><div style={{
                fontWeight: 600
              }}>{item.campaign_name}</div><div style={{
                fontSize: 11,
                color: "var(--color-text-muted)"
              }}>{item.campaign_type}</div></td>
              <td><span className="badge badge-sm badge-blue">{channelLabel(item.channel)}</span></td>
              <td>{statusBadge(item.status)}</td>
              <td style={{
              fontSize: 12
            }}>{item.scheduled_at ? new Date(item.scheduled_at).toLocaleString() : "—"}</td>
              <td style={{
              fontWeight: 600
            }}>{typeof item.budget_spent === "number" ? format(item.budget_spent) : "—"}</td>
              <td onClick={e => e.stopPropagation()}>
                <div style={{
                display: "flex",
                gap: 4,
                alignItems: "center"
              }}>
                  <button type="button" onClick={() => router.push(`/marketing/campaigns/${item.id}`)} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-info)"
                }}><Edit2 size={14} /></button>
                  {(item.status === "draft" || item.status === "scheduled") && <button type="button" onClick={() => handleSend(item.id)} className="btn btn-sm btn-primary" style={{
                  fontSize: 11
                }}>{t("marketing_campaigns.send")}</button>}
                  <button type="button" onClick={() => handleDelete(item.id)} disabled={deletingId === item.id} className="btn btn-ghost btn-sm" style={{
                  color: deletingId === item.id ? "var(--color-text-muted)" : "var(--color-error)"
                }}><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>)}
        </tbody>
      </table></div>
    </div>;
}