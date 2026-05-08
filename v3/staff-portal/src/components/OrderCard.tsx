"use client";

import Link from "next/link";
import { Order } from "@/lib/api";
import StatusBadge from "./StatusBadge";
import { Clock, ShoppingBag, User } from "lucide-react";

function timeSince(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function isOverdue(order: Order): boolean {
  const elapsed = Date.now() - new Date(order.created_at).getTime();
  return order.status === "pending" && elapsed > 5 * 60 * 1000;
}

export default function OrderCard({ order }: { order: Order }) {
  const overdue = isOverdue(order);

  return (
    <Link href={`/orders/${order.id}`}>
      <div
        className={`bg-white rounded-lg border p-4 shadow-sm hover:shadow-md transition cursor-pointer ${
          overdue ? "border-red-400 ring-1 ring-red-200" : "border-gray-200"
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag size={16} className="text-gray-500" />
            <span className="font-semibold text-sm">{order.order_number}</span>
          </div>
          <StatusBadge status={order.status} />
        </div>

        <div className="space-y-2 mb-3">
          {order.items.slice(0, 4).map((item) => (
            <div key={item.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">
                <span className="font-medium">{item.quantity}x</span> {item.name}
              </span>
            </div>
          ))}
          {order.items.length > 4 && (
            <p className="text-xs text-gray-400">+{order.items.length - 4} more items</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Clock size={12} />
            <span className={overdue ? "text-red-600 font-medium" : ""}>{timeSince(order.created_at)}</span>
          </div>
          <div className="flex items-center gap-3">
            {order.customer_name && (
              <span className="flex items-center gap-1">
                <User size={12} />
                {order.customer_name}
              </span>
            )}
            <span className="font-semibold text-gray-700">RM {order.total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
