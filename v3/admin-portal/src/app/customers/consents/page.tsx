"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { getCustomerConsents, type CustomerConsent } from "@/lib/api";
export default function CustomerConsentsPage() {
  const {
    t
  } = useTranslation();
  const [items, setItems] = useState<CustomerConsent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [consentTypeFilter, setConsentTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const fetchData = useCallback(() => {
    setLoading(true);
    getCustomerConsents({
      consent_type: consentTypeFilter || undefined,
      status: statusFilter || undefined
    }).then(data => setItems(data)).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [consentTypeFilter, statusFilter]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  const statusBadge = (s: string) => <span className={`badge badge-sm ${s === "granted" ? "badge-green" : s === "revoked" ? "badge-red" : "badge-gray"}`}>{s}</span>;
  return <div style={{
    padding: 32
  }}>
      <div className="page-header"><div><h1 className="page-title">{t("customers_consents.customer_consents")}</h1><p className="page-subtitle">{items.length}{t("customers_consents.records")}</p></div></div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{
      display: "flex",
      gap: 8,
      marginBottom: 16,
      flexWrap: "wrap"
    }}>
        <select value={consentTypeFilter} onChange={e => setConsentTypeFilter(e.target.value)} style={{
        padding: "6px 12px",
        fontSize: 13,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border-light)"
      }}>
          <option value="">{t("customers_consents.all_types")}</option><option value="marketing">{t("customers_consents.marketing")}</option><option value="analytics">{t("customers_consents.analytics")}</option><option value="data_processing">{t("customers_consents.data_processing")}</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{
        padding: "6px 12px",
        fontSize: 13,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border-light)"
      }}>
          <option value="">{t("customers_consents.all_status")}</option><option value="granted">{t("customers_consents.granted")}</option><option value="revoked">{t("customers_consents.revoked")}</option>
        </select>
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length}{t("customers_consents.records_2")}</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>{t("customers_consents.customer")}</th><th>{t("customers_consents.type")}</th><th style={{
              width: 90
            }}>{t("customers_consents.status")}</th><th>{t("customers_consents.granted_2")}</th><th>{t("customers_consents.revoked_2")}</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="data-table-empty">{t("customers_consents.loading")}</td></tr> : items.length === 0 ? <tr><td colSpan={5} className="data-table-empty">{t("customers_consents.no_consents_found")}</td></tr> : items.map(c => <tr key={c.id}>
              <td style={{
              fontWeight: 600
            }}>{c.customer_name || `Customer #${c.customer_id}`}</td>
              <td style={{
              textTransform: "capitalize",
              fontSize: 12
            }}>{c.consent_type?.replace(/_/g, " ")}</td>
              <td>{statusBadge(c.status)}</td>
              <td style={{
              fontSize: 12
            }}>{c.granted_at ? new Date(c.granted_at).toLocaleString() : "—"}</td>
              <td style={{
              fontSize: 12
            }}>{c.revoked_at ? new Date(c.revoked_at).toLocaleString() : "—"}</td>
            </tr>)}
        </tbody>
      </table></div>
    </div>;
}