"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Clock, CheckCircle, XCircle, Loader } from "lucide-react";
import { api, Order } from "@/lib/api";

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "cancelled":
      return <XCircle className="w-4 h-4 text-red-500" />;
    case "pending":
      return <Clock className="w-4 h-4 text-amber-500" />;
    default:
      return <Loader className="w-4 h-4 text-blue-500" />;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "completed":
      return "bg-green-50 text-green-700 border-green-200";
    case "cancelled":
      return "bg-red-50 text-red-700 border-red-200";
    case "pending":
      return "bg-amber-50 text-amber-700 border-amber-200";
    default:
      return "bg-blue-50 text-blue-700 border-blue-200";
  }
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Order[]>("/orders")
      .then((data) => setOrders(data || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Your Orders</h1>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="block bg-white rounded-2xl p-4 shadow-sm border border-gray-100 active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {statusIcon(order.status)}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusColor(order.status)}`}>
                    {order.status}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Order #{order.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">{order.order_type.replace("_", " ")}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">${order.total_amount.toFixed(2)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </Link>
          ))}
          {orders.length === 0 && (
            <div className="text-center text-gray-400 py-16 text-sm">
              <span className="text-3xl block mb-2">📦</span>
              No orders yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
