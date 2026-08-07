"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";
interface Category {
  id: number;
  category_name: string;
  slug: string;
  description?: string;
  display_order: number;
  is_available: boolean;
}
export default function MenuCategoriesPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fetchData = useCallback(async () => {
    try {
      const d = await api.getRaw<{
        items: Category[];
      }>("/admin/menu/categories?per_page=50");
      setItems(Array.isArray(d) ? d : d.items || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    (async () => {
      await fetchData();
    })();
  }, []);
  const sorted = [...items].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.category_name.localeCompare(b.category_name));
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div><h1 className="page-title">{t("menu_categories.menu_categories")}</h1><p className="page-subtitle">{items.length} {" "}{t("menu_categories.categories")}</p></div>
        <button onClick={() => router.push("/menu/categories/new")} className="btn btn-primary btn-sm"><Plus size={16} />{t("menu_categories.add_category")}</button>
      </div>
      <div style={{
      fontSize: 12,
      color: "var(--color-text-muted)",
      background: "var(--color-bg-white)",
      border: "1px solid var(--color-border-light)",
      borderRadius: "var(--radius-md)",
      padding: "10px 14px",
      marginBottom: 16
    }}>{t("menu_categories.sort_note", "Sort order is shared with Bundle Categories — the customer menu combines both lists into one sequence ordered by this number. Tip: give bundle categories lower numbers (they usually appear first), then à la carte categories.")}</div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span style={{
        fontSize: 13,
        fontWeight: 600
      }}>{t("menu_categories.categories_2")}</span></div>
      <div className="table-container" style={{
      marginTop: 0
    }}>
        <table className="data-table">
          <thead><tr><th>{t("menu_categories.name")}</th><th>{t("menu_categories.slug")}</th><th>{t("menu_categories.sort", "Sort")}</th><th>{t("menu_categories.status")}</th><th>{t("menu_categories.actions")}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="data-table-empty">{t("menu_categories.loading")}</td></tr> : sorted.map(item => <tr key={item.id}>
                <td><div style={{
                fontWeight: 600
              }}>{item.category_name}</div>{item.description && <div style={{
                fontSize: 12,
                color: "var(--color-text-muted)"
              }}>{item.description}</div>}</td>
                <td className="font-mono" style={{
              fontSize: 12
            }}>{item.slug}</td>
                <td>{item.display_order ?? 0}</td>
                <td><span className={`badge badge-sm ${item.is_available ? "badge-green" : "badge-gray"}`}>{item.is_available ? t("admin.status.active") : t("admin.status.inactive")}</span></td>
                <td>
                  <button onClick={() => router.push(`/menu/categories/${item.id}`)} className="btn btn-ghost btn-sm" style={{
                color: "var(--color-info)",
                marginRight: 4
              }}><Edit2 size={14} /></button>
                  <button onClick={async () => {
                if (confirm(t("common.confirm_delete"))) {
                  await api.del(`/admin/menu/categories/${item.id}`);
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