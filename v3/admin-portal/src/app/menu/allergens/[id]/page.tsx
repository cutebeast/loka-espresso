"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";

const LOCALES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ms", label: "BM", flag: "🇲🇾" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "ta", label: "தமிழ்", flag: "🇮🇳" },
  { code: "tr", label: "TR", flag: "🇹🇷" },
];

const FIELDS = [
  { key: "display_name", label: "Display Name" },
  { key: "description", label: "Description" },
];

const SEVERITY_OPTIONS = [
  { value: "low", label: "Low", color: "#166534" },
  { value: "medium", label: "Medium", color: "#92400E" },
  { value: "high", label: "High", color: "#991B1B" },
  { value: "critical", label: "Critical", color: "#7C3AED" },
];

export default function AllergenEditPage() {
  const p = useParams();
  const r = useRouter();
  const id = Number(p.id);
  const [form, setForm] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [activeLocale, setActiveLocale] = useState("en");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [regen, setRegen] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get<Record<string, any>>(`/admin/menu/allergens/${id}`).then(d => {
      if (d) {
        setForm(d);
        setTranslations((d as any).translations || {});
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      await api.patch(`/admin/menu/allergens/${id}`, form);
      setMsg("Saved");
      setTimeout(() => setMsg(""), 2000);
    } catch (e: any) {
      setMsg(e.message || "Failed to save");
    } finally { setSaving(false); }
  };

  const saveTranslation = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      FIELDS.forEach(f => {
        const key = `${f.key}_${activeLocale}`;
        if (form[key] !== undefined) payload[f.key] = form[key];
      });
      await api.post("/admin/translations", {
        table_name: "allergens",
        record_id: id,
        locale: activeLocale,
        fields: payload,
      });
      setTranslations(prev => ({ ...prev, [activeLocale]: JSON.stringify(payload) }));
      setMsg("Translation saved");
    } catch (e: any) {
      setMsg(e.message || "Failed");
    } finally { setSaving(false); }
  };

  const regenTranslations = async () => {
    setRegen(true);
    setMsg("");
    try {
      await api.post("/admin/translations/regen", { table_name: "allergens", record_id: id });
      setMsg("Translations regenerated");
    } catch (e: any) { setMsg(e.message || "Failed"); }
    finally { setRegen(false); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", opacity: 0.5 }}>Loading...</div>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => r.push("/menu/allergens")} className="btn btn-ghost btn-sm">
          <ArrowLeft size={18} />
        </button>
        <h1 className="page-title" style={{ margin: 0 }}>Edit Allergen</h1>
        <div style={{ flex: 1 }} />
        {msg && <span style={{ fontSize: 12, color: msg === "Saved" ? "var(--color-success)" : "var(--color-error)" }}>{msg}</span>}
        <button onClick={regenTranslations} disabled={regen} className="btn btn-ghost btn-sm" title="Regenerate all translations">
          <RefreshCw size={14} /> {regen ? "..." : "Re-translate"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {LOCALES.map(loc => (
          <button key={loc.code} onClick={() => setActiveLocale(loc.code)}
            style={{
              padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: activeLocale === loc.code ? "2px solid var(--color-primary)" : "1px solid var(--color-border-light)",
              background: activeLocale === loc.code ? "rgba(59,74,26,0.08)" : "white",
              cursor: "pointer",
            }}>
            {loc.flag} {loc.label}
          </button>
        ))}
      </div>

      {activeLocale === "en" ? (
        <div className="card" style={{ padding: 24, maxWidth: 500 }}>
          <div className="df-grid">
            <div className="df-field">
              <label className="form-label">Allergen Key</label>
              <input className="w-full border rounded px-3 py-2 text-sm" value={form.allergen_key || ""} onChange={e => setForm({ ...form, allergen_key: e.target.value })} disabled />
            </div>
            <div className="df-field">
              <label className="form-label">Display Name *</label>
              <input required className="w-full border rounded px-3 py-2 text-sm" value={form.display_name || ""} onChange={e => setForm({ ...form, display_name: e.target.value })} />
            </div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}>
              <label className="form-label">Description</label>
              <input className="w-full border rounded px-3 py-2 text-sm" value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="df-field">
              <label className="form-label">Severity</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={form.severity || "high"} onChange={e => setForm({ ...form, severity: e.target.value })}>
                {SEVERITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="df-field">
              <label className="form-label">Color</label>
              <input type="color" className="w-full border rounded px-3 py-2 text-sm" value={form.color_hex || "#991B1B"} onChange={e => setForm({ ...form, color_hex: e.target.value })} style={{ height: 36 }} />
            </div>
            <div className="df-field">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={form.is_active !== false} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                Active
              </label>
            </div>
          </div>
          <div className="df-actions">
            <button type="button" onClick={() => r.push("/menu/allergens")} className="btn btn-ghost">Cancel</button>
            <button onClick={save} disabled={saving} className="btn btn-primary"><Save size={16} />{saving ? "Saving..." : "Save"}</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 24, maxWidth: 500 }}>
          <h4 style={{ marginBottom: 16 }}>Translation — {LOCALES.find(l => l.code === activeLocale)?.label}</h4>
          <div className="df-grid">
            {FIELDS.map(f => (
              <div className="df-field" key={f.key} style={{ gridColumn: f.key === "description" ? "1/-1" : undefined }}>
                <label className="form-label">{f.label}</label>
                <input className="w-full border rounded px-3 py-2 text-sm" value={(form as any)[`${f.key}_${activeLocale}`] || ""} onChange={e => setForm({ ...form, [`${f.key}_${activeLocale}`]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="df-actions">
            <button onClick={saveTranslation} disabled={saving} className="btn btn-primary"><Save size={16} />{saving ? "Saving..." : "Save Translation"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
