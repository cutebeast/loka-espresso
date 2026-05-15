"use client";

import { useEffect, useState } from "react";
import { getCustomerDevices, type CustomerDevice } from "@/lib/api";

export default function CustomerDevicesPage() {
  const [items, setItems] = useState<CustomerDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deviceTypeFilter, setDeviceTypeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  const fetchData = () => { setLoading(true);
    getCustomerDevices({ platform: deviceTypeFilter || undefined, is_active: activeFilter === "" ? undefined : activeFilter === "true" })
      .then(data => setItems(data)).catch(err => setError(err.message)).finally(() => setLoading(false));
  };
  useEffect(() => { fetchData(); }, [deviceTypeFilter, activeFilter]);

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header"><div><h1 className="page-title">Customer Devices</h1><p className="page-subtitle">{items.length} devices</p></div></div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={deviceTypeFilter} onChange={e => setDeviceTypeFilter(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
          <option value="">All Platforms</option><option value="ios">iOS</option><option value="android">Android</option><option value="web">Web</option>
        </select>
        <select value={activeFilter} onChange={e => setActiveFilter(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
          <option value="">All</option><option value="true">Active</option><option value="false">Inactive</option>
        </select>
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} devices</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Customer</th><th>Platform</th><th>Model</th><th style={{ width: 80 }}>Status</th><th>Last Seen</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="data-table-empty">Loading...</td></tr>
          : items.length === 0 ? <tr><td colSpan={5} className="data-table-empty">No devices found.</td></tr>
          : items.map(d => (
            <tr key={d.id}>
              <td style={{ fontWeight: 600 }}>{d.customer_name || `Customer #${d.customer_id}`}</td>
              <td style={{ textTransform: "capitalize" }}>{d.platform}</td>
              <td style={{ fontSize: 12 }}>{d.device_model || "—"}</td>
              <td><span className={`badge badge-sm ${d.is_active ? "badge-green" : "badge-gray"}`}>{d.is_active ? "Active" : "Inactive"}</span></td>
              <td style={{ fontSize: 12 }}>{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
