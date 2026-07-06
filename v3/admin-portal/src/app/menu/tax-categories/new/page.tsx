"use client";

import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
export default function TaxCategoryNewPage() {
  const {
    t
  } = useTranslation();
  const r = useRouter();
  const [f, setF] = useState({
    category_name: "",
    rate: ""
  });
  const [s, setS] = useState(false);
  const sub = async (e: React.FormEvent) => {
    e.preventDefault();
    setS(true);
    try {
      const payload: any = {
        category_name: f.category_name,
        rate: Number(f.rate)
      };
      const result: any = await api.post("/admin/menu/tax-categories", payload);
      const id = result?.data?.id || result?.id;
      if (id) r.push(`/menu/tax-categories/${id}`);
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
        <button onClick={() => r.push("/menu/tax-categories")} className="btn btn-ghost btn-sm">
          <ArrowLeft size={18} />
        </button>
        <h1 className="page-title" style={{
        margin: 0
      }}>{t("menu_tax-categories_new.new_tax_category")}</h1>
      </div>
      <form onSubmit={sub}>
        <div className="card" style={{
        padding: 24,
        maxWidth: 500
      }}>
          <div className="df-grid">
            <div className="df-field">
              <label className="form-label">{t("menu_tax-categories_new.name")}</label>
              <input required className="w-full border rounded px-3 py-2 text-sm" value={f.category_name} onChange={e => setF({
              ...f,
              category_name: e.target.value
            })} />
            </div>
            <div className="df-field">
              <label className="form-label">{t("menu_tax-categories_new.rate_decimal")}</label>
              <input required type="number" step="0.01" className="w-full border rounded px-3 py-2 text-sm" value={f.rate} onChange={e => setF({
              ...f,
              rate: e.target.value
            })} placeholder="0.06" />
              <div className="df-hint">{t("menu_tax-categories_new.e_g_0_06_6_sst")}</div>
            </div>
          </div>
          <div className="df-actions">
            <button type="button" onClick={() => r.push("/menu/tax-categories")} className="btn btn-ghost">{t("menu_tax-categories_new.cancel")}</button>
            <button type="submit" disabled={s} className="btn btn-primary"><Save size={16} />{s ? "Creating..." : "Create"}</button>
          </div>
        </div>
      </form>
    </div>;
}