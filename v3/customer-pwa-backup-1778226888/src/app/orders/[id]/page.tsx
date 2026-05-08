"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Clock, CheckCircle, XCircle, Loader } from "lucide-react";
import { api, Order, OrderItem } from "@/lib/api";

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle className="w-6 h-6 text-green-500" />;
    case "cancelled":
      return <XCircle className="w-6 h-6 text-red-500" />;
    case "pending":
      return <Clock className="w-6 h-6 text-amber-500" />;
    default:
      return <Loader className="w-6 h-6 text-blue-500" />;
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

export default function OrderDetailPage() {
  const { id } = useParams() as { id: string };
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<Order>(`/orders/${id}`);
        setOrder(data);
        setItems(data.items || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="px-4 pt-6 space-y-4">
        <div className="h-8 bg-gray-200 rounded-lg w-1/3 animate-pulse" />
        <div className="bg-white rounded-2xl h-40 animate-pulse" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="px-4 pt-6 text-center text-gray-400 text-sm">
        Order not found
        <Link href="/orders" className="block mt-2 text-amber-600 font-semibold">
          Back to orders
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-6">
      <Link href="/orders" className="inline-flex items-center text-sm text-gray-500 mb-4">
        <ChevronLeft className="w-4 h-4" />
        Back
      </Link>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          {statusIcon(order.status)}
          <div>
            <h1 className="text-lg font-bold text-gray-900">Order #{order.id.slice(0, 8)}</h1>
            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mt-1 ${statusColor(order.status)}`}>
              {order.status}
            </span>
          </div>
        </div>

        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Type</span>
            <span className="font-medium text-gray-900 capitalize">{order.order_type.replace("_", " ")}</span>
          </div>
          {order.table_number && (
            <div className="flex justify-between">
              <span>Table</span>
              <span className="font-medium text-gray-900">{order.table_number}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Date</span>
            <span className="font-medium text-gray-900">{new Date(order.created_at).toLocaleString()}</span>
          </div>
          {order.special_instructions && (
            <div className="pt-2">
              <span className="text-gray-500">Instructions:</span>
              <p className="text-gray-800 mt-0.5">{order.special_instructions}</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 mt-4 shadow-sm border border-gray-100">
        <h2 className="font-bold text-gray-900 mb-3">Items</h2>
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg">🍲</div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.menu_item?.name || "Item"}</p>
                  <p className="text-xs text-gray-500">x{item.quantity}</p>
                </div>
              </div>
              <span className="text-sm font-semibold text-gray-900">${item.total_price.toFixed(2)}</span>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-gray-400">No item details</p>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-100 space-y-1">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span>${order.total_amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Tax</span>
            <span>${(order.total_amount * 0.1).toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 text-base pt-1">
            <span>Total</span>
            <span>${(order.total_amount * 1.1).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
