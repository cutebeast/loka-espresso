"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { BarChart3, TrendingUp, DollarSign, ShoppingBag } from "lucide-react";

interface Store { id: number; store_name: string; }

export default function ReportsPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"sales" | "marketing">("sales");
  const [data, setData] = useState({ revenue: 0, orders: 0, avgOrder: 0, customers: 0, stores: 0 });
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    api.get<{ items: Store[] }>("/admin/stores?per_page=50").then(d => setStores(Array.isArray(d) ? d : (d.items || []))).catch(() => {});
    setAnalyticsLoading(true);
    api.get<any>("/admin/marketing/analytics").then(d => setAnalytics(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setAnalyticsLoading(false));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (selectedStore) qs.set("store_id", selectedStore);
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      const metrics = await api.get<any>(`/admin/dashboard/metrics${qs.toString() ? "?" + qs.toString() : ""}`);
      setData({
        revenue: metrics.revenue_today ?? metrics.total_revenue ?? 0,
        orders: metrics.orders_today ?? metrics.total_orders ?? 0,
        avgOrder: (Number(metrics.revenue_today) > 0 && Number(metrics.orders_today) > 0) ? metrics.revenue_today / metrics.orders_today : 0,
        customers: metrics.new_customers || 0,
        stores: metrics.active_stores || stores.length,
      });
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [selectedStore, dateFrom, dateTo, stores.length]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fmt = (v: number) => `RM ${Number(v || 0).toFixed(2)}`;

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Reports</h1><p className="page-subtitle">Business analytics & insights</p></div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid var(--color-border-light)" }}>
        {[
          { key: "sales" as const, label: "Sales Reports", icon: BarChart3 },
          { key: "marketing" as const, label: "Marketing ROI", icon: TrendingUp },
        ].map(tab => (
          <button type="button" key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 20px", fontSize: 13,
              fontWeight: activeTab === tab.key ? 700 : 400,
              border: "none", borderBottom: activeTab === tab.key ? "3px solid var(--color-primary)" : "3px solid transparent",
              background: activeTab === tab.key ? "rgba(59,74,26,0.05)" : "transparent",
              cursor: "pointer", color: activeTab === tab.key ? "var(--color-primary)" : "var(--color-text-muted)",
              borderRadius: "4px 4px 0 0",
            }}>
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "sales" && (
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "end" }}>
        <div><label htmlFor="report-store-filter" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Store</label>
          <select id="report-store-filter" value={selectedStore} onChange={e => setSelectedStore(e.target.value)} style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: "6px 12px", fontSize: 13 }}><option value="">All Stores</option>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select></div>
        <div><label htmlFor="report-date-from" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>From</label><input id="report-date-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: "6px 10px", fontSize: 13 }} /></div>
        <div><label htmlFor="report-date-to" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>To</label><input id="report-date-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: "6px 10px", fontSize: 13 }} /></div>
      </div>
      )}

      {loading ? <div style={{ textAlign: "center", padding: 48, color: "var(--color-text-muted)" }}>Loading...</div>
      : activeTab === "sales" ? (
        <>
          <div className="kpi-grid" style={{ marginBottom: 24 }}>
            <div className="kpi-card"><div className="kpi-label">Total Revenue</div><div className="kpi-value">{fmt(data.revenue)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Total Orders</div><div className="kpi-value">{data.orders}</div></div>
            <div className="kpi-card"><div className="kpi-label">Avg Order Value</div><div className="kpi-value">{fmt(data.avgOrder)}</div></div>
            <div className="kpi-card"><div className="kpi-label">New Customers</div><div className="kpi-value">{data.customers}</div></div>
            <div className="kpi-card"><div className="kpi-label">Active Stores</div><div className="kpi-value">{data.stores}</div></div>
          </div>
          <div className="card" style={{ padding: 24 }}><p style={{ fontSize: 13, opacity: 0.6 }}>
            Showing aggregated sales metrics{selectedStore ? ` for ${stores.find(s => String(s.id) === selectedStore)?.store_name || "selected store"}` : " across all stores"}{dateFrom ? ` from ${dateFrom}` : ""}{dateTo ? ` to ${dateTo}` : ""}.
          </p></div>
        </>
      ) : (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><TrendingUp size={18} /> Campaign Analytics</h3>
          {analyticsLoading ? <p style={{ opacity: 0.5 }}>Loading...</p>
          : analytics.length === 0 ? <p style={{ opacity: 0.5 }}>No campaigns have been sent yet.</p>
          : (
            <div className="table-container"><table className="data-table">
              <thead><tr><th>Campaign</th><th style={{ textAlign: "center" }}>Audience</th><th style={{ textAlign: "center" }}>Sent</th><th style={{ textAlign: "center" }}>Opens</th><th style={{ textAlign: "center" }}>Clicks</th><th style={{ textAlign: "center" }}>Revenue</th></tr></thead>
              <tbody>
                {analytics.map((a: any) => (
                  <tr key={a.campaign_id}>
                    <td style={{ fontWeight: 600 }}>{a.campaign_name}</td>
                    <td style={{ textAlign: "center" }}>{a.audience_size}</td>
                    <td style={{ textAlign: "center" }}>{a.messages_sent}</td>
                    <td style={{ textAlign: "center" }}>{a.opens_count}</td>
                    <td style={{ textAlign: "center" }}>{a.clicks_count}</td>
                    <td style={{ textAlign: "center", fontWeight: 600, color: "var(--color-success)" }}>{a.conversion_revenue ? `RM ${Number(a.conversion_revenue).toFixed(2)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}
