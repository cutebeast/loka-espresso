"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";
interface Supplier {
  id: number;
  supplier_name: string;
  contact_person?: string;
  phone_number?: string;
  is_active: boolean;
}
export default function InventorySuppliersPage() {
  const {
    t
  } = useTranslation();
  const r = useRouter();
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.getRaw<any>("/admin/inventory/suppliers?per_page=200");
      setItems(Array.isArray(d) ? d : d.items || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  const handleDelete = async (id: number) => {
    if (!confirm("Delete?")) return;
    try {
      await api.del(`/admin/inventory/suppliers/${id}`);
      setConfirmDelete(null);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("inventory_suppliers.suppliers")}</h1>
          <p className="page-subtitle">{items.length}{t("inventory_suppliers.suppliers_2")}</p>
        </div>
        <button onClick={() => r.push("/inventory/suppliers/new")} className="btn btn-primary btn-sm">
          <Plus size={16} />{t("inventory_suppliers.add_supplier")}</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length}{t("inventory_suppliers.suppliers_3")}</span></div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("inventory_suppliers.name")}</th>
              <th>{t("inventory_suppliers.contact")}</th>
              <th>{t("inventory_suppliers.phone")}</th>
              <th style={{
              width: 80
            }}>{t("inventory_suppliers.status")}</th>
              <th style={{
              width: 80
            }}>{t("inventory_suppliers.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="data-table-empty">{t("inventory_suppliers.loading")}</td></tr> : items.length === 0 ? <tr><td colSpan={5} className="data-table-empty">{t("inventory_suppliers.no_suppliers_yet")}</td></tr> : items.map(s => <tr key={s.id} className="clickable" role="button" tabIndex={0} onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              r.push(`/inventory/suppliers/${s.id}`);
            }
          }} onClick={() => r.push(`/inventory/suppliers/${s.id}`)} style={{
            cursor: "pointer"
          }}>
                <td style={{
              fontWeight: 600
            }}>{s.supplier_name}</td>
                <td>{s.contact_person || "—"}</td>
                <td style={{
              fontSize: 12
            }}>{s.phone_number || "—"}</td>
                <td onClick={e => e.stopPropagation()}>
                  <span className={`badge badge-sm ${s.is_active ? "badge-green" : "badge-gray"}`}>
                    {s.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <button onClick={() => r.push(`/inventory/suppliers/${s.id}`)} className="btn btn-ghost btn-sm" style={{
                color: "var(--color-info)"
              }}>
                    <Edit2 size={14} />
                  </button>
                  {confirmDelete === s.id ? <>
                      <button onClick={() => handleDelete(s.id)} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-error)",
                  fontWeight: 600
                }}>✓</button>
                      <button onClick={() => setConfirmDelete(null)} className="btn btn-ghost btn-sm">✕</button>
                    </> : <button onClick={() => setConfirmDelete(s.id)} className="btn btn-ghost btn-sm" style={{
                color: "var(--color-error)"
              }}>
                      <Trash2 size={14} />
                    </button>}
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>;
}