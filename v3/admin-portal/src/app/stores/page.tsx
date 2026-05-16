"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, MapPin, Trash2, Edit2 } from "lucide-react";

interface Store {
  id: number; store_name: string; store_code: string; slug: string;
  address_line_1: string; city: string; state_province?: string | null;
  postal_code: string; country_code: string;
  phone_number: string; timezone: string; currency_code: string;
  is_active: boolean;
}

export default function StoresPage() {
  const router = useRouter();
  const [items, setItems] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getRaw<{ items: Store[] }>("/admin/stores?per_page=50");
      setItems(data.items || []);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { (async () => { await fetchData(); })(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this store?")) return;
    try { await api.del(`/admin/stores/${id}`); fetchData(); } catch { /* ignore */ }
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Store Locations</h1>
          <p className="page-subtitle">{items.length} stores</p>
        </div>
        <button onClick={() => router.push("/stores/new")} className="btn btn-primary btn-sm">
          <Plus size={16} /> Add Store
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Store</th><th>City</th><th>State</th><th>Postal</th><th>Country</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="data-table-empty">Loading...</td></tr>
            : items.map(item => (
              <tr key={item.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{item.store_name}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{item.address_line_1}</div>
                </td>
                <td>{item.city}</td>
                <td>{item.state_province || "—"}</td>
                <td style={{ fontSize: 12 }}>{item.postal_code}</td>
                <td style={{ fontSize: 12 }}>{item.country_code}</td>
                <td style={{ fontSize: 12 }}>{item.phone_number}</td>
                <td><span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>{item.is_active ? "Active" : "Inactive"}</span></td>
                <td>
                  <button onClick={() => router.push(`/stores/${item.id}`)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)", marginRight: 4 }}>
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
