"use client";

import { useState, useEffect } from "react";
import * as api from "@/lib/api";
import type { Order } from "@/lib/types";

const STATUS_BADGE: Record<string, string> = {
  pending: "badge-yellow",
  confirmed: "badge-blue",
  preparing: "badge-blue",
  ready: "badge-green",
  delivering: "badge-blue",
  completed: "badge-green",
  cancelled: "badge-red",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function loadOrders() {
      try {
        const data = await api.orders.listOrders({ pageSize: 20 });
        setOrders(data.data);
      } catch {
        setOrders([]);
      } finally {
        setLoading(false);
      }
    }
    loadOrders();
  }, []);

  async function handleReorder(order: Order) {
    try {
      for (const item of order.items) {
        await api.cart.addToCart(order.storeId, item.menuItem.id, item.quantity);
      }
      await api.cart.getCart();
    } catch {
      // handle error
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-400">Loading orders...</div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 px-6 text-center">
        <i className="fa-solid fa-receipt text-5xl text-gray-300 mb-4" />
        <h2 className="text-lg font-bold mb-2">No Orders Yet</h2>
        <p className="text-sm text-gray-500">
          Your order history will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <h1 className="text-xl font-bold mb-2">My Orders</h1>
      {orders.map((order) => {
        const isExpanded = expandedId === order.id;
        return (
          <div
            key={order.id}
            className="card cursor-pointer"
            onClick={() => setExpandedId(isExpanded ? null : order.id)}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">
                  Order #{order.id.slice(0, 8).toUpperCase()}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {new Date(order.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`badge ${STATUS_BADGE[order.status] ?? "badge-gray"}`}>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </span>
                <span className="font-bold text-sm text-[var(--color-navy)]">
                  R{order.total.toFixed(2)}
                </span>
                <i
                  className={`fa-solid fa-chevron-down text-xs text-gray-400 transition-transform ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                />
              </div>
            </div>

            {isExpanded && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <div className="space-y-2 mb-4">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">x{item.quantity}</span>
                        <span>{item.menuItem.name}</span>
                      </div>
                      <span className="text-gray-600">
                        R{item.totalPrice.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between text-xs text-gray-500 mb-3">
                  <span>
                    {order.orderMode === "dine_in"
                      ? "Dine In"
                      : order.orderMode === "pickup"
                      ? "Pickup"
                      : "Delivery"}
                  </span>
                  {order.loyaltyPointsEarned > 0 && (
                    <span className="text-[var(--color-green)]">
                      +{order.loyaltyPointsEarned} pts earned
                    </span>
                  )}
                </div>

                <button
                  className="btn btn-primary btn-sm w-full justify-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReorder(order);
                  }}
                >
                  <i className="fa-solid fa-rotate-right text-xs" /> Reorder
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
