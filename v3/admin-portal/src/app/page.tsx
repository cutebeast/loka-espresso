"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Store, UtensilsCrossed, Package, Users, UserCircle, ShoppingBag, TrendingUp } from "lucide-react";

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
  { key: "stores" as const, label: "Stores", icon: Store, color: "bg-brand" },
  { key: "menu_items" as const, label: "Menu Items", icon: UtensilsCrossed, color: "bg-brand-light" },
  { key: "inventory_items" as const, label: "Inventory Items", icon: Package, color: "bg-gold" },
  { key: "staff" as const, label: "Staff", icon: Users, color: "bg-brand-dark" },
  { key: "customers" as const, label: "Customers", icon: UserCircle, color: "bg-brand" },
  { key: "orders_today" as const, label: "Orders Today", icon: ShoppingBag, color: "bg-gold" },
  { key: "revenue_today" as const, label: "Revenue Today", icon: TrendingUp, color: "bg-brand-light" },
] as const;

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<DashboardMetrics>("/admin/dashboard/metrics")
      .then((data) => setMetrics(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-brand-text-muted">Loading dashboard...</div>
      </div>
    );
  }

  const formatValue = (key: string, val: number | undefined) => {
    if (val === undefined) return "—";
    if (key === "revenue_today") return `RM ${val.toFixed(2)}`;
    return val.toLocaleString();
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brand-text">Dashboard</h1>
        <p className="text-sm text-brand-text-muted mt-1">Overview of your business</p>
      </div>

      {error && (
        <div className="mb-6 text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const val = metrics[card.key];
          return (
            <div key={card.key} className="bg-brand-card rounded-xl border border-brand-border-light p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-brand-text-muted font-medium">{card.label}</div>
                  <div className="text-2xl font-bold text-brand-text mt-2">
                    {formatValue(card.key, val)}
                  </div>
                </div>
                <div className={`${card.color} w-10 h-10 rounded-lg flex items-center justify-center`}>
                  <Icon size={20} className="text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
