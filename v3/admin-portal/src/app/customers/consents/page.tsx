"use client";

import { useEffect, useState, useCallback } from "react";
import { getCustomerConsents, type CustomerConsent } from "@/lib/api";

export default function CustomerConsentsPage() {
  const [items, setItems] = useState<CustomerConsent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [consentTypeFilter, setConsentTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchData = useCallback(() => { setLoading(true);
    getCustomerConsents({ consent_type: consentTypeFilter || undefined, status: statusFilter || undefined })
      .then(data => setItems(data)).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [consentTypeFilter, statusFilter]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const statusBadge = (s: string) => <span className={`badge badge-sm ${s === "granted" ? "badge-green" : s === "revoked" ? "badge-red" : "badge-gray"}`}>{s}</span>;

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header"><div><h1 className="page-title">Customer Consents</h1><p className="page-subtitle">{items.length} records</p></div></div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={consentTypeFilter} onChange={e => setConsentTypeFilter(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
          <option value="">All Types</option><option value="marketing">Marketing</option><option value="analytics">Analytics</option><option value="data_processing">Data Processing</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
          <option value="">All Status</option><option value="granted">Granted</option><option value="revoked">Revoked</option>
        </select>
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} records</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Customer</th><th>Type</th><th style={{ width: 90 }}>Status</th><th>Granted</th><th>Revoked</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="data-table-empty">Loading...</td></tr>
          : items.length === 0 ? <tr><td colSpan={5} className="data-table-empty">No consents found.</td></tr>
          : items.map(c => (
            <tr key={c.id}>
              <td style={{ fontWeight: 600 }}>{c.customer_name || `Customer #${c.customer_id}`}</td>
              <td style={{ textTransform: "capitalize", fontSize: 12 }}>{c.consent_type?.replace(/_/g, " ")}</td>
              <td>{statusBadge(c.status)}</td>
              <td style={{ fontSize: 12 }}>{c.granted_at ? new Date(c.granted_at).toLocaleString() : "—"}</td>
              <td style={{ fontSize: 12 }}>{c.revoked_at ? new Date(c.revoked_at).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
