"use client";

import { useEffect, useState, useCallback } from "react";
import { getOrders, getStores, updateOrderStatus, Order, OrderStatus, Store } from "@/lib/api";
import OrderCard from "@/components/OrderCard";
import { Filter, RefreshCw, Store as StoreIcon, CheckCircle2, ChefHat, PackageCheck, Check } from "lucide-react";

const statusFilters: { label: string; value: OrderStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Preparing", value: "preparing" },
  { label: "Ready", value: "ready" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

const nextStatusMap: Record<OrderStatus, { label: string; next: OrderStatus; icon: React.ReactNode } | null> = {
  pending: { label: "Confirm", next: "confirmed", icon: <CheckCircle2 size={12} /> },
  confirmed: { label: "Prepare", next: "preparing", icon: <ChefHat size={12} /> },
  preparing: { label: "Ready", next: "ready", icon: <PackageCheck size={12} /> },
  ready: { label: "Complete", next: "completed", icon: <Check size={12} /> },
  completed: null,
  cancelled: null,
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchStores = useCallback(async () => {
    try {
      const data = await getStores();
      setStores(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await getOrders(storeId, filter === "all" ? undefined : filter);
      setOrders(Array.isArray(data) ? data : []);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [storeId, filter]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const handleUpdateStatus = async (id: string, status: OrderStatus) => {
    setUpdatingId(id);
    try {
      await updateOrderStatus(id, status);
      await fetchOrders();
    } catch (err: any) {
      setError(err.message || "Failed to update order");
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrders = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const counts = statusFilters.reduce((acc, s) => {
    acc[s.value] = s.value === "all" ? orders.length : orders.filter((o) => o.status === s.value).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Orders</h2>
        <button
          onClick={fetchOrders}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 transition"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}

      <div className="flex items-center gap-2 mb-4">
        <StoreIcon size={16} className="text-gray-400" />
        <select
          value={storeId ?? ""}
          onChange={(e) => setStoreId(e.target.value ? Number(e.target.value) : undefined)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
        >
          <option value="">All Stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        <Filter size={16} className="text-gray-400 shrink-0" />
        {statusFilters.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilter(s.value)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition ${
              filter === s.value
                ? "bg-slate-800 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {s.label} ({counts[s.value] ?? 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading orders...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-gray-400 text-sm">No orders found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const nextAction = nextStatusMap[order.status];
            return (
              <div key={order.id} className="relative">
                <OrderCard order={order} />
                {nextAction && (
                  <div className="absolute top-2 right-2">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleUpdateStatus(order.id, nextAction.next);
                      }}
                      disabled={updatingId === order.id}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 shadow-sm"
                    >
                      {updatingId === order.id ? "..." : nextAction.icon}
                      <span className="hidden sm:inline">{nextAction.label}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
