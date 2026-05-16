"use client";

import { useEffect, useState } from "react";
import { getAuditLog, type AuditLogEntry } from "@/lib/api";

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    let cancelled = false;
    getAuditLog({ action: actionFilter || undefined, resource_type: resourceTypeFilter || undefined, severity: severityFilter || undefined, date_from: fromDate || undefined, date_to: toDate || undefined })
      .then(data => { if (!cancelled) { setItems(data); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [actionFilter, resourceTypeFilter, severityFilter, fromDate, toDate]);

  const sevBadge = (s: string) => {
    const m: Record<string, string> = { low: "badge-gray", medium: "badge-yellow", high: "badge-red", critical: "badge-red" };
    return <span className={`badge badge-sm ${m[s] || "badge-gray"}`}>{s}</span>;
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header"><h1 className="page-title">Audit Log</h1><p className="page-subtitle">{items.length} entries</p></div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "end" }}>
        <input placeholder="Action" value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: "6px 12px", fontSize: 13 }} />
        <input placeholder="Resource Type" value={resourceTypeFilter} onChange={e => setResourceTypeFilter(e.target.value)} style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: "6px 12px", fontSize: 13 }} />
        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: "6px 12px", fontSize: 13 }}><option value="">All</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: "6px 10px", fontSize: 13 }} />
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: "6px 10px", fontSize: 13 }} />
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} entries</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Timestamp</th><th>Action</th><th>Resource</th><th>ID</th><th>User</th><th style={{ width: 90 }}>Severity</th><th style={{ width: 120 }}>IP</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={7} className="data-table-empty">Loading...</td></tr>
          : items.length === 0 ? <tr><td colSpan={7} className="data-table-empty">No entries found.</td></tr>
          : items.map(item => (
            <tr key={item.id}>
              <td style={{ fontSize: 12 }}>{new Date(item.created_at).toLocaleString()}</td>
              <td>{item.action}</td>
              <td>{item.resource_type}</td>
              <td className="font-mono" style={{ fontSize: 11 }}>{item.resource_id}</td>
              <td>{item.principal_id}</td>
              <td>{sevBadge(item.severity)}</td>
              <td className="font-mono" style={{ fontSize: 11 }}>{item.ip_address}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
