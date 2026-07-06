"use client";

import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
export default function NewAllergenPage() {
  const {
    t
  } = useTranslation();
  const r = useRouter();
  const [f, setF] = useState({
    allergen_key: "",
    display_name: "",
    description: "",
    severity: "high",
    color_hex: "#EF4444"
  });
  const [s, setS] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setS(true);
    try {
      const x: any = await api.post("/admin/menu/allergens", f);
      const id = x?.data?.id || x?.id;
      if (id) r.push(`/menu/allergens/${id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setS(false);
    }
  };
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <button onClick={() => r.push("/menu/allergens")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <h1 className="page-title" style={{
        margin: 0
      }}>{t("menu_allergens_new.new_allergen")}</h1>
      </div>
      <form onSubmit={submit}>
        <div className="card" style={{
        padding: 24,
        maxWidth: 500
      }}>
          <div className="df-grid">
            <div className="df-field"><label className="form-label">{t("menu_allergens_new.display_name")}</label><input required className="w-full border rounded px-3 py-2 text-sm" value={f.display_name} onChange={e => setF({
              ...f,
              display_name: e.target.value
            })} /></div>
            <div className="df-field"><label className="form-label">{t("menu_allergens_new.key")}</label><input required className="w-full border rounded px-3 py-2 text-sm" value={f.allergen_key} onChange={e => setF({
              ...f,
              allergen_key: e.target.value
            })} /></div>
            <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="form-label">{t("menu_allergens_new.description")}</label><input className="w-full border rounded px-3 py-2 text-sm" value={f.description} onChange={e => setF({
              ...f,
              description: e.target.value
            })} /></div>
            <div className="df-field">
              <label className="form-label">{t("menu_allergens_new.severity")}</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={f.severity} onChange={e => setF({
              ...f,
              severity: e.target.value
            })}>
                <option value="low">{t("menu_allergens_new.low")}</option><option value="medium">{t("menu_allergens_new.medium")}</option><option value="high">{t("menu_allergens_new.high")}</option><option value="critical">{t("menu_allergens_new.critical")}</option>
              </select>
            </div>
            <div className="df-field">
              <label className="form-label">{t("menu_allergens_new.badge_color")}</label>
              <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8
            }}>
                <input type="color" value={f.color_hex} onChange={e => setF({
                ...f,
                color_hex: e.target.value
              })} style={{
                width: 40,
                height: 36,
                border: "none",
                cursor: "pointer"
              }} />
                <input className="border rounded px-3 py-2 text-sm" style={{
                flex: 1
              }} value={f.color_hex} onChange={e => setF({
                ...f,
                color_hex: e.target.value
              })} />
              </div>
            </div>
          </div>
          <div className="df-actions">
            <button type="button" onClick={() => r.push("/menu/allergens")} className="btn btn-ghost">{t("menu_allergens_new.cancel")}</button>
            <button type="submit" disabled={s} className="btn btn-primary"><Save size={16} /> {s ? "Creating..." : "Create"}</button>
          </div>
        </div>
      </form>
    </div>;
}