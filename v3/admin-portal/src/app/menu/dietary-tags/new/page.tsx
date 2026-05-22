"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";

const EMOJIS = ["🥬","🥗","🌾","🥛","🥜","✅","🔥","❄️","☕","💤","🍬","🌶️","🥐","⭐","🌸","🆕","🚫","💪","🥩","🧀","🍳","🍞","🍪","🍩","🧁","🎂","🍫","🍯","🥤","🧊","🍵","🌿","🍃","🍓","🍒","🍎","🍊","🍋","🍌","🥭","🥥","🥑","🌽","🥕","🧄","🧅","🍕","🍔","🌮","🥪","🍜","🍝","🥟","🍱","🍲","🥘","🍿","🧈","🫒","🧂","🥄"];

export default function NewDietaryTagPage() {
  const r = useRouter();
  const [f, setF] = useState({ tag_key: "", display_name: "", icon: "", color_hex: "#22C55E" });
  const [saving, setSaving] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const x: any = await api.post("/admin/menu/dietary-tags", f);
      const id = x?.data?.id || x?.id;
      if (id) r.push(`/menu/dietary-tags/${id}`);
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => r.push("/menu/dietary-tags")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <h1 className="page-title" style={{ margin: 0 }}>New Dietary Tag</h1>
      </div>
      <form onSubmit={submit}>
        <div className="card" style={{ padding: 24, maxWidth: 500 }}>
          <div className="df-grid">
            <div className="df-field">
              <label className="form-label">Display Name *</label>
              <input required className="w-full border rounded px-3 py-2 text-sm" value={f.display_name} onChange={e => setF({ ...f, display_name: e.target.value })} />
            </div>
            <div className="df-field">
              <label className="form-label">Key *</label>
              <input required className="w-full border rounded px-3 py-2 text-sm" value={f.tag_key} onChange={e => setF({ ...f, tag_key: e.target.value })} />
            </div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}>
              <label className="form-label">Icon</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button" onClick={() => setShowEmoji(!showEmoji)}
                  style={{ fontSize: 22, width: 44, height: 44, border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", background: "white", cursor: "pointer" }}>
                  {f.icon || "🥬"}
                </button>
                <input className="border rounded px-3 py-2 text-sm" style={{ flex: 1 }} value={f.icon} onChange={e => setF({ ...f, icon: e.target.value })} placeholder="Or type emoji" />
              </div>
              {showEmoji && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 420, padding: 8, background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)" }}>
                  {EMOJIS.map(e => (
                    <button key={e} type="button" onClick={() => { setF({ ...f, icon: e }); setShowEmoji(false); }}
                      style={{ fontSize: 20, width: 34, height: 34, border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", cursor: "pointer", background: f.icon === e ? "rgba(59,74,26,0.15)" : "white" }}>
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="df-field">
              <label className="form-label">Color</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="color" value={f.color_hex} onChange={e => setF({ ...f, color_hex: e.target.value })} style={{ width: 40, height: 36, border: "none", cursor: "pointer" }} />
                <input className="border rounded px-3 py-2 text-sm" style={{ flex: 1 }} value={f.color_hex} onChange={e => setF({ ...f, color_hex: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="df-actions">
            <button type="button" onClick={() => r.push("/menu/dietary-tags")} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Creating..." : "Create"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
