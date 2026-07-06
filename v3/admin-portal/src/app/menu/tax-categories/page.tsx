"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";
export default function TaxCategoriesPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.getRaw<{
      items: any[];
    }>("/admin/menu/tax-categories").then(d => setItems(Array.isArray(d) ? d : d.items || [])).catch(e => {
      console.error('tax-categories:', e);
    }).finally(() => setLoading(false));
  }, []);
  const refresh = () => api.getRaw<{
    items: any[];
  }>("/admin/menu/tax-categories").then(d => setItems(Array.isArray(d) ? d : d.items || [])).catch(e => {
    console.error('tax-categories:', e);
  });
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div><h1 className="page-title">{t("menu_tax-categories.tax_categories")}</h1><p className="page-subtitle">{items.length}{t("menu_tax-categories.tax_categories_2")}</p></div>
        <button onClick={() => router.push("/menu/tax-categories/new")} className="btn btn-primary btn-sm"><Plus size={16} />{t("menu_tax-categories.add_tax")}</button>
      </div>
      <div className="table-container" style={{
      marginTop: 16
    }}>
        <table className="data-table">
          <thead><tr><th>{t("menu_tax-categories.name")}</th><th>{t("menu_tax-categories.rate")}</th><th>{t("menu_tax-categories.status")}</th><th>{t("menu_tax-categories.actions")}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} className="data-table-empty">{t("menu_tax-categories.loading")}</td></tr> : items.map(item => <tr key={item.id}>
                <td style={{
              fontWeight: 600
            }}>{item.category_name}</td>
                <td>{typeof item.rate === 'number' ? (item.rate * 100).toFixed(0) : 0}%</td>
                <td><span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>{item.is_active ? "Active" : "Inactive"}</span></td>
                <td>
                  <button onClick={() => router.push(`/menu/tax-categories/${item.id}`)} className="btn btn-ghost btn-sm" style={{
                color: "var(--color-info)",
                marginRight: 4
              }}><Edit2 size={14} /></button>
                  <button onClick={async () => {
                if (confirm("Delete?")) {
                  await api.del(`/admin/menu/tax-categories/${item.id}`);
                  refresh();
                }
              }} className="btn btn-ghost btn-sm" style={{
                color: "var(--color-error)"
              }}><Trash2 size={14} /></button>
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>;
}