"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface Banner { id: number; title: string; short_description?: string; action_type?: string; voucher_display_title?: string; start_date?: string; end_date?: string; is_active: boolean; }

const ACTION_TYPES = [{ value: "read_claim", label: "Read & Claim" }, { value: "url_claim", label: "Visit Link & Claim" }, { value: "survey_claim", label: "Survey & Claim" }];

export default function PromotionsPage() {
  const router = useRouter();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchBanners = useCallback(() => { api.get<{ items: Banner[] }>("/admin/promo-banners?per_page=100")
      .then(d => setBanners(Array.isArray(d) ? d : (d.items || [])))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false)); }, []);

  useEffect(() => { fetchBanners(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this promotion?")) return;
    try { await api.del(`/admin/promo-banners/${id}`); fetchBanners(); } catch { /* ignore */ }
  };

  const actionBadge = (t: string) => {
    const m: Record<string, string> = { read_claim: "badge-green", survey_claim: "badge-blue", url_claim: "badge-yellow" };
    return <span className={`badge badge-sm ${m[t] || "badge-gray"}`}>{(ACTION_TYPES.find(a => a.value === t) || {} as any).label || t || "—"}</span>;
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Promotions</h1><p className="page-subtitle">Gatekeeper banners — reward vouchers via actions</p></div>
        <button onClick={() => router.push("/promotions/new")} className="btn btn-primary btn-sm"><Plus size={16} /> Add Promotion</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)", padding: 12, marginBottom: 16, fontSize: 13, color: "var(--color-text-muted)" }}>
        <strong>3 Action Types:</strong> <em>Read & Claim</em> · <em>Visit Link & Claim</em> · <em>Survey & Claim</em>
      </div>
      <div className="table-header-bar"><span className="text-sm font-semibold">{banners.length} promotions</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Title</th><th>Action</th><th>Voucher</th><th>Dates</th><th style={{ width: 80 }}>Status</th><th style={{ width: 80 }}>Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={6} className="data-table-empty">Loading...</td></tr>
            : banners.map(b => (
              <tr key={b.id} className="clickable" role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();(() => router.push(`/promotions/${b.id}`))();}}} onClick={() => router.push(`/promotions/${b.id}`)} style={{ cursor: "pointer" }}>
                <td><div style={{ fontWeight: 600 }}>{b.title}</div>{b.short_description && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{b.short_description.slice(0, 60)}</div>}</td>
                <td>{actionBadge(b.action_type || "")}</td>
                <td style={{ fontSize: 12 }}>{b.voucher_display_title || "—"}</td>
                <td style={{ fontSize: 12 }}>{b.start_date ? b.start_date.slice(0, 10) : "—"} {b.end_date ? `→ ${b.end_date.slice(0, 10)}` : ""}</td>
                <td onClick={e => e.stopPropagation()}><span className={`badge badge-sm ${b.is_active ? "badge-green" : "badge-gray"}`}>{b.is_active ? "Active" : "Inactive"}</span></td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button onClick={() => router.push(`/promotions/${b.id}`)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)" }}><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(b.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table></div>
    </div>
  );
}
