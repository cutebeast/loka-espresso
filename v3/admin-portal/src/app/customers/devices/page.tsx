"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { getCustomerDevices, type CustomerDevice } from "@/lib/api";
export default function CustomerDevicesPage() {
  const {
    t
  } = useTranslation();
  const [items, setItems] = useState<CustomerDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deviceTypeFilter, setDeviceTypeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const fetchData = useCallback(() => {
    setLoading(true);
    getCustomerDevices({
      platform: deviceTypeFilter || undefined,
      is_active: activeFilter === "" ? undefined : activeFilter === "true"
    }).then(data => setItems(data)).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [deviceTypeFilter, activeFilter]);
  useEffect(() => {
    (async () => {
      fetchData();
    })();
  }, [fetchData]);
  return <div style={{
    padding: 32
  }}>
      <div className="page-header"><div><h1 className="page-title">{t("customers_devices.customer_devices")}</h1><p className="page-subtitle">{items.length}{t("customers_devices.devices")}</p></div></div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{
      display: "flex",
      gap: 8,
      marginBottom: 16,
      flexWrap: "wrap"
    }}>
        <select value={deviceTypeFilter} onChange={e => setDeviceTypeFilter(e.target.value)} style={{
        padding: "6px 12px",
        fontSize: 13,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border-light)"
      }}>
          <option value="">{t("customers_devices.all_platforms")}</option><option value="ios">{t("customers_devices.ios")}</option><option value="android">{t("customers_devices.android")}</option><option value="web">{t("customers_devices.web")}</option>
        </select>
        <select value={activeFilter} onChange={e => setActiveFilter(e.target.value)} style={{
        padding: "6px 12px",
        fontSize: 13,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border-light)"
      }}>
          <option value="">{t("customers_devices.all")}</option><option value="true">{t("customers_devices.active")}</option><option value="false">{t("customers_devices.inactive")}</option>
        </select>
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length}{t("customers_devices.devices_2")}</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>{t("customers_devices.customer")}</th><th>{t("customers_devices.platform")}</th><th>{t("customers_devices.model")}</th><th style={{
              width: 80
            }}>{t("customers_devices.status")}</th><th>{t("customers_devices.last_seen")}</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="data-table-empty">{t("customers_devices.loading")}</td></tr> : items.length === 0 ? <tr><td colSpan={5} className="data-table-empty">{t("customers_devices.no_devices_found")}</td></tr> : items.map(d => <tr key={d.id}>
              <td style={{
              fontWeight: 600
            }}>{d.customer_name || `Customer #${d.customer_id}`}</td>
              <td style={{
              textTransform: "capitalize"
            }}>{d.platform}</td>
              <td style={{
              fontSize: 12
            }}>{d.device_model || "—"}</td>
              <td><span className={`badge badge-sm ${d.is_active ? "badge-green" : "badge-gray"}`}>{d.is_active ? "Active" : "Inactive"}</span></td>
              <td style={{
              fontSize: 12
            }}>{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "—"}</td>
            </tr>)}
        </tbody>
      </table></div>
    </div>;
}