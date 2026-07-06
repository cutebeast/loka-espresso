"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";
interface Category {
  id: number;
  category_name: string;
  slug: string;
  description?: string;
  is_active: boolean;
}
export default function InventoryCategoriesPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    setLoading(true);
    api.getRaw<{
      items: Category[];
    }>("/admin/inventory/categories?per_page=50").then(d => setItems(Array.isArray(d) ? d : d.items || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  const fetchData = () => {
    setLoading(true);
    api.getRaw<{
      items: Category[];
    }>("/admin/inventory/categories?per_page=50").then(d => setItems(Array.isArray(d) ? d : d.items || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div><h1 className="page-title">{t("inventory_categories.inventory_categories")}</h1><p className="page-subtitle">{items.length}{t("inventory_categories.categories")}</p></div>
        <button onClick={() => router.push("/inventory/categories/new")} className="btn btn-primary btn-sm"><Plus size={16} />{t("inventory_categories.add_category")}</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-container" style={{
      marginTop: 16
    }}>
        <table className="data-table">
          <thead><tr><th>{t("inventory_categories.name")}</th><th>{t("inventory_categories.slug")}</th><th>{t("inventory_categories.status")}</th><th>{t("inventory_categories.actions")}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} className="data-table-empty">{t("inventory_categories.loading")}</td></tr> : items.map(item => <tr key={item.id}>
                <td><div style={{
                fontWeight: 600
              }}>{item.category_name}</div>{item.description && <div style={{
                fontSize: 12,
                color: "var(--color-text-muted)"
              }}>{item.description}</div>}</td>
                <td className="font-mono" style={{
              fontSize: 12
            }}>{item.slug}</td>
                <td><span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>{item.is_active ? "Active" : "Inactive"}</span></td>
                <td>
                  <button onClick={() => router.push(`/inventory/categories/${item.id}`)} className="btn btn-ghost btn-sm" style={{
                color: "var(--color-info)",
                marginRight: 4
              }}><Edit2 size={14} /></button>
                  <button onClick={async () => {
                if (confirm("Delete?")) {
                  await api.del(`/admin/inventory/categories/${item.id}`);
                  fetchData();
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