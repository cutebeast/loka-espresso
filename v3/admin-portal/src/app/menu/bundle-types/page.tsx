"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";
const MECHANIC_BADGE: Record<string, string> = {
  combo: "badge-blue",
  pick_x: "badge-orange",
  multi_course: "badge-green"
};
export default function BundleTypesPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.getRaw<{
      items: any[];
    }>("/admin/bundle-types?per_page=50").then(d => setItems(d.items || [])).catch(e => {
      console.error('bundle-types:', e);
    }).finally(() => setLoading(false));
  }, []);
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div><h1 className="page-title">{t("menu_bundle-types.bundle_types")}</h1><p className="page-subtitle">{t("menu_bundle-types.subtitle")}</p></div>
        <button onClick={() => router.push("/menu/bundle-types/new")} className="btn btn-primary btn-sm"><Plus size={16} />{t("menu_bundle-types.add_type")}</button>
      </div>
      <div className="table-container" style={{
      marginTop: 16
    }}>
        <table className="data-table">
          <thead><tr><th>{t("menu_bundle-types.name")}</th><th>{t("menu_bundle-types.type_key")}</th><th>{t("menu_bundle-types.mechanic")}</th><th>{t("menu_bundle-types.description")}</th><th>{t("menu_bundle-types.status")}</th><th>{t("menu_bundle-types.actions")}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="data-table-empty">{t("menu_bundle-types.loading")}</td></tr> : items.map(item => <tr key={item.id}>
                <td><div style={{
                fontWeight: 600
              }}>{item.name}</div></td>
                <td className="font-mono" style={{
              fontSize: 12
            }}>{item.type_key}</td>
                <td><span className={`badge badge-sm ${MECHANIC_BADGE[item.mechanic] || "badge-gray"}`}>{item.mechanic}</span></td>
                <td style={{
              maxWidth: 260,
              fontSize: 12,
              color: "var(--color-text-muted)"
            }}>{item.description || "—"}</td>
                <td><span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>{item.is_active ? t("admin.status.active") : t("admin.status.inactive")}</span></td>
                <td>
                  <button onClick={() => router.push(`/menu/bundle-types/${item.id}`)} className="btn btn-ghost btn-sm" style={{
                color: "var(--color-info)",
                marginRight: 4
              }}><Edit2 size={14} /></button>
                  <button onClick={async () => {
                if (confirm(t("common.confirm_delete"))) {
                  await api.del(`/admin/bundle-types/${item.id}`);
                  const d = await api.getRaw<{
                    items: any[];
                  }>("/admin/bundle-types?per_page=50");
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
