"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";

export default function NewAllergenPage() {
  const r = useRouter();
  const [f, setF] = useState({ allergen_key: "", display_name: "", description: "", severity: "high", color_hex: "#EF4444" });
  const [s, setS] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setS(true);
    try {
      const x: any = await api.post("/admin/menu/allergens", f);
      const id = x?.data?.id || x?.id;
      if (id) r.push(`/menu/allergens/${id}`);
    } catch {} finally { setS(false); }
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => r.push("/menu/allergens")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <h1 className="page-title" style={{ margin: 0 }}>New Allergen</h1>
      </div>
      <form onSubmit={submit}>
        <div className="card" style={{ padding: 24, maxWidth: 500 }}>
          <div className="df-grid">
            <div className="df-field"><label className="form-label">Display Name *</label><input required className="w-full border rounded px-3 py-2 text-sm" value={f.display_name} onChange={e => setF({ ...f, display_name: e.target.value })} /></div>
            <div className="df-field"><label className="form-label">Key *</label><input required className="w-full border rounded px-3 py-2 text-sm" value={f.allergen_key} onChange={e => setF({ ...f, allergen_key: e.target.value })} /></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="form-label">Description</label><input className="w-full border rounded px-3 py-2 text-sm" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
            <div className="df-field">
              <label className="form-label">Severity</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={f.severity} onChange={e => setF({ ...f, severity: e.target.value })}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
            </div>
            <div className="df-field">
              <label className="form-label">Badge Color</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="color" value={f.color_hex} onChange={e => setF({ ...f, color_hex: e.target.value })} style={{ width: 40, height: 36, border: "none", cursor: "pointer" }} />
                <input className="border rounded px-3 py-2 text-sm" style={{ flex: 1 }} value={f.color_hex} onChange={e => setF({ ...f, color_hex: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="df-actions">
            <button type="button" onClick={() => r.push("/menu/allergens")} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={s} className="btn btn-primary"><Save size={16} /> {s ? "Creating..." : "Create"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
