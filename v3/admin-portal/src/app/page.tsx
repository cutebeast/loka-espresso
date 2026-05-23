"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ShoppingBag, DollarSign, Flame, Users, TrendingUp } from "lucide-react";

interface DashboardData {
  stores: number; customers: number;
  orders_today: number; revenue_today: number;
  total_orders: number; total_revenue: number; active_orders: number;
  orders_by_type: Record<string, { count: number; revenue: number }>;
  monthly_data: { year: number; month: number; orders: number; revenue: number }[];
}

interface Store { id: number; store_name: string; }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<{ items: Store[] }>("/admin/stores?per_page=50")
      .then(d => setStores(d.items || (Array.isArray(d) ? d : [])))
      .catch((err: any) => { console.error("Failed to load stores:", err); });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const qs = new URLSearchParams();
    if (selectedStore) qs.set("store_id", selectedStore);
    if (fromDate) qs.set("from_date", fromDate);
    if (toDate) qs.set("to_date", toDate);
    api.get<DashboardData>(`/admin/dashboard/metrics?${qs}`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedStore, fromDate, toDate]);

  const formatRM = (v: number) => `RM ${(v || 0).toFixed(2)}`;

  if (loading && !data) {
    return <div style={{ padding: 32 }}><div className="skeleton" style={{ height: 200, borderRadius: "var(--radius-lg)" }} /></div>;
  }

  const kpis = [
    { label: "Total Orders", value: data?.total_orders, icon: ShoppingBag, color: "#3B4A1A" },
    { label: "Total Revenue", value: formatRM(data?.total_revenue || 0), icon: DollarSign, color: "#9B6625" },
    { label: "Active Orders", value: data?.active_orders, icon: Flame, color: "#D97706" },
    { label: "Total Customers", value: data?.customers, icon: Users, color: "#2563EB" },
  ];

  const maxBar = Math.max(...(data?.monthly_data.map(d => d.orders) || [0]), 1);

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Business overview</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)" }}>
            <option value="">All Stores</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}
          </select>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)" }} />
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>to</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)" }} />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* KPI Cards */}
      <div className="kpi-grid">
        {kpis.map(kpi => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="kpi-card">
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value">{kpi.value ?? "—"}</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ width: 36, height: 36, borderRadius: "var(--radius-sm)", background: kpi.color, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.85 }}>
                  <Icon size={18} color="white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Orders by Type + Revenue */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 24, marginTop: 24 }}>
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>
            <TrendingUp size={14} style={{ display: "inline", marginRight: 8, color: "var(--color-accent-copper)" }} />
            Orders by Type
          </h3>
          {!data?.orders_by_type || Object.keys(data.orders_by_type).length === 0 ? (
            <p style={{ color: "var(--color-text-muted)", fontSize: 14 }}>No orders in this period</p>
          ) : (
            Object.entries(data.orders_by_type).map(([type, info]) => (
              <div key={type} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-border-light)" }}>
                <span style={{ textTransform: "capitalize", color: "var(--color-text-secondary)", fontSize: 14 }}>{type.replace(/_/g, " ")}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{info.count} orders · {formatRM(info.revenue)}</span>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>
            <DollarSign size={14} style={{ display: "inline", marginRight: 8, color: "var(--color-accent-copper)" }} />
            Revenue
          </h3>
          <div style={{ fontSize: 36, fontWeight: 700, color: "var(--color-accent-copper)" }}>{formatRM(data?.total_revenue || 0)}</div>
          <p style={{ color: "var(--color-text-muted)", marginTop: 8, fontSize: 13 }}>Revenue for selected period</p>
        </div>
      </div>

      {/* Bar Chart */}
      {data?.monthly_data && data.monthly_data.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>Monthly Orders</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 160 }}>
            {data.monthly_data.map((d, i) => {
              const h = Math.max((d.orders / maxBar) * 140, 2);
              return (
                <div key={i} style={{ flex: 1, textAlign: "center", minWidth: 50 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{d.orders}</div>
                  <div style={{
                    height: h + "px", borderRadius: "4px 4px 0 0",
                    background: d.orders > 0 ? "var(--color-primary)" : "var(--color-border-light)",
                    opacity: d.orders > 0 ? 1 : 0.4, transition: "height 0.3s",
                    minHeight: d.orders > 0 ? 4 : 2,
                  }} />
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 6 }}>
                    {MONTHS[(d.month || 1) - 1]} {d.year}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
