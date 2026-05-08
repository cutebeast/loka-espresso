"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, updateOrderStatus, Order, OrderStatus } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { ArrowLeft, Clock, User, Phone, MapPin, CreditCard } from "lucide-react";

const statusFlow: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "completed"];

const statusActions: Record<OrderStatus, { label: string; next?: OrderStatus; variant: string }> = {
  pending: { label: "Confirm", next: "confirmed", variant: "blue" },
  confirmed: { label: "Start Preparing", next: "preparing", variant: "amber" },
  preparing: { label: "Mark Ready", next: "ready", variant: "green" },
  ready: { label: "Complete", next: "completed", variant: "slate" },
  completed: { label: "Completed", variant: "slate" },
  cancelled: { label: "Cancelled", variant: "red" },
};

function timeSince(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);

  const fetchOrder = async () => {
    try {
      const data = await api.get<Order>(`/orders/${id}`);
      setOrder(data);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load order");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [id]);

  const updateStatus = async (newStatus: OrderStatus) => {
    setUpdating(true);
    try {
      await updateOrderStatus(id, newStatus);
      await fetchOrder();
    } catch (err: any) {
      setError(err.message || "Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const cancelOrder = async () => {
    if (!confirm("Are you sure you want to cancel this order?")) return;
    setUpdating(true);
    try {
      await updateOrderStatus(id, "cancelled");
      await fetchOrder();
    } catch (err: any) {
      setError(err.message || "Failed to cancel order");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-gray-500 text-sm">Loading order...</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6">
        <div className="text-gray-500 text-sm">Order not found.</div>
      </div>
    );
  }

  const action = statusActions[order.status];
  const currentIndex = statusFlow.indexOf(order.status);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button
        onClick={() => router.push("/orders")}
        className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 mb-4"
      >
        <ArrowLeft size={16} />
        Back to Orders
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">{order.order_number}</h2>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            <span className="flex items-center gap-1"><Clock size={14} /> {timeSince(order.created_at)}</span>
            <span className="capitalize">{order.type.replace("_", " ")}</span>
          </div>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Items</h3>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {item.quantity}x {item.name}
                    </p>
                    {item.notes && <p className="text-xs text-gray-400 mt-0.5">{item.notes}</p>}
                  </div>
                  <span className="text-sm text-gray-600">RM {(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 mt-4 pt-4 flex items-center justify-between">
              <span className="font-medium">Total</span>
              <span className="font-bold text-lg">RM {order.total.toFixed(2)}</span>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Status Timeline</h3>
            <div className="flex items-center gap-2">
              {statusFlow.map((s, idx) => {
                const active = idx <= currentIndex && order.status !== "cancelled";
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        active ? "bg-slate-800" : "bg-gray-200"
                      }`}
                    />
                    <span className={`text-xs capitalize ${active ? "text-gray-800 font-medium" : "text-gray-400"}`}>
                      {s.replace("_", " ")}
                    </span>
                    {idx < statusFlow.length - 1 && (
                      <div className={`w-6 h-0.5 ${idx < currentIndex ? "bg-slate-800" : "bg-gray-200"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Customer</h3>
            <div className="space-y-3 text-sm">
              {order.customer_name && (
                <div className="flex items-center gap-2 text-gray-700">
                  <User size={16} className="text-gray-400" />
                  {order.customer_name}
                </div>
              )}
              {order.customer_phone && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Phone size={16} className="text-gray-400" />
                  {order.customer_phone}
                </div>
              )}
              {order.table_number && (
                <div className="flex items-center gap-2 text-gray-700">
                  <MapPin size={16} className="text-gray-400" />
                  Table {order.table_number}
                </div>
              )}
              <div className="flex items-center gap-2 text-gray-700">
                <CreditCard size={16} className="text-gray-400" />
                {order.payment_status || "Unpaid"}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Actions</h3>
            <div className="space-y-2">
              {action.next && (
                <button
                  onClick={() => updateStatus(action.next!)}
                  disabled={updating}
                  className={`w-full py-2 rounded text-sm font-medium text-white transition disabled:opacity-50 ${
                    action.variant === "blue"
                      ? "bg-blue-600 hover:bg-blue-700"
                      : action.variant === "amber"
                      ? "bg-amber-500 hover:bg-amber-600"
                      : action.variant === "green"
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-slate-700 hover:bg-slate-800"
                  }`}
                >
                  {updating ? "Updating..." : action.label}
                </button>
              )}
              {order.status !== "cancelled" && order.status !== "completed" && (
                <button
                  onClick={cancelOrder}
                  disabled={updating}
                  className="w-full py-2 rounded text-sm font-medium border border-red-300 text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                >
                  Cancel Order
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
