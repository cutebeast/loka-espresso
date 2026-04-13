"use client";

import { useState } from "react";
import * as api from "@/lib/api";

interface ReportData {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  popularItems: { name: string; quantity: number; revenue: number }[];
  salesByType: { type: string; count: number; revenue: number }[];
}

export default function ReportsPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function loadReport() {
    setLoading(true);
    try {
      const data = await api.request<ReportData>(
        `/admin/reports?from=${from}&to=${to}`
      );
      setReport(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function exportCSV() {
    setExporting(true);
    try {
      const blob = await api.request<Blob>(
        `/admin/export?from=${from}&to=${to}`,
        { headers: { Accept: "text/csv" } } as RequestInit
      );
      const url = URL.createObjectURL(
        blob instanceof Blob ? blob : new Blob([String(blob)])
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
    } finally {
      setExporting(false);
    }
  }

  const TYPE_LABELS: Record<string, string> = {
    dine_in: "Dine In",
    pickup: "Pickup",
    delivery: "Delivery",
  };

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">
            View sales analytics and export reports
          </p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              From
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-44"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              To
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-44"
            />
          </div>
          <button onClick={loadReport} disabled={loading} className="btn btn-primary disabled:opacity-50">
            {loading ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-chart-bar" />}
            Generate Report
          </button>
          <button onClick={exportCSV} disabled={exporting} className="btn disabled:opacity-50">
            {exporting ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-file-csv" />}
            Export CSV
          </button>
        </div>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-[var(--color-green)]">
                  <i className="fa-solid fa-dollar-sign text-lg" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${report.totalRevenue.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <i className="fa-solid fa-bag-shopping text-lg" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Orders</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {report.totalOrders}
                  </p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-[var(--color-purple)]">
                  <i className="fa-solid fa-receipt text-lg" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Avg Order Value</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${report.averageOrderValue.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">
                Popular Items
              </h3>
              {report.popularItems.length === 0 ? (
                <p className="py-8 text-center text-gray-400">No data</p>
              ) : (
                <div className="space-y-3">
                  {report.popularItems.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-navy)] text-sm font-bold text-white">
                          {i + 1}
                        </span>
                        <div>
                          <p className="font-medium text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-500">
                            {item.quantity} sold
                          </p>
                        </div>
                      </div>
                      <span className="font-semibold text-gray-900">
                        ${item.revenue.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">
                Sales by Type
              </h3>
              {report.salesByType.length === 0 ? (
                <p className="py-8 text-center text-gray-400">No data</p>
              ) : (
                <div className="space-y-3">
                  {report.salesByType.map((item, i) => {
                    const total = report.salesByType.reduce(
                      (s, x) => s + x.count,
                      0
                    );
                    const pct = total > 0 ? (item.count / total) * 100 : 0;
                    const COLORS: Record<string, string> = {
                      dine_in: "bg-blue-500",
                      pickup: "bg-[var(--color-green)]",
                      delivery: "bg-[var(--color-orange)]",
                    };
                    return (
                      <div key={i} className="rounded-xl bg-gray-50 px-4 py-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-medium text-gray-900">
                            {TYPE_LABELS[item.type] ?? item.type}
                          </span>
                          <div className="text-right">
                            <span className="font-semibold text-gray-900">
                              ${item.revenue.toFixed(2)}
                            </span>
                            <span className="ml-2 text-sm text-gray-500">
                              ({item.count} orders)
                            </span>
                          </div>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={`h-full rounded-full ${COLORS[item.type] ?? "bg-gray-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!report && !loading && (
        <div className="card py-16 text-center">
          <i className="fa-solid fa-chart-pie mb-3 text-4xl text-gray-300" />
          <p className="text-gray-500">
            Select a date range and generate a report
          </p>
        </div>
      )}
    </div>
  );
}
