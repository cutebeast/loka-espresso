"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface DashboardMetrics {
  stores?: number;
  menu_items?: number;
  inventory_items?: number;
  staff?: number;
  customers?: number;
  orders_today?: number;
  revenue_today?: number;
}

const cards = [
  { key: "stores", label: "Stores" },
  { key: "menu_items", label: "Menu Items" },
  { key: "inventory_items", label: "Inventory Items" },
  { key: "staff", label: "Staff" },
  { key: "customers", label: "Customers" },
  { key: "orders_today", label: "Orders Today" },
  { key: "revenue_today", label: "Revenue Today" },
] as const;

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<DashboardMetrics>("/admin/dashboard/metrics")
      .then((data) => setMetrics(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.key} className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500">{card.label}</div>
            <div className="text-2xl font-bold mt-1">
              {metrics[card.key] !== undefined ? metrics[card.key] : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
