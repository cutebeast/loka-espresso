"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";

export default function LoyaltyTiersPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    try { const d = await api.getRaw<any>("/admin/loyalty/tiers?per_page=50"); setItems(Array.isArray(d) ? d : (d.items||[])); } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Loyalty Tiers</h1><p className="page-subtitle">{items.length} tiers</p></div>
        <button onClick={() => router.push("/loyalty/tiers/new")} className="btn btn-primary btn-sm"><Plus size={16} /> Add Tier</button>
      </div>
      <div className="table-container" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead><tr><th>Tier</th><th>Key</th><th>Min Points</th><th>Multiplier</th><th>Sort</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="data-table-empty">Loading...</td></tr>
            : items.map(item => (
              <tr key={item.id}>
                <td><div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}><span style={{ width: 14, height: 14, borderRadius: 3, background: item.color_hex || "#ccc", display: "inline-block" }} />{item.display_name}</div></td>
                <td className="font-mono" style={{ fontSize: 12 }}>{item.tier_key}</td>
                <td>{item.min_lifetime_points?.toLocaleString() || 0}</td>
                <td>{item.points_multiplier}x</td>
                <td>{item.sort_order}</td>
                <td><span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>{item.is_active ? "Active" : "Inactive"}</span></td>
                <td>
                  <button onClick={() => router.push(`/loyalty/tiers/${item.id}`)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)", marginRight: 4 }}><Edit2 size={14} /></button>
                  <button onClick={async () => { if (confirm("Delete?")) { await api.del(`/admin/loyalty/tiers/${item.id}`); fetch(); } }} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
