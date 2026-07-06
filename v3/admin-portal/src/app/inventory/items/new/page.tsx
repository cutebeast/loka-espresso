"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
export default function NewItemPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const {
    symbol
  } = useCurrency();
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    item_name: "",
    item_code: "",
    item_type: "fnb",
    description: "",
    unit_of_measure: "kg",
    category_id: "",
    supplier_id: "",
    unit_cost: 0,
    is_active: true
  });
  useEffect(() => {
    api.getRaw<any>("/admin/inventory/categories?per_page=50").then(d => setCategories(Array.isArray(d) ? d : d.items || [])).catch(e => {
      console.error('categories:', e);
    });
    api.getRaw<any>("/admin/inventory/suppliers?per_page=50").then(d => setSuppliers(Array.isArray(d) ? d : d.items || [])).catch(e => {
      console.error('suppliers:', e);
    });
  }, []);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r: any = await api.post("/admin/inventory/items", {
        ...form,
        category_id: form.category_id ? Number(form.category_id) : null,
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        unit_cost: Number(form.unit_cost)
      });
      const id = r?.id;
      if (id) router.push(`/inventory/items/${id}`);else router.push("/inventory/items");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
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
        <button onClick={() => router.push("/inventory/items")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{
          margin: 0
        }}>{t("inventory_items_new.new_inventory_item")}</h1></div>
      </div>
      {error && <div className="alert alert-error" style={{
      marginBottom: 16
    }}>{error}</div>}
      <div className="card" style={{
      padding: 24,
      maxWidth: 700
    }}>
        <form onSubmit={handleSubmit}><div className="df-grid">
          <div className="df-field"><label className="df-label">{t("inventory_items_new.name")}</label><input required value={form.item_name} onChange={e => setForm({
              ...form,
              item_name: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label">{t("inventory_items_new.code")}</label><input required value={form.item_code} onChange={e => setForm({
              ...form,
              item_code: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label">{t("inventory_items_new.type")}</label><select value={form.item_type} onChange={e => setForm({
              ...form,
              item_type: e.target.value
            })}><option value="fnb">{t("inventory_items_new.fnb_item")}</option><option value="non_fnb">{t("inventory_items_new.non_fnb_item")}</option></select></div>
          <div className="df-field"><label className="df-label">{t("inventory_items_new.unit")}</label><select value={form.unit_of_measure} onChange={e => setForm({
              ...form,
              unit_of_measure: e.target.value
            })}><option value="kg">{t("inventory_items_new.kg")}</option><option value="g">{t("inventory_items_new.g")}</option><option value="L">{t("inventory_items_new.l")}</option><option value="ml">{t("inventory_items_new.ml")}</option><option value="pcs">{t("inventory_items_new.pcs")}</option><option value="pack">{t("inventory_items_new.pack")}</option></select></div>
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("inventory_items_new.description")}</label><input value={form.description} onChange={e => setForm({
              ...form,
              description: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label">{t("inventory_items_new.category")}</label><select value={form.category_id} onChange={e => setForm({
              ...form,
              category_id: e.target.value
            })}><option value="">—</option>{categories.map((c: any) => <option key={c.id} value={c.id}>{c.category_name || c.name}</option>)}</select></div>
          <div className="df-field"><label className="df-label">{t("inventory_items_new.supplier")}</label><select value={form.supplier_id} onChange={e => setForm({
              ...form,
              supplier_id: e.target.value
            })}><option value="">—</option>{suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select></div>
          <div className="df-field"><label className="df-label">{`Unit Cost (${symbol})`}</label><input type="number" step="0.01" value={form.unit_cost} onChange={e => setForm({
              ...form,
              unit_cost: Number(e.target.value)
            })} /></div>
          <div className="df-field"><label className="df-label" style={{
              display: "flex",
              alignItems: "center",
              gap: 8
            }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({
                ...form,
                is_active: e.target.checked
              })} />{t("inventory_items_new.active")}</label></div>
        </div><div className="df-actions" style={{
          marginTop: 20
        }}><button type="button" onClick={() => router.push("/inventory/items")} className="btn btn-ghost">{t("inventory_items_new.cancel")}</button><button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Creating..." : "Create Item"}</button></div></form>
      </div>
    </div>;
}