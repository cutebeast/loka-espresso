"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";
export default function BundleCategoriesPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.getRaw<{
      items: any[];
    }>("/admin/bundle-categories?per_page=50").then(d => setItems(d.items || [])).catch(e => {
      console.error('bundle-categories:', e);
    }).finally(() => setLoading(false));
  }, []);
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div><h1 className="page-title">{t("menu_bundle-categories.bundle_categories")}</h1><p className="page-subtitle">{items.length} {" "}{t("menu_bundle-categories.categories")}</p></div>
        <button onClick={() => router.push("/menu/bundle-categories/new")} className="btn btn-primary btn-sm"><Plus size={16} />{t("menu_bundle-categories.add_category")}</button>
      </div>
      <div className="table-container" style={{
      marginTop: 16
    }}>
        <table className="data-table">
          <thead><tr><th>{t("menu_bundle-categories.name")}</th><th>{t("menu_bundle-categories.slug")}</th><th>{t("menu_bundle-categories.order")}</th><th>{t("menu_bundle-categories.status")}</th><th>{t("menu_bundle-categories.actions")}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="data-table-empty">{t("menu_bundle-categories.loading")}</td></tr> : items.map(item => <tr key={item.id}>
                <td><div style={{
                fontWeight: 600
              }}>{item.name}</div></td>
                <td className="font-mono" style={{
              fontSize: 12
            }}>{item.slug}</td>
                <td>{item.display_order}</td>
                <td><span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>{item.is_active ? t("admin.status.active") : t("admin.status.inactive")}</span></td>
                <td>
                  <button onClick={() => router.push(`/menu/bundle-categories/${item.id}`)} className="btn btn-ghost btn-sm" style={{
                color: "var(--color-info)",
                marginRight: 4
              }}><Edit2 size={14} /></button>
                  <button onClick={async () => {
                if (confirm(t("common.confirm_delete"))) {
                  await api.del(`/admin/bundle-categories/${item.id}`);
                  const d = await api.getRaw<{
                    items: any[];
                  }>("/admin/bundle-categories?per_page=50");
                  setItems(d.items || []);
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
