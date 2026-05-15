"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";

export default function NewTierPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    tier_key: "", display_name: "", description: "",
    min_lifetime_points: 0, sort_order: 0, is_active: true,
    points_multiplier: 1.0, color_hex: "#6B7280",
  });

  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true);
    try {
      const r: any = await api.post("/admin/loyalty/tiers", form);
      const id = r?.data?.id || r?.id;
      if (id) router.push(`/loyalty/tiers/${id}`);
      else router.push("/loyalty/tiers");
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/loyalty/tiers")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <h1 className="page-title" style={{ margin: 0 }}>New Loyalty Tier</h1>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="card" style={{ padding: 24, maxWidth: 500 }}>
        <form onSubmit={handleSubmit}><div className="df-grid">
          <div className="df-field"><label className="form-label">Tier Key *</label><input required className="w-full border rounded px-3 py-2 text-sm" value={form.tier_key} onChange={e => setForm({ ...form, tier_key: e.target.value })} placeholder="silver, gold, platinum" /></div>
          <div className="df-field"><label className="form-label">Display Name *</label><input required className="w-full border rounded px-3 py-2 text-sm" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} /></div>
          <div className="df-field"><label className="form-label">Min Lifetime Points</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.min_lifetime_points} onChange={e => setForm({ ...form, min_lifetime_points: Number(e.target.value) })} /></div>
          <div className="df-field"><label className="form-label">Points Multiplier</label><input type="number" step="0.1" className="w-full border rounded px-3 py-2 text-sm" value={form.points_multiplier} onChange={e => setForm({ ...form, points_multiplier: Number(e.target.value) })} /></div>
          <div className="df-field"><label className="form-label">Color</label><input type="color" value={form.color_hex} onChange={e => setForm({ ...form, color_hex: e.target.value })} style={{ width: 60, height: 36, padding: 2 }} /></div>
          <div className="df-field"><label className="form-label">Sort Order</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="form-label">Description</label><textarea rows={3} className="w-full border rounded px-3 py-2 text-sm" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div className="df-field"><label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active</label></div>
        </div><div className="df-actions"><button type="button" onClick={() => router.push("/loyalty/tiers")} className="btn btn-ghost">Cancel</button><button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Creating..." : "Create Tier"}</button></div></form>
      </div>
    </div>
  );
}
