"use client";

import { useState, useEffect, useCallback } from "react";
import * as api from "@/lib/api";
import type { Order, OrderStatus } from "@/lib/types";

const FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Preparing", value: "preparing" },
  { label: "Ready", value: "ready" },
  { label: "Completed", value: "completed" },
];

const STATUS_FLOW: Record<string, OrderStatus | null> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "completed",
  completed: null,
};

const STATUS_BADGE: Record<string, string> = {
  pending: "badge-yellow",
  confirmed: "badge-blue",
  preparing: "badge-yellow",
  ready: "badge-green",
  delivering: "badge-blue",
  completed: "badge-green",
  cancelled: "badge-red",
};

const NEXT_LABEL: Record<string, string> = {
  pending: "Confirm",
  confirmed: "Start Preparing",
  preparing: "Mark Ready",
  ready: "Complete",
};

const MODE_LABEL: Record<string, string> = {
  dine_in: "Dine In",
  pickup: "Pickup",
  delivery: "Delivery",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const params: { page: number; pageSize: number; status?: string } = {
        page: 1,
        pageSize: 50,
      };
      if (filter !== "all") params.status = filter;
      const res = await api.orders.listOrders(params);
      setOrders(res.data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  async function updateStatus(orderId: string, status: OrderStatus) {
    setUpdating(orderId);
    try {
      await api.request<Order>(`/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status } : o))
      );
    } catch {
    } finally {
      setUpdating(null);
    }
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  }

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500">
            Manage and track all incoming orders
          </p>
        </div>
        <button onClick={loadOrders} className="btn">
          <i className="fa-solid fa-rotate" />
          Refresh
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setFilter(f.value);
              setLoading(true);
            }}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              filter === f.value
                ? "bg-[var(--color-navy)] text-white"
                : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <i className="fa-solid fa-spinner fa-spin text-2xl text-[var(--color-navy)]" />
        </div>
      ) : orders.length === 0 ? (
        <div className="card py-16 text-center">
          <i className="fa-solid fa-inbox mb-3 text-4xl text-gray-300" />
          <p className="text-gray-500">No orders found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => {
            const nextStatus = STATUS_FLOW[order.status];
            return (
              <div key={order.id} className="card">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[var(--color-navy)]">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className="badge badge-blue">
                      {MODE_LABEL[order.orderMode] ?? order.orderMode}
                    </span>
                    {order.tableNumber && (
                      <span className="badge badge-gray">
                        Table {order.tableNumber}
                      </span>
                    )}
                  </div>
                  <span
                    className={`badge ${STATUS_BADGE[order.status] ?? "badge-gray"}`}
                  >
                    {order.status}
                  </span>
                </div>

                <div className="mb-3 space-y-1">
                  {order.items.slice(0, 3).map((item, i) => (
                    <div
                      key={item.id ?? i}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-gray-600">
                        {item.quantity}x {item.menuItem.name}
                      </span>
                      <span className="text-gray-400">
                        ${item.totalPrice.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <p className="text-xs text-gray-400">
                      +{order.items.length - 3} more items
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <div>
                    <span className="text-lg font-bold text-gray-900">
                      ${order.total.toFixed(2)}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">
                      {timeAgo(order.createdAt)}
                    </span>
                  </div>
                  {nextStatus && (
                    <button
                      onClick={() => updateStatus(order.id, nextStatus)}
                      disabled={updating === order.id}
                      className="btn btn-primary btn-sm disabled:opacity-50"
                    >
                      {updating === order.id ? (
                        <i className="fa-solid fa-spinner fa-spin" />
                      ) : (
                        NEXT_LABEL[order.status]
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
