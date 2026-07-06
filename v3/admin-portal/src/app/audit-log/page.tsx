"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { getAuditLog, type AuditLogEntry } from "@/lib/api";
export default function AuditLogPage() {
  const {
    t
  } = useTranslation();
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
    getAuditLog({
      action: actionFilter || undefined,
      resource_type: resourceTypeFilter || undefined,
      severity: severityFilter || undefined,
      date_from: fromDate || undefined,
      date_to: toDate || undefined
    }).then(data => {
      if (!cancelled) {
        setItems(data);
        setLoading(false);
      }
    }).catch(err => {
      if (!cancelled) {
        setError(err.message);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [actionFilter, resourceTypeFilter, severityFilter, fromDate, toDate]);
  const sevBadge = (s: string) => {
    const m: Record<string, string> = {
      low: "badge-gray",
      medium: "badge-yellow",
      high: "badge-red",
      critical: "badge-red"
    };
    return <span className={`badge badge-sm ${m[s] || "badge-gray"}`}>{s}</span>;
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header"><h1 className="page-title">{t("audit-log.audit_log")}</h1><p className="page-subtitle">{items.length}{t("audit-log.entries")}</p></div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 16,
      alignItems: "end"
    }}>
        <input placeholder={t("audit-log.action")} value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={{
        border: "1px solid var(--color-border-light)",
        borderRadius: "var(--radius-sm)",
        padding: "6px 12px",
        fontSize: 13
      }} />
        <input placeholder={t("audit-log.resource_type")} value={resourceTypeFilter} onChange={e => setResourceTypeFilter(e.target.value)} style={{
        border: "1px solid var(--color-border-light)",
        borderRadius: "var(--radius-sm)",
        padding: "6px 12px",
        fontSize: 13
      }} />
        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} style={{
        border: "1px solid var(--color-border-light)",
        borderRadius: "var(--radius-sm)",
        padding: "6px 12px",
        fontSize: 13
      }}><option value="">{t("audit-log.all")}</option><option value="low">{t("audit-log.low")}</option><option value="medium">{t("audit-log.medium")}</option><option value="high">{t("audit-log.high")}</option><option value="critical">{t("audit-log.critical")}</option></select>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{
        border: "1px solid var(--color-border-light)",
        borderRadius: "var(--radius-sm)",
        padding: "6px 10px",
        fontSize: 13
      }} />
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{
        border: "1px solid var(--color-border-light)",
        borderRadius: "var(--radius-sm)",
        padding: "6px 10px",
        fontSize: 13
      }} />
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length}{t("audit-log.entries_2")}</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>{t("audit-log.timestamp")}</th><th>{t("audit-log.action_2")}</th><th>{t("audit-log.resource")}</th><th>{t("audit-log.id")}</th><th>{t("audit-log.user")}</th><th style={{
              width: 90
            }}>{t("audit-log.severity")}</th><th style={{
              width: 120
            }}>{t("audit-log.ip")}</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={7} className="data-table-empty">{t("audit-log.loading")}</td></tr> : items.length === 0 ? <tr><td colSpan={7} className="data-table-empty">{t("audit-log.no_entries_found")}</td></tr> : items.map(item => <tr key={item.id}>
              <td style={{
              fontSize: 12
            }}>{new Date(item.created_at).toLocaleString()}</td>
              <td>{item.action}</td>
              <td>{item.resource_type}</td>
              <td className="font-mono" style={{
              fontSize: 11
            }}>{item.resource_id}</td>
              <td>{item.principal_id}</td>
              <td>{sevBadge(item.severity)}</td>
              <td className="font-mono" style={{
              fontSize: 11
            }}>{item.ip_address}</td>
            </tr>)}
        </tbody>
      </table></div>
    </div>;
}