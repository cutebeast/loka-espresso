"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { BarChart3, TrendingUp, Percent } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useCurrency } from "@/hooks/useCurrency";
interface Store {
  id: number;
  store_name: string;
}
interface MarginRow {
  menu_item_id: number;
  item_name: string;
  quantity: number;
  revenue: number;
  cogs: number | null;
  margin: number | null;
  margin_pct: number | null;
  tracked: boolean;
  tracked_revenue: number;
  untracked_revenue: number;
}
interface MarginReport {
  rows: MarginRow[];
  untracked: { quantity: number; revenue: number; items: number };
  totals: {
    quantity: number;
    revenue: number;
    tracked_revenue: number;
    untracked_revenue: number;
    cogs: number;
    margin: number;
    margin_pct: number | null;
  };
  daily: { date: string; revenue: number; cogs: number; margin: number; untracked_revenue: number }[];
}
export default function ReportsPage() {
  const {
    t
  } = useTranslation();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"sales" | "marketing" | "margin">("sales");
  const [data, setData] = useState({
    revenue: 0,
    orders: 0,
    avgOrder: 0,
    customers: 0,
    stores: 0
  });
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [marginReport, setMarginReport] = useState<MarginReport | null>(null);
  const [marginLoading, setMarginLoading] = useState(false);
  const {
    format
  } = useCurrency();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    api.get<{
      items: Store[];
    }>("/admin/stores?per_page=50").then(d => {
      if (mountedRef.current) setStores(Array.isArray(d) ? d : d.items || []);
    }).catch(e => { console.error('stores:', e); setError(e.message || t("admin.errors.loadFailed")); });
    setAnalyticsLoading(true);
    api.get<any>("/admin/marketing/analytics").then(d => {
      if (mountedRef.current) setAnalytics(Array.isArray(d) ? d : []);
    }).catch(e => { console.error('analytics:', e); setError(e.message || t("admin.errors.loadFailed")); }).finally(() => {
      if (mountedRef.current) setAnalyticsLoading(false);
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const fetchData = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (selectedStore) qs.set("store_id", selectedStore);
      if (dateFrom) qs.set("from_date", dateFrom);
      if (dateTo) qs.set("to_date", dateTo);
      const metrics = await api.get<any>(`/admin/dashboard/metrics${qs.toString() ? "?" + qs.toString() : ""}`);
      const ranged = !!(dateFrom || dateTo);
      const revenue = ranged ? (metrics.total_revenue ?? 0) : (metrics.revenue_today ?? 0);
      const orders = ranged ? (metrics.total_orders ?? 0) : (metrics.orders_today ?? 0);
      setData({
        revenue,
        orders,
        avgOrder: Number(revenue) > 0 && Number(orders) > 0 ? revenue / orders : 0,
        customers: metrics.new_customers || 0,
        stores: metrics.active_stores || stores.length
      });
    } catch (err: any) {
      console.error("Failed to load reports:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedStore, dateFrom, dateTo, stores]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useEffect(() => {
    if (activeTab !== "margin") return;
    setMarginLoading(true);
    const qs = new URLSearchParams();
    if (selectedStore) qs.set("store_id", selectedStore);
    if (dateFrom) qs.set("from_date", dateFrom);
    if (dateTo) qs.set("to_date", dateTo);
    api.get<MarginReport>(`/admin/reports/margin${qs.toString() ? "?" + qs.toString() : ""}`).then(d => {
      if (mountedRef.current) setMarginReport(d);
    }).catch(e => { console.error('margin:', e); setError(e.message || t("admin.errors.loadFailed")); }).finally(() => {
      if (mountedRef.current) setMarginLoading(false);
    });
  }, [activeTab, selectedStore, dateFrom, dateTo]);
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div><h1 className="page-title">{t("reports.reports")}</h1><p className="page-subtitle">{t("reports.business_analytics_insights")}</p></div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{
      display: "flex",
      gap: 4,
      marginBottom: 20,
      borderBottom: "2px solid var(--color-border-light)"
    }}>
        {[{
        key: "sales" as const,
        label: t("reports.sales_reports"),
        icon: BarChart3
      }, {
        key: "marketing" as const,
        label: t("reports.marketing_roi"),
        icon: TrendingUp
      }, {
        key: "margin" as const,
        label: t("reports.profit_margin"),
        icon: Percent
      }].map(tab => <button type="button" key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
        padding: "10px 20px",
        fontSize: 13,
        fontWeight: activeTab === tab.key ? 700 : 400,
        border: "none",
        borderBottom: activeTab === tab.key ? "3px solid var(--color-primary)" : "3px solid transparent",
        background: activeTab === tab.key ? "rgba(59,74,26,0.05)" : "transparent",
        cursor: "pointer",
        color: activeTab === tab.key ? "var(--color-primary)" : "var(--color-text-muted)",
        borderRadius: "4px 4px 0 0"
      }}>
            <tab.icon size={14} /> {tab.label}
          </button>)}
      </div>

      {(activeTab === "sales" || activeTab === "margin") && <div style={{
      display: "flex",
      gap: 12,
      marginBottom: 20,
      alignItems: "end"
    }}>
        <div><label htmlFor="report-store-filter" style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-text-muted)",
          display: "block",
          marginBottom: 4
        }}>{t("reports.store")}</label>
          <select id="report-store-filter" value={selectedStore} onChange={e => setSelectedStore(e.target.value)} style={{
          border: "1px solid var(--color-border-light)",
          borderRadius: "var(--radius-sm)",
          padding: "6px 12px",
          fontSize: 13
        }}><option value="">{t("admin.common.allStores")}</option>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select></div>
        <div><label htmlFor="report-date-from" style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-text-muted)",
          display: "block",
          marginBottom: 4
        }}>{t("reports.from")}</label><input id="report-date-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{
          border: "1px solid var(--color-border-light)",
          borderRadius: "var(--radius-sm)",
          padding: "6px 10px",
          fontSize: 13
        }} /></div>
        <div><label htmlFor="report-date-to" style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-text-muted)",
          display: "block",
          marginBottom: 4
        }}>{t("reports.to")}</label><input id="report-date-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{
          border: "1px solid var(--color-border-light)",
          borderRadius: "var(--radius-sm)",
          padding: "6px 10px",
          fontSize: 13
        }} /></div>
      </div>}

      {activeTab === "margin" ? marginLoading ? <div style={{
      textAlign: "center",
      padding: 48,
      color: "var(--color-text-muted)"
    }}>{t("reports.loading")}</div> : !marginReport || marginReport.rows.length === 0 ? <div className="card" style={{
      padding: 24
    }}><p style={{
          fontSize: 13,
          opacity: 0.6
        }}>{t("reports.margin_no_data")}</p></div> : <>
          <div className="kpi-grid" style={{
        marginBottom: 24
      }}>
            <div className="kpi-card"><div className="kpi-label">{t("reports.total_revenue")}</div><div className="kpi-value">{format(marginReport.totals.revenue)}</div></div>
            <div className="kpi-card"><div className="kpi-label">{t("reports.margin_cogs")}</div><div className="kpi-value">{format(marginReport.totals.cogs)}</div></div>
            <div className="kpi-card"><div className="kpi-label">{t("reports.gross_margin")}</div><div className="kpi-value">{format(marginReport.totals.margin)}</div></div>
            <div className="kpi-card"><div className="kpi-label">{t("reports.margin_pct")}</div><div className="kpi-value">{marginReport.totals.margin_pct != null ? marginReport.totals.margin_pct.toFixed(1) + "%" : "—"}</div></div>
            <div className="kpi-card"><div className="kpi-label">{t("reports.untracked_revenue")}</div><div className="kpi-value">{format(marginReport.totals.untracked_revenue)}</div></div>
          </div>
          <div className="card" style={{
        padding: 24,
        marginBottom: 24
      }}>
            {marginReport.untracked.revenue > 0 && <p style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
          marginBottom: 12
        }}>{t("reports.untracked_note", {
            amount: format(marginReport.untracked.revenue),
            count: marginReport.untracked.items
          })}</p>}
            <div className="table-container"><table className="data-table">
              <thead><tr><th>{t("reports.margin_item")}</th><th style={{
                textAlign: "center"
              }}>{t("reports.margin_qty")}</th><th style={{
                textAlign: "right"
              }}>{t("reports.revenue")}</th><th style={{
                textAlign: "right"
              }}>{t("reports.margin_cogs")}</th><th style={{
                textAlign: "right"
              }}>{t("reports.gross_margin")}</th><th style={{
                textAlign: "right"
              }}>{t("reports.margin_pct")}</th></tr></thead>
              <tbody>
                {marginReport.rows.map(r => <tr key={r.menu_item_id}>
                    <td style={{
                  fontWeight: 600
                }}>{r.item_name}{!r.tracked && <span style={{
                        fontSize: 11,
                        fontWeight: 400,
                        opacity: 0.6
                      }}> — {t("reports.untracked")}</span>}</td>
                    <td style={{
                  textAlign: "center"
                }}>{r.quantity}</td>
                    <td style={{
                  textAlign: "right"
                }}>{format(r.revenue)}</td>
                    <td style={{
                  textAlign: "right"
                }}>{r.cogs != null ? format(r.cogs) : "—"}</td>
                    <td style={{
                  textAlign: "right"
                }}>{r.margin != null ? format(r.margin) : "—"}</td>
                    <td style={{
                  textAlign: "right"
                }}>{r.margin_pct != null ? r.margin_pct.toFixed(1) + "%" : "—"}</td>
                  </tr>)}
                <tr style={{
                fontWeight: 700,
                borderTop: "2px solid var(--color-border-light)"
              }}>
                  <td>{t("reports.margin_total")}</td>
                  <td style={{
                  textAlign: "center"
                }}>{marginReport.totals.quantity}</td>
                  <td style={{
                  textAlign: "right"
                }}>{format(marginReport.totals.revenue)}</td>
                  <td style={{
                  textAlign: "right"
                }}>{format(marginReport.totals.cogs)}</td>
                  <td style={{
                  textAlign: "right"
                }}>{format(marginReport.totals.margin)}</td>
                  <td style={{
                  textAlign: "right"
                }}>{marginReport.totals.margin_pct != null ? marginReport.totals.margin_pct.toFixed(1) + "%" : "—"}</td>
                </tr>
              </tbody>
            </table></div>
          </div>
          {marginReport.daily.length > 1 && <div className="card" style={{
        padding: 24
      }}>
            <h3 style={{
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 8
        }}><Percent size={18} />{t("reports.margin_daily")}</h3>
            <div className="table-container"><table className="data-table">
              <thead><tr><th>{t("reports.margin_date")}</th><th style={{
                textAlign: "right"
              }}>{t("reports.revenue")}</th><th style={{
                textAlign: "right"
              }}>{t("reports.margin_cogs")}</th><th style={{
                textAlign: "right"
              }}>{t("reports.gross_margin")}</th></tr></thead>
              <tbody>
                {marginReport.daily.map(d => <tr key={d.date}>
                    <td style={{
                  fontWeight: 600
                }}>{d.date}</td>
                    <td style={{
                  textAlign: "right"
                }}>{format(d.revenue)}</td>
                    <td style={{
                  textAlign: "right"
                }}>{format(d.cogs)}</td>
                    <td style={{
                  textAlign: "right"
                }}>{format(d.margin)}</td>
                  </tr>)}
              </tbody>
            </table></div>
          </div>}
        </> : loading ? <div style={{
      textAlign: "center",
      padding: 48,
      color: "var(--color-text-muted)"
    }}>{t("reports.loading")}</div> : activeTab === "sales" ? <>
          <div className="kpi-grid" style={{
        marginBottom: 24
      }}>
            <div className="kpi-card"><div className="kpi-label">{t("reports.total_revenue")}</div><div className="kpi-value">{format(data.revenue)}</div></div>
            <div className="kpi-card"><div className="kpi-label">{t("reports.total_orders")}</div><div className="kpi-value">{data.orders}</div></div>
            <div className="kpi-card"><div className="kpi-label">{t("reports.avg_order_value")}</div><div className="kpi-value">{format(data.avgOrder)}</div></div>
            <div className="kpi-card"><div className="kpi-label">{t("reports.new_customers")}</div><div className="kpi-value">{data.customers}</div></div>
            <div className="kpi-card"><div className="kpi-label">{t("reports.active_stores")}</div><div className="kpi-value">{data.stores}</div></div>
          </div>
          <div className="card" style={{
        padding: 24
      }}><p style={{
          fontSize: 13,
          opacity: 0.6
        }}>{t("reports.showing_aggregated_sales_metrics")}{selectedStore ? ` for ${stores.find(s => String(s.id) === selectedStore)?.store_name || "selected store"}` : " across all stores"}{dateFrom ? ` from ${dateFrom}` : ""}{dateTo ? ` to ${dateTo}` : ""}.
          </p></div>
        </> : <div className="card" style={{
      padding: 24
    }}>
          <h3 style={{
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 8
      }}><TrendingUp size={18} />{t("reports.campaign_analytics")}</h3>
          {analyticsLoading ? <p style={{
        opacity: 0.5
      }}>{t("reports.loading_2")}</p> : analytics.length === 0 ? <p style={{
        opacity: 0.5
      }}>{t("reports.no_campaigns_have_been_sent_yet")}</p> : <div className="table-container"><table className="data-table">
              <thead><tr><th>{t("reports.campaign")}</th><th style={{
                textAlign: "center"
              }}>{t("reports.audience")}</th><th style={{
                textAlign: "center"
              }}>{t("reports.sent")}</th><th style={{
                textAlign: "center"
              }}>{t("reports.opens")}</th><th style={{
                textAlign: "center"
              }}>{t("reports.clicks")}</th><th style={{
                textAlign: "center"
              }}>{t("reports.revenue")}</th></tr></thead>
              <tbody>
                {analytics.map((a: any) => <tr key={a.campaign_id}>
                    <td style={{
                fontWeight: 600
              }}>{a.campaign_name}</td>
                    <td style={{
                textAlign: "center"
              }}>{a.audience_size}</td>
                    <td style={{
                textAlign: "center"
              }}>{a.messages_sent}</td>
                    <td style={{
                textAlign: "center"
              }}>{a.opens_count}</td>
                    <td style={{
                textAlign: "center"
              }}>{a.clicks_count}</td>
                    <td style={{
                textAlign: "center",
                fontWeight: 600,
                color: "var(--color-success)"
              }}>{a.conversion_revenue ? format(a.conversion_revenue) : "—"}</td>
                  </tr>)}
              </tbody>
            </table></div>}
        </div>}
    </div>;
}