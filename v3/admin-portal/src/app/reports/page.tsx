"use client";

import { useEffect, useState } from "react";
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
  const [data, setData] = useState({ revenue: 0, orders: 0, avgOrder: 0 });

  useEffect(() => {
    api.get<{ items: Store[] }>("/admin/stores?per_page=50").then(d => setStores(Array.isArray(d) ? d : (d.items || []))).catch(() => {});
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const metrics = await api.get<{ revenue_today: number; orders_today: number }>("/admin/dashboard/metrics");
      setData({
        revenue: metrics.revenue_today || 0,
        orders: metrics.orders_today || 0,
        avgOrder: metrics.revenue_today && metrics.orders_today ? metrics.revenue_today / metrics.orders_today : 0,
      });
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [selectedStore, dateFrom, dateTo]);

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
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
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

      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "end" }}>
        <div><label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Store</label>
          <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)} style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: "6px 12px", fontSize: 13 }}><option value="">All Stores</option>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select></div>
        <div><label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: "6px 10px", fontSize: 13 }} /></div>
        <div><label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", padding: "6px 10px", fontSize: 13 }} /></div>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 48, color: "var(--color-text-muted)" }}>Loading...</div>
      : activeTab === "sales" ? (
        <>
          <div className="kpi-grid" style={{ marginBottom: 24 }}>
            <div className="kpi-card"><div className="kpi-label">Total Revenue</div><div className="kpi-value">{fmt(data.revenue)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Total Orders</div><div className="kpi-value">{data.orders}</div></div>
            <div className="kpi-card"><div className="kpi-label">Avg Order Value</div><div className="kpi-value">{fmt(data.avgOrder)}</div></div>
          </div>
          <div className="card" style={{ padding: 24 }}><p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Detailed reports coming soon.</p></div>
        </>
      ) : (
        <div className="card" style={{ padding: 24 }}><h3 style={{ marginBottom: 12 }}>Marketing ROI</h3><p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Marketing analytics coming soon. View Campaigns for performance data.</p></div>
      )}
    </div>
  );
}
