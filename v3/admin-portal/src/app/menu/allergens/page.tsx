"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";
export default function AllergensPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.getRaw<{
      items: any[];
    }>("/admin/menu/allergens").then(d => setItems(Array.isArray(d) ? d : d.items || [])).catch(e => {
      console.error('allergens:', e);
    }).finally(() => setLoading(false));
  }, []);
  const refresh = () => api.getRaw<{
    items: any[];
  }>("/admin/menu/allergens").then(d => setItems(Array.isArray(d) ? d : d.items || [])).catch(e => {
    console.error('allergens:', e);
  });
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div><h1 className="page-title">{t("menu_allergens.allergens")}</h1><p className="page-subtitle">{items.length}{t("menu_allergens.allergens_2")}</p></div>
        <button onClick={() => router.push("/menu/allergens/new")} className="btn btn-primary btn-sm"><Plus size={16} />{t("menu_allergens.add_allergen")}</button>
      </div>
      <div className="table-container" style={{
      marginTop: 16
    }}>
        <table className="data-table">
          <thead><tr><th>{t("menu_allergens.name")}</th><th>{t("menu_allergens.key")}</th><th>{t("menu_allergens.severity")}</th><th>{t("menu_allergens.status")}</th><th>{t("menu_allergens.actions")}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="data-table-empty">{t("menu_allergens.loading")}</td></tr> : items.map(item => <tr key={item.id}>
                <td><div style={{
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6
              }}><span style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: item.color_hex || (item.severity === "high" || item.severity === "critical" ? "#EF4444" : "#F59E0B"),
                  display: "inline-block"
                }} />{item.display_name}</div>{item.description && <div style={{
                fontSize: 12,
                color: "var(--color-text-muted)"
              }}>{item.description}</div>}</td>
                <td className="font-mono" style={{
              fontSize: 12
            }}>{item.allergen_key}</td>
                <td><span className={`badge badge-sm ${item.severity === "high" || item.severity === "critical" ? "badge-red" : "badge-yellow"}`}>{item.severity}</span></td>
                <td><span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>{item.is_active ? "Active" : "Inactive"}</span></td>
                <td>
                  <button onClick={() => router.push(`/menu/allergens/${item.id}`)} className="btn btn-ghost btn-sm" style={{
                color: "var(--color-info)",
                marginRight: 4
              }}><Edit2 size={14} /></button>
                  <button onClick={async () => {
                if (confirm("Delete?")) {
                  await api.del(`/admin/menu/allergens/${item.id}`);
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