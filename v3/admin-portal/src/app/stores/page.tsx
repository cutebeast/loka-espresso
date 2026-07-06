"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Trash2, Edit2 } from "lucide-react";
interface Store {
  id: number;
  store_name: string;
  store_code: string;
  slug: string;
  address_line_1: string;
  city: string;
  state_province?: string | null;
  postal_code: string;
  country_code: string;
  phone_number: string;
  timezone: string;
  currency_code: string;
  is_active: boolean;
  operating_hours?: {
    day_of_week: number;
    open_time: string;
    close_time: string;
    is_closed: boolean;
    is_24_hours: boolean;
    last_order_time: string | null;
  }[];
}
export default function StoresPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fetchData = useCallback(async () => {
    try {
      const data = await api.getRaw<{
        items: Store[];
      }>("/admin/stores?per_page=50");
      setItems(data.items || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this store?")) return;
    setDeletingId(id);
    try {
      await api.del(`/admin/stores/${id}`);
      fetchData();
    } catch (e: any) {
      console.error("Failed to delete store:", e);
    } finally {
      setDeletingId(null);
    }
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("stores.store_locations")}</h1>
          <p className="page-subtitle">{items.length}{t("stores.stores")}</p>
        </div>
        <button type="button" onClick={() => router.push("/stores/new")} className="btn btn-primary btn-sm">
          <Plus size={16} />{t("stores.add_store")}</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-header-bar"><span style={{
        fontSize: 13,
        fontWeight: 600
      }}>{t("stores.stores_2")}</span></div>
      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>{t("stores.store")}</th><th>{t("stores.city")}</th><th>{t("stores.state")}</th><th>{t("stores.postal")}</th><th>{t("stores.country")}</th><th>{t("stores.phone")}</th><th>{t("stores.hours")}</th><th>{t("stores.status")}</th><th>{t("stores.actions")}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="data-table-empty">{t("stores.loading")}</td></tr> : items.map(item => {
            const {
              t
            } = useTranslation();
            const hours = item.operating_hours || [];
            const has24h = hours.some(h => h.is_24_hours);
            const closedDays = hours.filter(h => h.is_closed).length;
            return <tr key={item.id}>
                <td>
                  <div style={{
                  fontWeight: 600
                }}>{item.store_name}</div>
                  <div style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)"
                }}>{item.address_line_1}</div>
                </td>
                <td>{item.city}</td>
                <td>{item.state_province || "—"}</td>
                <td style={{
                fontSize: 12
              }}>{item.postal_code}</td>
                <td style={{
                fontSize: 12
              }}>{item.country_code}</td>
                <td style={{
                fontSize: 12
              }}>{item.phone_number}</td>
                <td style={{
                fontSize: 12
              }}>
                  <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 4
                }}>
                    {has24h && <span className="badge badge-sm badge-blue">{t("stores.24h")}</span>}
                    {closedDays > 0 && <span className="badge badge-sm badge-gray">{closedDays}{t("stores.d_closed")}</span>}
                    {!has24h && closedDays === 0 && <span className="badge badge-sm badge-green">{t("stores.regular")}</span>}
                  </div>
                </td>
                <td><span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>{item.is_active ? "Active" : "Inactive"}</span></td>
                <td>
                  <button type="button" onClick={() => router.push(`/stores/${item.id}`)} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-info)",
                  marginRight: 4
                }}>
                    <Edit2 size={14} />
                  </button>
                  <button type="button" onClick={() => handleDelete(item.id)} disabled={deletingId === item.id} className="btn btn-ghost btn-sm" style={{
                  color: deletingId === item.id ? "var(--color-text-muted)" : "var(--color-error)"
                }}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>;
          })}
          </tbody>
        </table>
      </div>
    </div>;
}